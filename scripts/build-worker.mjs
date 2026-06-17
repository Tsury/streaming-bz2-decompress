import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const patchWasmUrlLookup = (source, label) => {
  const patched = source.replace(
    /new URL\(["']bzip2\.wasm["'],\s*import\.meta\.url\)\.toString\(\)/g,
    '"bzip2.wasm"'
  );

  if (patched === source) {
    throw new Error(`Failed to patch ${label} wasm URL lookup`);
  }

  return patched;
};

const workerResult = await build({
  bundle: true,
  entryPoints: ['src/bzip2Worker.ts'],
  external: ['fs', 'path'],
  format: 'esm',
  logLevel: 'silent',
  minify: true,
  platform: 'browser',
  target: 'es2020',
  write: false
});

const wasmLoaderResult = await build({
  bundle: true,
  entryPoints: ['src/bzip2WasmLoader.ts'],
  external: ['fs', 'path'],
  format: 'esm',
  logLevel: 'silent',
  minify: true,
  platform: 'browser',
  target: 'es2020',
  write: false
});

const bundledWorkerSource = workerResult.outputFiles[0]?.text;
const bundledWasmLoaderSource = wasmLoaderResult.outputFiles[0]?.text;

if (!bundledWorkerSource) {
  throw new Error('Failed to build bzip2 worker source');
}

if (!bundledWasmLoaderSource) {
  throw new Error('Failed to build bzip2 wasm loader source');
}

const workerSource = patchWasmUrlLookup(bundledWorkerSource, 'worker');
const wasmLoaderSource = patchWasmUrlLookup(bundledWasmLoaderSource, 'wasm loader');

await mkdir('dist', { recursive: true });
await writeFile('dist/bzip2WorkerSource.js', `export const BZIP2_WORKER_SOURCE = ${JSON.stringify(workerSource)};\n`);
await writeFile('dist/bzip2WasmLoader.js', wasmLoaderSource);
