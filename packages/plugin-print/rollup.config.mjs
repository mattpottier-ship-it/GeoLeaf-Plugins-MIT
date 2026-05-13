/*!
 * GeoLeaf Print Plugin — Rollup Config
 * © 2026 Mattieu Pottier — MIT License
 */
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import postcss from 'rollup-plugin-postcss';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

export default {
    input: 'src/entry.ts',
    output: {
        file: 'dist/geoleaf-print.plugin.js',
        format: 'es',
        sourcemap: true,
        inlineDynamicImports: true,
    },
    // Core and maplibre-gl loaded separately by the host page. jsPDF bundled inline.
    external: [/^@geoleaf\/core/, 'maplibre-gl'],
    plugins: [
        nodeResolve({ preferBuiltins: false }),
        commonjs(),
        replace({
            preventAssignment: true,
            '__GEOLEAF_PRINT_VERSION__': pkg.version ?? '1.0.0',
        }),
        postcss({ inject: true, minimize: true, extract: false, sourceMap: false }),
        typescript({ tsconfig: './tsconfig.json' }),
    ],
};
