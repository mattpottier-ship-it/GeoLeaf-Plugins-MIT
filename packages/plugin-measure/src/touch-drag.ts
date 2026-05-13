/*!
 * @geoleaf-plugins/measure — Touch drag handler (best-effort mobile)
 * © 2026 Mattieu Pottier — MIT License
 *
 * Excluded from coverage: touch events are not exercised in happy-dom.
 */

/**
 * Attaches a touch-drag handler to the given handle element.
 * Repositions the root element (identified via CSS custom properties) within the container.
 */
export function wireTouchDrag(
    handle: HTMLElement,
    container: HTMLElement,
    getRoot: () => HTMLElement | null
): void {
    const onTouchStart = (e: TouchEvent): void => {
        const t0 = e.touches[0];
        const root = getRoot();
        if (!t0 || !root) return;
        const sx = t0.clientX, sy = t0.clientY;
        const sl = parseFloat(root.style.getPropertyValue("--gl-measure-left") || "10");
        const st = parseFloat(root.style.getPropertyValue("--gl-measure-top") || "10");
        let raf = 0;

        const onMove = (ev: TouchEvent): void => {
            const t = ev.touches[0];
            const r2 = getRoot();
            if (!t || !r2) return;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const r3 = getRoot();
                if (!r3) return;
                const rect = container.getBoundingClientRect();
                const w = r3.offsetWidth, h = r3.offsetHeight;
                const nl = Math.max(0, Math.min(sl + t.clientX - sx, rect.width - w));
                const nt = Math.max(0, Math.min(st + t.clientY - sy, rect.height - h));
                r3.style.setProperty("--gl-measure-left", `${nl}px`);
                r3.style.setProperty("--gl-measure-top", `${nt}px`);
            });
        };
        const onEnd = (): void => {
            cancelAnimationFrame(raf);
            handle.removeEventListener("touchmove", onMove);
            handle.removeEventListener("touchend", onEnd);
        };
        handle.addEventListener("touchmove", onMove, { passive: true });
        handle.addEventListener("touchend", onEnd);
    };
    handle.addEventListener("touchstart", onTouchStart, { passive: true });
}
