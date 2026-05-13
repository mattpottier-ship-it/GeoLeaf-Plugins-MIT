/*!
 * GeoLeaf FlatGeobuf Plugin — Declarative JSON Config Loader
 *
 * Parses a declarative layer config object (as found in profiles JSON)
 * and delegates to loadAsLayer / loadBboxAsLayer accordingly.
 *
 * © 2026 Mattieu Pottier — MIT License
 */

import type { FgbBbox, FgbLayerOptions } from "./types.js";
import { loadAsLayer, loadBboxAsLayer } from "./public-api.js";

// ─── Declarative config schema ────────────────────────────────────────────────

/**
 * Declarative JSON configuration for a FlatGeobuf layer, as used in profile
 * layer config files (e.g. `zones_desserte_config.json`).
 *
 * @example
 * ```json
 * {
 *   "id": "zones_desserte",
 *   "label": "Zones de desserte SNCF",
 *   "plugin": "flatgeobuf",
 *   "data": {
 *     "url": "data/zones_desserte_sncf.fgb",
 *     "bbox": [2.225, 41.362, 8.227, 51.089],
 *     "limit": 1000,
 *     "autoRefresh": true,
 *     "debounceMs": 500
 *   }
 * }
 * ```
 */
export interface FgbLayerJsonConfig {
    /** Layer identifier, used as MapLibre source/layer ID. */
    id: string;
    /** Human-readable layer name shown in the UI. */
    label?: string;
    /** Must be `"flatgeobuf"` — used by the profile loader to route to this plugin. */
    plugin: "flatgeobuf";
    data: {
        /** URL of the `.fgb` file (absolute or relative to the deployed profile root). */
        url: string;
        /**
         * Optional bounding box filter `[W, S, E, N]` (minLng, minLat, maxLng, maxLat).
         * When present, uses FGB R-tree spatial index + HTTP Range requests.
         */
        bbox?: [number, number, number, number];
        /** Maximum number of features to load (anti-DoS). Default: 100 000. */
        limit?: number;
        /** Re-fetch features when the map viewport changes (`moveend`). Default: false. */
        autoRefresh?: boolean;
        /** Debounce delay in ms for auto-refresh. Default: 300. */
        debounceMs?: number;
    };
    /** Initial layer visibility. Default: true. */
    defaultVisible?: boolean;
    /** Enable point clustering. Default: false. */
    cluster?: boolean;
}

// ─── loadLayerFromConfig ──────────────────────────────────────────────────────

/**
 * Loads a FlatGeobuf layer from a declarative JSON configuration object.
 *
 * - If `config.data.bbox` is defined, delegates to `loadBboxAsLayer` with HTTP Range
 *   spatial filtering and optional auto-refresh on viewport change.
 * - Otherwise, delegates to `loadAsLayer` to load the complete file.
 *
 * @param config - Declarative layer configuration (e.g. parsed from a profile JSON file).
 * @returns The created MapLibre layer ID.
 *
 * @example
 * ```typescript
 * const layerId = await GeoLeaf.FlatGeobuf.loadLayerFromConfig({
 *   id: "eco_regions_fgb",
 *   label: "Éco-régions (FlatGeobuf)",
 *   plugin: "flatgeobuf",
 *   data: { url: "layers/eco_regions_fgb/data/eco_regions.fgb", limit: 50000 }
 * });
 * ```
 */
export async function loadLayerFromConfig(config: FgbLayerJsonConfig): Promise<string> {
    const { id, label, data, defaultVisible, cluster } = config;

    const layerOpts: FgbLayerOptions = {
        layerId: id,
        layerName: label,
        maxFeatures: data.limit,
        visible: defaultVisible,
        cluster,
    };

    if (data.bbox) {
        const [minX, minY, maxX, maxY] = data.bbox;
        const bbox: FgbBbox = { minX, minY, maxX, maxY };
        return loadBboxAsLayer(data.url, bbox, {
            ...layerOpts,
            autoRefresh: data.autoRefresh ?? false,
            debounceMs: data.debounceMs,
        });
    }

    return loadAsLayer(data.url, layerOpts);
}
