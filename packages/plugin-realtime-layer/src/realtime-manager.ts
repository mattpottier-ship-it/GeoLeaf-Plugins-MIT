/**
 * RealtimeManager — orchestrates realtime layer sources.
 *
 * - Scans all loaded GeoLeaf layer configs for `data.realtime.enabled: true`
 *   at boot time.
 * - Instantiates sources and decoders via the factories.
 * - Manages `start()` / `stop()` lifecycle per layer.
 * - Reports status via `getStatus()`.
 *
 * @module realtime-manager
 */

import type { IDecoder } from "./decoders/i-decoder.js";
import type { IRealtimeSource } from "./sources/i-realtime-source.js";
import type { RealtimeConfig } from "./config-schema.js";
import { validateRealtimeConfig } from "./config-schema.js";
import { createSource } from "./source-factory.js";
import { JsonDecoder } from "./decoders/json-decoder.js";
import { GtfsRtDecoder } from "./decoders/gtfs-rt-decoder.js";
import { applyUpdates } from "./layer-updater.js";
import { startTracking, stopTracking, getStaleCount } from "./stale-manager.js";

// ── GeoLeaf API surface used by this module ───────────────────────────────────

interface GeoLeafAPI {
    GeoJSON?: {
        getAllLayers(): Array<{ id: string }>;
        getLayerData(id: string): { config?: Record<string, unknown> } | null;
    };
}

const _g = globalThis as { GeoLeaf?: GeoLeafAPI };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RealtimeStatus {
    active: boolean;
    source: string;
    lastUpdateAt: number | null;
    staleCount: number;
}

interface ActiveEntry {
    source: IRealtimeSource;
    decoder: IDecoder;
    config: RealtimeConfig;
    lastUpdateAt: number | null;
}

// ── Decoder registry ──────────────────────────────────────────────────────────

const _decoderRegistry = new Map<string, IDecoder>();
_decoderRegistry.set("json", new JsonDecoder());
// gtfs-rt registered lazily on first use to avoid loading protobuf unless needed

// ── Active layer entries ──────────────────────────────────────────────────────

const _active = new Map<string, ActiveEntry>();

/**
 * Extract the `realtime` block from a layer config, supporting both the
 * canonical profile schema (`config.data.realtime`) and the legacy/flat
 * test schema (`config.realtime`). Returns `undefined` when neither is set.
 */
function _extractRealtime(config: unknown): unknown {
    if (!config || typeof config !== "object") return undefined;
    const c = config as Record<string, unknown>;
    const data = c["data"];
    if (data && typeof data === "object") {
        const fromData = (data as Record<string, unknown>)["realtime"];
        if (fromData !== undefined) return fromData;
    }
    return c["realtime"];
}

// ── Public manager API ────────────────────────────────────────────────────────

/** Register a custom decoder by name. Must be called before `GeoLeaf.boot()`. */
export function registerDecoder(name: string, decoder: IDecoder): void {
    _decoderRegistry.set(name, decoder);
}

/**
 * Start real-time updates for a single layer.
 * If already active, this is a no-op.
 */
export function start(layerId: string): void {
    if (_active.has(layerId)) return;

    const GeoJSON = _g.GeoLeaf?.GeoJSON;
    if (!GeoJSON) {
        console.warn(`[realtime-layer] GeoLeaf.GeoJSON not available — cannot start "${layerId}"`);
        return;
    }

    const layerData = GeoJSON.getLayerData(layerId);
    const rawConfig = _extractRealtime(layerData?.config);
    if (!rawConfig) {
        console.warn(`[realtime-layer] No data.realtime config found for layer "${layerId}"`);
        return;
    }

    let config: RealtimeConfig;
    try {
        config = validateRealtimeConfig(rawConfig, layerId);
    } catch (err) {
        console.error(String(err));
        return;
    }

    _startEntry(layerId, config);
}

/** Stop real-time updates for a single layer. */
export function stop(layerId: string): void {
    const entry = _active.get(layerId);
    if (!entry) return;
    entry.source.stop();
    stopTracking(layerId);
    _active.delete(layerId);
}

/** Stop all active realtime layers. */
export function stopAll(): void {
    for (const layerId of Array.from(_active.keys())) {
        stop(layerId);
    }
}

/** Current status of a realtime layer. */
export function getStatus(layerId: string): RealtimeStatus {
    const entry = _active.get(layerId);
    if (!entry) {
        return { active: false, source: "none", lastUpdateAt: null, staleCount: 0 };
    }
    return {
        active: true,
        source: entry.config.source,
        lastUpdateAt: entry.lastUpdateAt,
        staleCount: getStaleCount(layerId),
    };
}

/**
 * Called at boot — scans all layers for `data.realtime.enabled: true` and
 * starts sources automatically.
 */
export function bootFromProfile(): void {
    const GeoJSON = _g.GeoLeaf?.GeoJSON;
    if (!GeoJSON) return;

    const layers = GeoJSON.getAllLayers();
    for (const { id } of layers) {
        const layerData = GeoJSON.getLayerData(id);
        const rawRealtime = _extractRealtime(layerData?.config);
        if (!rawRealtime || typeof rawRealtime !== "object") continue;
        const rt = rawRealtime as Record<string, unknown>;
        if (rt["enabled"] !== true) continue;

        let config: RealtimeConfig;
        try {
            config = validateRealtimeConfig(rawRealtime, id);
        } catch (err) {
            console.error(String(err));
            continue;
        }
        _startEntry(id, config);
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _startEntry(layerId: string, config: RealtimeConfig): void {
    let decoder = _decoderRegistry.get(config.decoder);
    if (!decoder) {
        if (config.decoder === "gtfs-rt") {
            decoder = new GtfsRtDecoder(config.mapping);
            _decoderRegistry.set("gtfs-rt", decoder);
        } else {
            console.error(
                `[realtime-layer] "${layerId}": unknown decoder "${config.decoder}". ` +
                    `Register it with GeoLeaf.RealtimeLayer.registerDecoder() before boot.`
            );
            return;
        }
    }

    let source: IRealtimeSource;
    try {
        source = createSource(config, layerId);
    } catch (err) {
        console.error(String(err));
        return;
    }

    const entry: ActiveEntry = {
        source,
        decoder,
        config,
        lastUpdateAt: null,
    };
    _active.set(layerId, entry);

    // Determine target layer (gtfs-rt may target a different layer)
    const targetLayerId = config.mapping?.targetLayerId ?? layerId;

    source.onData((rawData) => {
        const updates = decoder.decode(rawData);
        if (!updates.length) return;
        entry.lastUpdateAt = Date.now();
        applyUpdates(layerId, updates, config, targetLayerId);
    });

    if (config.staleTimeoutMs) {
        startTracking(layerId, config);
    }

    source.start();
}
