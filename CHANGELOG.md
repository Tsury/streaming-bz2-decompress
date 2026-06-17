# Changelog

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
  },
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
  },
});
```

### Performance

- Optimized hot decoder paths for large browser/worker replay decompression workloads.
- Reduced avoidable copies in stream block-boundary handling.
- Fixed package lifecycle so consumers no longer need TypeScript installed during `npm install`.
