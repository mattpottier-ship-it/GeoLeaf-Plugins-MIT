/*!
 * @geoleaf-plugins/print — Preview modal renderer (Sprint 5 + Sprint 6)
 *
 * Opens the print preview modal: locked scale, format selector, checkboxes,
 * title/description fields, live re-composition preview, and export buttons.
 *
 * Sprint 6: _tryExport wired to real exporters (GeoLeaf.Print._getExporter),
 * downloadBlob triggered after successful export, server fallback on tainted canvas.
 * "Redéfinir l'emprise" returns the sentinel "redefine" so flow.ts can restart.
 *
 * © 2026 Mattieu Pottier — MIT License
 */

import { OffscreenSession } from "./offscreen-render.js";
import {
    computeBbox,
    computeTargetPixels,
    computeZones,
    getPageFormat,
} from "./page-format.js";
import { createComposedCanvas } from "./layout-composer.js";
import { getPrintConfig } from "./config.js";
import { _getGeoLeaf, _getNativeMap } from "./internal.js";
import { downloadBlob } from "./download.js";
import { tryServerFallback, buildServerPayload } from "./server-fallback.js";
import type { EmpriseResult } from "./emprise-selector.js";
import type { ComposedExportOpts, PageOrientation, PrintFlowOptions } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODAL_ID = "gl-print-modal";
const DEBOUNCE_MS = 150;

/** Return type — internal only, not part of the public API. */
export type ModalResult = Blob | null | "redefine";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Creates an element with class name(s) and optional tag. */
function _el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    attrs?: Record<string, string>
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            el.setAttribute(k, v);
        }
    }
    return el;
}

/**
 * Calls the exporter registered for the given format.
 * Returns null when no exporter is found or when the exporter fails with a
 * non-security error. Re-throws DOMException (SecurityError) so the button
 * handler can detect a tainted canvas and activate the server fallback.
 */
async function _tryExport(
    format: string,
    canvas: HTMLCanvasElement,
    opts: ComposedExportOpts
): Promise<Blob | null> {
    const gl = _getGeoLeaf();
    const exporter = (gl?.Print as any)?._getExporter?.(format);
    if (typeof exporter !== "function") {
        console.warn(`[GeoLeaf.Print] No exporter registered for format "${format}".`);
        return null;
    }
    try {
        return await exporter(canvas, opts);
    } catch (err) {
        // Re-throw SecurityError so the caller can try the server fallback.
        if (err instanceof DOMException) throw err;
        console.warn(`[GeoLeaf.Print] Exporter "${format}" failed:`, err);
        return null;
    }
}

/** Renders the composed canvas into the preview <img>. */
function _updatePreview(previewImg: HTMLImageElement, composed: HTMLCanvasElement): void {
    previewImg.src = composed.toDataURL("image/jpeg", 0.7);
}

// ---------------------------------------------------------------------------
// DOM builders
// ---------------------------------------------------------------------------

function _buildHeader(title: string, onClose: () => void): HTMLElement {
    const header = _el("div", "gl-print-modal__header");
    const h = _el("h2", "gl-print-modal__title");
    h.textContent = title;
    const btn = _el("button", "gl-print-modal__close", { "aria-label": "Fermer", type: "button" });
    btn.textContent = "×";
    btn.onclick = onClose;
    header.appendChild(h);
    header.appendChild(btn);
    return header;
}

function _buildCheckbox(id: string, label: string, checked: boolean): HTMLLabelElement {
    const lbl = _el("label", "gl-print-check-label", { for: id });
    const inp = _el("input", "gl-print-check-input", { type: "checkbox", id });
    inp.checked = checked;
    lbl.appendChild(inp);
    lbl.append(` ${label}`);
    return lbl;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Opens the print preview modal.
 * Returns the exported Blob, `null` on cancel/close, or `"redefine"` when the
 * user clicks « Redéfinir l'emprise ».
 */
export async function openModal(
    empriseResult: EmpriseResult,
    opts: PrintFlowOptions
): Promise<ModalResult> {
    const config = getPrintConfig();
    const gl = _getGeoLeaf();
    const nativeMap = _getNativeMap();

    // Gather i18n labels
    const getLabel = gl?.I18n?.getLabel ?? ((k: string) => k);

    // Remove any stale modal
    document.getElementById(MODAL_ID)?.remove();

    return new Promise<ModalResult>((resolve) => {
        // ------------------------------------------------------------------
        // State
        // ------------------------------------------------------------------
        const lockedScale = empriseResult.scaleDenominator;
        let currentFormat = opts.defaultFormat ?? config.defaultFormat;
        const currentOrientation: PageOrientation = empriseResult.orientation;
        let cachedMapCanvas: HTMLCanvasElement | null = null;
        let session: OffscreenSession | null = null;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        // ------------------------------------------------------------------
        // Close / resolve helpers
        // ------------------------------------------------------------------
        function _close(result: ModalResult): void {
            if (debounceTimer) clearTimeout(debounceTimer);
            session?.destroy();
            session = null;
            document.removeEventListener("keydown", _keyHandler);
            document.removeEventListener("print:render:start", _spinnerShow);
            document.removeEventListener("print:render:end", _spinnerHide);
            document.getElementById(MODAL_ID)?.remove();
            document.body.classList.remove("gl-print-modal-open");
            resolve(result);
        }

        // ------------------------------------------------------------------
        // Spinner handlers
        // ------------------------------------------------------------------
        function _spinnerShow(): void { spinner.style.display = "flex"; }
        function _spinnerHide(): void { spinner.style.display = "none"; }
        document.addEventListener("print:render:start", _spinnerShow);
        document.addEventListener("print:render:end", _spinnerHide);

        // ------------------------------------------------------------------
        // Keyboard handler (Échap)
        // ------------------------------------------------------------------
        function _keyHandler(e: KeyboardEvent): void {
            if (e.key === "Escape") { e.preventDefault(); _close(null); }
        }
        document.addEventListener("keydown", _keyHandler);

        // ------------------------------------------------------------------
        // DOM construction
        // ------------------------------------------------------------------
        const modal = _el("div", "gl-print-modal");
        modal.id = MODAL_ID;

        const overlay = _el("div", "gl-print-modal__overlay");
        overlay.onclick = () => _close(null);

        const content = _el("div", "gl-print-modal__content");
        // Stop click from bubbling to overlay
        content.onclick = (e) => e.stopPropagation();

        // Header
        const header = _buildHeader(getLabel("print.modal.title"), () => _close(null));

        // Body
        const body = _el("div", "gl-print-modal__body");

        // Title input
        const titleWrap = _el("div", "gl-print-form-group");
        const titleLabel = _el("label", "gl-print-form-label", { for: "gl-print-title" });
        titleLabel.textContent = getLabel("print.modal.field.title");
        const titleInput = _el("input", "gl-print-form-input", {
            id: "gl-print-title",
            type: "text",
            maxlength: "120",
        });
        titleInput.value = opts.title ?? config.title;
        titleWrap.appendChild(titleLabel);
        titleWrap.appendChild(titleInput);
        body.appendChild(titleWrap);

        // Preview area
        const previewWrap = _el("div", "gl-print-preview-wrap");
        const previewImg = _el("img", "gl-print-preview-img") as HTMLImageElement;
        previewImg.alt = "";
        const spinner = _el("div", "gl-print-spinner");
        spinner.innerHTML = `<div class="gl-print-spinner__icon"></div>`;
        spinner.style.display = "none";
        previewWrap.appendChild(previewImg);
        previewWrap.appendChild(spinner);
        body.appendChild(previewWrap);

        // Checkboxes
        const hasLegend = !!(gl?.Legend?.getAllLayers);
        const hasMeasure = !!((globalThis as any).GeoLeaf?.plugins?.isLoaded?.("measure"));
        const checksWrap = _el("div", "gl-print-checks");

        const legendCheck = _buildCheckbox(
            "gl-print-chk-legend",
            getLabel("print.modal.check.legend"),
            opts.includeLegend ?? config.includeLegend
        );
        if (!hasLegend) (legendCheck as any).style.display = "none";

        const scaleCheck = _buildCheckbox(
            "gl-print-chk-scale",
            getLabel("print.modal.check.scale"),
            opts.includeScale ?? config.includeScale
        );
        const northCheck = _buildCheckbox(
            "gl-print-chk-north",
            getLabel("print.modal.check.northArrow"),
            opts.includeNorthArrow ?? config.includeNorthArrow
        );
        // Annotations checkbox: only shown when plugin-measure is loaded
        const annotCheck = hasMeasure
            ? _buildCheckbox(
                  "gl-print-chk-annot",
                  getLabel("print.modal.check.annotations"),
                  (opts.includeAnnotations ?? config.includeAnnotations) !== false
              )
            : null;

        checksWrap.appendChild(legendCheck);
        checksWrap.appendChild(scaleCheck);
        checksWrap.appendChild(northCheck);
        if (annotCheck) checksWrap.appendChild(annotCheck);
        body.appendChild(checksWrap);

        // Description
        const descWrap = _el("div", "gl-print-form-group");
        const descLabel = _el("label", "gl-print-form-label", { for: "gl-print-desc" });
        descLabel.textContent = getLabel("print.modal.field.description");
        const descArea = _el("textarea", "gl-print-form-input gl-print-desc", { id: "gl-print-desc", rows: "2" });
        descWrap.appendChild(descLabel);
        descWrap.appendChild(descArea);
        body.appendChild(descWrap);

        // Redefine link
        const redefineLink = _el("a", "gl-print-redefine", { href: "#", role: "button" });
        redefineLink.textContent = getLabel("print.modal.redefineExtent");
        redefineLink.onclick = (e) => { e.preventDefault(); _close("redefine"); };
        body.appendChild(redefineLink);

        body.appendChild(_el("hr", "gl-print-separator"));

        // Footer
        const footer = _el("div", "gl-print-modal__footer");

        // Footer left: scale + format selector
        const footerLeft = _el("div", "gl-print-footer-left");
        const scaleLocked = _el("span", "gl-print-scale-locked");
        scaleLocked.title = getLabel("print.modal.scaleLocked");
        scaleLocked.textContent = `🔒 1:${lockedScale.toLocaleString("fr-FR")}`;
        footerLeft.appendChild(scaleLocked);

        const formatSelect = _el("select", "gl-print-format-select", { "aria-label": getLabel("print.modal.format") });
        (config.availableFormats ?? ["A4", "A3"]).forEach((fmt) => {
            const opt = _el("option", "", { value: fmt });
            opt.textContent = fmt;
            if (fmt === currentFormat) opt.selected = true;
            formatSelect.appendChild(opt);
        });
        footerLeft.appendChild(formatSelect);
        footer.appendChild(footerLeft);

        // Footer right: export buttons
        const footerRight = _el("div", "gl-print-footer-right");
        const exportFormats: string[] = config.exportFormats ?? ["pdf", "jpg"];
        exportFormats.forEach((fmt) => {
            const btn = _el("button", `gl-print-btn gl-print-btn--${fmt}`, { type: "button" });
            btn.textContent = getLabel(`print.btn.${fmt}`);
            btn.onclick = async () => {
                if (!cachedMapCanvas) return;
                const formatDef = getPageFormat(currentFormat);
                if (!formatDef) return;
                const wMm = currentOrientation === "landscape" ? formatDef.heightMm : formatDef.widthMm;
                const hMm = currentOrientation === "landscape" ? formatDef.widthMm : formatDef.heightMm;
                const exportOpts: ComposedExportOpts = {
                    format: fmt,
                    orientation: currentOrientation,
                    widthMm: wMm,
                    heightMm: hMm,
                    quality: config.jpgQuality,
                };
                const isLegendChecked = (legendCheck.querySelector("input") as HTMLInputElement).checked;
                const isScaleChecked = (scaleCheck.querySelector("input") as HTMLInputElement).checked;
                const isNorthChecked = (northCheck.querySelector("input") as HTMLInputElement).checked;
                const isAnnotChecked = annotCheck
                    ? (annotCheck.querySelector("input") as HTMLInputElement).checked
                    : false;
                const exportBbox = computeBbox(currentFormat, lockedScale, currentOrientation, empriseResult.center);
                const zones = computeZones(currentFormat, currentOrientation, {
                    includeTitle: !!titleInput.value.trim(),
                    includeLegend: isLegendChecked,
                    includeScale: false,
                    includeNorthArrow: false,
                    includeFooter: false,
                });
                const targetPx = computeTargetPixels(zones, config.dpi);
                const composed = await createComposedCanvas(cachedMapCanvas, zones, targetPx, {
                    title: titleInput.value,
                    description: descArea.value,
                    scaleDenominator: lockedScale,
                    dpi: config.dpi,
                    includeScale: isScaleChecked,
                    includeNorthArrow: isNorthChecked,
                    includeLegend: isLegendChecked,
                    includeAnnotations: isAnnotChecked,
                    bbox: exportBbox,
                    pageSizeMm: { widthMm: wMm, heightMm: hMm },
                });

                let blob: Blob | null = null;
                try {
                    blob = await _tryExport(fmt, composed, exportOpts);
                } catch (_err) {
                    // DOMException (SecurityError) = tainted canvas — try server fallback.
                    if (config.serverEndpoint) {
                        const payload = buildServerPayload(
                            nativeMap,
                            exportBbox,
                            {
                                format: currentFormat,
                                orientation: currentOrientation,
                                dpi: config.dpi,
                                margins: config.margins as { top: number; right: number; bottom: number; left: number },
                            },
                            {
                                title: titleInput.value,
                                description: descArea.value,
                                includeLegend: isLegendChecked,
                                includeScale: isScaleChecked,
                                includeNorthArrow: isNorthChecked,
                            },
                            fmt
                        );
                        blob = await tryServerFallback(payload, config);
                    } else {
                        const gl2 = _getGeoLeaf();
                        const msg =
                            gl2?.I18n?.getLabel?.("print.error.tainted") ??
                            "Export impossible : certains fonds de carte ne supportent pas le CORS.";
                        console.warn("[GeoLeaf.Print]", msg);
                    }
                }

                if (blob) {
                    const slug = (titleInput.value.trim() || "carte")
                        .replace(/[^a-zA-Z0-9À-ɏ_-]/g, "_")
                        .slice(0, 80);
                    const ext = fmt === "pdf" ? "pdf" : "jpg";
                    await downloadBlob(blob, `${slug}.${ext}`);
                }
                _close(blob);
            };
            footerRight.appendChild(btn);
        });
        footer.appendChild(footerRight);

        // Assemble modal
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(overlay);
        modal.appendChild(content);
        document.body.appendChild(modal);
        document.body.classList.add("gl-print-modal-open");

        // Focus title input
        requestAnimationFrame(() => titleInput.focus());

        // ------------------------------------------------------------------
        // Composition helpers
        // ------------------------------------------------------------------
        async function _recompose(): Promise<void> {
            if (!cachedMapCanvas) return;
            const formatDef = getPageFormat(currentFormat);
            if (!formatDef) return;
            const wMm = currentOrientation === "landscape" ? formatDef.heightMm : formatDef.widthMm;
            const hMm = currentOrientation === "landscape" ? formatDef.widthMm : formatDef.heightMm;
            const zones = computeZones(currentFormat, currentOrientation, {
                includeTitle: !!titleInput.value.trim(),
                includeLegend: (legendCheck.querySelector("input") as HTMLInputElement).checked,
                includeScale: false,
                includeNorthArrow: false,
                includeFooter: false,
            });
            const targetPx = computeTargetPixels(zones, config.dpi);
            const isAnnotChecked = annotCheck
                ? (annotCheck.querySelector("input") as HTMLInputElement).checked
                : false;
            const composed = await createComposedCanvas(cachedMapCanvas, zones, targetPx, {
                title: titleInput.value,
                description: descArea.value,
                scaleDenominator: lockedScale,
                dpi: config.dpi,
                includeScale: (scaleCheck.querySelector("input") as HTMLInputElement).checked,
                includeNorthArrow: (northCheck.querySelector("input") as HTMLInputElement).checked,
                includeLegend: (legendCheck.querySelector("input") as HTMLInputElement).checked,
                includeAnnotations: isAnnotChecked,
                bbox: computeBbox(currentFormat, lockedScale, currentOrientation, empriseResult.center),
                pageSizeMm: { widthMm: wMm, heightMm: hMm },
            });
            _updatePreview(previewImg, composed);
        }

        async function _rerender(): Promise<void> {
            if (!session) return;
            const formatDef = getPageFormat(currentFormat);
            if (!formatDef) return;
            const center: [number, number] = [empriseResult.center.lng, empriseResult.center.lat];
            const bbox = computeBbox(currentFormat, lockedScale, currentOrientation, empriseResult.center);
            const zones = computeZones(currentFormat, currentOrientation, {
                includeTitle: false, includeLegend: false,
                includeScale: false, includeNorthArrow: false, includeFooter: false,
            });
            const targetPx = computeTargetPixels(zones, config.dpi);
            const { widthPx, heightPx } = targetPx.map;
            const zoom = Math.log2(
                (156543.04 * Math.cos((empriseResult.center.lat * Math.PI) / 180)) /
                ((lockedScale * 0.0254) / config.dpi)
            );
            void bbox;
            await session.resize(widthPx, heightPx, center, zoom);
            cachedMapCanvas = session.getCanvas();
            await _recompose();
        }

        // ------------------------------------------------------------------
        // Interaction bindings
        // ------------------------------------------------------------------
        titleInput.addEventListener("input", () => void _recompose());
        descArea.addEventListener("input", () => void _recompose());

        const _checkboxes = [legendCheck, scaleCheck, northCheck];
        if (annotCheck) _checkboxes.push(annotCheck);
        for (const chkLbl of _checkboxes) {
            chkLbl.querySelector("input")!.addEventListener("change", () => void _recompose());
        }

        formatSelect.addEventListener("change", () => {
            currentFormat = formatSelect.value;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => void _rerender(), DEBOUNCE_MS);
        });

        // ------------------------------------------------------------------
        // Initial render
        // ------------------------------------------------------------------
        (async () => {
            const style = nativeMap?.getStyle?.() ?? {};
            const transformRequest = (nativeMap as any)?._requestManager?._transformRequest;
            const formatDef = getPageFormat(currentFormat);
            if (!formatDef) { _close(null); return; }

            const zones = computeZones(currentFormat, currentOrientation, {
                includeTitle: false, includeLegend: false,
                includeScale: false, includeNorthArrow: false, includeFooter: false,
            });
            const targetPx = computeTargetPixels(zones, config.dpi);
            const { widthPx, heightPx } = targetPx.map;
            const center: [number, number] = [empriseResult.center.lng, empriseResult.center.lat];
            const zoom = Math.log2(
                (156543.04 * Math.cos((empriseResult.center.lat * Math.PI) / 180)) /
                ((lockedScale * 0.0254) / config.dpi)
            );

            session = new OffscreenSession(style, transformRequest, widthPx, heightPx, center, zoom, config.dpi);
            await session.waitReady();
            cachedMapCanvas = session.getCanvas();
            await _recompose();
        })();
    });
}
