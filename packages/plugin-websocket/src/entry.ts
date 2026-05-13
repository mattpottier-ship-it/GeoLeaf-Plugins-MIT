/*!
 * GeoLeaf WebSocket Plugin — Entry Point
 * Mounts GeoLeaf.Ws on the global GeoLeaf namespace and registers the plugin.
 * ESM only — no UMD, no CommonJS.
 */

import { buildPublicApi } from "./public-api.js";
import { registerTransport } from "./transports/transport-registry.js";

// Re-export registerTransport for consumers who want to add custom transports
export { registerTransport };

// ─── GeoLeaf global type augmentation ─────────────────────────────────────────

interface GeoLeafPluginAPI {
    _version?: string;
    Ws?: unknown;
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
    };
}

const _g = globalThis as {
    GeoLeaf?: GeoLeafPluginAPI;
};

// ─── Mount GeoLeaf.Ws ─────────────────────────────────────────────────────────

if (_g.GeoLeaf) {
    _g.GeoLeaf.Ws = buildPublicApi();
}

// ─── Register plugin ──────────────────────────────────────────────────────────

if (_g.GeoLeaf?.plugins?.register) {
    _g.GeoLeaf.plugins.register("websocket", {
        version: "__GEOLEAF_WS_VERSION__",
        type: "standard",
        label: "WebSocket Transport",
        healthCheck: () => {
            const ws = _g.GeoLeaf?.Ws as { state?: string } | undefined;
            return ws?.state === "connected";
        },
    });
}
