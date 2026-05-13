/**
 * public-api.ts — GeoLeaf.Ws public API surface.
 *
 * buildPublicApi() wires together the plugin's collaborators and returns
 * the object mounted on globalThis.GeoLeaf.Ws by entry.ts.
 *
 * Uses module-level mutable singletons so that a single buildPublicApi() call
 * produces an API object that stays valid across init()/destroy() cycles.
 *
 * The public API exposes:
 *   init, destroy, reconnect, state, subscribe, unsubscribe, send,
 *   getSubscriptions, getMetrics
 */

import type { WsPluginConfig } from "./config-schema.js";
import type { MessageHandler, TransportState, WsMetrics } from "./transports/i-ws-transport.js";
import { validateConfig, applyDefaults } from "./config-schema.js";
import { ConnectionManager } from "./connection-manager.js";
import { ChannelManager } from "./channel-manager.js";
import { HeartbeatManager } from "./heartbeat-manager.js";
import { SendQueue } from "./send-queue.js";
import { MetricsCollector } from "./metrics-collector.js";
import { createTransport } from "./transports/transport-registry.js";

export interface GeoLeafWsApi {
    /** Initialize the plugin. Connects immediately. Resolves when connected. */
    init(config: WsPluginConfig): Promise<void>;
    /** Disconnect gracefully, clear all subscriptions, reset metrics. Idempotent. */
    destroy(): void;
    /** Force a reconnection. Resets retry counter. No-op if already connected. */
    reconnect(): void;
    /** Current connection state. */
    readonly state: TransportState;
    /** Subscribe to a named channel. Returns an idempotent unsubscribe function. */
    subscribe(channel: string, handler: MessageHandler): () => void;
    /** Unsubscribe from a channel by name. No-op if not subscribed. */
    unsubscribe(channel: string): void;
    /**
     * Send a message on a channel.
     * Queued if disconnected and queueOnDisconnect is true.
     */
    send(channel: string, payload: unknown): void;
    /** Returns all currently active subscription channel names. */
    getSubscriptions(): string[];
    /** Returns a metrics snapshot. Safe to call before init(). */
    getMetrics(): WsMetrics;
}

// ─── Module-level mutable singletons ─────────────────────────────────────────
// Reset on each init() call — allows the API object to survive multiple cycles.

let _connectionManager: ConnectionManager = new ConnectionManager();
let _channelManager: ChannelManager = new ChannelManager();
let _heartbeatManager: HeartbeatManager = new HeartbeatManager();
let _metrics: MetricsCollector = new MetricsCollector();
let _sendQueue: SendQueue | null = null;
let _initialized = false;
/** Direct reference to transport.send, captured during init(). */
let _sendDirect: ((channel: string, payload: unknown) => void) | null = null;

// ─── Internal helpers referenced as API methods ───────────────────────────────

function _destroy(): void {
    _connectionManager.destroy();
    _channelManager.clear();
    _heartbeatManager.detach();
    _metrics.reset();
    _sendQueue?.clear();
    _sendQueue = null;
    _sendDirect = null;
    _initialized = false;
}

function _reconnect(): void {
    _connectionManager.reconnect();
}

function _subscribe(channel: string, handler: MessageHandler): () => void {
    return _channelManager.subscribe(channel, handler);
}

function _unsubscribe(channel: string): void {
    _channelManager.unsubscribe(channel);
}

function _send(channel: string, payload: unknown): void {
    const state = _connectionManager.state;
    if (state === "connected" && _sendDirect) {
        _sendDirect(channel, payload);
    } else if (_sendQueue) {
        _sendQueue.enqueue(channel, payload);
    }
}

function _getSubscriptions(): string[] {
    return _channelManager.getSubscriptions();
}

function _getMetrics(): WsMetrics {
    return _metrics.getSnapshot();
}

// ─── buildPublicApi ───────────────────────────────────────────────────────────

/**
 * Creates and returns the GeoLeaf.Ws public API object.
 * Called once during entry.ts bootstrap.
 */
export function buildPublicApi(): GeoLeafWsApi {
    return {
        async init(config: WsPluginConfig): Promise<void> {
            if (_initialized) {
                _destroy();
            }

            validateConfig(config);
            const resolved = applyDefaults(config);
            _initialized = true;

            _connectionManager = new ConnectionManager();
            _channelManager = new ChannelManager();
            _heartbeatManager = new HeartbeatManager();
            _metrics = new MetricsCollector();
            _sendQueue = new SendQueue(resolved.maxQueueSize, resolved.queueOnDisconnect);

            const transport = createTransport(resolved.transport);

            // Capture direct send reference — avoids coupling to ConnectionManager internals
            _sendDirect = (channel, payload) => {
                transport.send(channel, payload);
                _metrics.touchMessageSent();
            };

            _channelManager.attach(transport);
            _heartbeatManager.attach(transport, resolved.heartbeat);
            _connectionManager.attach(
                transport,
                resolved,
                _channelManager,
                _sendQueue,
                _metrics,
                _heartbeatManager
            );

            await _connectionManager.connect();
        },

        destroy: _destroy,
        reconnect: _reconnect,

        get state(): TransportState {
            return _connectionManager.state;
        },

        subscribe: _subscribe,
        unsubscribe: _unsubscribe,
        send: _send,
        getSubscriptions: _getSubscriptions,
        getMetrics: _getMetrics,
    };
}
