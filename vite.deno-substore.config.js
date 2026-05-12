import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subStoreTransformPlugin } from './vite.substore-transform.js';
import { createSharedResolveConfig } from './vite.shared.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [subStoreTransformPlugin()],
    resolve: createSharedResolveConfig(),
    build: {
        emptyOutDir: false,
        outDir: path.join(__dirname, 'dist/deno'),
        target: 'esnext',
        minify: false,
        sourcemap: true,
        lib: {
            entry: path.join(__dirname, 'sub-store/backend/src/main.js'),
            formats: ['es'],
            fileName: () => 'substore-runtime.js',
        },
        rollupOptions: {
            external: ['node:crypto'],
            output: {
                inlineDynamicImports: true,
            },
        },
    },
});
