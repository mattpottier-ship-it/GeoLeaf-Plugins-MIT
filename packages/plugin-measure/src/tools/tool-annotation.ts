/*!
 * @geoleaf-plugins/measure — Annotation tool (tooltip / multiline note)
 * © 2026 Mattieu Pottier — MIT License
 *
 * Each map click on the canvas creates a new tooltip overlay via annotation-overlays.ts.
 * No measure-engine session is used — features are inserted directly via onCreated callback.
 */
import { createOverlay } from "../annotation-overlays.js";
import { setCursor } from "../draw-layers.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _map: any = null;
let _active = false;
let _canvas: HTMLCanvasElement | null = null;
let _container: HTMLElement | null = null;
let _cursorObserver: MutationObserver | null = null;

// ---------------------------------------------------------------------------
// Cursor guard — MutationObserver fights MapLibre cursor resets
// ---------------------------------------------------------------------------

function _startCursorGuard(): void {
    _cursorObserver = new MutationObserver(() => {
        if (_active && _canvas && _canvas.style.cursor !== "crosshair") {
            _canvas.style.cursor = "crosshair";
        }
    });
    _cursorObserver.observe(_canvas!, { attributes: true, attributeFilter: ["style"] });
}

function _stopCursorGuard(): void {
    _cursorObserver?.disconnect();
    _cursorObserver = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converts a MouseEvent client position to [lng, lat] via the map. */
function _containerCoord(e: MouseEvent): [number, number] {
    const rect = (_map.getCanvas() as HTMLCanvasElement).getBoundingClientRect();
    const ll = _map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    return [ll.lng, ll.lat];
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function _onContainerClick(e: MouseEvent): void {
    if (!_active) return;
    // Only handle direct canvas clicks — overlay elements handle their own pointer events
    if (e.target !== _canvas) return;
    e.stopImmediatePropagation();
    const lngLat = _containerCoord(e);
    createOverlay(lngLat);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Arms the annotation tooltip tool. */
export function activateAnnotationTooltip(map: any): void {
    if (_active) deactivateAnnotation();
    _map = map;
    _active = true;
    _canvas = map.getCanvas() as HTMLCanvasElement;
    _container = map.getContainer() as HTMLElement;
    (map as any).__geoleafExclusiveMode = true;
    setCursor("crosshair");
    _startCursorGuard();
    _container.addEventListener("click", _onContainerClick, true);
}

/** Disarms whichever annotation sub-tool is currently active. */
export function deactivateAnnotation(): void {
    if (!_active) return;
    _active = false;
    _stopCursorGuard();
    if (_container) _container.removeEventListener("click", _onContainerClick, true);
    if (_map) {
        (_map as any).__geoleafExclusiveMode = false;
        setCursor("grab");
    }
    _map = null;
    _canvas = null;
    _container = null;
}
