/*!
 * GeoLeaf File Import Plugin — CSV Converter
 * Converts CSV/TSV data to GeoJSON FeatureCollection.
 *
 * Uses PapaParse for robust CSV parsing with auto-detected delimiters.
 * Heuristic column detection for lat/lng or WKT geometry.
 *
 * © 2026 Mattieu Pottier — MIT License
 */
import Papa from "papaparse";
import type { Feature, Geometry, Point } from "geojson";
import type { IFileConverter, ConvertResult, GeoJSONFeatureCollection } from "./i-converter.js";

// ─── Column detection heuristics ──────────────────────────────────────────────

const LAT_PATTERNS = ["lat", "latitude", "y", "lat_y", "coordy"];
const LNG_PATTERNS = ["lng", "lon", "long", "longitude", "x", "lng_x", "lon_x", "coordx"];
const WKT_PATTERNS = ["wkt", "geom", "geometry", "the_geom", "shape"];

interface GeoColumns {
    type: "latlng" | "wkt";
    latCol?: string;
    lngCol?: string;
    wktCol?: string;
}

function _detectGeoColumns(headers: string[]): GeoColumns | null {
    const lower = headers.map((h) => h.toLowerCase().trim());

    // Try lat/lng first
    const latIdx = lower.findIndex((h) => LAT_PATTERNS.includes(h));
    const lngIdx = lower.findIndex((h) => LNG_PATTERNS.includes(h));
    if (latIdx !== -1 && lngIdx !== -1) {
        return { type: "latlng", latCol: headers[latIdx], lngCol: headers[lngIdx] };
    }

    // Try WKT column
    const wktIdx = lower.findIndex((h) => WKT_PATTERNS.includes(h));
    if (wktIdx !== -1) {
        return { type: "wkt", wktCol: headers[wktIdx] };
    }

    return null;
}

// ─── Minimal WKT POINT parser ─────────────────────────────────────────────────

/**
 * Parse a WKT POINT string to a GeoJSON Point geometry.
 * Only supports POINT (no multi-geometry for CSV rows).
 */
function _parseWktPoint(wkt: string): Point | null {
    // eslint-disable-next-line security/detect-unsafe-regex
    const match = wkt.match(/POINT\s*\(\s*([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s+([\d.eE+-]+))?\s*\)/i);
    if (!match) return null;
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const z = match[3] ? parseFloat(match[3]) : undefined;
    const coordinates = z != null && Number.isFinite(z) ? [x, y, z] : [x, y];
    return { type: "Point", coordinates };
}

// ─── Main converter ───────────────────────────────────────────────────────────

const emptyFC = (): GeoJSONFeatureCollection => ({ type: "FeatureCollection", features: [] });

/**
 * CSV/TSV → GeoJSON converter.
 * Auto-detects delimiter via PapaParse, detects lat/lng or WKT columns,
 * builds Point features with all other columns as properties.
 */
export const csvConverter: IFileConverter = {
    formatName: "CSV",

    convert(input: string | ArrayBuffer): ConvertResult {
        const csvString = typeof input === "string" ? input : new TextDecoder().decode(input);

        if (!csvString || csvString.trim().length === 0) {
            return { data: emptyFC(), warnings: ["Empty CSV input"] };
        }

        const warnings: string[] = [];

        try {
            const parsed = Papa.parse<Record<string, string>>(csvString, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false, // Keep as strings for explicit parsing
            });

            if (parsed.errors.length > 0) {
                for (const err of parsed.errors) {
                    warnings.push(`CSV row ${err.row ?? "?"}: ${err.message}`);
                }
            }

            const headers = parsed.meta.fields || [];
            if (headers.length === 0) {
                return { data: emptyFC(), warnings: ["No headers found in CSV"] };
            }

            const geoCols = _detectGeoColumns(headers);
            if (!geoCols) {
                return {
                    data: emptyFC(),
                    warnings: [
                        "No geographic columns detected. Expected lat/lng columns (lat, latitude, y, lng, lon, longitude, x) or WKT column (wkt, geom, geometry).",
                    ],
                };
            }

            const geoColumnNames = new Set<string>();
            if (geoCols.latCol) geoColumnNames.add(geoCols.latCol);
            if (geoCols.lngCol) geoColumnNames.add(geoCols.lngCol);
            if (geoCols.wktCol) geoColumnNames.add(geoCols.wktCol);

            const features: Feature<Geometry>[] = [];

            for (let i = 0; i < parsed.data.length; i++) {
                const row = parsed.data[i];
                let geometry: Geometry | null = null;

                if (geoCols.type === "latlng") {
                    const lat = parseFloat(row[geoCols.latCol!]);
                    const lng = parseFloat(row[geoCols.lngCol!]);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                        warnings.push(`Row ${i + 1}: invalid coordinates, skipped`);
                        continue;
                    }
                    geometry = { type: "Point", coordinates: [lng, lat] };
                } else if (geoCols.type === "wkt") {
                    const wktVal = row[geoCols.wktCol!];
                    if (!wktVal || !wktVal.trim()) {
                        warnings.push(`Row ${i + 1}: empty WKT, skipped`);
                        continue;
                    }
                    geometry = _parseWktPoint(wktVal.trim());
                    if (!geometry) {
                        warnings.push(
                            `Row ${i + 1}: unsupported or invalid WKT "${wktVal.trim().substring(0, 50)}", skipped`
                        );
                        continue;
                    }
                }

                if (!geometry) continue;

                // Build properties from all non-geo columns
                const properties: Record<string, unknown> = {};
                for (const key of headers) {
                    if (geoColumnNames.has(key)) continue;
                    const val = row[key];
                    if (val === undefined || val === null || val === "") continue;
                    // Attempt numeric coercion
                    const num = Number(val);
                    properties[key] = Number.isFinite(num) && val.trim() !== "" ? num : val;
                }

                features.push({
                    type: "Feature",
                    geometry,
                    properties,
                });
            }

            return { data: { type: "FeatureCollection", features }, warnings };
        } catch (err) {
            return {
                data: emptyFC(),
                warnings: [`CSV parsing error: ${(err as Error).message}`],
            };
        }
    },
};
