/*!
 * GeoLeaf FlatGeobuf Plugin — Entry Point
 * Mounts GeoLeaf.FlatGeobuf on the global GeoLeaf namespace and registers the plugin.
 * ESM only — no UMD, no CommonJS.
 *
 * Boot order: this script must be loaded AFTER @geoleaf/core and BEFORE GeoLeaf.boot().
 *
 * © 2026 Mattieu Pottier — MIT License
 */

import { load, loadBbox, loadAsLayer, loadBboxAsLayer } from "./public-api.js";
import { loadLayerFromConfig } from "./config-loader.js";

// Re-export types for plugin consumers
export type {
    FgbBbox,
    FgbLoadOptions,
    FgbBboxOptions,
    FgbLayerOptions,
    FgbLoadResult,
} from "./types.js";
export type { FgbLayerJsonConfig } from "./config-loader.js";

// ─── GeoLeaf global type augmentation ─────────────────────────────────────────

interface GeoLeafPluginAPI {
    _version?: string;
    FlatGeobuf?: unknown;
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
}

const _g = globalThis as {
    GeoLeaf?: GeoLeafPluginAPI;
};

// ─── Build public API object ──────────────────────────────────────────────────

function buildPublicApi() {
    return {
        load,
        loadBbox,
        loadAsLayer,
        loadBboxAsLayer,
        loadLayerFromConfig,
    };
}

// ─── Mount GeoLeaf.FlatGeobuf ─────────────────────────────────────────────────

if (_g.GeoLeaf) {
    _g.GeoLeaf.FlatGeobuf = buildPublicApi();
}

// ─── Register plugin ──────────────────────────────────────────────────────────

if (_g.GeoLeaf?.plugins?.register) {
    _g.GeoLeaf.plugins.register("flatgeobuf", {
        version: "__GEOLEAF_FGB_VERSION__",
        requires: [],
        optional: [],
        label: "FlatGeobuf (spatial binary vector)",
        healthCheck: () => typeof _g.GeoLeaf?.FlatGeobuf === "object",
    });
}
