/*!
 * @geoleaf-plugins/measure — Measure engine
 * © 2026 Mattieu Pottier — MIT License
 *
 * Shared step-based drawing engine used by tool-distance (Sprint 3) and
 * tool-gps (Sprint 5). Singleton module — state held in module variables.
 */
import type { MeasureConfig, MeasureFeature, MeasureSession, Units } from "./types.js";
import {
    segmentLengths,
    perimeter,
    area,
    centroid,
    formatDistance,
    formatArea,
} from "./compute.js";
import {
    updateLines,
    updatePolygons,
    updateVertices,
    updateLabels,
    updatePreview,
    clearPreview,
    clearAll as clearAllLayers,
} from "./draw-layers.js";
import { getCurrentUnits } from "./floating-menu.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _session: MeasureSession | null = null;
let _collection: MeasureFeature[] = [];
let _cfg: MeasureConfig | null = null;
let _onFeatureAdded: (() => void) | null = null;

// Finished features split by geometry type for layer updates
let _lineFeatures: GeoJSON.Feature[] = [];
let _polygonFeatures: GeoJSON.Feature[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Midpoint between two coordinates. */
function _midpoint(a: [number, number], b: [number, number]): [number, number] {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * MapLibre text-rotate angle (degrees) to align a label along a segment A→B.
 * Returns a value in (-90, 90] so the text is never rendered upside-down.
 * Uses Mercator-projected coordinates (Δlng linear, Δy logarithmic) for visual accuracy.
 */
function _segmentTextRotate(a: [number, number], b: [number, number]): number {
    const toRad = Math.PI / 180;
    // Both dx and dy must be in the same unit (radians) for atan2 to give the correct visual angle
    const dx = (b[0] - a[0]) * toRad;                                              // Mercator x (radians)
    const dy = Math.log(Math.tan(Math.PI / 4 + b[1] * toRad / 2))
             - Math.log(Math.tan(Math.PI / 4 + a[1] * toRad / 2));                 // Mercator y (radians)
    let r = Math.atan2(dx, dy) * 180 / Math.PI - 90;
    if (r < -90) r += 180;
    if (r >= 90) r -= 180;
    return r;
}

type LabelEntry = { coord: [number, number]; text: string; bearing: number; color?: string; offsetType?: string };

/** Builds label features: cote at midpoint of each segment + optional area at centroid. */
function _buildLabels(units: Units, segLengths: number[]): LabelEntry[] {
    if (!_session || !_cfg) return [];
    const labels: LabelEntry[] = [];
    const verts = _session.vertices;

    for (let i = 1; i < verts.length; i++) {
        labels.push({
            coord: _midpoint(verts[i - 1], verts[i]),
            text: formatDistance(segLengths[i - 1] ?? 0, units.distance, _cfg!.decimals.distance),
            bearing: _segmentTextRotate(verts[i - 1], verts[i]),
        });
    }

    if (_session.closed && verts.length >= 3) {
        const c = centroid(verts);
        const areaM2 = area([verts]);
        labels.push({ coord: c, text: formatArea(areaM2, units.area, _cfg!.decimals.area), bearing: 0 });
    }

    return labels;
}

/** Rebuilds all draw-layer data from current session state. */
function _refreshLayers(units: Units, segLengths: number[]): void {
    if (!_session) return;
    const verts = _session.vertices;

    updateVertices(verts);

    if (_session.closed && verts.length >= 3) {
        // Polygon: close the ring
        const ring = [...verts, verts[0]];
        updatePolygons([
            ...(_polygonFeatures),
            {
                type: "Feature",
                geometry: { type: "Polygon", coordinates: [ring] },
                properties: {},
            },
        ]);
    } else if (verts.length >= 2) {
        updateLines([
            ...(_lineFeatures),
            {
                type: "Feature",
                geometry: { type: "LineString", coordinates: verts },
                properties: {},
            },
        ]);
    }

    updateLabels([..._buildLabels(units, segLengths), ..._finishedLabels(units)]);
}

/** Collects label features from finished features in _collection. */
function _finishedLabels(units: Units): LabelEntry[] {
    if (!_cfg) return [];
    const labels: LabelEntry[] = [];
    for (const feat of _collection) {
        if (!feat.properties) continue;
        if (feat.geometry.type === "Polygon" && feat.properties.areaM2 != null) {
            const ring = (feat.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][];
            if (ring.length >= 3) {
                const c = centroid(ring);
                labels.push({
                    coord: c,
                    text: formatArea(feat.properties.areaM2, units.area, _cfg!.decimals.area),
                    bearing: 0,
                });
                // Red perimeter label below the area label
                labels.push({
                    coord: c,
                    text: formatDistance(feat.properties.perimeterM as number, units.distance, _cfg!.decimals.distance),
                    bearing: 0,
                    color: "#E53935",
                    offsetType: "below",
                });
            }
            if (feat.properties.measureType !== "circle" && ring.length >= 2) {
                const isClosedRing =
                    ring[0][0] === ring[ring.length - 1][0] &&
                    ring[0][1] === ring[ring.length - 1][1];
                const open = isClosedRing ? ring.slice(0, ring.length - 1) : ring;
                if (open.length >= 2) {
                    const closed = [...open, open[0]];
                    const lens = segmentLengths(closed);
                    for (let i = 1; i < closed.length; i++) {
                        labels.push({
                            coord: _midpoint(closed[i - 1], closed[i]),
                            text: formatDistance(lens[i - 1] ?? 0, units.distance, _cfg!.decimals.distance),
                            bearing: _segmentTextRotate(closed[i - 1], closed[i]),
                        });
                    }
                }
            }
        }
        if (feat.geometry.type === "LineString") {
            const coords = (feat.geometry as GeoJSON.LineString).coordinates as [number, number][];
            const lens = segmentLengths(coords);
            for (let i = 1; i < coords.length; i++) {
                labels.push({
                    coord: _midpoint(coords[i - 1], coords[i]),
                    text: formatDistance(lens[i - 1] ?? 0, units.distance, _cfg!.decimals.distance),
                    bearing: _segmentTextRotate(coords[i - 1], coords[i]),
                });
            }
            // Red total distance label at last vertex, below
            labels.push({
                coord: coords[coords.length - 1],
                text: formatDistance(feat.properties.lengthM as number, units.distance, _cfg!.decimals.distance),
                bearing: 0,
                color: "#E53935",
                offsetType: "below",
            });
        }
    }
    return labels;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialises the engine with the resolved measure config.
 * Must be called before any other engine function.
 */
export function initEngine(cfg: MeasureConfig): void {
    _cfg = cfg;
}

/**
 * Registers a callback invoked whenever a feature is permanently added to the collection
 * (finishSession or addSurfaceFeature). Used by the public-api layer to trigger persistence.
 */
export function setOnFeatureAdded(cb: () => void): void {
    _onFeatureAdded = cb;
}

/**
 * Starts a new drawing session.
 * Any in-progress session is cancelled first.
 */
export function startSession(mode: "line" | "polygon"): void {
    clearPreview();
    _session = { type: mode, vertices: [], closed: false };
}

/**
 * Adds a vertex to the current session and updates layers.
 */
export function addVertex(coord: [number, number]): void {
    if (!_session) return;
    _session.vertices.push(coord);
    const units = getCurrentUnits();
    const segLens = segmentLengths(_session.vertices);
    _refreshLayers(units, segLens);
}

/**
 * Updates the elastic-line preview between the last vertex and `coord`.
 */
export function updateEnginePreview(coord: [number, number]): void {
    if (!_session || _session.vertices.length === 0) return;
    const preview = [..._session.vertices, coord];
    updatePreview(preview, false);
}

/**
 * Closes the current session as a polygon (adds closing edge, computes area).
 * Requires at least 3 vertices.
 */
export function closeAsPolygon(): void {
    if (!_session || _session.vertices.length < 3) return;
    _session.closed = true;
    _session.type = "polygon";
    clearPreview();
    const units = getCurrentUnits();
    const segLens = segmentLengths([..._session.vertices, _session.vertices[0]]);
    _refreshLayers(units, segLens);
}

/**
 * Finalises the current session into a MeasureFeature and adds it to the collection.
 * Returns the created feature, or null if there is no active session.
 */
export function finishSession(): MeasureFeature | null {
    if (!_session || _session.vertices.length < 2) return null;
    const units = getCurrentUnits();

    let geometry: GeoJSON.Geometry;
    const props: MeasureFeature["properties"] = {
        measureType: _session.type === "polygon" ? "polygon" : "distance",
        createdAt: new Date().toISOString(),
    };

    if (_session.closed && _session.vertices.length >= 3) {
        const ring = [..._session.vertices, _session.vertices[0]];
        geometry = { type: "Polygon", coordinates: [ring] };
        props.perimeterM = perimeter(_session.vertices, true);
        props.areaM2 = area([_session.vertices]);
        props.lengthM = props.perimeterM;
    } else {
        geometry = { type: "LineString", coordinates: _session.vertices };
        props.lengthM = perimeter(_session.vertices, false);
        props.perimeterM = props.lengthM;
    }

    const feature: MeasureFeature = { type: "Feature", geometry, properties: props };
    _collection.push(feature);

    // Move session geometry into finished layer buckets
    if (geometry.type === "Polygon") {
        _polygonFeatures = _collection
            .filter((f) => f.geometry.type === "Polygon")
            .map((f) => f as GeoJSON.Feature);
        updatePolygons(_polygonFeatures);
    } else {
        _lineFeatures = _collection
            .filter((f) => f.geometry.type === "LineString")
            .map((f) => f as GeoJSON.Feature);
        updateLines(_lineFeatures);
    }

    // Refresh all labels from the full collection
    updateVertices([]);
    updateLabels(_finishedLabels(units));
    clearPreview();

    _session = null;
    _onFeatureAdded?.();
    return feature;
}

/**
 * Directly inserts a completed surface feature (rect or circle) into the collection,
 * bypassing the step-based session workflow.
 * Updates draw layers and clears the preview and recap box.
 */
export function addSurfaceFeature(feature: MeasureFeature): void {
    _collection.push(feature);
    _polygonFeatures = _collection
        .filter((f) => f.geometry.type === "Polygon")
        .map((f) => f as GeoJSON.Feature);
    updatePolygons(_polygonFeatures);
    updateVertices([]);
    const units = getCurrentUnits();
    updateLabels(_finishedLabels(units));
    clearPreview();
    _onFeatureAdded?.();
}

/**
 * Cancels the current session without saving. Clears preview.
 */
export function cancelSession(): void {
    _session = null;
    clearPreview();
    // Restore finished geometries to layers
    updateLines(_lineFeatures);
    updatePolygons(_polygonFeatures);
    const units = getCurrentUnits();
    updateLabels(_finishedLabels(units));
    updateVertices([]);
}

/** Returns the current drawing session (read-only reference). */
export function getSession(): MeasureSession | null {
    return _session;
}

/** Returns a deep copy of the FeatureCollection (RFC 7946). */
export function getEngineCollection(): GeoJSON.FeatureCollection {
    return {
        type: "FeatureCollection",
        features: _collection.map((f) => JSON.parse(JSON.stringify(f))),
    };
}

/**
 * Empties the collection, clears all draw layers and recap box.
 */
export function clearEngineCollection(): void {
    _collection = [];
    _lineFeatures = [];
    _polygonFeatures = [];
    _session = null;
    clearAllLayers();
}

/**
 * Re-renders all cote labels using the new units.
 * Called when the user switches distance/area units.
 */
export function rerenderLabels(units: Units): void {
    if (!_cfg) return;
    updateLabels(_finishedLabels(units));
}

/**
 * Bulk-loads a saved FeatureCollection at boot (localStorage restoration).
 * Re-renders draw layers without starting a session.
 * Annotation Point features are stored in _collection but skipped by draw layers.
 */
export function loadCollection(features: MeasureFeature[]): void {
    _collection = [...features];
    _lineFeatures = _collection
        .filter((f) => f.geometry.type === "LineString")
        .map((f) => f as GeoJSON.Feature);
    _polygonFeatures = _collection
        .filter((f) => f.geometry.type === "Polygon")
        .map((f) => f as GeoJSON.Feature);
    updateLines(_lineFeatures);
    updatePolygons(_polygonFeatures);
    if (_cfg) updateLabels(_finishedLabels(getCurrentUnits()));
}

/**
 * Removes a single feature from the collection by its _id property.
 * Used when the user deletes an individual annotation overlay.
 */
export function removeFeatureById(id: string): void {
    _collection = _collection.filter((f) => f.properties._id !== id);
    _lineFeatures = _collection
        .filter((f) => f.geometry.type === "LineString")
        .map((f) => f as GeoJSON.Feature);
    _polygonFeatures = _collection
        .filter((f) => f.geometry.type === "Polygon")
        .map((f) => f as GeoJSON.Feature);
    updateLines(_lineFeatures);
    updatePolygons(_polygonFeatures);
    if (_cfg) updateLabels(_finishedLabels(getCurrentUnits()));
}
