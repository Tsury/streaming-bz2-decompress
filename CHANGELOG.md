# Changelog

## 3.0.0

### Breaking Changes

- Browser builds now require WebAssembly support. The package uses a WASM-backed decoder for the fast path and falls back to the JavaScript decoder only after WASM/worker failures.
- Streaming is now best-effort at bzip2 block boundaries. When input is paced, `onDecompressed` can fire before `dataFinished()`. If input is produced in a tight local loop, early output depends on worker scheduling and bounded yielding.
- The package now creates browser workers from generated Blob source. Consumers with strict CSP must allow Blob workers or disable worker streaming with `workerCount: 0`.

### Added

- Parallel bzip2 block decompression in Web Workers.
- WASM-backed full-file fallback using embedded wasm bytes, with no runtime `bzip2.wasm` URL lookup from Blob workers.
- `workerCount` option to cap or disable worker streaming.
- `streamingChunkSize` option for internal scan/dispatch windows. Default is 500 KB.
- Browser bundler support for Vite/Rolldown dependency optimization without Vite-specific `?worker` imports.

### Performance

- Much faster large replay decompression and parse pipelines by dispatching independent bzip2 blocks to workers.
- Better fast-local-file behavior via internal 500 KB dispatch windows and bounded event-loop yielding.
- Browser builds no longer emit an unused `bzip2Worker-*.js` asset from the Node fallback path.
- Browser builds no longer surface upstream `fs`/`path` externalization warnings from the WASM loader.

### Migration

Most v2 consumers can keep the same API calls:

```ts
await actions.addData(chunk);
await actions.dataFinished();
```

For browser apps:

- Ensure WebAssembly is available.
- Allow Blob workers, or pass `workerCount: 0` to disable worker streaming.
- For compressed local `.bz2` files, stream reads and keep input chunks around 500 KB to 4 MB.
- Cap `workerCount` if UI responsiveness matters more than maximum throughput.

## 2.0.0

### Breaking Changes

- `addData(data)` and `dataFinished()` now return `Promise<void>`.
- `onDecompressed` and `onError` callbacks may return `void` or `Promise<void>`.
- Stream completion is now backpressured: `dataFinished()` resolves only after the final decompressed chunk callback has completed.

### Migration

Await `addData()` and `dataFinished()` whenever ordering matters:

```ts
await actions.addData(chunk);
await actions.dataFinished();
```

Callbacks can stay synchronous:

```ts
const actions = decompressStream({
  onDecompressed: (_id, data, done) => {
    // synchronous callback still works
  },
  onError: (_id, error) => {
    console.error(error);
  }
});
```

Or they can perform async work:

```ts
const actions = decompressStream({
  onDecompressed: async (_id, data, done) => {
    await consumeChunk(data, done);
  },
  onError: async (_id, error) => {
    await reportError(error);
  }
});
```

### Performance

- Optimized hot decoder paths for large browser/worker replay decompression workloads.
- Reduced avoidable copies in stream block-boundary handling.
- Fixed package lifecycle so consumers no longer need TypeScript installed during `npm install`.
