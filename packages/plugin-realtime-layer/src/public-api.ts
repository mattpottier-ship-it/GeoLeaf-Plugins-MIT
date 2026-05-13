/**
 * public-api — builds the `GeoLeaf.RealtimeLayer` namespace object.
 *
 * This is the only surface exposed to integrators. All methods delegate to
 * realtime-manager and stale-manager internals.
 *
 * @module public-api
 */

import type { IDecoder } from "./decoders/i-decoder.js";
import type { StaleActionHandler } from "./stale-manager.js";
import type { RealtimeStatus } from "./realtime-manager.js";
import {
    start,
    stop,
    stopAll,
    getStatus,
    registerDecoder as _registerDecoder,
} from "./realtime-manager.js";
import { registerStaleAction as _registerStaleAction } from "./stale-manager.js";

export interface RealtimeLayerPublicAPI {
    /**
     * Start real-time updates for a layer.
     * Called automatically at boot for all layers with `data.realtime.enabled: true`.
     * Can be called manually for layers with `enabled: false` (opt-in).
     */
    start(layerId: string): void;

    /** Stop real-time updates for a specific layer. */
    stop(layerId: string): void;

    /** Stop all active realtime layers. */
    stopAll(): void;

    /** Returns the current status of a realtime layer. */
    getStatus(layerId: string): RealtimeStatus;

    /**
     * Register a custom decoder.
     * Must be called before `GeoLeaf.boot()` so it is available at boot scan.
     *
     * @example
     * GeoLeaf.RealtimeLayer.registerDecoder('my-format', new MyDecoder());
     */
    registerDecoder(name: string, decoder: IDecoder): void;

    /**
     * Register a custom stale action handler.
     * Must be called before `GeoLeaf.boot()`.
     *
     * @example
     * GeoLeaf.RealtimeLayer.registerStaleAction('notify', (layerId, featureId, feature) => {
     *   GeoLeaf.Notifications.show(`Feature ${featureId} is stale`, { type: 'warning' });
     * });
     */
    registerStaleAction(name: string, handler: StaleActionHandler): void;

    /** Plugin version string. */
    version: string;
}

export function buildPublicApi(): RealtimeLayerPublicAPI {
    return {
        start,
        stop,
        stopAll,
        getStatus,
        registerDecoder: _registerDecoder,
        registerStaleAction: _registerStaleAction,
        version: "__GEOLEAF_RT_VERSION__",
    };
}
