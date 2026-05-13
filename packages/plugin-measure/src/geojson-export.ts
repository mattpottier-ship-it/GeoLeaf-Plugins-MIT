/*!
 * @geoleaf-plugins/measure — GeoJSON export
 * © 2026 Mattieu Pottier — MIT License
 *
 * Builds a RFC 7946 FeatureCollection with enriched properties and triggers
 * a file download using the same priority pattern as @geoleaf-plugins/print:
 * navigator.share (iOS) → <a download> (desktop/Android) → window.open fallback.
 */
import type { MeasureConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Blob builder
// ---------------------------------------------------------------------------

/**
 * Builds a GeoJSON Blob from the given FeatureCollection.
 * Each feature's properties are normalised so all enriched fields are present
 * (missing values serialise as null).
 */
export function buildGeoJSONBlob(collection: GeoJSON.FeatureCollection): Blob {
    const ENRICHED_KEYS = [
        "measureType", "lengthM", "perimeterM", "areaM2", "radiusM",
        "label", "annotationKind", "widthPx", "heightPx", "createdAt",
    ];
    const enriched: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: collection.features.map((f) => {
            const defaults: Record<string, null> = {};
            for (const k of ENRICHED_KEYS) defaults[k] = null;
            return {
                ...f,
                properties: { ...defaults, ...(f.properties ?? {}) },
            };
        }),
    };
    return new Blob([JSON.stringify(enriched, null, 2)], { type: "application/geo+json" });
}

// ---------------------------------------------------------------------------
// Download trigger
// ---------------------------------------------------------------------------

async function _triggerDownload(blob: Blob, fileName: string): Promise<void> {
    const file = new File([blob], fileName, { type: blob.type });

    // iOS: Web Share API (navigator.share + canShare guard — <a download> doesn't save on iOS)
    if (
        typeof navigator !== "undefined" &&
        /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
        typeof navigator.share === "function" &&
        typeof (navigator as any).canShare === "function" &&
        (navigator as any).canShare({ files: [file] })
    ) {
        try {
            await navigator.share({ files: [file], title: fileName });
            return;
        } catch (err) {
            if (err instanceof Error && err.name !== "AbortError") {
                console.warn("[GeoLeaf.Measure] navigator.share failed, falling back:", err);
            }
        }
    }

    // Desktop / Android: <a download>
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exports the FeatureCollection as GeoJSON.
 * By default triggers a file download; pass `download: false` to skip.
 * Always returns the generated Blob.
 */
export async function exportGeoJSON(
    collection: GeoJSON.FeatureCollection,
    opts?: { download?: boolean; fileName?: string },
    cfg?: MeasureConfig
): Promise<Blob> {
    const blob = buildGeoJSONBlob(collection);
    if (opts?.download !== false) {
        const name = opts?.fileName ?? cfg?.exportFileName ?? "mesures.geojson";
        await _triggerDownload(blob, name);
    }
    return blob;
}
