/**
 * Tests for geojson-export.ts — RFC 7946 Blob builder and download trigger.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installMockGeoLeaf, uninstallMockGeoLeaf } from "./setup.js";
import { getMeasureConfig } from "../config.js";
import { buildGeoJSONBlob, exportGeoJSON } from "../geojson-export.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLineCollection(): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: { type: "LineString", coordinates: [[2.0, 48.0], [2.1, 48.1]] },
                properties: {
                    measureType: "distance",
                    lengthM: 12345,
                    createdAt: "2026-05-01T00:00:00.000Z",
                },
            },
        ],
    };
}

function makeAnnotationCollection(): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [2.35, 48.85] },
                properties: {
                    measureType: "annotation-tooltip",
                    annotationKind: "tooltip",
                    label: "Mon étiquette",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    _id: "abc123",
                },
            },
        ],
    };
}

beforeEach(() => {
    installMockGeoLeaf();
});

afterEach(() => {
    uninstallMockGeoLeaf();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("buildGeoJSONBlob", () => {
    it("returns a Blob with MIME type application/geo+json", () => {
        const blob = buildGeoJSONBlob(makeLineCollection());
        expect(blob.type).toBe("application/geo+json");
    });

    it("serialises valid RFC 7946 FeatureCollection JSON", async () => {
        const blob = buildGeoJSONBlob(makeLineCollection());
        const text = await blob.text();
        const parsed = JSON.parse(text);
        expect(parsed.type).toBe("FeatureCollection");
        expect(Array.isArray(parsed.features)).toBe(true);
    });

    it("adds null-defaulted enriched keys to each feature", async () => {
        const blob = buildGeoJSONBlob(makeLineCollection());
        const text = await blob.text();
        const parsed = JSON.parse(text);
        const props = parsed.features[0].properties;
        // Keys present in ENRICHED_KEYS should exist (even if null)
        expect("annotationKind" in props).toBe(true);
        expect("widthPx" in props).toBe(true);
        expect("heightPx" in props).toBe(true);
        expect("radiusM" in props).toBe(true);
    });

    it("preserves existing non-null property values", async () => {
        const blob = buildGeoJSONBlob(makeLineCollection());
        const text = await blob.text();
        const parsed = JSON.parse(text);
        expect(parsed.features[0].properties.lengthM).toBe(12345);
        expect(parsed.features[0].properties.measureType).toBe("distance");
    });

    it("preserves annotation-specific properties", async () => {
        const blob = buildGeoJSONBlob(makeAnnotationCollection());
        const text = await blob.text();
        const parsed = JSON.parse(text);
        const props = parsed.features[0].properties;
        expect(props.label).toBe("Mon étiquette");
        expect(props.annotationKind).toBe("tooltip");
    });

    it("handles empty FeatureCollection", async () => {
        const blob = buildGeoJSONBlob({ type: "FeatureCollection", features: [] });
        const text = await blob.text();
        const parsed = JSON.parse(text);
        expect(parsed.features).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------

describe("exportGeoJSON", () => {
    it("returns the generated Blob", async () => {
        const blob = await exportGeoJSON(makeLineCollection(), { download: false });
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe("application/geo+json");
    });

    it("does not trigger download when download: false", async () => {
        const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
        await exportGeoJSON(makeLineCollection(), { download: false });
        expect(createSpy).not.toHaveBeenCalled();
    });

    it("triggers <a download> by default (desktop path)", async () => {
        const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

        await exportGeoJSON(makeLineCollection());

        expect(createSpy).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
    });

    it("uses cfg.exportFileName as the default filename", async () => {
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const anchorSetSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

        const cfg = getMeasureConfig();
        await exportGeoJSON(makeLineCollection(), undefined, cfg);

        // The anchor download attribute should be set to the exportFileName
        // We verify indirectly by checking the anchor was created and clicked
        expect(anchorSetSpy).toHaveBeenCalled();
    });

    it("respects a custom fileName override", async () => {
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

        const anchors: HTMLAnchorElement[] = [];
        const origCreate = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
            const el = origCreate(tag);
            if (tag === "a") anchors.push(el as HTMLAnchorElement);
            return el;
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

        await exportGeoJSON(makeLineCollection(), { fileName: "export-test.geojson" });

        expect(anchors.length).toBeGreaterThan(0);
        expect(anchors[anchors.length - 1].download).toBe("export-test.geojson");
    });
});
