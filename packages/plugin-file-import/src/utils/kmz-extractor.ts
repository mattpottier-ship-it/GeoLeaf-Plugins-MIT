/*!
 * GeoLeaf File Import Plugin — KMZ Extractor
 * Decompresses KMZ (zipped KML) and extracts the inner .kml file.
 *
 * Uses fflate for ZIP decompression (lightweight, no Node.js deps).
 *
 * © 2026 Mattieu Pottier — MIT License
 */
import { unzipSync } from "fflate";

/** Maximum total decompressed size (50 MB) — zip-bomb protection. */
const MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024;

/**
 * Extract the KML content string from a KMZ (ZIP) buffer.
 * @param data - The raw KMZ file as a Uint8Array.
 * @returns The KML string content, or null if no .kml file found.
 */
export function extractKmlFromKmz(data: Uint8Array): { kml: string | null; warnings: string[] } {
    const warnings: string[] = [];

    try {
        const files = unzipSync(data);

        // Security: check total decompressed size to prevent zip bombs
        let totalSize = 0;
        for (const name of Object.keys(files)) {
            totalSize += files[name].length;
            if (totalSize > MAX_DECOMPRESSED_BYTES) {
                warnings.push(`KMZ archive exceeds maximum decompressed size (${MAX_DECOMPRESSED_BYTES / 1024 / 1024} MB)`);
                return { kml: null, warnings };
            }
        }

        // Find the first .kml file (usually doc.kml)
        const kmlEntry = Object.keys(files).find((name) =>
            name.toLowerCase().endsWith(".kml")
        );

        if (!kmlEntry) {
            warnings.push("No .kml file found inside KMZ archive");
            return { kml: null, warnings };
        }

        const kmlBytes = files[kmlEntry];
        const kml = new TextDecoder().decode(kmlBytes);
        return { kml, warnings };
    } catch (err) {
        warnings.push(`KMZ decompression error: ${(err as Error).message}`);
        return { kml: null, warnings };
    }
}
