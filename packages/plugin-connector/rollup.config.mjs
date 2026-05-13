/*!
 * GeoLeaf Connector Plugin — Rollup Config
 * © 2026 Mattieu Pottier — MIT License
 */
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

export default {
    input: 'src/entry.ts',
    output: {
        file: 'dist/geoleaf-connector.plugin.js',
        format: 'es',
        sourcemap: true,
    },
    // @geoleaf/core is never bundled — loaded separately by the host page
    external: [/^@geoleaf\/core/],
    plugins: [
        nodeResolve(),
        replace({
            preventAssignment: true,
            '__GEOLEAF_CONNECTOR_VERSION__': pkg.version ?? '1.0.0',
        }),
        typescript({ tsconfig: './tsconfig.json' }),
    ],
};
