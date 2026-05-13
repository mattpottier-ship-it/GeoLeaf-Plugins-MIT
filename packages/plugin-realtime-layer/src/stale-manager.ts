/**
 * StaleManager — tracks the last-seen timestamp of each feature per layer and
 * applies the configured stale action when the timeout is exceeded.
 *
 * Runs a background `setInterval` check every 10 s (hard-coded). When a feature
 * has not been touched for more than `staleTimeoutMs`:
 *  - `"remove"` (default): the feature is removed from the layer.
 *  - `"dim"`: the property `_stale: true` is merged onto the feature — the layer
 *    style should define a `styleRule` on this field.
 *  - Custom action: called via handler registered with `registerStaleAction()`.
 *
 * @module stale-manager
 */

import type { RealtimeConfig } from "./config-schema.js";

export type StaleActionHandler = (
    layerId: string,
    featureId: string,
    feature: Record<string, unknown>
) => void;

interface GeoLeafGeoJSON {
    getLayerData(layerId: string): {
        features: Array<{ properties?: Record<string, unknown> | null }>;
    } | null;
    updateLayerData(layerId: string, data: unknown): void;
}

const _g = globalThis as { GeoLeaf?: { GeoJSON?: GeoLeafGeoJSON } };

const STALE_CHECK_INTERVAL_MS = 10_000;

/** Per-layer feature timestamp tracking. */
const _lastSeen = new Map<string, Map<string, number>>();

/** Custom stale action handlers. */
const _customActions = new Map<string, StaleActionHandler>();

/** setInterval handle for the global stale check. */
let _checkTimer: ReturnType<typeof setInterval> | null = null;

/** Active configs per layer. */
const _activeConfigs = new Map<string, RealtimeConfig>();

/** Cumulative stale eviction count per layer. */
const _staleCounts = new Map<string, number>();

/** Register a custom stale action by name. */
export function registerStaleAction(name: string, handler: StaleActionHandler): void {
    _customActions.set(name, handler);
}

/** Record a feature as freshly updated for a given layer. */
export function touch(layerId: string, featureId: string): void {
    if (!_lastSeen.has(layerId)) {
        _lastSeen.set(layerId, new Map());
    }
    _lastSeen.get(layerId)?.set(featureId, Date.now());
}

/** Start tracking stale features for a layer. */
export function startTracking(layerId: string, config: RealtimeConfig): void {
    if (!config.staleTimeoutMs) return;
    _activeConfigs.set(layerId, config);
    _ensureTimer();
}

/** Stop tracking stale features for a layer and clear its timestamps. */
export function stopTracking(layerId: string): void {
    _activeConfigs.delete(layerId);
    _lastSeen.delete(layerId);
    _staleCounts.delete(layerId);
    if (_activeConfigs.size === 0) _clearTimer();
}

/** Returns the cumulative count of evicted stale features for a layer. */
export function getStaleCount(layerId: string): number {
    return _staleCounts.get(layerId) ?? 0;
}

function _ensureTimer(): void {
    if (_checkTimer !== null) return;
    _checkTimer = setInterval(_runCheck, STALE_CHECK_INTERVAL_MS);
}

function _clearTimer(): void {
    if (_checkTimer !== null) {
        clearInterval(_checkTimer);
        _checkTimer = null;
    }
}

function _runCheck(): void {
    const now = Date.now();
    for (const [layerId, config] of _activeConfigs.entries()) {
        if (!config.staleTimeoutMs) continue;
        const layer = _lastSeen.get(layerId);
        if (!layer) continue;

        for (const [featureId, ts] of layer.entries()) {
            if (now - ts <= config.staleTimeoutMs) continue;

            const action = config.staleAction ?? "remove";
            _applyAction(layerId, featureId, action);
            layer.delete(featureId);
            _staleCounts.set(layerId, (_staleCounts.get(layerId) ?? 0) + 1);
        }
    }
}

function _applyAction(
    layerId: string,
    featureId: string,
    action: string
): void {
    const GeoJSON = _g.GeoLeaf?.GeoJSON;
    if (!GeoJSON) return;

    if (action === "remove") {
        _removeFeature(GeoJSON, layerId, featureId);
        return;
    }

    if (action === "dim") {
        _mergeFeatureProps(GeoJSON, layerId, featureId, { _stale: true });
        return;
    }

    const handler = _customActions.get(action);
    if (handler) {
        const layerData = GeoJSON.getLayerData(layerId);
        const feature = layerData?.features.find(
            (f) => _featureStrId(f.properties) === featureId
        );
        handler(layerId, featureId, feature?.properties ?? {});
        return;
    }

    console.warn(
        `[realtime-layer][stale] Unknown stale action "${action}" for layer "${layerId}". Feature "${featureId}" left unchanged.`
    );
}

/** Extract a string ID from a feature's properties, safely. */
function _featureStrId(props: Record<string, unknown> | null | undefined): string {
    if (!props) return "";
    const v = props["id"] ?? props["_id"] ?? "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    return "";
}

function _removeFeature(
    GeoJSON: GeoLeafGeoJSON,
    layerId: string,
    featureId: string
): void {
    const layerData = GeoJSON.getLayerData(layerId);
    if (!layerData) return;
    const features = layerData.features.filter(
        (f) => _featureStrId(f.properties) !== featureId
    );
    GeoJSON.updateLayerData(layerId, { type: "FeatureCollection", features });
}

function _mergeFeatureProps(
    GeoJSON: GeoLeafGeoJSON,
    layerId: string,
    featureId: string,
    patch: Record<string, unknown>
): void {
    const layerData = GeoJSON.getLayerData(layerId);
    if (!layerData) return;
    const features = layerData.features.map((f) => {
        const fid = _featureStrId(f.properties);
        if (fid !== featureId) return f;
        return { ...f, properties: { ...(f.properties ?? undefined), ...patch } };
    });
    GeoJSON.updateLayerData(layerId, { type: "FeatureCollection", features });
}
