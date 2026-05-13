/*!
 * @geoleaf-plugins/measure — Compute
 * © 2026 Mattieu Pottier — MIT License
 *
 * Pure geodesic helpers wrapping Turf.js + unit formatters.
 * All functions are stateless and side-effect-free.
 */
import turfDistance from "@turf/distance";
import turfArea from "@turf/area";
import turfCircle from "@turf/circle";
import turfCentroid from "@turf/centroid";
import { point, polygon, lineString, featureCollection } from "@turf/helpers";

import type { DistanceUnit, AreaUnit } from "./types.js";

// ---------------------------------------------------------------------------
// Geodesic calculations
// ---------------------------------------------------------------------------

/**
 * Returns the length (metres) of each segment in a coordinate array.
 * Result has length = coords.length - 1; returns [] if fewer than 2 points.
 */
export function segmentLengths(coords: [number, number][]): number[] {
    if (coords.length < 2) return [];
    const lengths: number[] = [];
    for (let i = 1; i < coords.length; i++) {
        lengths.push(
            turfDistance(point(coords[i - 1]), point(coords[i]), { units: "meters" })
        );
    }
    return lengths;
}

/**
 * Sum of all segment lengths (metres).
 * @param closed If true, adds the segment from last to first vertex.
 */
export function perimeter(coords: [number, number][], closed: boolean): number {
    if (coords.length < 2) return 0;
    const segs = segmentLengths(coords);
    let total = segs.reduce((s, l) => s + l, 0);
    if (closed && coords.length > 2) {
        total += turfDistance(point(coords[coords.length - 1]), point(coords[0]), {
            units: "meters",
        });
    }
    return total;
}

/**
 * Polygon area in square metres. Accepts the outer ring as coordinate array
 * (need not be closed — the function closes it automatically).
 */
export function area(polygonCoords: [number, number][][]): number {
    const rings = polygonCoords.map((ring) => {
        const r = [...ring];
        if (r.length > 0) {
            const first = r[0];
            const last = r[r.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) r.push([...first]);
        }
        return r;
    });
    return turfArea(polygon(rings));
}

/**
 * Approximates a circle as a regular polygon.
 * Returns the outer ring coordinate array (closed).
 */
export function circlePolygon(
    center: [number, number],
    radiusM: number,
    steps: number
): [number, number][][] {
    const feat = turfCircle(point(center), radiusM, { steps, units: "meters" });
    return feat.geometry.coordinates as [number, number][][];
}

/**
 * Returns the centroid [lng, lat] of a polygon outer ring.
 */
export function centroid(coords: [number, number][]): [number, number] {
    const ring = [...coords];
    if (ring.length > 0) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    }
    const feat = turfCentroid(polygon([ring]));
    return feat.geometry.coordinates as [number, number];
}

/**
 * Returns the outer ring of an axis-aligned bounding box (closed polygon).
 * p1 = top-left (HG), p2 = bottom-right (BD).
 */
export function bboxPolygon(
    p1: [number, number],
    p2: [number, number]
): [number, number][][] {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    return [
        [
            [Math.min(x1, x2), Math.max(y1, y2)],
            [Math.max(x1, x2), Math.max(y1, y2)],
            [Math.max(x1, x2), Math.min(y1, y2)],
            [Math.min(x1, x2), Math.min(y1, y2)],
            [Math.min(x1, x2), Math.max(y1, y2)],
        ],
    ];
}

// ---------------------------------------------------------------------------
// Unit formatters
// ---------------------------------------------------------------------------

/**
 * Formats a distance in metres to a human-readable string.
 * `"auto"` chooses m below 1 000 m, km above.
 */
export function formatDistance(m: number, unit: DistanceUnit, decimals: number): string {
    switch (unit) {
        case "km":
            return `${_round(m / 1000, decimals)} km`;
        case "m":
            return `${_round(m, decimals)} m`;
        case "auto":
        default:
            return m < 1000
                ? `${_round(m, decimals)} m`
                : `${_round(m / 1000, decimals)} km`;
    }
}

/**
 * Formats an area in square metres to a human-readable string.
 * `"auto"` chooses m² below 1 ha, ha below 1 km², km² above.
 */
export function formatArea(m2: number, unit: AreaUnit, decimals: number): string {
    switch (unit) {
        case "ha":
            return `${_round(m2 / 1e4, decimals)} ha`;
        case "km2":
            return `${_round(m2 / 1e6, decimals)} km²`;
        case "m2":
            return `${_round(m2, decimals)} m²`;
        case "auto":
        default:
            if (m2 < 1e4) return `${_round(m2, decimals)} m²`;
            if (m2 < 1e6) return `${_round(m2 / 1e4, decimals)} ha`;
            return `${_round(m2 / 1e6, decimals)} km²`;
    }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

// Re-exported for use by other modules (avoids direct @turf/helpers import)
export { point, polygon, lineString, featureCollection };
