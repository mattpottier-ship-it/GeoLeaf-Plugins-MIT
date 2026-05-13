/**
 * GtfsRtDecoder — decodes GTFS-Realtime protobuf payloads (TripUpdate feed)
 * into {@link DecodedUpdate} objects for property patching on a GeoLeaf layer.
 *
 * The GTFS-RT TripUpdate feed does NOT contain coordinates — only stop/trip
 * identifiers and delay values. The decoder therefore produces property-only
 * updates (no geometry). The target layer must already have the station
 * geometries loaded.
 *
 * The `gtfs-realtime-bindings` package is imported dynamically so it is
 * tree-shaken from the bundle when GTFS-RT is not used.
 *
 * @module decoders/gtfs-rt-decoder
 */

import type { IDecoder, DecodedUpdate } from "./i-decoder.js";

/** Mapping hints provided via `data.realtime.mapping` in the layer config. */
export interface GtfsRtMapping {
    /** GTFS-RT entity field used as the feature identifier (e.g. `"stop_id"`, `"trip_id"`). */
    idField?: string;
    /** GTFS-RT field carrying the delay in seconds. */
    delayField?: string;
    /** GeoLeaf layer ID to update (may differ from the config's own layer). */
    targetLayerId?: string;
}

export class GtfsRtDecoder implements IDecoder {
    private readonly _mapping: GtfsRtMapping;

    constructor(mapping: GtfsRtMapping = {}) {
        this._mapping = mapping;
    }

    decode(data: unknown): DecodedUpdate[] {
        if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
            return [];
        }
        const buffer =
            data instanceof ArrayBuffer
                ? data
                : (data as ArrayBufferView & { buffer: ArrayBuffer }).buffer;
        return this._decodeFeed(new Uint8Array(buffer));
    }

    private _decodeFeed(bytes: Uint8Array): DecodedUpdate[] {
        let tripUpdates: Array<{
            id: string;
            tripUpdate?: {
                trip?: { tripId?: string | null };
                stopTimeUpdate?: Array<{
                    stopId?: string | null;
                    departure?: { delay?: number | null } | null;
                    arrival?: { delay?: number | null } | null;
                }> | null;
            } | null;
        }>;

        try {
            // Dynamic require — bundled via @rollup/plugin-commonjs

            const { transit_realtime } = require("gtfs-realtime-bindings");
            const feed = transit_realtime.FeedMessage.decode(bytes) as {
                entity: typeof tripUpdates;
            };
            tripUpdates = feed.entity ?? [];
        } catch (err) {
            console.warn("[realtime-layer][gtfs-rt] Failed to decode feed:", err);
            return [];
        }

        const idField = this._mapping.idField ?? "trip_id";
        const updates: DecodedUpdate[] = [];

        for (const entity of tripUpdates) {
            if (!entity.tripUpdate) continue;

            const { trip, stopTimeUpdate } = entity.tripUpdate;

            // Extract the primary identifier (trip_id or stop_id depending on config)
            let id: string | null = null;
            if (idField === "stop_id" && stopTimeUpdate?.[0]?.stopId) {
                id = stopTimeUpdate[0].stopId;
            } else if (idField === "trip_id" && trip?.tripId) {
                id = trip.tripId;
            } else {
                id = entity.id ?? null;
            }

            if (!id) continue;

            // Extract delay
            const firstStop = stopTimeUpdate?.[0];
            const delay = firstStop?.departure?.delay ?? firstStop?.arrival?.delay ?? 0;

            updates.push({
                id,
                properties: {
                    delay,
                    _realtimeUpdatedAt: Date.now(),
                },
                action: "upsert",
            });
        }

        return updates;
    }
}
