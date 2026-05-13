/*!
 * @geoleaf-plugins/measure — Entry point
 * © 2026 Mattieu Pottier — MIT License
 */
import "./css/geoleaf-measure.css";
import { buildPublicApi, openMeasureMenu } from "./public-api.js";
import { getMeasureConfig } from "./config.js";
import langFr from "./lang/lang_fr.js";
import langEn from "./lang/lang_en.js";
import langEs from "./lang/lang_es.js";
import langPt from "./lang/lang_pt.js";
import langIt from "./lang/lang_it.js";
import langDe from "./lang/lang_de.js";

// Replaced at build time by rollup/replace — must be a plain string literal.
const _VERSION = "__GEOLEAF_MEASURE_VERSION__";

const _g = typeof globalThis !== "undefined" ? (globalThis as any) : (window as any);

// 1 — Register i18n dictionaries FIRST so labels resolve during boot (pill button).
_g.GeoLeaf?.I18n?.registerDict?.("measure", {
    fr: langFr,
    en: langEn,
    es: langEs,
    pt: langPt,
    it: langIt,
    de: langDe,
});

// 2 — Mount GeoLeaf.Measure namespace.
if (_g.GeoLeaf) {
    _g.GeoLeaf.Measure = buildPublicApi();
}

// 3 — Register in the plugin registry.
_g.GeoLeaf?.plugins?.register?.("measure", {
    version: _VERSION,
    requires: [],
    optional: [],
    label: "Mesure & annotation",
    healthCheck: () => typeof _g.GeoLeaf?.Measure === "object",
});

// Ruler/square icon (22 px, stroke currentColor) — sanitised by core DOMSecurity.setSafeHTML.
const _MEASURE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"' +
    ' stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 20 L20 2"/>' +
    '<path d="M2 20 L2 14 L8 20 Z"/>' +
    '<line x1="6" y1="18" x2="9" y2="15"/>' +
    '<line x1="10" y1="14" x2="13" y2="11"/>' +
    '<line x1="14" y1="10" x2="17" y2="7"/>' +
    "</svg>";

// 4 & 5 — Register toolbar slot + wire event listener (skipped if enabled === false).
if (getMeasureConfig().enabled !== false) {
    _g.GeoLeaf?.registry?.register?.({
        id: "measure",
        ui: {
            mobileIcon: {
                icon: _MEASURE_ICON,
                labelKey: "measure.toolbar.button",
                profileKey: "ui.showMeasure",
                requiresPlugin: "measure",
                action: "measure",
            },
        },
    });

    if (typeof document !== "undefined") {
        document.addEventListener("geoleaf:toolbar:action", (e: Event) => {
            const ce = e as CustomEvent<{ action: string; element?: Element }>;
            if (ce.detail?.action === "measure") {
                openMeasureMenu(ce.detail?.element);
            }
        });
    }
}

// Re-export public types for TypeScript consumers.
export type {
    MeasureType,
    MeasureFeature,
    MeasureSession,
    MeasureConfig,
    MeasureTypeDef,
    Units,
    DistanceUnit,
    AreaUnit,
    PrintableAnnotation,
} from "./types.js";
