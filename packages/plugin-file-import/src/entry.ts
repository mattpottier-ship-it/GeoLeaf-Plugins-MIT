/*!
 * GeoLeaf File Import Plugin — Entry Point
 * Mounts GeoLeaf.FileImport on the global GeoLeaf namespace and registers the plugin.
 * ESM only — no UMD, no CommonJS.
 *
 * Boot order: this script must be loaded AFTER @geoleaf/core and BEFORE GeoLeaf.boot().
 *
 * © 2026 Mattieu Pottier — MIT License
 */

import {
    convert,
    importAsLayer,
    getSupportedFormats,
    registerConverter,
} from "./public-api.js";

// Re-export extension points for plugin consumers
export type { IFileConverter, ConvertResult, GeoJSONFeatureCollection } from "./converters/i-converter.js";
export type { ImportLayerOptions } from "./public-api.js";

// ─── GeoLeaf global type augmentation ─────────────────────────────────────────

interface GeoLeafPluginAPI {
    _version?: string;
    FileImport?: unknown;
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
        convert,
        importAsLayer,
        getSupportedFormats,
        registerConverter,
    };
}

// ─── Mount GeoLeaf.FileImport ─────────────────────────────────────────────────

if (_g.GeoLeaf) {
    _g.GeoLeaf.FileImport = buildPublicApi();
}

// ─── Register plugin ──────────────────────────────────────────────────────────

if (_g.GeoLeaf?.plugins?.register) {
    _g.GeoLeaf.plugins.register("file-import", {
        version: "__GEOLEAF_FI_VERSION__",
        requires: [],
        optional: [],
        label: "FileImport (GPX/KML/CSV/TopoJSON)",
        healthCheck: () => !!_g.GeoLeaf?.FileImport,
    });
}
