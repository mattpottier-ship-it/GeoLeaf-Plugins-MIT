/**
 * event-bus-bridge.ts — Emits plugin events via document.dispatchEvent.
 *
 * GeoLeaf.events is a read-only subscribe-only facade for consumers.
 * All plugin-internal event emission uses document.dispatchEvent exclusively,
 * consistent with the connector plugin and plugin-registry patterns.
 */

import type { WsError, WsMetrics, TransportType } from "../transports/i-ws-transport.js";

// ─── Event payload types ───────────────────────────────────────────────────────

export interface WsConnectedPayload {
    transport: TransportType;
    channels: string[];
}

export interface WsDisconnectedPayload {
    transport: TransportType;
    reason: string;
}

export interface WsReconnectingPayload {
    attempt: number;
    nextDelayMs: number;
}

export interface WsFailedPayload {
    transport: TransportType;
    error: WsError;
}

export interface WsAuthRequiredPayload {
    transport: TransportType;
}

export interface WsMessagePayload {
    channel: string;
    payload: unknown;
}

export interface WsChannelPayload {
    channel: string;
}

export interface WsSendQueuedPayload {
    channel: string;
    queueLength: number;
}

export interface WsSendDroppedPayload {
    channel: string;
}

export interface WsSendQueuedOverflowPayload {
    channel: string;
    droppedPayload: unknown;
}

export interface WsHeartbeatTimeoutPayload {
    transport: TransportType;
}

// ─── Emitter ──────────────────────────────────────────────────────────────────

function emit(name: string, detail: unknown): void {
    if (typeof document === "undefined") return;
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: false, cancelable: false }));
}

/** Transport established and ready. */
export function emitConnected(payload: WsConnectedPayload): void {
    emit("geoleaf:ws:connected", payload);
}

/** Connection lost. */
export function emitDisconnected(payload: WsDisconnectedPayload): void {
    emit("geoleaf:ws:disconnected", payload);
}

/** Reconnection attempt in progress. */
export function emitReconnecting(payload: WsReconnectingPayload): void {
    emit("geoleaf:ws:reconnecting", payload);
}

/** Unrecoverable failure (max retries or auth error). */
export function emitFailed(payload: WsFailedPayload): void {
    emit("geoleaf:ws:failed", payload);
}

/** Auth expired — user action required. */
export function emitAuthRequired(payload: WsAuthRequiredPayload): void {
    emit("geoleaf:ws:auth-required", payload);
}

/** Message received on a subscribed channel. */
export function emitMessage(payload: WsMessagePayload): void {
    emit("geoleaf:ws:message", payload);
}

/** Channel subscription added or replaced. */
export function emitChannelSubscribed(payload: WsChannelPayload): void {
    emit("geoleaf:ws:channel-subscribed", payload);
}

/** Channel unsubscribed. */
export function emitChannelUnsubscribed(payload: WsChannelPayload): void {
    emit("geoleaf:ws:channel-unsubscribed", payload);
}

/** Message placed in the send queue while disconnected. */
export function emitSendQueued(payload: WsSendQueuedPayload): void {
    emit("geoleaf:ws:send-queued", payload);
}

/** Message dropped because queueOnDisconnect is false. */
export function emitSendDropped(payload: WsSendDroppedPayload): void {
    emit("geoleaf:ws:send-dropped", payload);
}

/** Oldest queued message evicted to enforce maxQueueSize. */
export function emitSendQueuedOverflow(payload: WsSendQueuedOverflowPayload): void {
    emit("geoleaf:ws:send-queued-overflow", payload);
}

/** Ping timed out — reconnection triggered. */
export function emitHeartbeatTimeout(payload: WsHeartbeatTimeoutPayload): void {
    emit("geoleaf:ws:heartbeat-timeout", payload);
}

/** Metrics snapshot updated. */
export function emitMetricsUpdated(metrics: WsMetrics): void {
    emit("geoleaf:ws:metrics-updated", metrics);
}
