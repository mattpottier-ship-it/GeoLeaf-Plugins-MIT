/**
 * heartbeat-manager.ts — Ping/pong keep-alive for long-lived WebSocket connections.
 *
 * Starts a timer after the transport connects.
 * On each tick, calls transport.ping().
 * If the ping does not resolve within timeoutMs, the connection is considered
 * lost: transport.disconnect("heartbeat-timeout") is called and the
 * heartbeat-timeout event is emitted. The ConnectionManager then handles reconnection.
 * The timer restarts automatically after reconnection.
 */

import type { IWsTransport } from "./transports/i-ws-transport.js";
import { emitHeartbeatTimeout } from "./events/event-bus-bridge.js";

export interface HeartbeatConfig {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
}

export class HeartbeatManager {
    private _transport: IWsTransport | null = null;
    private _config: HeartbeatConfig | null = null;
    private _timerId: ReturnType<typeof setTimeout> | null = null;
    private _running = false;

    /** Attach a config and transport. Does not start the timer — call start() after connecting. */
    attach(transport: IWsTransport, config: HeartbeatConfig): void {
        this._transport = transport;
        this._config = config;
    }

    /** Start the heartbeat timer. No-op if disabled or already running. */
    start(): void {
        if (!this._config?.enabled) return;
        if (this._running) return;
        this._running = true;
        this._scheduleNext();
    }

    /** Stop the heartbeat timer. Safe to call multiple times. */
    stop(): void {
        this._running = false;
        if (this._timerId !== null) {
            clearTimeout(this._timerId);
            this._timerId = null;
        }
    }

    /** Detach transport and config. Stops the timer. */
    detach(): void {
        this.stop();
        this._transport = null;
        this._config = null;
    }

    private _scheduleNext(): void {
        if (!this._running || !this._config) return;
        this._timerId = setTimeout(() => {
            void this._tick();
        }, this._config.intervalMs);
    }

    private async _tick(): Promise<void> {
        if (!this._running || !this._config || !this._transport) return;

        const transport = this._transport;
        const config = this._config;

        const pingRace = Promise.race([
            transport.ping().then(() => "ok" as const),
            new Promise<"timeout">((resolve) =>
                setTimeout(() => resolve("timeout"), config.timeoutMs)
            ),
        ]);

        const result = await pingRace;

        if (!this._running) return; // stopped while waiting

        if (result === "timeout") {
            emitHeartbeatTimeout({ transport: "native-ws" });
            transport.disconnect("heartbeat-timeout");
            // ConnectionManager will trigger reconnection via onDisconnected callback
            this.stop();
            return;
        }

        // Ping succeeded — schedule next tick
        this._scheduleNext();
    }
}
