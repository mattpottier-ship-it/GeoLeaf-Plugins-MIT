/**
 * WebSocketSource — bridges `GeoLeaf.Ws.subscribe()` into the IRealtimeSource
 * interface.
 *
 * Requires `@geoleaf-plugins/websocket` to be loaded and initialised before
 * this plugin boots. A clear error is raised at start() if the plugin is absent.
 *
 * @module sources/websocket-source
 */

import type { IRealtimeSource } from "./i-realtime-source.js";

interface GeoLeafWs {
    subscribe(channel: string, handler: (data: unknown) => void): () => void;
}

const _g = globalThis as { GeoLeaf?: { Ws?: GeoLeafWs } };

export class WebSocketSource implements IRealtimeSource {
    private readonly _channel: string;

    private _handler: ((data: unknown) => void) | null = null;
    private _unsubscribe: (() => void) | null = null;

    constructor(channel: string) {
        this._channel = channel;
    }

    onData(handler: (data: unknown) => void): void {
        this._handler = handler;
    }

    start(): void {
        const ws = _g.GeoLeaf?.Ws;
        if (!ws || typeof ws.subscribe !== "function") {
            console.error(
                `[realtime-layer][websocket] @geoleaf-plugins/websocket is not loaded or not ` +
                    `initialised. Cannot subscribe to channel "${this._channel}". ` +
                    `Ensure the WebSocket plugin is loaded and GeoLeaf.Ws.init() has been called ` +
                    `before GeoLeaf.boot().`
            );
            return;
        }
        if (!this._handler) return;
        this._unsubscribe = ws.subscribe(this._channel, (data) => {
            this._handler?.(data);
        });
    }

    stop(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }
}
