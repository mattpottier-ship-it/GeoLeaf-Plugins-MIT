/*!
 * @geoleaf-plugins/measure — Types
 * © 2026 Mattieu Pottier — MIT License
 */

/** Supported measure tool identifiers. */
export type MeasureType =
    | "distance"
    | "rect"
    | "circle"
    | "polygon"
    | "gps"
    | "annotation-tooltip";

/** Supported distance units. */
export type DistanceUnit = "m" | "km" | "auto";

/** Supported area units. */
export type AreaUnit = "m2" | "ha" | "km2" | "auto";

/** Active unit selection. */
export interface Units {
    distance: DistanceUnit;
    area: AreaUnit;
}

/** A single measured feature stored in the FeatureCollection. */
export interface MeasureFeature {
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties: {
        measureType: MeasureType | string;
        lengthM?: number;
        perimeterM?: number;
        areaM2?: number;
        radiusM?: number;
        label?: string;
        annotationKind?: "label" | "tooltip";
        widthPx?: number;
        heightPx?: number;
        createdAt: string;
        [key: string]: unknown;
    };
}

/** Active drawing session shared between measure-engine and tool modules. */
export interface MeasureSession {
    type: "line" | "polygon";
    vertices: [number, number][];
    closed: boolean;
}

/** Plugin configuration after merging defaults with profile values. */
export interface MeasureConfig {
    enabled: boolean;
    showButton: boolean;
    position: string;
    menuPosition: string | { top: number; left: number };
    defaultDistanceUnit: DistanceUnit;
    defaultAreaUnit: AreaUnit;
    snapPx: number;
    circleSteps: number;
    enabledTools: MeasureType[];
    tooltipDefaultSize: { width: number; height: number };
    labelMaxChars: number;
    persist: boolean;
    storageKey: string;
    maxFeatures: number;
    gpsCloseThresholdM: number;
    gpsMaxJumpMps: number;
    decimals: { distance: number; area: number };
    exportFileName: string;
    [key: string]: unknown;
}

/** Definition for a custom measure tool registered via registerMeasureType(). */
export interface MeasureTypeDef {
    cursor?: string;
    onActivate?: (map: unknown) => void;
    onDeactivate?: () => void;
}

/** Printable annotation descriptor returned by getPrintableAnnotations(). */
export interface PrintableAnnotation {
    kind: "label" | "tooltip";
    lngLat: [number, number];
    text: string;
    widthPx?: number;
    heightPx?: number;
    anchor: "bottom" | "center";
}
