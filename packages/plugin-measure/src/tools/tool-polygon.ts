/*!
 * @geoleaf-plugins/measure — Polygon surface measurement tool
 * © 2026 Mattieu Pottier — MIT License
 *
 * Wires MapLibre map events to the measure engine for polygon surface measurement.
 * Closure: snap on first vertex (snapPx), double-click, or key C.
 * Cumulative: prior measurements stay visible after each finish.
 */
import {
    startSession,
    addVertex,
    updateEnginePreview,
    closeAsPolygon,
    finishSession,
    cancelSession,
    getSession,
} from "../measure-engine.js";
import { setCursor } from "../draw-layers.js";
import { getMeasureConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _map: any = null;
let _active = false;
let _canvas: HTMLCanvasElement | null = null;
let _container: HTMLElement | null = null;
let _cursorObserver: MutationObserver | null = null;
let _snapping = false;

// Guards against the two click events fired before dblclick adding extra vertices.
let _justFinished = false;

// ---------------------------------------------------------------------------
// Cursor guard
// ---------------------------------------------------------------------------

function _startCursorGuard(): void {
    _canvas = _map.getCanvas() as HTMLCanvasElement;
    _container = _map.getContainer() as HTMLElement;
    _cursorObserver = new MutationObserver(() => {
        if (!_active || !_canvas) return;
        const expected = _snapping ? "pointer" : "crosshair";
        if (_canvas.style.cursor !== expected) {
            _canvas.style.cursor = expected;
        }
    });
    _cursorObserver.observe(_canvas, { attributes: true, attributeFilter: ["style"] });
}

function _stopCursorGuard(): void {
    _cursorObserver?.disconnect();
    _cursorObserver = null;
    _container = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pixel distance between two geographic coordinates on the current map. */
function _pixelDist(a: [number, number], b: [number, number]): number {
    const pa = _map.project({ lng: a[0], lat: a[1] });
    const pb = _map.project({ lng: b[0], lat: b[1] });
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** True if cursor is within snapPx of the first vertex (requires ≥ 3 vertices). */
function _isSnapping(cursor: [number, number]): boolean {
    const verts = getSession()?.vertices;
    if (!verts || verts.length < 3) return false;
    const snapPx = getMeasureConfig().snapPx ?? 12;
    return _pixelDist(verts[0], cursor) <= snapPx;
}

// ---------------------------------------------------------------------------
// Event handlers — DOM capture (production: blocks feature layer interactions)
// Attached to map.getContainer() so they fire before ANY MapLibre / GeoLeaf handler.
// ---------------------------------------------------------------------------

function _containerCoord(e: MouseEvent): [number, number] {
    const rect = (_map.getCanvas() as HTMLCanvasElement).getBoundingClientRect();
    const lngLat = _map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    return [lngLat.lng, lngLat.lat];
}

function _onContainerClick(e: MouseEvent): void {
    if (!_active || _justFinished) return;
    if (e.target !== _canvas) return;
    e.stopImmediatePropagation();
    const coord = _containerCoord(e);
    if (_isSnapping(coord)) {
        _triggerClose();
        return;
    }
    const verts = getSession()?.vertices;
    if (verts?.length && verts[verts.length - 1][0] === coord[0] && verts[verts.length - 1][1] === coord[1]) return;
    addVertex(coord);
}

function _onContainerDblClick(e: MouseEvent): void {
    if (!_active) return;
    if (e.target !== _canvas) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if ((getSession()?.vertices.length ?? 0) >= 3) {
        _triggerClose();
    }
}

// ---------------------------------------------------------------------------
// Event handlers — MapLibre events (used by unit tests via map._fireEvent)
// ---------------------------------------------------------------------------

function _onClick(e: any): void {
    if (!_active || _justFinished) return;
    const coord = e.lngLat.toArray() as [number, number];
    if (_isSnapping(coord)) {
        _triggerClose();
        return;
    }
    const verts = getSession()?.vertices;
    if (verts?.length && verts[verts.length - 1][0] === coord[0] && verts[verts.length - 1][1] === coord[1]) return;
    addVertex(coord);
}

function _onMouseMove(e: any): void {
    if (!_active) return;
    const coord = e.lngLat.toArray() as [number, number];
    const verts = getSession()?.vertices;
    _snapping = !!(verts && verts.length >= 3 && _isSnapping(coord));
    if (verts && verts.length > 0) {
        updateEnginePreview(coord);
    }
    setCursor(_snapping ? "pointer" : "crosshair");
}

function _onDblClick(e: any): void {
    if (!_active) return;
    e.preventDefault?.();
    if ((getSession()?.vertices.length ?? 0) >= 3) {
        _triggerClose();
    }
}

function _onKeyDown(e: KeyboardEvent): void {
    if (!_active) return;
    if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        if ((getSession()?.vertices.length ?? 0) >= 3) {
            _triggerClose();
        }
    }
}

function _triggerClose(): void {
    _justFinished = true;
    _snapping = false;
    closeAsPolygon();
    finishSession();
    // Stay active so the user can start another polygon immediately.
    // Reset the guard after the dblclick sequence resolves.
    setTimeout(() => {
        _justFinished = false;
        if (_active) {
            startSession("polygon");
            setCursor("crosshair");
        }
    }, 50);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Arms the polygon tool: starts a new session and listens for map events.
 * Safe to call if already active (no-op).
 */
export function activatePolygon(map: any): void {
    if (_active) return;
    _map = map;
    _active = true;
    _justFinished = false;
    _snapping = false;
    (map as any).__geoleafExclusiveMode = true;

    startSession("polygon");
    setCursor("crosshair");

    _startCursorGuard();

    _container!.addEventListener("click", _onContainerClick, true);
    _container!.addEventListener("dblclick", _onContainerDblClick, true);

    _map.doubleClickZoom?.disable?.();
    _map.on("click", _onClick);
    _map.on("mousemove", _onMouseMove);
    _map.on("dblclick", _onDblClick);
    document.addEventListener("keydown", _onKeyDown);
}

/**
 * Disarms the polygon tool: removes event listeners, cancels any open session,
 * and restores the default cursor.
 */
export function deactivatePolygon(): void {
    if (!_active) return;
    _active = false;
    _justFinished = false;
    _snapping = false;

    if (_container) {
        _container.removeEventListener("click", _onContainerClick, true);
        _container.removeEventListener("dblclick", _onContainerDblClick, true);
    }
    _stopCursorGuard();
    _canvas = null;

    if (_map) {
        (_map as any).__geoleafExclusiveMode = false;
        _map.doubleClickZoom?.enable?.();
        _map.off("click", _onClick);
        _map.off("mousemove", _onMouseMove);
        _map.off("dblclick", _onDblClick);
    }
    document.removeEventListener("keydown", _onKeyDown);

    if (getSession()) cancelSession();
    setCursor("grab");
    _map = null;
}
