/*!
 * @geoleaf-plugins/measure — Internal helpers
 * © 2026 Mattieu Pottier — MIT License
 */

const _g = typeof globalThis !== "undefined" ? (globalThis as any) : (window as any);

/** Returns the GeoLeaf global namespace (may be incomplete before boot). */
export function _getGeoLeaf(): any {
    return _g.GeoLeaf ?? {};
}

/** Logs a warning when the core is unavailable. Returns true if core is missing. */
export function _warnNoCore(fnName: string): boolean {
    if (!_g.GeoLeaf) {
        console.warn(`[GeoLeaf.Measure] ${fnName}: GeoLeaf core not loaded.`);
        return true;
    }
    return false;
}

/**
 * Returns the raw MapLibre map instance via GeoLeaf.Core, or null if unavailable.
 * Use for project(), unproject(), dragPan, getContainer(), etc.
 */
export function _getNativeMap(): any {
    return _g?.GeoLeaf?.Core?.getMap?.()?.getNativeMap?.() ?? null;
}

/**
 * Creates a typed DOM element with optional CSS class and HTML attributes.
 * Never use innerHTML — always textContent for user-controlled strings.
 */
export function _el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    attrs?: Record<string, string>
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    }
    return el;
}

/** Returns the i18n label for a key, falling back to the key itself. */
export function _getLabel(key: string): string {
    return (_g?.GeoLeaf?.I18n?.getLabel?.(key) as string | undefined) ?? key;
}
