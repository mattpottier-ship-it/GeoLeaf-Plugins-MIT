/*!
 * GeoLeaf FlatGeobuf Plugin — Public API
 *
 * Exposes 4 functions: load, loadBbox, loadAsLayer, loadBboxAsLayer.
 * Each function delegates to the core loader/bbox-filter modules.
 *
 * © 2026 Mattieu Pottier — MIT License
 */
import type { FgbBbox, FgbLoadOptions, FgbBboxOptions, FgbLayerOptions, FgbLoadResult } from "./types.js";
import { loadFgb } from "./fgb-loader.js";
import { loadFgbBbox, setupAutoRefresh } from "./fgb-bbox-filter.js";

// ─── GeoLeaf core accessor ────────────────────────────────────────────────────

interface GeoLeafGeoJSON {
    addData?(data: unknown, options?: Record<string, unknown>): string | undefined;
}

interface GeoLeafCore {
    getMap?(): { getNativeMap?(): unknown } | null;
}

interface GeoLeafNS {
    GeoJSON?: GeoLeafGeoJSON;
    Core?: GeoLeafCore;
}

function _getGeoLeaf(): GeoLeafNS {
    return (globalThis as any).GeoLeaf ?? {};
}

function _addDataToMap(
    result: FgbLoadResult,
    options: FgbLayerOptions
): string {
    const gl = _getGeoLeaf();
    if (!gl.GeoJSON?.addData) {
        throw new Error("[GeoLeaf.FlatGeobuf] GeoLeaf.GeoJSON.addData is not available. Is @geoleaf/core loaded?");
    }

    const addOptions: Record<string, unknown> = {};
    if (options.layerId) addOptions.id = options.layerId;
    if (options.layerName) addOptions.name = options.layerName;
    if (options.visible !== undefined) addOptions.visible = options.visible;
    if (options.cluster) addOptions.cluster = options.cluster;

    const layerId = gl.GeoJSON.addData(result.data, addOptions);
    if (!layerId) {
        throw new Error("[GeoLeaf.FlatGeobuf] addData returned no layer ID.");
    }
    return layerId;
}

// ─── load ────────────────────────────────────────────────────────────────────

/**
 * Loads a complete FlatGeobuf file from a URL and returns a GeoJSON FeatureCollection.
 *
 * @param url - Remote URL of the .fgb file.
 * @param options - Load options (maxFeatures, signal, onHeader).
 * @returns The deserialized FeatureCollection with metadata.
 */
export async function load(
    url: string,
    options?: FgbLoadOptions
): Promise<FgbLoadResult> {
    return loadFgb(url, options);
}

// ─── loadBbox ────────────────────────────────────────────────────────────────

/**
 * Loads features from a FlatGeobuf file filtered by a bounding box.
 * Uses the FGB spatial index and HTTP Range requests for efficiency.
 *
 * @param url - Remote URL of the .fgb file.
 * @param bbox - Bounding box filter { minX, minY, maxX, maxY }.
 * @param options - Load options (maxFeatures, signal, onHeader).
 * @returns The filtered FeatureCollection.
 */
export async function loadBbox(
    url: string,
    bbox: FgbBbox,
    options?: FgbBboxOptions
): Promise<FgbLoadResult> {
    return loadFgbBbox(url, bbox, options);
}

// ─── loadAsLayer ──────────────────────────────────────────────────────────────

/**
 * Loads a complete FlatGeobuf file and adds it as a GeoJSON layer on the map.
 *
 * @param url - Remote URL of the .fgb file.
 * @param options - Layer options (layerId, visible, cluster, maxFeatures…).
 * @returns The created layer ID.
 */
export async function loadAsLayer(
    url: string,
    options: FgbLayerOptions = {}
): Promise<string> {
    const result = await loadFgb(url, options);
    return _addDataToMap(result, options);
}

// ─── loadBboxAsLayer ──────────────────────────────────────────────────────────

/**
 * Loads FlatGeobuf features filtered by bbox and adds them as a GeoJSON layer.
 * Optionally sets up auto-refresh to re-fetch on viewport change.
 *
 * @param url - Remote URL of the .fgb file.
 * @param bbox - Initial bounding box filter.
 * @param options - Layer + bbox options (autoRefresh, debounceMs…).
 * @returns The created layer ID.
 */
export async function loadBboxAsLayer(
    url: string,
    bbox: FgbBbox,
    options: FgbLayerOptions = {}
): Promise<string> {
    const result = await loadFgbBbox(url, bbox, options);
    const layerId = _addDataToMap(result, options);

    // Set up auto-refresh if requested
    if (options.autoRefresh) {
        const gl = _getGeoLeaf();
        const adapter = gl.Core?.getMap?.();
        const nativeMap = adapter && typeof (adapter as any).getNativeMap === "function"
            ? (adapter as any).getNativeMap()
            : null;

        if (nativeMap && typeof nativeMap.on === "function") {
            setupAutoRefresh(nativeMap, url, options, async (newBbox) => {
                try {
                    const refreshed = await loadFgbBbox(url, newBbox, options);
                    gl.GeoJSON?.addData?.(refreshed.data, { id: layerId, replace: true });
                } catch {
                    // Silently ignore auto-refresh errors (network, abort, etc.)
                }
            });
        }
    }

    return layerId;
}
