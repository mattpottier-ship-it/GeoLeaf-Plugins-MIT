/**
 * config-schema — validation helpers for `data.realtime` config blocks.
 *
 * Consumed by realtime-manager at boot to validate each layer config before
 * starting a source.
 *
 * @module config-schema
 */

/** Full `data.realtime` configuration block supported by the plugin. */
export interface RealtimeConfig {
    /** Whether real-time is active for this layer. */
    enabled: boolean;
    /** Data transport type. */
    source: "polling" | "websocket" | "sse";
    /**
     * Decoder to apply on arriving raw data.
     * Built-in values: `"json"`, `"gtfs-rt"`. Pass a custom name registered via
     * `GeoLeaf.RealtimeLayer.registerDecoder()`.
     */
    decoder: string;
    /** How to apply decoded updates onto the layer. Default: `"upsert"`. */
    updateMode?: "upsert" | "replace" | "merge";
    /**
     * GeoJSON feature property used as unique key (required for `upsert` and `merge`).
     * Maps inbound feature IDs to existing features in the layer.
     */
    idField?: string;
    /** Milliseconds after which a non-updated feature is considered stale. */
    staleTimeoutMs?: number;
    /**
     * What to do with stale features. Default: `"remove"`.
     * Built-in: `"remove"`, `"dim"`. Pass a custom name registered via
     * `GeoLeaf.RealtimeLayer.registerStaleAction()`.
     */
    staleAction?: string;

    // ── polling / sse ──
    /** Endpoint URL (required for `"polling"` and `"sse"`). */
    url?: string;
    /** Polling interval in ms (polling only). Default: 30 000. */
    intervalMs?: number;
    /**
     * Optional fallback URL fetched when {@link url} returns a non-2xx response
     * or throws a network error. Typically points to a static snapshot served
     * from the same origin as the profile (e.g. `data/foo_snapshot.geojson`).
     *
     * The snapshot is emitted once per outage window; the source keeps polling
     * the primary URL every {@link intervalMs} and automatically returns to it
     * on the first successful tick. Polling-only.
     */
    fallbackUrl?: string;

    // ── websocket ──
    /** WebSocket channel name passed to `GeoLeaf.Ws.subscribe()` (required for `"websocket"`). */
    channel?: string;

    // ── gtfs-rt decoder ──
    /** Mapping hints for the GTFS-RT decoder. */
    mapping?: {
        /** GTFS-RT entity field to use as the feature identifier. */
        idField?: string;
        /** GTFS-RT field carrying the delay value in seconds. */
        delayField?: string;
        /** Target GeoLeaf layer ID to update (may differ from the config's own layer). */
        targetLayerId?: string;
    };
}

// ── Internal validation helpers ───────────────────────────────────────────────

const VALID_SOURCES = ["polling", "websocket", "sse"] as const;
const VALID_MODES = ["upsert", "replace", "merge"] as const;

function _assertObject(raw: unknown, layerId: string): Record<string, unknown> {
    if (!raw || typeof raw !== "object") {
        throw new Error(`[realtime-layer] "${layerId}": data.realtime must be an object`);
    }
    return raw as Record<string, unknown>;
}

function _assertSource(r: Record<string, unknown>, layerId: string): RealtimeConfig["source"] {
    if (!VALID_SOURCES.includes(r["source"] as (typeof VALID_SOURCES)[number])) {
        throw new Error(
            `[realtime-layer] "${layerId}": data.realtime.source must be one of: ${VALID_SOURCES.join(", ")}`
        );
    }
    return r["source"] as RealtimeConfig["source"];
}

function _assertDecoder(r: Record<string, unknown>, layerId: string): string {
    if (typeof r["decoder"] !== "string" || r["decoder"].length === 0) {
        throw new Error(
            `[realtime-layer] "${layerId}": data.realtime.decoder must be a non-empty string`
        );
    }
    return r["decoder"];
}

function _assertSourceParams(
    r: Record<string, unknown>,
    source: RealtimeConfig["source"],
    layerId: string
): void {
    if ((source === "polling" || source === "sse") && typeof r["url"] !== "string") {
        throw new Error(
            `[realtime-layer] "${layerId}": data.realtime.url is required for source "${source}"`
        );
    }
    if (source === "websocket" && typeof r["channel"] !== "string") {
        throw new Error(
            `[realtime-layer] "${layerId}": data.realtime.channel is required for source "websocket"`
        );
    }
}

function _assertUpdateMode(
    r: Record<string, unknown>,
    layerId: string
): RealtimeConfig["updateMode"] {
    const updateMode = (r["updateMode"] as string | undefined) ?? "upsert";
    if (!VALID_MODES.includes(updateMode as (typeof VALID_MODES)[number])) {
        throw new Error(
            `[realtime-layer] "${layerId}": data.realtime.updateMode must be one of: ${VALID_MODES.join(", ")}`
        );
    }
    return updateMode as RealtimeConfig["updateMode"];
}

// ── Public validator ──────────────────────────────────────────────────────────

/**
 * Validate a raw `data.realtime` block from a layer config JSON.
 *
 * Returns a normalised {@link RealtimeConfig} on success or throws a descriptive
 * `Error` so the realtime-manager can skip the layer and log clearly.
 *
 * @param raw - Untrusted value from the parsed JSON config.
 * @param layerId - Layer ID used in error messages only.
 */
export function validateRealtimeConfig(raw: unknown, layerId: string): RealtimeConfig {
    const r = _assertObject(raw, layerId);

    if (typeof r["enabled"] !== "boolean") {
        throw new TypeError(
            `[realtime-layer] "${layerId}": data.realtime.enabled must be a boolean`
        );
    }

    const source = _assertSource(r, layerId);
    const decoder = _assertDecoder(r, layerId);
    _assertSourceParams(r, source, layerId);
    const updateMode = _assertUpdateMode(r, layerId);

    return {
        enabled: r["enabled"] as unknown as boolean,
        source,
        decoder,
        updateMode,
        idField: typeof r["idField"] === "string" ? r["idField"] : undefined,
        staleTimeoutMs: typeof r["staleTimeoutMs"] === "number" ? r["staleTimeoutMs"] : undefined,
        staleAction: typeof r["staleAction"] === "string" ? r["staleAction"] : "remove",
        url: typeof r["url"] === "string" ? r["url"] : undefined,
        intervalMs: typeof r["intervalMs"] === "number" ? r["intervalMs"] : 30_000,
        fallbackUrl: typeof r["fallbackUrl"] === "string" ? r["fallbackUrl"] : undefined,
        channel: typeof r["channel"] === "string" ? r["channel"] : undefined,
        mapping:
            r["mapping"] && typeof r["mapping"] === "object"
                ? (r["mapping"] as RealtimeConfig["mapping"])
                : undefined,
    };
}
