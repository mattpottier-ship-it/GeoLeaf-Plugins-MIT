/*!
 * @geoleaf-plugins/measure — Circle surface measurement tool
 * © 2026 Mattieu Pottier — MIT License
 *
 * Drag interaction: mousedown (centre) → mousemove (radius preview) → mouseup.
 * Minimum radius threshold prevents accidental micro-circles.
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
    circlePolygon,
    segmentLengths,
    perimeter,
    area,
} from "../compute.js";
import { getMeasureConfig } from "../config.js";

// Minimum radius in metres to register as a valid circle.
const MIN_RADIUS_M = 1;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _map: any = null;
let _active = false;
let _center: [number, number] | null = null;
let _lastRadius = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Distance in metres between two geographic coordinates (via segmentLengths). */
function _radiusM(a: [number, number], b: [number, number]): number {
    return segmentLengths([a, b])[0] ?? 0;
}

/** Updates the map preview for the current drag state. */
function _updateLive(center: [number, number], radiusM: number): void {
    const cfg = getMeasureConfig();
    const steps = cfg.circleSteps ?? 64;
    const rings = circlePolygon(center, radiusM, steps);
    updatePreview(rings[0]);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function _onMouseDown(e: any): void {
    if (!_active || e.originalEvent?.button !== 0) return;
    _center = [e.lngLat.lng, e.lngLat.lat];
    _lastRadius = 0;
    disableDragPan();
    _map.on("mousemove", _onMouseMove);
    document.addEventListener("mouseup", _onMouseUp, { once: true });
}

function _onMouseMove(e: any): void {
    if (!_center) return;
    const curr: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    _lastRadius = _radiusM(_center, curr);
    if (_lastRadius >= MIN_RADIUS_M) {
        _updateLive(_center, _lastRadius);
    }
}

function _onMouseUp(_e: MouseEvent): void {
    _map.off("mousemove", _onMouseMove);
    enableDragPan();

    const center = _center;
    const radiusM = _lastRadius;
    _center = null;
    _lastRadius = 0;

    if (!center || radiusM < MIN_RADIUS_M) {
        clearPreview();
        return;
    }
    _finishCircle(center, radiusM);
}

function _finishCircle(center: [number, number], radiusM: number): void {
    const cfg = getMeasureConfig();
    const steps = cfg.circleSteps ?? 64;
    const rings = circlePolygon(center, radiusM, steps);
    const ring = rings[0];
    const openRing = ring.slice(0, ring.length - 1);
    const perimM = perimeter(openRing, true);
    const areaM2 = area(rings);

    const feature: MeasureFeature = {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: rings },
        properties: {
            measureType: "circle",
            radiusM,
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
 * Arms the circle tool: registers mousedown on the map.
 * Safe to call if already active (no-op).
 */
export function activateCircle(map: any): void {
    if (_active) return;
    _map = map;
    _active = true;
    _center = null;
    _lastRadius = 0;
    (map as any).__geoleafExclusiveMode = true;
    setCursor("crosshair");
    _map.on("mousedown", _onMouseDown);
}

/**
 * Disarms the circle tool: removes event listeners and clears preview.
 */
export function deactivateCircle(): void {
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
    _center = null;
    _lastRadius = 0;
    _map = null;
}
