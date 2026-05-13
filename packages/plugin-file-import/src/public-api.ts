/*!
 * GeoLeaf File Import Plugin — Public API
 * Provides convert(), importAsLayer(), getSupportedFormats(), registerConverter().
 *
 * © 2026 Mattieu Pottier — MIT License
 */
import type { ConvertResult, GeoJSONFeatureCollection, IFileConverter } from "./converters/i-converter.js";
import {
    detectConverter,
    isKmz,
    getSupportedExtensions,
    registerConverter as _registerConverter,
} from "./format-detector.js";
import { extractKmlFromKmz } from "./utils/kmz-extractor.js";
import { kmlConverter } from "./converters/kml-converter.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for importAsLayer(). */
export interface ImportLayerOptions {
    /** Custom layer ID. Auto-generated if omitted. */
    layerId?: string;
    /** Layer display name. Defaults to file name. */
    layerName?: string;
    /** Initial visibility. Defaults to true. */
    visible?: boolean;
    /** Enable clustering. Defaults to false. */
    cluster?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _readFileContent(
    file: File
): Promise<{ text: string; buffer: ArrayBuffer }> {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder().decode(buffer);
    return { text, buffer };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a file to GeoJSON.
 * Detects the format by file extension and delegates to the appropriate converter.
 * @param file - The File object from an <input> or drag-and-drop.
 * @returns The conversion result with GeoJSON data and any warnings.
 */
export async function convert(file: File): Promise<ConvertResult> {
    if (!file || !file.name) {
        return {
            data: { type: "FeatureCollection", features: [] },
            warnings: ["No file provided"],
        };
    }

    const converter = detectConverter(file.name);
    if (!converter) {
        return {
            data: { type: "FeatureCollection", features: [] },
            warnings: [`Unsupported file format: ${file.name}`],
        };
    }

    const { text, buffer } = await _readFileContent(file);

    // KMZ special handling: decompress then convert KML
    if (isKmz(file.name)) {
        const { kml, warnings: kmzWarnings } = extractKmlFromKmz(new Uint8Array(buffer));
        if (!kml) {
            return {
                data: { type: "FeatureCollection", features: [] },
                warnings: kmzWarnings,
            };
        }
        const result = kmlConverter.convert(kml);
        // Merge decompression warnings
        if (result instanceof Promise) {
            const resolved = await result;
            resolved.warnings = [...kmzWarnings, ...(resolved.warnings || [])];
            return resolved;
        }
        result.warnings = [...kmzWarnings, ...(result.warnings || [])];
        return result;
    }

    // Standard conversion
    const result = converter.convert(text);
    return result instanceof Promise ? result : result;
}

/**
 * Convert a file and add it as a GeoJSON layer on the map.
 * @param file - The File object.
 * @param options - Layer configuration options.
 * @returns The layer ID created.
 */
export async function importAsLayer(
    file: File,
    options?: ImportLayerOptions
): Promise<string> {
    const result = await convert(file);

    if (result.data.features.length === 0) {
        throw new Error(
            `No features extracted from "${file.name}". ${result.warnings?.join("; ") || ""}`
        );
    }

    const gl = (globalThis as Record<string, unknown>).GeoLeaf as
        | { GeoJSON?: { addData?: (data: GeoJSONFeatureCollection, opts?: unknown) => string } }
        | undefined;

    if (!gl?.GeoJSON?.addData) {
        throw new Error(
            "[FileImport] GeoLeaf.GeoJSON.addData is not available. Ensure @geoleaf/core is loaded."
        );
    }

    const layerId = gl.GeoJSON.addData(result.data, {
        layerId: options?.layerId,
        layerName: options?.layerName ?? file.name,
        visible: options?.visible ?? true,
        cluster: options?.cluster ?? false,
    });

    return layerId;
}

/**
 * Get the list of supported file format extensions.
 */
export function getSupportedFormats(): string[] {
    return getSupportedExtensions();
}

/**
 * Register a custom file converter for a given extension.
 * @param ext - File extension including dot (e.g. ".shp").
 * @param converter - Converter implementing IFileConverter.
 */
export function registerConverter(ext: string, converter: IFileConverter): void {
    _registerConverter(ext, converter);
}
