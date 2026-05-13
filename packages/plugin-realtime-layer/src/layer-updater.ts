/**
 * LayerUpdater — applies decoded feature updates to a GeoLeaf layer using
 * `GeoLeaf.GeoJSON.*` public API only (no access to core internals).
 *
 * Supported update modes:
 *  - `"replace"` — replaces the entire FeatureCollection with the incoming data.
 *  - `"upsert"`  — adds or updates individual features identified by `idField`.
 *  - `"merge"`   — merges properties onto existing features identified by `idField`.
 *
 * @module layer-updater
 */

import type { DecodedUpdate, GeoJSONGeometry } from "./decoders/i-decoder.js";
import type { RealtimeConfig } from "./config-schema.js";
import { touch } from "./stale-manager.js";

interface GeoLeafGeoJSON {
    getLayerData(
        layerId: string
    ): {
        features: Array<{
            properties?: Record<string, unknown> | null;
            geometry?: GeoJSONGeometry | null;
            type?: string;
        }>;
    } | null;
    updateLayerData(layerId: string, data: unknown): void;
}

const _g = globalThis as { GeoLeaf?: { GeoJSON?: GeoLeafGeoJSON } };

type GeoJSONFeature = {
    type: "Feature";
    properties: Record<string, unknown> | null;
    geometry: GeoJSONGeometry | null;
};

/**
 * Apply a batch of decoded updates to a layer according to the config's `updateMode`.
 *
 * @param layerId  - GeoLeaf layer ID to update.
 * @param updates  - Decoded updates from the decoder.
 * @param config   - Realtime config for the layer (mode, idField, …).
 * @param targetLayerId - Optional override for the layer to update (gtfs-rt mapping.targetLayerId).
 */
export function applyUpdates(
    layerId: string,
    updates: DecodedUpdate[],
    config: RealtimeConfig,
    targetLayerId?: string
): void {
    const targetId = targetLayerId ?? layerId;
    const GeoJSON = _g.GeoLeaf?.GeoJSON;
    if (!GeoJSON) {
        console.warn("[realtime-layer] GeoLeaf.GeoJSON is not available.");
        return;
    }

    const mode = config.updateMode ?? "upsert";

    if (mode === "replace") {
        _applyReplace(GeoJSON, targetId, updates);
        return;
    }

    const idField = config.idField;
    _applyUpsertOrMerge(GeoJSON, targetId, updates, idField, mode === "merge");
}

// ── replace ──────────────────────────────────────────────────────────────────

function _applyReplace(
    GeoJSON: GeoLeafGeoJSON,
    layerId: string,
    updates: DecodedUpdate[]
): void {
    const features: GeoJSONFeature[] = updates.map((u) => ({
        type: "Feature",
        properties: { ...u.properties, _realtimeId: u.id },
        geometry: u.geometry ?? null,
    }));
    GeoJSON.updateLayerData(layerId, { type: "FeatureCollection", features });
}

// ── upsert / merge ────────────────────────────────────────────────────────────

function _applyUpsertOrMerge(
    GeoJSON: GeoLeafGeoJSON,
    layerId: string,
    updates: DecodedUpdate[],
    idField: string | undefined,
    mergeOnly: boolean
): void {
    const layerData = GeoJSON.getLayerData(layerId);
    const existing: GeoJSONFeature[] = layerData
        ? (
              layerData.features as Array<{
                  properties?: Record<string, unknown> | null;
                  geometry?: GeoJSONGeometry | null;
              }>
          ).map((f) => ({
              type: "Feature" as const,
              properties: f.properties ? { ...f.properties } : {},
              geometry: f.geometry ?? null,
          }))
        : [];

    for (const update of updates) {
        if (update.action === "delete") {
            const idx = _findIndex(existing, update.id, idField);
            if (idx !== -1) existing.splice(idx, 1);
            continue;
        }

        const idx = _findIndex(existing, update.id, idField);
        if (idx !== -1) {
            // Update existing feature
            const target = existing[idx];
            if (!mergeOnly && update.geometry) {
                target.geometry = update.geometry;
            }
            target.properties = { ...target.properties, ...update.properties };
        } else if (!mergeOnly) {
            // upsert: insert new feature
            existing.push({
                type: "Feature",
                properties: { ...update.properties, [idField ?? "_realtimeId"]: update.id },
                geometry: update.geometry ?? null,
            });
        }

        // Record touch time for stale tracking
        touch(layerId, update.id);
    }

    GeoJSON.updateLayerData(layerId, { type: "FeatureCollection", features: existing });
}

/**
 * Find the index of a feature in an array by its ID field value.
 * Checks `idField` property first, then `id`, then `_id`.
 */
function _findIndex(
    features: GeoJSONFeature[],
    id: string,
    idField: string | undefined
): number {
    return features.findIndex((f) => {
        if (!f.properties) return false;
        const props = f.properties;
        if (idField && props[idField] !== undefined) {
            const v = props[idField];
            return (typeof v === "string" || typeof v === "number") && String(v) === id;
        }
        const fallback = props["id"] ?? props["_id"] ?? props["_realtimeId"] ?? "";
        return (typeof fallback === "string" || typeof fallback === "number") && String(fallback) === id;
    });
}
