# @geoleaf-plugins/flatgeobuf

GeoLeaf plugin for loading [FlatGeobuf](https://flatgeobuf.org/) files as interactive map layers.
Supports full-file loading and **HTTP Range spatial filtering** via the FGB R-tree spatial index.

- **MIT License** — public registry (npmjs.org)
- Requires `@geoleaf/core` loaded before this plugin
- ESM only — no CommonJS/UMD

---

## Installation

```bash
npm install @geoleaf-plugins/flatgeobuf
```

Load in your HTML after `@geoleaf/core`:

```html
<script
    type="module"
    src="node_modules/@geoleaf-plugins/flatgeobuf/dist/geoleaf-flatgeobuf.plugin.js"
></script>
```

---

## Configuration JSON déclarative

The recommended way to integrate FlatGeobuf layers in GeoLeaf profiles is via declarative JSON configuration. Each layer config file declares `"plugin": "flatgeobuf"` and a `data` block. A single call to `loadLayerFromConfig()` handles routing to the correct loading strategy.

### Schema `FgbLayerJsonConfig`

```typescript
interface FgbLayerJsonConfig {
    id: string; // Layer ID used as MapLibre source/layer ID
    label?: string; // Human-readable name shown in the UI
    plugin: "flatgeobuf"; // Required — identifies the plugin
    data: {
        url: string; // URL to the .fgb file (absolute or relative to profile root)
        bbox?: [
            // Optional: [W, S, E, N] bounding box filter
            number, //   minLng (West)
            number, //   minLat (South)
            number, //   maxLng (East)
            number, //   maxLat (North)
        ];
        limit?: number; // Max features to load (default: 100 000)
        autoRefresh?: boolean; // Re-fetch on viewport change (default: false)
        debounceMs?: number; // Debounce delay for auto-refresh (default: 300 ms)
    };
    defaultVisible?: boolean; // Initial layer visibility (default: true)
    cluster?: boolean; // Enable point clustering (default: false)
}
```

When `data.bbox` is set, the plugin uses the FGB spatial index and HTTP Range requests to fetch only features within the bounding box — minimising transferred bytes. When absent, the complete file is streamed.

### Exemple 1 — zones_desserte (bbox + auto-refresh)

Profile: `profiles/france-rail/layers/zones_desserte/zones_desserte_config.json`

```json
{
    "id": "zones_desserte",
    "label": "Zones de desserte SNCF",
    "plugin": "flatgeobuf",
    "zIndex": 30,
    "geometry": "polygon",
    "data": {
        "url": "data/zones_desserte_sncf.fgb",
        "bbox": [2.225, 41.362, 8.227, 51.089],
        "limit": 1000,
        "autoRefresh": true,
        "debounceMs": 500
    },
    "defaultVisible": false
}
```

Loading this config from your initialisation code:

```javascript
const layerId = await GeoLeaf.FlatGeobuf.loadLayerFromConfig(config);
// Loads features within bbox via HTTP Range, then re-fetches on every map pan/zoom
```

Verify the spatial filtering is active: open DevTools → Network → filter `.fgb` → check that the response has a `Content-Range` header.

### Exemple 2 — eco_regions_fgb (fichier local, sans bbox)

Profile: `profiles/tourism/layers/eco_regions_fgb/eco_regions_fgb_config.json`

```json
{
    "id": "eco_regions_fgb",
    "label": "Éco-régions (FlatGeobuf)",
    "plugin": "flatgeobuf",
    "zIndex": 51,
    "geometry": "polygon",
    "data": {
        "url": "layers/eco_regions_fgb/data/eco_regions.fgb",
        "limit": 50000,
        "autoRefresh": false
    },
    "defaultVisible": false
}
```

```javascript
const layerId = await GeoLeaf.FlatGeobuf.loadLayerFromConfig(config);
// Streams the complete .fgb file — no bbox filtering
```

### Gain de taille FlatGeobuf vs GeoJSON

| Dataset                             | GeoJSON  | FlatGeobuf | Gain     |
| ----------------------------------- | -------- | ---------- | -------- |
| `eco_regions` (tourism)             | 2 106 KB | 1 076 KB   | **−51%** |
| `zones_desserte_sncf` (france-rail) | 12 KB    | 5 KB       | **−61%** |

For large polygon datasets the compression gain is significant. The HTTP Range bbox filtering provides an additional reduction by only fetching the features intersecting the current viewport.

---

## API programmatique

Four lower-level functions are also available for direct use:

### `load(url, options?)`

Loads a complete FlatGeobuf file and returns a GeoJSON FeatureCollection.

```typescript
const result = await GeoLeaf.FlatGeobuf.load("https://example.com/data.fgb", { maxFeatures: 5000 });
console.log(result.featureCount); // number of features loaded
console.log(result.data); // GeoJSON FeatureCollection
```

### `loadBbox(url, bbox, options?)`

Loads features filtered by bounding box using FGB spatial index + HTTP Range requests.

```typescript
const result = await GeoLeaf.FlatGeobuf.loadBbox(
    "https://example.com/data.fgb",
    { minX: 2.225, minY: 41.362, maxX: 8.227, maxY: 51.089 },
    { maxFeatures: 1000 }
);
```

### `loadAsLayer(url, options?)`

Loads a complete FlatGeobuf file and adds it as a GeoJSON layer on the map.

```typescript
const layerId = await GeoLeaf.FlatGeobuf.loadAsLayer("https://example.com/data.fgb", {
    layerId: "my-layer",
    layerName: "My Dataset",
    visible: true,
});
```

### `loadBboxAsLayer(url, bbox, options?)`

Loads bbox-filtered features and adds them as a layer. Optionally refreshes on viewport change.

```typescript
const layerId = await GeoLeaf.FlatGeobuf.loadBboxAsLayer(
    "https://example.com/data.fgb",
    { minX: -5, minY: 41, maxX: 10, maxY: 51 },
    {
        layerId: "live-layer",
        autoRefresh: true, // Re-fetch on map pan/zoom
        debounceMs: 300,
        maxFeatures: 2000,
    }
);
```

### `loadLayerFromConfig(config)`

Parses a declarative JSON config object (see [Configuration JSON déclarative](#configuration-json-déclarative)) and delegates to `loadAsLayer` or `loadBboxAsLayer` based on whether `data.bbox` is set.

```typescript
const layerId = await GeoLeaf.FlatGeobuf.loadLayerFromConfig({
    id: "my-layer",
    label: "My FGB Layer",
    plugin: "flatgeobuf",
    data: {
        url: "path/to/data.fgb",
        bbox: [-5, 41, 10, 51],
        limit: 1000,
        autoRefresh: true,
    },
});
```

---

## Types

```typescript
interface FgbBbox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

interface FgbLoadOptions {
    maxFeatures?: number; // Default: 100 000
    signal?: AbortSignal;
    onHeader?: (meta: Record<string, unknown>) => void;
}

interface FgbBboxOptions extends FgbLoadOptions {
    autoRefresh?: boolean;
    debounceMs?: number; // Default: 300
}

interface FgbLayerOptions extends FgbBboxOptions {
    layerId?: string;
    layerName?: string;
    visible?: boolean; // Default: true
    cluster?: boolean; // Default: false
}

interface FgbLoadResult {
    data: FeatureCollection;
    featureCount: number;
    headerMeta?: Record<string, unknown>;
}
```

---

## Converting GeoJSON to FlatGeobuf

Use the `flatgeobuf` npm package directly:

```javascript
import { readFileSync, writeFileSync } from "fs";
import { serialize } from "flatgeobuf/lib/mjs/geojson.js";

const geojson = JSON.parse(readFileSync("data.geojson", "utf8"));
const buf = serialize(geojson);
writeFileSync("data.fgb", Buffer.from(buf));
```

> The server hosting `.fgb` files must support HTTP Range requests (206 Partial Content)
> for bbox filtering to work. Most static file servers (Nginx, Apache, S3, GitHub Pages) support this by default.

---

## Licence

MIT — © 2026 Mattieu Pottier
