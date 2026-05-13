/**
 * JsonDecoder — decodes GeoJSON payloads (snapshot or delta) arriving from
 * polling HTTP, WebSocket, or SSE sources.
 *
 * Input can be:
 *  - A complete `FeatureCollection` → decoded as an array of upsert updates.
 *  - An array of GeoJSON `Feature` objects.
 *  - A single `Feature` object.
 *  - A raw string that will be JSON-parsed.
 *
 * @module decoders/json-decoder
 */

import type { IDecoder, DecodedUpdate, GeoJSONGeometry } from "./i-decoder.js";

/** Raw GeoJSON feature shape expected from the source. */
interface RawFeature {
    type?: string;
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry?: GeoJSONGeometry | null;
}

/** JSON payload shape accepted by this decoder. */
type JsonPayload =
    | { type: "FeatureCollection"; features: RawFeature[] }
    | RawFeature[]
    | RawFeature
    | string;

export class JsonDecoder implements IDecoder {
    decode(data: unknown): DecodedUpdate[] {
        const parsed = this._parse(data);
        return this._toUpdates(parsed);
    }

    private _parse(data: unknown): JsonPayload {
        if (typeof data === "string") {
            try {
                return JSON.parse(data) as JsonPayload;
            } catch {
                return [];
            }
        }
        return data as JsonPayload;
    }

    private _toUpdates(payload: JsonPayload): DecodedUpdate[] {
        if (!payload) return [];

        // FeatureCollection
        if (
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            (payload as { type?: string }).type === "FeatureCollection"
        ) {
            const fc = payload as { type: "FeatureCollection"; features: RawFeature[] };
            return (fc.features ?? []).map((f) => this._featureToUpdate(f));
        }

        // Array of features
        if (Array.isArray(payload)) {
            return payload.map((f: RawFeature) => this._featureToUpdate(f));
        }

        // Single feature
        if (typeof payload === "object" && (payload as RawFeature).type === "Feature") {
            return [this._featureToUpdate(payload as RawFeature)];
        }

        return [];
    }

    private _featureToUpdate(feature: RawFeature): DecodedUpdate {
        const raw = feature.id ?? feature.properties?.["id"] ?? feature.properties?.["_id"] ?? "";
        let id: string;
        if (raw === null || raw === undefined) {
            id = "";
        } else if (typeof raw === "object") {
            id = JSON.stringify(raw);
        } else {
            id = String(raw as string | number | boolean);
        }
        return {
            id,
            properties: feature.properties ?? {},
            geometry: feature.geometry ?? undefined,
            action: "upsert",
        };
    }
}
