/*!
 * @geoleaf-plugins/print — Public API
 * © 2026 Mattieu Pottier — MIT License
 *
 * Sprint 3: openPrintFlow (emprise selector).
 * Sprint 4: captureExtent, captureViewport, registerPageFormat implemented.
 * Sprint 5: modal + composition (openPrintFlow delegates to flow.ts).
 * Sprint 6: exportImage, exportPDF, registerExporter, _getExporter implemented.
 */
import type {
    PrintFlowOptions,
    CaptureOptions,
    CaptureResult,
    ExportOptions,
    ExporterFn,
    PageFormatDef,
    PageOrientation,
} from "./types.js";
import type { EmpriseBbox } from "./types.js";
import { _warnNoCore } from "./internal.js";
import { openPrintFlow as _openPrintFlow } from "./flow.js";
import {
    captureExtent as _captureExtent,
    captureViewport as _captureViewport,
} from "./offscreen-render.js";
import { registerPageFormat as _registerPageFormat, computeZones, computeTargetPixels, getPageFormat } from "./page-format.js";
import { createComposedCanvas } from "./layout-composer.js";
import { registerExporter as _registerExporter, getExporter } from "./format-registry.js";
import { downloadBlob } from "./download.js";
import { getPrintConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Derives page orientation from bbox aspect ratio when not explicitly provided. */
function _orientationFromBbox(bbox: EmpriseBbox): PageOrientation {
    return bbox.maxLng - bbox.minLng >= bbox.maxLat - bbox.minLat ? "landscape" : "portrait";
}

/**
 * Shared pipeline for exportImage() and exportPDF():
 * capture → compose → return canvas + metadata.
 */
async function _capture(
    opts: ExportOptions
): Promise<{
    composed: HTMLCanvasElement;
    widthMm: number;
    heightMm: number;
    orientation: PageOrientation;
} | null> {
    const config = getPrintConfig();
    const dpi = opts.dpi ?? config.dpi ?? 300;
    const format = opts.format ?? config.defaultFormat ?? "A4";

    // 1 — Off-screen render
    let capture: CaptureResult;
    try {
        if (opts.bbox) {
            const orientation: PageOrientation =
                opts.orientation ?? _orientationFromBbox(opts.bbox);
            capture = await _captureExtent(opts.bbox, { format, orientation, dpi });
        } else {
            capture = await _captureViewport({ format, orientation: opts.orientation, dpi });
        }
    } catch (err) {
        console.warn("[GeoLeaf.Print] capture failed:", err);
        return null;
    }

    // 2 — Orientation (from opts, or re-derived from captured bbox)
    const orientation: PageOrientation =
        opts.orientation ?? _orientationFromBbox(capture.bbox);

    // 3 — Page dimensions (after orientation swap)
    const formatDef = getPageFormat(format);
    if (!formatDef) {
        console.warn("[GeoLeaf.Print] Unknown paper format:", format);
        return null;
    }
    const widthMm = orientation === "landscape" ? formatDef.heightMm : formatDef.widthMm;
    const heightMm = orientation === "landscape" ? formatDef.widthMm : formatDef.heightMm;

    // 4 — Zones + composition
    const includeLegend = opts.includeLegend ?? config.includeLegend ?? false;
    const includeScale = opts.includeScale ?? config.includeScale ?? true;
    const includeNorthArrow = opts.includeNorthArrow ?? config.includeNorthArrow ?? true;

    const zones = computeZones(format, orientation, {
        includeTitle: !!(opts.title ?? "").trim(),
        includeLegend,
        includeScale,
        includeNorthArrow,
        includeFooter: false,
    });
    const targetPx = computeTargetPixels(zones, dpi);

    const composed = await createComposedCanvas(capture.canvas, zones, targetPx, {
        title: opts.title ?? "",
        description: opts.description ?? "",
        scaleDenominator: capture.scaleDenominator,
        dpi,
        includeScale,
        includeNorthArrow,
        includeLegend,
        pageSizeMm: { widthMm, heightMm },
    });

    return { composed, widthMm, heightMm, orientation };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens the interactive print flow: emprise selector → preview modal → export.
 * Resolves with the exported Blob, or null if the user cancels.
 */
export function openPrintFlow(opts?: PrintFlowOptions): Promise<Blob | null> {
    return _openPrintFlow(opts ?? {});
}

/**
 * Re-renders the map off-screen over the given geographic extent at the
 * requested format and DPI. Returns the map zone canvas (before composition).
 */
export async function captureExtent(
    bbox: EmpriseBbox,
    opts: CaptureOptions = {}
): Promise<CaptureResult | null> {
    if (_warnNoCore("captureExtent")) return null;
    try {
        return await _captureExtent(bbox, opts);
    } catch (err) {
        console.warn("[GeoLeaf.Print] captureExtent failed:", err);
        return null;
    }
}

/**
 * Captures the extent matching the current viewport (format from config, A4 by default).
 */
export async function captureViewport(opts?: CaptureOptions): Promise<CaptureResult | null> {
    if (_warnNoCore("captureViewport")) return null;
    try {
        return await _captureViewport(opts ?? {});
    } catch (err) {
        console.warn("[GeoLeaf.Print] captureViewport failed:", err);
        return null;
    }
}

/**
 * Composes and exports the map as a JPEG image, then downloads it.
 * Returns the Blob, or null on failure.
 */
export async function exportImage(opts: ExportOptions): Promise<Blob | null> {
    if (_warnNoCore("exportImage")) return null;
    const config = getPrintConfig();
    const result = await _capture(opts);
    if (!result) return null;

    const exporter = getExporter("jpg");
    if (!exporter) {
        console.warn("[GeoLeaf.Print] exportImage: JPG exporter not registered.");
        return null;
    }

    try {
        const blob = await exporter(result.composed, {
            format: "jpg",
            orientation: result.orientation,
            widthMm: result.widthMm,
            heightMm: result.heightMm,
            quality: opts.quality ?? config.jpgQuality,
        });
        const slug = (opts.title ?? "").trim() || "carte";
        const filename = opts.filename ? `${opts.filename}.jpg` : `${slug}.jpg`;
        await downloadBlob(blob, filename);
        return blob;
    } catch (err) {
        console.warn("[GeoLeaf.Print] exportImage failed:", err);
        return null;
    }
}

/**
 * Composes and exports the map as a PDF (loads jsPDF dynamically), then downloads it.
 * Returns the Blob, or null on failure.
 */
export async function exportPDF(opts: ExportOptions): Promise<Blob | null> {
    if (_warnNoCore("exportPDF")) return null;
    const config = getPrintConfig();
    const result = await _capture(opts);
    if (!result) return null;

    const exporter = getExporter("pdf");
    if (!exporter) {
        console.warn("[GeoLeaf.Print] exportPDF: PDF exporter not registered.");
        return null;
    }

    try {
        const blob = await exporter(result.composed, {
            format: "pdf",
            orientation: result.orientation,
            widthMm: result.widthMm,
            heightMm: result.heightMm,
            quality: opts.quality ?? config.jpgQuality,
        });
        const slug = (opts.title ?? "").trim() || "carte";
        const filename = opts.filename ? `${opts.filename}.pdf` : `${slug}.pdf`;
        await downloadBlob(blob, filename);
        return blob;
    } catch (err) {
        console.warn("[GeoLeaf.Print] exportPDF failed:", err);
        return null;
    }
}

/**
 * Registers a custom export format.
 * @param format - Case-insensitive format identifier (e.g. `"png"`).
 * @param fn - Exporter function that receives the composed canvas and returns a Blob.
 */
export function registerExporter(format: string, fn: ExporterFn): void {
    _registerExporter(format, fn);
}

/**
 * Registers a custom paper format (A2, A1, A0, …).
 * @param name - Format identifier (e.g. `"A2"`).
 * @param def - Format definition with dimensions and zone computation.
 */
export function registerPageFormat(name: string, def: PageFormatDef): void {
    _registerPageFormat(name, def);
}

/**
 * Returns the registered ExporterFn for the given format.
 * @internal Used by modal-renderer._tryExport.
 */
export function _getExporter(format: string): ExporterFn | undefined {
    return getExporter(format);
}

/** @internal Returns all public API functions as an object. */
export function buildPublicApi() {
    return {
        openPrintFlow,
        captureExtent,
        captureViewport,
        exportImage,
        exportPDF,
        registerExporter,
        registerPageFormat,
        _getExporter,
    };
}
