/*!
 * GeoLeaf Realtime Layer Plugin — Entry Point
 * Mounts GeoLeaf.RealtimeLayer on the global GeoLeaf namespace and registers the plugin.
 * ESM only — no UMD, no CommonJS.
 *
 * Boot order: this script must be loaded AFTER @geoleaf-plugins/websocket (if using
 * WebSocket sources) and BEFORE GeoLeaf.boot().
 */

import { buildPublicApi } from "./public-api.js";
import { bootFromProfile } from "./realtime-manager.js";

// Re-export extension points for plugin consumers (e.g. @geoleaf-plugins/realtime-positions)
export type { IDecoder, DecodedUpdate } from "./decoders/i-decoder.js";
export type { IRealtimeSource } from "./sources/i-realtime-source.js";
export type { StaleActionHandler } from "./stale-manager.js";

// ─── GeoLeaf global type augmentation ─────────────────────────────────────────

interface GeoLeafPluginAPI {
    _version?: string;
    RealtimeLayer?: unknown;
    plugins?: {
        register(
            name: string,
            opts: {
                version?: string;
                requires?: string[];
                optional?: string[];
                label?: string;
                healthCheck?: () => boolean;
            }
        ): void;
        isLoaded?(name: string): boolean;
    };
    events?: {
        on(event: string, handler: () => void): void;
    };
}

const _g = globalThis as {
    GeoLeaf?: GeoLeafPluginAPI;
};

// ─── Mount GeoLeaf.RealtimeLayer ──────────────────────────────────────────────

if (_g.GeoLeaf) {
    _g.GeoLeaf.RealtimeLayer = buildPublicApi();
}

// ─── Register plugin ──────────────────────────────────────────────────────────

if (_g.GeoLeaf?.plugins?.register) {
    _g.GeoLeaf.plugins.register("realtime-layer", {
        version: "__GEOLEAF_RT_VERSION__",
        type: "standard",
        requires: [],              // only @geoleaf/core
        optional: ["websocket"],   // required only for source: "websocket" layers
        label: "GeoLeaf Realtime Layer",
        healthCheck: () => !!_g.GeoLeaf?.RealtimeLayer,
    });
}

// ─── Auto-boot: scan layers with data.realtime.enabled: true ─────────────────
//
// The correct event is "geoleaf:app:ready" dispatched from app/init.ts revealApp().
// The spec references "geoleaf:boot:ready" which is incorrect — use the actual event.

document.addEventListener("geoleaf:app:ready", () => {
    bootFromProfile();
});
