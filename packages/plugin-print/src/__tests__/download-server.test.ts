/**
 * Tests for Sprint 6 download and server-fallback modules:
 *  - download (downloadBlob — <a download> and navigator.share paths)
 *  - server-fallback (buildServerPayload, tryServerFallback — binary, {url}, error, invalid URL)
 *
 * Format-registry and exporter tests (JPG, PDF) live in export.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { downloadBlob } from "../download.js";
import {
    tryServerFallback,
    buildServerPayload,
    type ServerFallbackPayload,
} from "../server-fallback.js";
import type { PrintConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<PrintConfig> = {}): PrintConfig {
    return {
        enabled: true,
        showButton: true,
        position: "left",
        defaultFormat: "A4",
        availableFormats: ["A4", "A3"],
        dpi: 300,
        availableDpi: [300],
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
        includeLegend: false,
        includeScale: true,
        includeNorthArrow: true,
        title: "",
        exportFormats: ["pdf", "jpg"],
        jpgQuality: 0.92,
        serverEndpoint: undefined,
        serverHeaders: {},
        forceServer: false,
        maxCanvasPxMobile: 16_000_000,
        ...overrides,
    } as PrintConfig;
}

function makePayload(): ServerFallbackPayload {
    return {
        style: {},
        center: [2.35, 48.85],
        zoom: 12,
        bearing: 0,
        pitch: 0,
        bbox: { minLng: 2.3, minLat: 48.8, maxLng: 2.4, maxLat: 48.9 },
        page: { format: "A4", orientation: "portrait", dpi: 300, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
        compose: { title: "Test", description: "", includeLegend: false, includeScale: true, includeNorthArrow: true },
        outputFormat: "pdf",
    };
}

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

describe("downloadBlob", () => {
    let origCreateObjectURL: typeof URL.createObjectURL;
    let origRevokeObjectURL: typeof URL.revokeObjectURL;
    let clickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        origCreateObjectURL = URL.createObjectURL;
        origRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => "blob:fake-url");
        URL.revokeObjectURL = vi.fn();
        clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    afterEach(() => {
        URL.createObjectURL = origCreateObjectURL;
        URL.revokeObjectURL = origRevokeObjectURL;
        clickSpy.mockRestore();
        vi.unstubAllGlobals();
        // Clean up any appended anchors
        document.querySelectorAll("a[download]").forEach((a) => a.remove());
    });

    it("creates an <a download> element and clicks it", async () => {
        const blob = new Blob(["data"], { type: "image/jpeg" });
        await downloadBlob(blob, "carte.jpg");

        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
        expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it("sets href and download attribute on the anchor", async () => {
        const blob = new Blob(["data"], { type: "image/jpeg" });

        let capturedAnchor: HTMLAnchorElement | null = null;
        const origAppend = document.body.appendChild.bind(document.body);
        vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
            if (node instanceof HTMLAnchorElement) capturedAnchor = node;
            return origAppend(node);
        });

        await downloadBlob(blob, "ma-carte.pdf");

        expect(capturedAnchor).not.toBeNull();
        expect(capturedAnchor!.href).toContain("fake-url");
        expect(capturedAnchor!.download).toBe("ma-carte.pdf");

        vi.mocked(document.body.appendChild).mockRestore();
    });

    it("uses navigator.share on iOS when available and canShare returns true", async () => {
        const shareMock = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", {
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            share: shareMock,
            canShare: vi.fn(() => true),
        });

        const blob = new Blob(["data"], { type: "application/pdf" });
        await downloadBlob(blob, "doc.pdf");

        expect(shareMock).toHaveBeenCalledTimes(1);
        expect(shareMock).toHaveBeenCalledWith(expect.objectContaining({
            files: expect.any(Array),
            title: "doc.pdf",
        }));
        // Should NOT fall through to <a download>
        expect(clickSpy).not.toHaveBeenCalled();
    });

    it("uses <a download> directly on desktop even when navigator.share is available", async () => {
        const shareMock = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", {
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0",
            share: shareMock,
            canShare: vi.fn(() => true),
        });

        const blob = new Blob(["data"], { type: "application/pdf" });
        await downloadBlob(blob, "doc.pdf");

        // navigator.share must NOT be called on desktop
        expect(shareMock).not.toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });

    it("falls back to <a download> when navigator.share throws AbortError (iOS)", async () => {
        const shareMock = vi.fn().mockRejectedValue(
            Object.assign(new Error("User cancelled"), { name: "AbortError" })
        );
        vi.stubGlobal("navigator", {
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            share: shareMock,
            canShare: vi.fn(() => true),
        });

        const blob = new Blob(["data"], { type: "application/pdf" });
        await downloadBlob(blob, "doc.pdf");

        // AbortError = user cancelled — should still fall through to <a download>
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });
});

// ---------------------------------------------------------------------------
// download — non-AbortError branch
// ---------------------------------------------------------------------------

describe("downloadBlob — non-AbortError share failure", () => {
    let origCreateObjectURL: typeof URL.createObjectURL;
    let origRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
        origCreateObjectURL = URL.createObjectURL;
        origRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => "blob:fake-url");
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    afterEach(() => {
        URL.createObjectURL = origCreateObjectURL;
        URL.revokeObjectURL = origRevokeObjectURL;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.querySelectorAll("a[download]").forEach((a) => a.remove());
    });

    it("warns and falls back to <a download> when navigator.share throws non-AbortError (iOS)", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const shareError = new TypeError("Share not supported");
        vi.stubGlobal("navigator", {
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            share: vi.fn().mockRejectedValue(shareError),
            canShare: vi.fn(() => true),
        });

        const blob = new Blob(["data"], { type: "application/pdf" });
        await downloadBlob(blob, "doc.pdf");

        expect(warnSpy).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });
});

// ---------------------------------------------------------------------------
// server-fallback — buildServerPayload
// ---------------------------------------------------------------------------

describe("buildServerPayload", () => {
    it("builds a payload from nativeMap and options", () => {
        const nativeMap = {
            getStyle: vi.fn(() => ({ version: 8 })),
            getZoom: vi.fn(() => 12),
            getCenter: vi.fn(() => ({ lng: 2.35, lat: 48.85 })),
        };
        const bbox = { minLng: 2.3, minLat: 48.8, maxLng: 2.4, maxLat: 48.9 };
        const page = { format: "A4", orientation: "portrait" as const, dpi: 300, margins: { top: 10, right: 10, bottom: 10, left: 10 } };
        const compose = { title: "T", description: "", includeLegend: false, includeScale: true, includeNorthArrow: true };

        const payload = buildServerPayload(nativeMap, bbox, page, compose, "pdf");

        expect(payload.style).toEqual({ version: 8 });
        expect(payload.center).toEqual([2.35, 48.85]);
        expect(payload.zoom).toBe(12);
        expect(payload.bearing).toBe(0);
        expect(payload.pitch).toBe(0);
        expect(payload.bbox).toBe(bbox);
        expect(payload.page).toBe(page);
        expect(payload.compose).toBe(compose);
        expect(payload.outputFormat).toBe("pdf");
    });

    it("uses defaults when nativeMap returns null values", () => {
        const nativeMap = {
            getStyle: vi.fn(() => null),
            getZoom: vi.fn(() => null),
            getCenter: vi.fn(() => null),
        };
        const bbox = { minLng: 2.3, minLat: 48.8, maxLng: 2.4, maxLat: 48.9 };
        const page = { format: "A4", orientation: "portrait" as const, dpi: 300, margins: { top: 10, right: 10, bottom: 10, left: 10 } };
        const compose = { title: "T", description: "", includeLegend: false, includeScale: true, includeNorthArrow: true };

        const payload = buildServerPayload(nativeMap, bbox, page, compose, "pdf");

        expect(payload.style).toEqual({});
        expect(payload.center).toEqual([0, 0]);
        expect(payload.zoom).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// server-fallback — tryServerFallback
// ---------------------------------------------------------------------------

describe("tryServerFallback", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns null when serverEndpoint is undefined", async () => {
        const result = await tryServerFallback(makePayload(), makeConfig());
        expect(result).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null and warns for invalid serverEndpoint URL", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = await tryServerFallback(makePayload(), makeConfig({ serverEndpoint: "ftp://invalid" }));
        expect(result).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("POSTs to serverEndpoint with correct headers", async () => {
        const blob = new Blob(["%PDF"], { type: "application/pdf" });
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "application/pdf" },
            blob: () => Promise.resolve(blob),
        });

        await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/print",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({ "Content-Type": "application/json" }),
                body: expect.any(String),
            })
        );
    });

    it("merges serverHeaders into the request headers", async () => {
        const blob = new Blob(["%PDF"], { type: "application/pdf" });
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "application/pdf" },
            blob: () => Promise.resolve(blob),
        });

        await tryServerFallback(
            makePayload(),
            makeConfig({
                serverEndpoint: "https://example.com/print",
                serverHeaders: { Authorization: "Bearer token123" },
            })
        );

        expect(fetchMock).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: "Bearer token123" }),
            })
        );
    });

    it("returns Blob for binary response (application/pdf)", async () => {
        const blob = new Blob(["%PDF"], { type: "application/pdf" });
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "application/pdf" },
            blob: () => Promise.resolve(blob),
        });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBe(blob);
    });

    it("returns Blob for binary response (image/jpeg)", async () => {
        const blob = new Blob(["jpeg"], { type: "image/jpeg" });
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "image/jpeg" },
            blob: () => Promise.resolve(blob),
        });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBe(blob);
    });

    it("fetches from {url} in JSON response", async () => {
        const blob = new Blob(["%PDF"], { type: "application/pdf" });
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                headers: { get: () => "application/json" },
                json: () => Promise.resolve({ url: "https://cdn.example.com/result.pdf" }),
            })
            .mockResolvedValueOnce({
                ok: true,
                blob: () => Promise.resolve(blob),
            });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(2, "https://cdn.example.com/result.pdf");
        expect(result).toBe(blob);
    });

    it("returns null and warns when server returns HTTP error", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("returns null when network request throws", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockRejectedValue(new TypeError("Network error"));

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("returns null when {url} in JSON response is unsafe", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            // eslint-disable-next-line no-script-url
            json: () => Promise.resolve({ url: "javascript:alert(1)" }),
        });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        // Must NOT fetch the javascript: URL
        expect(fetchMock).toHaveBeenCalledTimes(1);
        warnSpy.mockRestore();
    });

    it("returns null when JSON response has no url field", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: () => Promise.resolve({ status: "ok" }),
        });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        warnSpy.mockRestore();
    });

    it("returns null when response.json() throws", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: () => Promise.reject(new SyntaxError("Unexpected token")),
        });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("returns null when file URL fetch returns non-ok status", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                headers: { get: () => "application/json" },
                json: () => Promise.resolve({ url: "https://cdn.example.com/result.pdf" }),
            })
            .mockResolvedValueOnce({ ok: false, status: 404 });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("returns null when file URL fetch throws a network error", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                headers: { get: () => "application/json" },
                json: () => Promise.resolve({ url: "https://cdn.example.com/result.pdf" }),
            })
            .mockRejectedValueOnce(new TypeError("Network error"));

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("works when serverHeaders is undefined (uses empty headers fallback)", async () => {
        const blob = new Blob(["%PDF"], { type: "application/pdf" });
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => "application/pdf" },
            blob: () => Promise.resolve(blob),
        });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print", serverHeaders: undefined })
        );

        expect(result).toBe(blob);
    });

    it("handles null content-type header gracefully", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            json: () => Promise.resolve({ status: "ok" }),
        });

        const result = await tryServerFallback(
            makePayload(),
            makeConfig({ serverEndpoint: "https://example.com/print" })
        );

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
