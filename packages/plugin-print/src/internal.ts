/*!
 * @geoleaf-plugins/print — Internal helpers
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
        console.warn(`[GeoLeaf.Print] ${fnName}: GeoLeaf core not loaded.`);
        return true;
    }
    return false;
}

/**
 * Returns the raw MapLibre map instance via GeoLeaf.Core, or null if unavailable.
 * Use for unproject(), dragPan, getContainer(), etc.
 */
export function _getNativeMap(): any {
    return _g?.GeoLeaf?.Core?.getMap?.()?.getNativeMap?.() ?? null;
}

/**
 * Validates a URL — only http: and https: schemes are accepted.
 * Rejects javascript:, data:, and other dangerous schemes.
 */
export function _validateUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}
