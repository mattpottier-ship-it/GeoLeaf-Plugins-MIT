# @geoleaf-plugins/measure

GeoLeaf plugin for measuring distances, areas, circles and adding georeferenced tooltip annotations on an interactive map.

- **MIT License** — public registry (npmjs.org)
- Requires `@geoleaf/core` loaded before this plugin
- ESM only — no CommonJS/UMD
- Integrates with `@geoleaf-plugins/print` for annotation export

---

## Installation

```bash
npm install @geoleaf-plugins/measure
```

Load in your HTML after `@geoleaf/core`:

```html
<script
    type="module"
    src="node_modules/@geoleaf-plugins/measure/dist/geoleaf-measure.plugin.js"
></script>
```

---

## Quick start

Once the plugin is loaded, a floating vertical pill toolbar appears (top-left by default). It contains:

1. **Distance tool** — click two or more points; the segment lengths and total distance are shown.
2. **Area tool** — click to draw a polygon; the area and perimeter are shown.
3. **Circle tool** — click center then drag to set radius; area and perimeter are shown.
4. **Tooltip annotation** — click to place a resizable tooltip box anchored to a map coordinate; drag to reposition.
5. **GPS track** — records a GPS track in real time.
6. **Unit cyclers** — toggle between km/m, ha/m², etc.
7. **Clear all** — removes all measures and annotations.
8. **GeoJSON export** — downloads all active features as GeoJSON.

---

## Public API

### `GeoLeaf.Measure.activate(toolId)`

Activates the given tool programmatically.

```typescript
function activate(toolId: string): void;
// toolId: "distance" | "area" | "circle" | "annotation-tooltip" | "gps"
```

---

### `GeoLeaf.Measure.deactivate()`

Deactivates the current tool and returns to idle state.

```typescript
function deactivate(): void;
```

---

### `GeoLeaf.Measure.clearAll()`

Removes all measure features and annotation overlays from the map.

```typescript
function clearAll(): void;
```

---

### `GeoLeaf.Measure.exportGeoJSON()`

Returns a GeoJSON `FeatureCollection` containing all current measure and annotation features.

```typescript
function exportGeoJSON(): GeoJSON.FeatureCollection;
```

---

### `GeoLeaf.Measure.importGeoJSON(fc)`

Restores measure features and annotation overlays from a `FeatureCollection` (e.g. loaded from a saved file).

```typescript
function importGeoJSON(fc: GeoJSON.FeatureCollection): void;
```

---

### `GeoLeaf.Measure.getPrintableAnnotations()`

Returns an array of annotation descriptors consumed by `@geoleaf-plugins/print` when composing the print output.

```typescript
interface PrintableAnnotation {
    kind: "tooltip";
    lngLat: [number, number];
    text: string;
    anchor: "bottom";
    widthPx: number;
    heightPx: number;
}

function getPrintableAnnotations(): PrintableAnnotation[];
```

---

### `GeoLeaf.Measure.setMenuPosition(top, left)`

Repositions the floating toolbar (useful when other UI elements overlap it).

```typescript
function setMenuPosition(top: number, left: number): void;
```

---

### `GeoLeaf.Measure.getMenuHeight()`

Returns the current height in pixels of the floating toolbar pill.

```typescript
function getMenuHeight(): number;
```

---

## Configuration (`measureConfig`)

Add a `measureConfig` key to your GeoLeaf profile JSON. All fields are optional.

```json
{
    "measureConfig": {
        "enabled": true,
        "showButton": true,
        "position": "top-left",
        "distanceUnit": "km",
        "areaUnit": "ha",
        "tools": ["distance", "area", "circle", "annotation-tooltip", "gps"],
        "dpi": 300,
        "gpsMinDistance": 5,
        "tooltipDefaultSize": { "widthPx": 160, "heightPx": 80 }
    }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enables / disables the plugin entirely. |
| `showButton` | boolean | `true` | Shows the floating toolbar pill. |
| `position` | string | `"top-left"` | Initial position of the floating toolbar (`"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"`). |
| `distanceUnit` | string | `"km"` | Default distance unit (`"km"` or `"m"`). |
| `areaUnit` | string | `"ha"` | Default area unit (`"ha"` or `"m²"`). |
| `tools` | string[] | all tools | List of tools shown in the toolbar (omit a tool to hide it). |
| `dpi` | number | `300` | Resolution used for print composition. |
| `gpsMinDistance` | number | `5` | Minimum distance in metres between GPS track points. |
| `tooltipDefaultSize` | object | `{ widthPx: 160, heightPx: 80 }` | Default size of a new tooltip annotation box in CSS pixels. |
| `annotationStrokeColor` | string | `"#2563eb"` | Stroke colour for annotation elements. |
| `annotationFillColor` | string | `"rgba(37,99,235,0.08)"` | Fill colour for annotation elements. |
| `lineColor` | string | `"#2563eb"` | Stroke colour for distance/area/circle lines. |
| `lineFillColor` | string | `"rgba(37,99,235,0.08)"` | Fill colour for area/circle polygons. |
| `lineWidth` | number | `2` | Stroke width in pixels for measurement lines. |
| `recapBoxEnabled` | boolean | `true` | Shows the floating recap summary box while a tool is active. |
| `recapPosition` | string | `"bottom-center"` | Position of the recap box relative to the map. |
| `exportFileName` | string | `"mesures"` | Base filename for GeoJSON export (without extension). |

---

## Print integration

When both `@geoleaf-plugins/measure` and `@geoleaf-plugins/print` are loaded, the print modal automatically shows an **Annotations** checkbox. When ticked, tooltip annotations are composited onto the exported map image at their geographic positions.

No extra configuration is required — the integration is automatic.

---

## GPS track

The GPS tool records the user's real-time position using `navigator.geolocation.watchPosition`. The track is drawn as a line layer and each position fix is shown as a circle.

- Requires browser geolocation permission and HTTPS.
- Minimum distance between recorded points: `gpsMinDistance` metres (default 5 m) to avoid noise.
- The track is exported as a `LineString` feature in GeoJSON export.

---

## Annotations

Tooltip annotations are DOM overlays anchored to geographic coordinates.

- **Create**: activate the annotation tool and click on the map; a resizable text box appears in edit mode.
- **Edit**: tap the annotation box to re-enter edit mode; type and press outside the box to commit.
- **Drag**: pointer-drag the annotation to move it; the anchor coordinate updates accordingly.
- **Delete**: hover the annotation box; click the × button that appears.
- **Persist**: all annotations are included in `exportGeoJSON()` and restored via `importGeoJSON()`.

Legacy `annotation-label` features from previous versions are automatically migrated to `annotation-tooltip` on import.

---

## Limitations (v1.0.0)

- **GPS on mobile**: requires HTTPS and granted geolocation permission. Accuracy depends on device hardware.
- **Annotation drag on touch**: pointer events are used; pinch-zoom on an annotation may conflict with map panning.
- **Print annotation positioning**: annotations are positioned using the print canvas pixel coordinates; very large or very small scales may shift anchor positions slightly.
- **No undo**: clearing all (`clearAll`) is irreversible.

---

## Bundle budget

| Part | Size (gzip) |
|------|-------------|
| Plugin core | ~18 KB |

No runtime dependencies beyond `@geoleaf/core` and the browser's built-in APIs.

---

## MIT License

Copyright © 2026 Mattieu Pottier. See [LICENSE](../../LICENSE) for details.
