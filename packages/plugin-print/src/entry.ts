/*!
 * @geoleaf-plugins/print — Entry point
 * © 2026 Mattieu Pottier — MIT License
 */
import "./css/geoleaf-print.css";
import { buildPublicApi } from "./public-api.js";
import { getPrintConfig } from "./config.js";
import langFr from "./lang/lang_fr.js";
import langEn from "./lang/lang_en.js";
import langEs from "./lang/lang_es.js";
import langPt from "./lang/lang_pt.js";
import langIt from "./lang/lang_it.js";
import langDe from "./lang/lang_de.js";

// Replaced at build time by rollup/replace — must be a plain string literal.
const _VERSION = "__GEOLEAF_PRINT_VERSION__";

const _g = typeof globalThis !== "undefined" ? (globalThis as any) : (window as any);

// 1 — Register i18n dictionaries FIRST so labels resolve during boot (pill button).
_g.GeoLeaf?.I18n?.registerDict?.("print", { fr: langFr, en: langEn, es: langEs, pt: langPt, it: langIt, de: langDe });

// 2 — Mount GeoLeaf.Print namespace.
if (_g.GeoLeaf) {
    _g.GeoLeaf.Print = buildPublicApi();
}

// 3 — Register in the plugin registry.
_g.GeoLeaf?.plugins?.register?.("print", {
    version: _VERSION,
    requires: [],
    optional: ["legend", "storage"],
    label: "Print (carte à l'échelle → PDF / JPG)",
    healthCheck: () => typeof _g.GeoLeaf?.Print === "object",
});

// Printer icon (22 px, stroke currentColor) — sanitised by core DOMSecurity.setSafeHTML.
const _PRINT_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"' +
    ' stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 6 2 18 2 18 9"/>' +
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>' +
    '<rect x="6" y="14" width="12" height="8"/>' +
    "</svg>";

// 4 & 5 — Register toolbar slot + wire event listener (skipped if enabled === false).
if (getPrintConfig().enabled !== false) {
    _g.GeoLeaf?.registry?.register?.({
        id: "print",
        ui: {
            mobileIcon: {
                icon: _PRINT_ICON,
                labelKey: "print.toolbar.button",
                profileKey: "ui.showPrint",
                requiresPlugin: "print",
                action: "print",
            },
            desktopTabButton: {
                icon: _PRINT_ICON,
                labelKey: "print.toolbar.button",
                profileKey: "ui.showPrint",
                requiresPlugin: "print",
                action: "print",
            },
        },
    });

    if (typeof document !== "undefined") {
        document.addEventListener("geoleaf:toolbar:action", (e: Event) => {
            const ce = e as CustomEvent<{ action: string }>;
            if (ce.detail?.action === "print") {
                _g.GeoLeaf?.Print?.openPrintFlow?.();
            }
        });
    }
}

// Re-export public types for TypeScript consumers.
export type {
    PageOrientation,
    EmpriseBbox,
    Rect,
    PageMargins,
    PageZones,
    ZoneOptions,
    PageFormatDef,
    CaptureOptions,
    CaptureResult,
    ExportOptions,
    PrintFlowOptions,
    ComposedExportOpts,
    ExporterFn,
    ComposeSlot,
} from "./types.js";
