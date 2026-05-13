/*!
 * @geoleaf-plugins/measure — Public API (façade)
 * © 2026 Mattieu Pottier — MIT License
 *
 * Sprint 2: startMeasure / stopMeasure / setUnits / getUnits / registerMeasureType wired.
 * Sprint 3: clearAll, getCollection, rerenderLabels, onToolSelect (distance) wired.
 * Sprint 4: surface tools (rect/circle/polygon) wired.
 * Sprint 5: GPS tool wired.
 * Sprint 6: exportGeoJSON, getPrintableAnnotations, annotations.
 */
import type { MeasureType, MeasureTypeDef, Units, PrintableAnnotation } from "./types.js";
import { getMeasureConfig } from "./config.js";
import { _warnNoCore, _getNativeMap } from "./internal.js";
import {
    initMenu,
    toggleMeasureMenu,
    setActiveTool,
    setCurrentUnits,
    getCurrentUnits,
    setMenuPosition,
    getMenuHeight,
} from "./floating-menu.js";
import {
    initEngine,
    setOnFeatureAdded,
    addSurfaceFeature,
    clearEngineCollection,
    getEngineCollection,
    loadCollection,
    removeFeatureById,
    rerenderLabels,
} from "./measure-engine.js";
import { initLayers } from "./draw-layers.js";
import { activateDistance, deactivateDistance } from "./tools/tool-distance.js";
import { activateRect, deactivateRect } from "./tools/tool-rect.js";
import { activateCircle, deactivateCircle } from "./tools/tool-circle.js";
import { activatePolygon, deactivatePolygon } from "./tools/tool-polygon.js";
import { activateGps, deactivateGps } from "./tools/tool-gps.js";
import {
    initAnnotationOverlays,
    createOverlayFromFeature,
    clearAllOverlays,
    getPrintableAnnotations as _getPrintableAnnotations,
} from "./annotation-overlays.js";
import { activateAnnotationTooltip, deactivateAnnotation } from "./tools/tool-annotation.js";
import { initPersistence, scheduleSave, clearStorage } from "./persistence.js";
import { exportGeoJSON as _exportGeoJSON } from "./geojson-export.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _menuInitialized = false;
let _pillBtn: Element | null = null;
let _menuPositioned = false;
const _customTools = new Map<string, MeasureTypeDef>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Deactivates all tools that may currently be running. */
function _deactivateAll(): void {
    deactivateDistance();
    deactivateRect();
    deactivateCircle();
    deactivatePolygon();
    deactivateGps();
    deactivateAnnotation();
}

/** Lazily initialises the floating menu, layers, engine, overlays, and restores localStorage. */
function _ensureMenu(): void {
    if (_menuInitialized) return;
    const map = _getNativeMap();
    if (!map) return;
    const cfg = getMeasureConfig();

    initEngine(cfg);
    setOnFeatureAdded(() => scheduleSave(getEngineCollection));
    initLayers(map);

    // Init annotation overlay system
    initAnnotationOverlays(map, cfg, {
        onCreated: (f) => {
            if (getEngineCollection().features.length >= cfg.maxFeatures) {
                console.warn(`[GeoLeaf.Measure] maxFeatures (${cfg.maxFeatures}) reached — annotation not added`);
                return;
            }
            addSurfaceFeature(f);
            scheduleSave(getEngineCollection);
        },
        onMutated: () => scheduleSave(getEngineCollection),
        onRemoved: (id) => { removeFeatureById(id); scheduleSave(getEngineCollection); },
    });

    // Boot restoration from localStorage
    const savedFeatures = initPersistence(cfg);
    if (savedFeatures?.length) {
        loadCollection(savedFeatures);
        for (const f of savedFeatures) {
            const kind = f.properties?.annotationKind as "label" | "tooltip" | undefined;
            if (kind === "label" || kind === "tooltip") createOverlayFromFeature(f);
        }
    }

    initMenu(cfg, {
        onToggle: (open) => { _pillBtn?.classList.toggle("gl-map-toolbar__btn--active", open); },
        onToolSelect: (type) => {
            _deactivateAll();
            if (type === "distance") activateDistance(map);
            else if (type === "rect") activateRect(map);
            else if (type === "circle") activateCircle(map);
            else if (type === "polygon") activatePolygon(map);
            else if (type === "gps") activateGps(map, () => setActiveTool(null));
            else if (type === "annotation-tooltip") activateAnnotationTooltip(map);
        },
        onUnitsChange: (u) => {
            setCurrentUnits(u);
            rerenderLabels(getCurrentUnits());
        },
        onClearAll: () => clearAll(),
        onExport: () => { exportGeoJSON().catch((err) => console.error("[GeoLeaf.Measure] export error:", err)); },
    });
    _menuInitialized = true;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Opens or closes the floating measure sub-menu.
 * Also calls `_ensureMenu()` so tools work on first click.
 * @param btn - The pill toolbar button element (used for active-state toggle).
 */
export function openMeasureMenu(btn?: Element): void {
    if (_warnNoCore("openMeasureMenu")) return;
    if (btn) _pillBtn = btn;
    _ensureMenu();
    toggleMeasureMenu();
    // On first open: center the submenu on the pill bar, placed to its right
    if (_pillBtn && !_menuPositioned) {
        const map = _getNativeMap();
        if (map) {
            const mapEl = map.getContainer() as HTMLElement;
            const mapRect = mapEl.getBoundingClientRect();
            // Walk up to find the pill bar wrapper for accurate center
            const pillBarEl =
                _pillBtn.closest(".gl-map-toolbar-wrapper") ??
                _pillBtn.closest(".gl-map-toolbar") ??
                _pillBtn.parentElement;
            const pillRect = pillBarEl
                ? pillBarEl.getBoundingClientRect()
                : _pillBtn.getBoundingClientRect();
            const GAP = 10;
            const menuH = getMenuHeight();
            const pillCenter = pillRect.top + pillRect.height / 2;
            let top = pillCenter - menuH / 2;
            let left = pillRect.right + GAP;
            top = Math.max(mapRect.top + 4, Math.min(top, mapRect.bottom - menuH - 4));
            left = Math.min(left, mapRect.right - 64);
            setMenuPosition(top, left);
        }
        _menuPositioned = true;
    }
}

/** Arms the specified measure tool (changes cursor, activates drawing mode). */
export function startMeasure(type: MeasureType): void {
    if (_warnNoCore("startMeasure")) return;
    _ensureMenu();
    setActiveTool(type);
}

/** Terminates or cancels the currently active measure tool. */
export function stopMeasure(): void {
    if (_warnNoCore("stopMeasure")) return;
    _deactivateAll();
    setActiveTool(null);
}

/** Clears all features, drawing layers, annotation overlays, and localStorage entry. */
export function clearAll(): void {
    if (_warnNoCore("clearAll")) return;
    _deactivateAll();
    setActiveTool(null);
    clearAllOverlays();
    clearEngineCollection();
    clearStorage(getMeasureConfig());
}

/** Returns a deep copy of the current FeatureCollection (measures + annotations). */
export function getCollection(): GeoJSON.FeatureCollection {
    return getEngineCollection();
}

/**
 * Exports the current FeatureCollection as a GeoJSON Blob and (by default) triggers download.
 * @param opts.download - Set false to return the Blob without downloading.
 * @param opts.fileName - Override the default export filename.
 */
export async function exportGeoJSON(
    opts?: { download?: boolean; fileName?: string }
): Promise<Blob> {
    return _exportGeoJSON(getEngineCollection(), opts, getMeasureConfig());
}

/** Changes the active distance and/or area units and re-renders visible labels. */
export function setUnits(u: Partial<Units>): void {
    if (_warnNoCore("setUnits")) return;
    setCurrentUnits(u);
    rerenderLabels(getCurrentUnits());
}

/** Returns the currently active distance and area units. */
export function getUnits(): Units {
    return getCurrentUnits();
}

/**
 * Returns printable annotation descriptors for the print plugin canvas renderer.
 * Only annotations within the map viewport are included.
 */
export function getPrintableAnnotations(): PrintableAnnotation[] {
    return _getPrintableAnnotations();
}

/**
 * Registers a custom measure tool.
 * @param type - Unique identifier for the custom tool.
 * @param def - Tool definition (cursor, activate/deactivate callbacks).
 */
export function registerMeasureType(type: string, def: MeasureTypeDef): void {
    _customTools.set(type, def);
}

/** @internal Returns all public API functions as an object. */
export function buildPublicApi() {
    return {
        startMeasure,
        stopMeasure,
        clearAll,
        getCollection,
        exportGeoJSON,
        setUnits,
        getUnits,
        getPrintableAnnotations,
        registerMeasureType,
    };
}
