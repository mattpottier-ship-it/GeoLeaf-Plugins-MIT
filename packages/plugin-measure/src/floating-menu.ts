/*!
 * @geoleaf-plugins/measure — Floating measure sub-menu
 * © 2026 Mattieu Pottier — MIT License
 *
 * Sprint 2: draggable sub-menu, tool buttons, recap-box host.
 * Sprint 6: pill layout matching the left toolbar bar; unit cycle buttons (m↔km, m²→ha→km²);
 *   icon-only tool/action buttons; onToggle callback for pill active state.
 */
import type { MeasureConfig, MeasureType, Units } from "./types.js";
import { getMeasureConfig } from "./config.js";
import { _getNativeMap, _el, _getLabel } from "./internal.js";
import { wireTouchDrag } from "./touch-drag.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _root: HTMLElement | null = null;
let _menuEl: HTMLElement | null = null;
let _isOpen = false;
let _activeTool: MeasureType | null = null;
let _units: Units = { distance: "auto", area: "auto" };
let _cfg: MeasureConfig | null = null;
let _distUnitBtn: HTMLButtonElement | null = null;
let _areaUnitBtn: HTMLButtonElement | null = null;
let _scrollEl: HTMLElement | null = null;
let _navUp: HTMLElement | null = null;
let _navDown: HTMLElement | null = null;
let _resizeObserver: ResizeObserver | null = null;
let _tooltipEl: HTMLDivElement | null = null;
let _onToggle: ((open: boolean) => void) | undefined;
let _onToolSelect: ((type: MeasureType | null) => void) | undefined;
let _onUnitsChange: ((u: Partial<Units>) => void) | undefined;
let _onClearAll: (() => void) | undefined;
let _onExport: (() => void) | undefined;
let _submenuOpenListener: ((e: Event) => void) | null = null;

/** Callbacks provided by the public API layer. */
export interface MenuCallbacks {
    /** Called when the menu opens (true) or closes (false). */
    onToggle?: (open: boolean) => void;
    onToolSelect?: (type: MeasureType | null) => void;
    onUnitsChange?: (u: Partial<Units>) => void;
    onClearAll?: () => void;
    onExport?: () => void;
}

// ---------------------------------------------------------------------------
// SVG icon constants
// ---------------------------------------------------------------------------

const _SVG_GRIP  = '<line x1="5" y1="8" x2="19" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="16" x2="19" y2="16"/>';
const _SVG_CLOSE = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
const _SVG_DISTANCE = '<line x1="4" y1="20" x2="20" y2="4"/><line x1="7.5" y1="18.5" x2="9.5" y2="16.5"/><line x1="11" y1="15" x2="13" y2="13"/><line x1="14.5" y1="11.5" x2="16.5" y2="9.5"/>';
const _SVG_GPS   = '<path d="M12 2C8.69 2 6 4.69 6 8c0 4.5 6 14 6 14s6-9.5 6-14c0-3.31-2.69-6-6-6z"/><circle cx="12" cy="8" r="2"/>';
const _SVG_RECT  = '<rect x="3" y="6" width="18" height="12" rx="1.5"/>';
const _SVG_CIRCLE = '<circle cx="12" cy="12" r="9"/>';
const _SVG_POLYGON = '<polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/>';
const _SVG_ANNOT_TOOLTIP = '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>';
const _SVG_CLEAR = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4h6v2"/>';
const _SVG_EXPORT = '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
const _SVG_CHEVRON_UP   = '<path d="M18 15l-6-6-6 6"/>';
const _SVG_CHEVRON_DOWN = '<path d="M6 9l6 6 6-6"/>';

// ---------------------------------------------------------------------------
// SVG helper — static source paths only, never user input
// ---------------------------------------------------------------------------

function _makeIcon(paths: string): DocumentFragment {
    const tpl = document.createElement("template");
    tpl.innerHTML =
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"` +
        ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    return tpl.content.cloneNode(true) as DocumentFragment;
}

// ---------------------------------------------------------------------------
// Unit cycling
// ---------------------------------------------------------------------------

const _DIST_CYCLE: Array<"m" | "km"> = ["m", "km"];
const _AREA_CYCLE: Array<"m2" | "ha" | "km2"> = ["m2", "ha", "km2"];
const _DIST_LABEL: Record<string, string> = { m: "m", km: "km", auto: "~" };
const _AREA_LABEL: Record<string, string> = { m2: "m²", ha: "ha", km2: "km²", auto: "~" };

function _distLabel(): string { return _DIST_LABEL[_units.distance] ?? _units.distance; }
function _areaLabel(): string { return _AREA_LABEL[_units.area] ?? _units.area; }

function _cycleDistUnit(): void {
    const idx = _DIST_CYCLE.indexOf(_units.distance as "m" | "km");
    const next = _DIST_CYCLE[(idx < 0 ? 0 : idx + 1) % _DIST_CYCLE.length];
    _units.distance = next;
    _syncUnitBtns();
    _onUnitsChange?.({ distance: next });
}

function _cycleAreaUnit(): void {
    const idx = _AREA_CYCLE.indexOf(_units.area as "m2" | "ha" | "km2");
    const next = _AREA_CYCLE[(idx < 0 ? 0 : idx + 1) % _AREA_CYCLE.length];
    _units.area = next;
    _syncUnitBtns();
    _onUnitsChange?.({ area: next });
}

function _syncUnitBtns(): void {
    if (_distUnitBtn) _distUnitBtn.textContent = _distLabel();
    if (_areaUnitBtn) _areaUnitBtn.textContent = _areaLabel();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialises the floating menu with config and callbacks.
 * Idempotent: updates callbacks without rebuilding the DOM if already initialised.
 */
export function initMenu(cfg: MeasureConfig, cbs: MenuCallbacks = {}): void {
    _cfg = cfg;
    _onToggle = cbs.onToggle;
    _onToolSelect = cbs.onToolSelect;
    _onUnitsChange = cbs.onUnitsChange;
    _onClearAll = cbs.onClearAll;
    _onExport = cbs.onExport;
    _units = { distance: cfg.defaultDistanceUnit, area: cfg.defaultAreaUnit };
    if (!_root) {
        const map = _getNativeMap();
        if (map) _buildDOM(map, cfg);
    } else {
        _syncUnitBtns();
    }
}

/**
 * Toggles the sub-menu open or closed.
 * Lazy-initialises the DOM if initMenu() was not called before.
 */
export function toggleMeasureMenu(): void {
    if (!_root) {
        const map = _getNativeMap();
        if (!map) return;
        const cfg = _cfg ?? getMeasureConfig();
        _cfg = cfg;
        _units = { distance: cfg.defaultDistanceUnit, area: cfg.defaultAreaUnit };
        _buildDOM(map, cfg);
    }
    _isOpen ? _close() : _open();
}

/** Arms the given tool, or disarms all tools if null. */
export function setActiveTool(type: MeasureType | null): void {
    _activeTool = type;
    _syncActiveButton();
}

/** Returns the currently armed tool, or null if none. */
export function getCurrentTool(): MeasureType | null {
    return _activeTool;
}

/** Updates the unit toggle buttons to reflect the given partial units. */
export function setCurrentUnits(u: Partial<Units>): void {
    _units = { ..._units, ...u };
    _syncUnitBtns();
}

/** Returns a copy of the currently active units. */
export function getCurrentUnits(): Units {
    return { ..._units };
}

/** Overrides the floating menu position (viewport-absolute pixels). */
export function setMenuPosition(top: number, left: number): void {
    if (!_root) return;
    _root.style.setProperty("--gl-measure-top", `${top}px`);
    _root.style.setProperty("--gl-measure-left", `${left}px`);
}

/** Returns the rendered height of the menu element (0 if hidden or not built). */
export function getMenuHeight(): number {
    return _menuEl?.offsetHeight ?? 0;
}

/** Removes the menu DOM and resets all module state. */
export function destroyMenu(): void {
    if (_submenuOpenListener) {
        document.removeEventListener("geoleaf:submenu:open", _submenuOpenListener);
        _submenuOpenListener = null;
    }
    _resizeObserver?.disconnect();
    _resizeObserver = null;
    _root?.parentNode?.removeChild(_root);
    _root = null;
    _menuEl = null;
    _scrollEl = null;
    _navUp = null;
    _navDown = null;
    _tooltipEl = null;
    _isOpen = false;
    _activeTool = null;
    _cfg = null;
    _distUnitBtn = null;
    _areaUnitBtn = null;
    _onToggle = undefined;
    _onToolSelect = undefined;
    _onUnitsChange = undefined;
    _onClearAll = undefined;
    _onExport = undefined;
}

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------

type ToolDef = { id: MeasureType; lk: string; ak: string; svg: string };

const _GROUPS: Array<{ tools: ToolDef[] }> = [
    {
        tools: [
            { id: "distance",           lk: "measure.tool.distance",          ak: "measure.aria.distanceTool",          svg: _SVG_DISTANCE },
            { id: "gps",                lk: "measure.tool.gps",               ak: "measure.aria.gpsTool",               svg: _SVG_GPS },
        ],
    },
    {
        tools: [
            { id: "rect",               lk: "measure.tool.rect",              ak: "measure.aria.rectTool",              svg: _SVG_RECT },
            { id: "circle",             lk: "measure.tool.circle",            ak: "measure.aria.circleTool",            svg: _SVG_CIRCLE },
            { id: "polygon",            lk: "measure.tool.polygon",           ak: "measure.aria.polygonTool",           svg: _SVG_POLYGON },
        ],
    },
    {
        tools: [
            { id: "annotation-tooltip", lk: "measure.tool.annotationTooltip", ak: "measure.aria.annotationTooltipTool", svg: _SVG_ANNOT_TOOLTIP },
        ],
    },
];

function _buildNavBtn(svg: string, dir: -1 | 1, label: string): HTMLElement {
    const btn = _el("button", `gl-measure-menu__nav gl-measure-menu__nav--${dir < 0 ? "up" : "down"}`);
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", label);
    btn.appendChild(_makeIcon(svg));
    btn.addEventListener("click", () => _scrollEl?.scrollBy({ top: dir * 80, behavior: "smooth" }));
    return btn;
}

function _updateNavVisibility(): void {
    if (!_scrollEl || !_navUp || !_navDown) return;
    const { scrollTop, scrollHeight, clientHeight } = _scrollEl;
    const hasOverflow = scrollHeight > clientHeight + 2;
    _navUp.classList.toggle("gl-is-visible", hasOverflow && scrollTop > 2);
    _navDown.classList.toggle("gl-is-visible", hasOverflow && scrollTop + clientHeight < scrollHeight - 2);
}

function _buildDOM(map: any, cfg: MeasureConfig): void {
    const container: HTMLElement = map.getContainer();

    _root = _el("div", "gl-measure-root");
    _root.style.setProperty("--gl-measure-max-h", `${Math.max(200, container.clientHeight - 80)}px`);
    _applyPosition(cfg.menuPosition);

    _tooltipEl = document.createElement("div");
    _tooltipEl.className = "gl-measure-tooltip";
    _tooltipEl.setAttribute("aria-hidden", "true");
    _root.appendChild(_tooltipEl);

    _menuEl = _el("div", "gl-measure-menu gl-measure-menu--hidden");
    _menuEl.setAttribute("role", "dialog");
    _menuEl.setAttribute("aria-label", _getLabel("measure.menu.title"));

    // Drag handle — outside scroll area, always visible
    const handle = _el("div", "gl-measure-menu__handle");
    handle.setAttribute("aria-label", _getLabel("measure.aria.menuDragHandle"));
    const grip = _el("span", "gl-measure-menu__grip");
    grip.appendChild(_makeIcon(_SVG_GRIP));
    handle.appendChild(grip);
    _menuEl.appendChild(handle);

    // Nav up
    _navUp = _buildNavBtn(_SVG_CHEVRON_UP, -1, "Scroll up");
    _menuEl.appendChild(_navUp);

    // Scrollable content area
    _scrollEl = _el("div", "gl-measure-menu__scroll");

    const activeGroups = _GROUPS
        .map((g) => g.tools.filter((t) => cfg.enabledTools.includes(t.id)))
        .filter((tools) => tools.length > 0);

    for (let i = 0; i < activeGroups.length; i++) {
        if (i > 0) _scrollEl.appendChild(_el("div", "gl-measure-menu__sep"));
        for (const tool of activeGroups[i]) {
            _scrollEl.appendChild(_buildToolBtn(tool));
        }
    }

    _scrollEl.appendChild(_el("div", "gl-measure-menu__sep"));
    _distUnitBtn = _buildUnitBtn("dist");
    _areaUnitBtn = _buildUnitBtn("area");
    _scrollEl.appendChild(_distUnitBtn);
    _scrollEl.appendChild(_areaUnitBtn);

    _scrollEl.appendChild(_el("div", "gl-measure-menu__sep"));
    _scrollEl.appendChild(_buildActionBtn(_SVG_CLEAR,  "measure.btn.clear",  "measure.aria.clearBtn",  "clear",  () => _onClearAll?.()));
    _scrollEl.appendChild(_buildActionBtn(_SVG_EXPORT, "measure.btn.export", "measure.aria.exportBtn", "export", () => _onExport?.()));

    _menuEl.appendChild(_scrollEl);

    // Nav down
    _navDown = _buildNavBtn(_SVG_CHEVRON_DOWN, 1, "Scroll down");
    _menuEl.appendChild(_navDown);

    _root.appendChild(_menuEl);
    container.appendChild(_root);

    _scrollEl.addEventListener("scroll", _updateNavVisibility, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
        _resizeObserver = new ResizeObserver(_updateNavVisibility);
        _resizeObserver.observe(_scrollEl);
    }

    _wireDrag(handle, container);
    wireTouchDrag(handle, container, () => _root);
    _wireTips();

    _submenuOpenListener = (e: Event) => {
        const ce = e as CustomEvent<{ id: string }>;
        if (ce.detail?.id !== "measure" && _isOpen) _close();
    };
    document.addEventListener("geoleaf:submenu:open", _submenuOpenListener);
}

function _buildToolBtn(tool: ToolDef): HTMLButtonElement {
    const btn = _el("button", "gl-measure-tool-btn");
    btn.type = "button";
    btn.dataset.tool = tool.id;
    btn.dataset.tooltip = _getLabel(tool.lk);
    btn.setAttribute("aria-label", _getLabel(tool.ak));
    btn.setAttribute("aria-pressed", "false");
    btn.appendChild(_makeIcon(tool.svg));
    btn.addEventListener("click", () => _handleToolClick(tool.id));
    return btn;
}

function _buildUnitBtn(type: "dist" | "area"): HTMLButtonElement {
    const btn = _el("button", "gl-measure-unit-btn");
    btn.type = "button";
    btn.dataset.unitType = type;
    btn.dataset.tooltip = _getLabel(
        type === "dist" ? "measure.unit.distance.label" : "measure.unit.area.label"
    );
    btn.setAttribute("aria-label", _getLabel(
        type === "dist" ? "measure.unit.distance.label" : "measure.unit.area.label"
    ));
    btn.textContent = type === "dist" ? _distLabel() : _areaLabel();
    btn.addEventListener("click", type === "dist" ? _cycleDistUnit : _cycleAreaUnit);
    return btn;
}

function _buildActionBtn(
    svg: string,
    lk: string,
    ak: string,
    action: string,
    handler: () => void,
): HTMLButtonElement {
    const btn = _el("button", "gl-measure-action-btn");
    btn.type = "button";
    btn.dataset.action = action;
    btn.dataset.tooltip = _getLabel(lk);
    btn.setAttribute("aria-label", _getLabel(ak));
    btn.appendChild(_makeIcon(svg));
    btn.addEventListener("click", handler);
    return btn;
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

function _applyPosition(pos: string | { top: number; left: number }): void {
    if (!_root) return;
    const { top, left } = typeof pos === "object" ? pos : { top: 10, left: 10 };
    _root.style.setProperty("--gl-measure-top", `${top}px`);
    _root.style.setProperty("--gl-measure-left", `${left}px`);
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

function _open(): void {
    _isOpen = true;
    _menuEl?.classList.remove("gl-measure-menu--hidden");
    _onToggle?.(true);
    document.dispatchEvent(
        new CustomEvent("geoleaf:submenu:open", { detail: { id: "measure" }, bubbles: false }),
    );
}

function _close(): void {
    _isOpen = false;
    _menuEl?.classList.add("gl-measure-menu--hidden");
    _onToggle?.(false);
    if (_activeTool !== null) {
        _activeTool = null;
        _syncActiveButton();
        _onToolSelect?.(null);
    }
}

// ---------------------------------------------------------------------------
// Tool handling
// ---------------------------------------------------------------------------

function _handleToolClick(id: MeasureType): void {
    const next = _activeTool === id ? null : id;
    _activeTool = next;
    _syncActiveButton();
    _onToolSelect?.(next);
}

function _syncActiveButton(): void {
    if (!_menuEl) return;
    for (const btn of _menuEl.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
        const active = btn.dataset.tool === _activeTool;
        btn.classList.toggle("gl-measure-tool-btn--active", active);
        btn.setAttribute("aria-pressed", String(active));
    }
}

// ---------------------------------------------------------------------------
// Tooltip — JS-positioned floating div (overflow:hidden on menu clips ::after)
// ---------------------------------------------------------------------------

function _showTip(btn: HTMLElement): void {
    if (!_tooltipEl) return;
    const label = btn.dataset.tooltip;
    if (!label) return;
    _tooltipEl.textContent = label;
    const r = btn.getBoundingClientRect();
    _tooltipEl.style.left = `${r.right + 10}px`;
    _tooltipEl.style.top = `${r.top + r.height / 2}px`;
    _tooltipEl.classList.add("gl-is-visible");
}

function _hideTip(): void {
    _tooltipEl?.classList.remove("gl-is-visible");
}

function _wireTips(): void {
    if (!_root) return;
    for (const btn of _root.querySelectorAll<HTMLElement>("[data-tooltip]")) {
        btn.addEventListener("mouseenter", () => _showTip(btn));
        btn.addEventListener("focusin",    () => _showTip(btn));
        btn.addEventListener("mouseleave", _hideTip);
        btn.addEventListener("focusout",   _hideTip);
    }
}

// ---------------------------------------------------------------------------
// Drag — mouse
// ---------------------------------------------------------------------------

function _wireDrag(handle: HTMLElement, container: HTMLElement): void {
    handle.addEventListener("mousedown", (e: MouseEvent) => {
        if (e.button !== 0 || !_root) return;
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY;
        const sl = parseFloat(_root.style.getPropertyValue("--gl-measure-left") || "10");
        const st = parseFloat(_root.style.getPropertyValue("--gl-measure-top") || "10");
        let raf = 0;

        const onMove = (ev: MouseEvent): void => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                if (!_root) return;
                const r = container.getBoundingClientRect();
                const w = _root.offsetWidth, h = _root.offsetHeight;
                const nl = Math.max(0, Math.min(sl + ev.clientX - sx, r.width - w));
                const nt = Math.max(0, Math.min(st + ev.clientY - sy, r.height - h));
                _root.style.setProperty("--gl-measure-left", `${nl}px`);
                _root.style.setProperty("--gl-measure-top", `${nt}px`);
            });
        };
        const onUp = (): void => {
            cancelAnimationFrame(raf);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });
}
