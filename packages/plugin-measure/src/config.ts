/*!
 * @geoleaf-plugins/measure — Config
 * © 2026 Mattieu Pottier — MIT License
 */
import type { MeasureConfig, MeasureType, DistanceUnit, AreaUnit } from "./types.js";
import { _getGeoLeaf } from "./internal.js";

const ALL_TOOLS: MeasureType[] = [
    "distance",
    "rect",
    "circle",
    "polygon",
    "gps",
    "annotation-tooltip",
];

/** Default values for measureConfig (mirrors CDC §1.7). */
const MEASURE_CONFIG_DEFAULTS: MeasureConfig = {
    enabled: true,
    showButton: true,
    position: "left",
    menuPosition: "top-left",
    defaultDistanceUnit: "m",
    defaultAreaUnit: "m2",
    snapPx: 12,
    circleSteps: 64,
    enabledTools: [...ALL_TOOLS],
    tooltipDefaultSize: { width: 160, height: 80 },
    labelMaxChars: 120,
    persist: true,
    storageKey: "geoleaf.measure.fc",
    maxFeatures: 500,
    gpsCloseThresholdM: 15,
    gpsMaxJumpMps: 25,
    decimals: { distance: 0, area: 0 },
    exportFileName: "mesures.geojson",
};

/** Returns the merged measureConfig (profile values over defaults). */
export function getMeasureConfig(): MeasureConfig {
    const gl = _getGeoLeaf();
    const raw = (gl.Config?.get?.("measureConfig", {}) ?? {}) as Partial<MeasureConfig>;

    // Alias: showButton ↔ ui.showMeasure
    const showButton =
        raw.showButton ??
        (gl.Config?.get?.("ui", {})?.showMeasure) ??
        MEASURE_CONFIG_DEFAULTS.showButton;

    // Validate and filter enabledTools
    const enabledToolsRaw = raw.enabledTools;
    const enabledTools = Array.isArray(enabledToolsRaw)
        ? (enabledToolsRaw.filter((t) => ALL_TOOLS.includes(t as MeasureType)) as MeasureType[])
        : MEASURE_CONFIG_DEFAULTS.enabledTools;

    // Clamp numeric bounds
    const snapPx = Math.max(1, Number(raw.snapPx ?? MEASURE_CONFIG_DEFAULTS.snapPx) || 1);
    const circleSteps = Math.min(
        256,
        Math.max(8, Number(raw.circleSteps ?? MEASURE_CONFIG_DEFAULTS.circleSteps) || 64)
    );
    const maxFeatures = Math.max(
        1,
        Number(raw.maxFeatures ?? MEASURE_CONFIG_DEFAULTS.maxFeatures) || 500
    );
    const gpsCloseThresholdM = Math.max(
        1,
        Number(raw.gpsCloseThresholdM ?? MEASURE_CONFIG_DEFAULTS.gpsCloseThresholdM) || 15
    );
    const gpsMaxJumpMps = Math.max(
        1,
        Number(raw.gpsMaxJumpMps ?? MEASURE_CONFIG_DEFAULTS.gpsMaxJumpMps) || 25
    );

    // Validate unit values
    const validDistanceUnits: DistanceUnit[] = ["m", "km", "auto"];
    const validAreaUnits: AreaUnit[] = ["m2", "ha", "km2", "auto"];
    const defaultDistanceUnit = validDistanceUnits.includes(raw.defaultDistanceUnit as DistanceUnit)
        ? (raw.defaultDistanceUnit as DistanceUnit)
        : MEASURE_CONFIG_DEFAULTS.defaultDistanceUnit;
    const defaultAreaUnit = validAreaUnits.includes(raw.defaultAreaUnit as AreaUnit)
        ? (raw.defaultAreaUnit as AreaUnit)
        : MEASURE_CONFIG_DEFAULTS.defaultAreaUnit;

    return {
        ...MEASURE_CONFIG_DEFAULTS,
        ...raw,
        showButton,
        enabledTools,
        snapPx,
        circleSteps,
        maxFeatures,
        gpsCloseThresholdM,
        gpsMaxJumpMps,
        defaultDistanceUnit,
        defaultAreaUnit,
    } as MeasureConfig;
}
