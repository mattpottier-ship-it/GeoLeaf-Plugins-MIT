/*!
 * @geoleaf-plugins/print — PDF exporter (jsPDF bundled)
 *
 * jsPDF is bundled into the plugin bundle (not external).
 * The plugin itself is already a separate lazy-loaded artifact, so bundling
 * jsPDF inline is the correct approach for browser compatibility.
 *
 * © 2026 Mattieu Pottier — MIT License
 */

import { jsPDF } from "jspdf";
import type { ComposedExportOpts, ExporterFn } from "../types.js";

/**
 * Exports the composed canvas as a PDF Blob.
 *
 * jsPDF orientation shorthand: 'p' = portrait, 'l' = landscape.
 */
export const pdfExporterFn: ExporterFn = async (
    canvas: HTMLCanvasElement,
    opts: ComposedExportOpts
): Promise<Blob> => {
    const { widthMm, heightMm, orientation } = opts;

    const doc = new jsPDF({
        unit: "mm",
        format: [widthMm, heightMm],
        orientation: orientation === "landscape" ? "l" : "p",
    });

    // Use JPEG for the image data — smaller file size, acceptable quality for maps.
    const dataUrl = canvas.toDataURL("image/jpeg", opts.quality ?? 0.92);
    doc.addImage(dataUrl, "JPEG", 0, 0, widthMm, heightMm);

    return doc.output("blob") as Blob;
};
