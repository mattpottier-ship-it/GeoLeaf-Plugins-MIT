/*!
 * GeoLeaf File Import Plugin — Converter Contract
 * © 2026 Mattieu Pottier — MIT License
 */
import type { FeatureCollection, Geometry } from "geojson";

/** GeoJSON FeatureCollection shorthand used throughout the plugin. */
export type GeoJSONFeatureCollection = FeatureCollection<Geometry>;

/**
 * Result returned by every converter.
 * `data` contains the converted GeoJSON; `warnings` lists non-fatal issues
 * encountered during conversion (e.g. unsupported elements, coordinate gaps).
 */
export interface ConvertResult {
    /** Converted GeoJSON FeatureCollection. */
    data: GeoJSONFeatureCollection;
    /** Non-fatal warnings emitted during conversion. */
    warnings: string[];
}

/**
 * Contract that every format converter must implement.
 * Input is a string (XML/CSV/JSON text) or ArrayBuffer (binary like KMZ).
 */
export interface IFileConverter {
    /** Human-readable format name (e.g. "GPX", "KML"). */
    readonly formatName: string;

    /**
     * Convert raw file content to a GeoJSON FeatureCollection.
     * @param input - File content as string (text formats) or ArrayBuffer (binary).
     * @returns Conversion result with data and optional warnings.
     */
    convert(input: string | ArrayBuffer): ConvertResult | Promise<ConvertResult>;
}
