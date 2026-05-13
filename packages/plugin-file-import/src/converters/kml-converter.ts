/*!
 * GeoLeaf File Import Plugin — KML Converter
 * Converts KML (Keyhole Markup Language) XML to GeoJSON FeatureCollection.
 *
 * Uses @mapbox/togeojson for base conversion, then enriches:
 * - ExtendedData/SchemaData → custom properties
 * - Style stroke/fill → style properties
 * - Folders → folder property
 * - TimeSpan/TimeStamp → temporal properties
 * - Description HTML → stripped to plain text
 * - GroundOverlay → warning (not convertible to vector)
 *
 * © 2026 Mattieu Pottier — MIT License
 */
import type { Geometry, FeatureCollection } from "geojson";
import type { IFileConverter, ConvertResult, GeoJSONFeatureCollection } from "./i-converter.js";

// @mapbox/togeojson — typed via src/types/togeojson.d.ts
import * as toGeoJSONLib from "@mapbox/togeojson";

// ─── Enrichment helpers ───────────────────────────────────────────────────────

/** Strip HTML tags from a description string (simple regex approach — no DOM). */
function _stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "").trim();
}

/** Extract folder path for a Placemark by walking up parent <Folder> elements. */
function _extractFolderPath(placemark: Element): string | undefined {
    const parts: string[] = [];
    let parent = placemark.parentElement;
    while (parent) {
        if (parent.tagName === "Folder") {
            const nameEl = parent.getElementsByTagName("name")[0];
            const name = nameEl?.textContent?.trim();
            if (name) parts.unshift(name);
        }
        parent = parent.parentElement;
    }
    return parts.length > 0 ? parts.join("/") : undefined;
}

/** Extract TimeSpan or TimeStamp from a Placemark. */
function _extractTimeInfo(placemark: Element): {
    timeStart?: string;
    timeEnd?: string;
    timestamp?: string;
} {
    const result: { timeStart?: string; timeEnd?: string; timestamp?: string } = {};

    const timeSpan = placemark.getElementsByTagName("TimeSpan")[0];
    if (timeSpan) {
        const begin = timeSpan.getElementsByTagName("begin")[0]?.textContent?.trim();
        const end = timeSpan.getElementsByTagName("end")[0]?.textContent?.trim();
        if (begin) result.timeStart = begin;
        if (end) result.timeEnd = end;
    }

    const timeStamp = placemark.getElementsByTagName("TimeStamp")[0];
    if (timeStamp) {
        const when = timeStamp.getElementsByTagName("when")[0]?.textContent?.trim();
        if (when) result.timestamp = when;
    }

    return result;
}

/** Extract ExtendedData key-value pairs. */
function _extractExtendedData(placemark: Element): Record<string, string> {
    const props: Record<string, string> = {};
    const extData = placemark.getElementsByTagName("ExtendedData")[0];
    if (!extData) return props;

    // SimpleData (within SchemaData)
    const simpleData = extData.getElementsByTagName("SimpleData");
    for (let i = 0; i < simpleData.length; i++) {
        const name = simpleData[i].getAttribute("name");
        const val = simpleData[i].textContent?.trim();
        if (name && val) props[name] = val;
    }

    // Data elements (name + value pattern)
    const dataEls = extData.getElementsByTagName("Data");
    for (let i = 0; i < dataEls.length; i++) {
        const name = dataEls[i].getAttribute("name");
        const valEl = dataEls[i].getElementsByTagName("value")[0];
        const val = valEl?.textContent?.trim();
        if (name && val) props[name] = val;
    }

    return props;
}

// ─── Main converter ───────────────────────────────────────────────────────────

const emptyFC = (): GeoJSONFeatureCollection => ({ type: "FeatureCollection", features: [] });

/**
 * KML → GeoJSON converter.
 * Uses @mapbox/togeojson for geometry extraction, then enriches with
 * ExtendedData, folders, temporal info, and sanitized descriptions.
 */
export const kmlConverter: IFileConverter = {
    formatName: "KML",

    convert(input: string | ArrayBuffer): ConvertResult {
        const kmlString = typeof input === "string" ? input : new TextDecoder().decode(input);

        if (!kmlString || kmlString.trim().length === 0) {
            return { data: emptyFC(), warnings: ["Empty KML input"] };
        }

        const warnings: string[] = [];

        try {
            const parser = new DOMParser();
            const kmlDoc = parser.parseFromString(kmlString, "text/xml");

            const parseErrors = kmlDoc.getElementsByTagName("parsererror");
            if (parseErrors.length > 0) {
                return {
                    data: emptyFC(),
                    warnings: [`XML parsing error: ${parseErrors[0].textContent}`],
                };
            }

            // Check for GroundOverlay (not convertible to vector)
            const overlays = kmlDoc.getElementsByTagName("GroundOverlay");
            if (overlays.length > 0) {
                warnings.push(
                    `${overlays.length} GroundOverlay(s) found — raster overlays are not supported and were skipped`
                );
            }

            // Base conversion via @mapbox/togeojson
            const fc = toGeoJSONLib.kml(kmlDoc) as FeatureCollection<Geometry>;

            // Enrich features with folder paths, temporal info, extended data
            const placemarks = kmlDoc.getElementsByTagName("Placemark");
            const placemarksArr: Element[] = [];
            for (let i = 0; i < placemarks.length; i++) {
                placemarksArr.push(placemarks[i]);
            }

            for (let i = 0; i < fc.features.length && i < placemarksArr.length; i++) {
                const feature = fc.features[i];
                const placemark = placemarksArr[i];

                if (!feature.properties) feature.properties = {};

                // Folder path
                const folder = _extractFolderPath(placemark);
                if (folder) feature.properties.folder = folder;

                // Temporal info
                const timeInfo = _extractTimeInfo(placemark);
                if (timeInfo.timeStart) feature.properties.timeStart = timeInfo.timeStart;
                if (timeInfo.timeEnd) feature.properties.timeEnd = timeInfo.timeEnd;
                if (timeInfo.timestamp) feature.properties.timestamp = timeInfo.timestamp;

                // ExtendedData
                const extData = _extractExtendedData(placemark);
                Object.assign(feature.properties, extData);

                // Sanitize description (strip HTML)
                if (typeof feature.properties.description === "string") {
                    feature.properties.description = _stripHtml(feature.properties.description);
                }
            }

            return { data: fc as GeoJSONFeatureCollection, warnings };
        } catch (err) {
            return {
                data: emptyFC(),
                warnings: [`KML parsing error: ${(err as Error).message}`],
            };
        }
    },
};
