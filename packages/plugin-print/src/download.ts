/*!
 * @geoleaf-plugins/print — Multi-platform file download
 *
 * Strategy (in priority order):
 *  1. navigator.share({ files }) — iOS Safari only.
 *     On iOS, <a download> opens the file in the browser instead of saving it,
 *     so the native share sheet is the only reliable save path.
 *     Desktop browsers (Chrome/Edge on Windows/macOS) also support navigator.share
 *     but it opens a system share dialog — NOT what we want on desktop.
 *     Guard: only activate on iOS (iPhone/iPad/iPod UA string).
 *  2. <a download> — Desktop and Android Chrome (reliable on non-iOS platforms).
 *  3. window.open(blobUrl) — Fallback for browsers that block <a download>.
 *
 * © 2026 Mattieu Pottier — MIT License
 */

/** Returns true only on iOS Safari / iOS Chrome where <a download> does not save. */
function _isIOS(): boolean {
    return typeof navigator !== "undefined" &&
        /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Triggers a file download for the given Blob.
 *
 * On iOS, the native share sheet is used (navigator.share with files) because
 * <a download> does not save to Files on iOS — it opens the file in the browser.
 * On all other platforms (desktop, Android), <a download> is used directly.
 *
 * @param blob     - The Blob to download.
 * @param filename - Suggested file name including extension (e.g. `"carte.pdf"`).
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
    const file = new File([blob], filename, { type: blob.type });

    // 1 — Web Share API — iOS only (iPhone/iPad/iPod)
    if (
        _isIOS() &&
        typeof navigator.share === "function" &&
        typeof (navigator as any).canShare === "function" &&
        (navigator as any).canShare({ files: [file] })
    ) {
        try {
            await navigator.share({ files: [file], title: filename });
            return;
        } catch (err) {
            // AbortError = user cancelled share sheet — fall through to <a download>
            if (err instanceof Error && err.name !== "AbortError") {
                console.warn("[GeoLeaf.Print] navigator.share failed, falling back:", err);
            }
        }
    }

    // 2 — <a download> (desktop / Android / iOS fallback)
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } finally {
        // Revoke after a delay to allow the browser to start the download.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
}
