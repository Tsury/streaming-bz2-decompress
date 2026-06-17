# Streaming BZ2 Decompress

## Overview

Decompress a bzip2 stream in the browser - no Node.js required.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Example](#example)
- [Migrating](#migrating)
- [Bundlers](#bundlers)
- [Local files](#local-files)
- [Contributing](#contributing)
- [Caveats](#caveats)
- [Credits](#credits)
- [License](#license)

## Installation

```bash
npm i streaming-bz2-decompress
```

## Usage

The library exposes a single function `decompressStream` which takes care of the decompression process.
It receives the callbacks `onDecompressed` and `onError` in order to pass decompressed data back to the consumer.
It returns the actions `dataFinished`, `addData` and `cancel` in order to receive input from the consumer.

Use `addData` to pass compressed data. The current implementation does best-effort streaming by decompressing complete bzip2 blocks in Web Workers while more input is still arriving.
Once finished passing compressed data, use `dataFinished` to flush the final block and completion state. The final `onDecompressed` call has `done = true`.

`addData` and `dataFinished` return promises. Await them when chunk ordering or completion ordering matters.

## API

### decompressStream

The only function exposed by this library is `decompressStream`.

```typescript
export type Awaitable<T> = T | Promise<T>;

export interface DecompressStreamCallbacks {
  onDecompressed: (id: number, data: Uint8Array, done: boolean) => Awaitable<void>;
  onError: (id: number, e: string) => Awaitable<void>;
  // Internal compressed input scan/dispatch window. Default: 500 KB.
  streamingChunkSize?: number;
  // Maximum parallel workers. Pass 0 to disable worker streaming.
  workerCount?: number;
}

export interface DecompressStreamActions {
  dataFinished: () => Promise<void>;
  addData: (data: Uint8Array) => Promise<void>;
  cancel: () => void;
}

declare function decompressStream(callbacks: DecompressStreamCallbacks): DecompressStreamActions;
```

## Example

Here is a basic example to demonstrate the usage:

```javascript
let totalReceived = 0;

const decompressionActions = decompressStream({
  onDecompressed: async (id, data, done) => {
    totalReceived += data.byteLength;
    console.log('Received data for task ' + id + ': ' + data.byteLength);

    if (done) {
      console.log('Task ' + id + ' done. Received: ' + totalReceived);
    }
  },
  onError: (id, e) => {
    console.error('Error for task ' + id + ': ' + e);
  }
});

const response = await fetch('http://path/to/file.bz2');

if (!response.ok || !response.body) {
  throw Error(`Failed to fetch with status: ${response.statusText || 'unknown'}`);
}

const reader = response.body.getReader();

while (true) {
  const readRes = await reader.read();
  const { done, value } = readRes;

  if (done) {
    await decompressionActions.dataFinished();
    break;
  }

  if (!value) {
    throw Error('No value');
  }

  await decompressionActions.addData(value);
}

// Received data for task 0: 898440
// Received data for task 0: 898818
// Task 0 done. Received: 52846954
```

## Migrating

### From v2 to v3

Version 3 keeps the v2 async API, but changes the decompression engine. Browser builds now use WebAssembly plus generated Blob workers for the fast path. Most consumers do not need code changes if they already await `addData()` and `dataFinished()`.

Check these runtime requirements:

- WebAssembly must be available.
- Blob workers must be allowed by CSP. If they are not allowed, pass `workerCount: 0` to disable worker streaming.
- For compressed local `.bz2` files, stream reads and use chunks around 500 KB to 4 MB.
- If UI responsiveness is more important than maximum throughput, cap `workerCount`.

### From v1 to v2

Version 2 is intentionally breaking. The v1 actions were typed as synchronous `void` methods. In v2, `addData()` and `dataFinished()` return promises so stream completion can wait for downstream consumers.

Before:

```ts
actions.addData(chunk);
actions.dataFinished();
```

After:

```ts
await actions.addData(chunk);
await actions.dataFinished();
```

Synchronous callbacks still work, but callbacks can now return a promise when the next stream stage needs backpressure:

```ts
const actions = decompressStream({
  onDecompressed: async (_id, data, done) => {
    await consumeChunk(data, done);
  },
  onError: (_id, error) => {
    console.error(error);
  }
});
```

## Bundlers

The browser worker is packaged as generated inline source and created with a Blob URL. The published package does not rely on Vite-only `?worker` imports, so it can be Vite/Rolldown dependency-optimized or prebundled.

Node.js uses `dist/bzip2Worker.js` for worker threads. Browser builds should not emit a separate `bzip2Worker-*.js` asset; browser workers use the generated inline source instead.

The WASM loader is also packaged as generated browser-safe code, so browser bundlers should not warn about upstream Node `fs` or `path` imports.

## Local files

For local `.bz2` files read from fast storage, stream the file and `await addData()` for each chunk. Keep compressed input chunks around 500 KB to 4 MB. The library internally scans and dispatches work in 500 KB windows, and applies bounded yielding so worker output callbacks can run before `dataFinished()` even when input is produced quickly.

If the producer reads the whole file into memory before calling `addData()`, peak memory includes that caller-owned buffer, the library compressed buffer, worker input/output transfers, and decompressed chunks waiting for the consumer. For lowest peak memory, use `Blob.stream()`, `File.stream()`, or another streaming reader instead of `arrayBuffer()` on the full file.

## Caveats

- WebAssembly must be available in the browser runtime.
- Blob workers must be allowed for parallel browser streaming. Pass `workerCount: 0` to disable worker streaming when Blob workers are blocked.
- Complete bzip2 blocks are dispatched internally in 500 KB compressed input windows by default. Consumers can pass larger chunks; tune `streamingChunkSize` only after measuring.
- `workerCount` can cap parallel bzip2 workers. Pass `0` to disable worker streaming and use full-file fallback.
- There's no CRC validation for the entire file at the end - only the per-block ones. There's no proper BZ2 format eof detection. That's why `dataFinished` is required.

## Contributing

- Currently, there are no tests for this repository. PRs are welcome to add tests.

## Credits

This library is based on the following repositories:

- [seek-bzip by openpgpjs](https://github.com/openpgpjs/seek-bzip)
- [seek-bzip by cscott](https://github.com/cscott/seek-bzip)
- [bzip2.js by antimatter15](https://github.com/antimatter15/bzip2.js)

## License

This project is licensed under the MIT License.
