/*!
 * GeoLeaf FlatGeobuf Plugin — Internal Helpers
 * Shared URL validation, feature collection, and header extraction.
 * @internal Not part of public API.
 *
 * © 2026 Mattieu Pottier — MIT License
 */
import type { Feature, FeatureCollection } from "geojson";
import type { FgbLoadOptions, FgbLoadResult } from "./types.js";

/** Default maximum number of features to accumulate. */
export const DEFAULT_MAX_FEATURES = 100_000;

/**
 * Validates a URL string against allowed protocols.
 * Delegates to GeoLeaf core `validateUrl` when available; falls back
 * to a local protocol whitelist check.
 * @internal
 */
export function validateFgbUrl(url: string): string | null {
    const core = (globalThis as any).GeoLeaf?.Utils?.validateUrl;
    if (typeof core === "function") return core(url);

    try {
        const parsed = new URL(url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
    } catch { /* invalid URL */ }
    return null;
}

/**
 * Checks pre-conditions common to all load functions.
 * @throws Error if the URL is invalid or the signal is already aborted.
 * @internal
 */
export function validateLoadPreconditions(url: string, signal?: AbortSignal): string {
    const safeUrl = validateFgbUrl(url);
    if (!safeUrl) {
        throw new Error(`[GeoLeaf.FlatGeobuf] Invalid or disallowed URL: "${url}"`);
    }
    if (signal?.aborted) {
        throw new Error("[GeoLeaf.FlatGeobuf] Request aborted before start.");
    }
    return safeUrl;
}

/**
 * Collects features from an async iterator with maxFeatures and abort support.
 * Calls `onHeader` once on the first feature if provided.
 * @internal
 */
export async function collectFeatures(
    iter: AsyncIterable<Feature>,
    options: FgbLoadOptions
): Promise<FgbLoadResult> {
    const maxFeatures = options.maxFeatures ?? DEFAULT_MAX_FEATURES;
    const features: Feature[] = [];
    let headerMeta: Record<string, unknown> | undefined;
    let headerFired = false;

    for await (const feature of iter) {
        if (options.signal?.aborted) break;

        if (!headerFired && options.onHeader) {
            headerMeta = extractHeaderMeta(iter);
            options.onHeader(headerMeta ?? {});
            headerFired = true;
        }

        features.push(feature);
        if (features.length >= maxFeatures) break;
    }

    const data: FeatureCollection = { type: "FeatureCollection", features };
    return { data, featureCount: features.length, headerMeta };
}

/**
 * Attempts to extract header metadata from the flatgeobuf iterator.
 * @internal
 */
export function extractHeaderMeta(
    iter: AsyncIterable<Feature>
): Record<string, unknown> | undefined {
    const raw = (iter as any).header ?? (iter as any).headerMeta;
    if (raw && typeof raw === "object") return { ...raw };
    return undefined;
}
