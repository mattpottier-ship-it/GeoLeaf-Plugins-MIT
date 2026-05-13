/*!
 * @geoleaf-plugins/measure — Rectangle surface measurement tool
 * © 2026 Mattieu Pottier — MIT License
 *
 * Drag interaction: mousedown (top-left anchor) → mousemove (live preview) → mouseup.
 * Minimum pixel threshold prevents accidental micro-rectangles.
 */
import type { MeasureFeature } from "../types.js";
import { addSurfaceFeature } from "../measure-engine.js";
import {
    updatePreview,
    clearPreview,
    disableDragPan,
    enableDragPan,
    setCursor,
} from "../draw-layers.js";
import {
    bboxPolygon,
    perimeter,
    area,
} from "../compute.js";

// Minimum pixel drag distance to register as a valid rectangle.
const MIN_DRAG_PX = 5;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _map: any = null;
let _active = false;
let _anchor: [number, number] | null = null;
let _lastCursor: [number, number] | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pixel distance between two geographic coordinates on the current map. */
function _pixelDist(a: [number, number], b: [number, number]): number {
    const pa = _map.project({ lng: a[0], lat: a[1] });
    const pb = _map.project({ lng: b[0], lat: b[1] });
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** Updates the map preview for the current drag state. */
function _updateLive(curr: [number, number]): void {
    if (!_anchor) return;
    const rings = bboxPolygon(_anchor, curr);
    updatePreview(rings[0]);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function _onMouseDown(e: any): void {
    if (!_active || e.originalEvent?.button !== 0) return;
    _anchor = [e.lngLat.lng, e.lngLat.lat];
    _lastCursor = _anchor;
    disableDragPan();
    _map.on("mousemove", _onMouseMove);
    document.addEventListener("mouseup", _onMouseUp, { once: true });
}

function _onMouseMove(e: any): void {
    if (!_anchor) return;
    _lastCursor = [e.lngLat.lng, e.lngLat.lat];
    _updateLive(_lastCursor);
}

function _onMouseUp(_e: MouseEvent): void {
    _map.off("mousemove", _onMouseMove);
    enableDragPan();

    const anchor = _anchor;
    const curr = _lastCursor;
    _anchor = null;
    _lastCursor = null;

    if (!anchor || !curr || _pixelDist(anchor, curr) < MIN_DRAG_PX) {
        clearPreview();
        return;
    }
    _finishRect(anchor, curr);
}

function _finishRect(p1: [number, number], p2: [number, number]): void {
    const rings = bboxPolygon(p1, p2);
    const open = rings[0].slice(0, rings[0].length - 1);
    const perimM = perimeter(open, true);
    const areaM2 = area(rings);

    const feature: MeasureFeature = {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: rings },
        properties: {
            measureType: "rect",
            perimeterM: perimM,
            areaM2,
            lengthM: perimM,
            createdAt: new Date().toISOString(),
        },
    };
    addSurfaceFeature(feature);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Arms the rectangle tool: registers mousedown on the map.
 * Safe to call if already active (no-op).
 */
export function activateRect(map: any): void {
    if (_active) return;
    _map = map;
    _active = true;
    _anchor = null;
    _lastCursor = null;
    (map as any).__geoleafExclusiveMode = true;
    setCursor("crosshair");
    _map.on("mousedown", _onMouseDown);
}

/**
 * Disarms the rectangle tool: removes event listeners and clears preview.
 */
export function deactivateRect(): void {
    if (!_active) return;
    _active = false;
    if (_map) {
        (_map as any).__geoleafExclusiveMode = false;
        _map.off("mousedown", _onMouseDown);
        _map.off("mousemove", _onMouseMove);
    }
    document.removeEventListener("mouseup", _onMouseUp);
    enableDragPan();
    clearPreview();
    setCursor("grab");
    _anchor = null;
    _lastCursor = null;
    _map = null;
}
