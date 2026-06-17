# Streaming BZ2 Decompress

## Overview

Decompress a bzip2 stream in the browser - no Node.js required.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Example](#example)
- [Migrating from v1](#migrating-from-v1)
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

Use `addData` to pass compressed data. Once whole blocks of BZ2 compressed data are received, they will be decompressed and `onDecompressed` will be called with the decompressed data.
Once finished passing compressed data, use `dataFinished` to trigger decompression of any remaining compressed data.

`addData` and `dataFinished` return promises. Await them when chunk ordering or completion ordering matters.

## API

### decompressStream

The only function exposed by this library is `decompressStream`.

```typescript
export type Awaitable<T> = T | Promise<T>;

export interface DecompressStreamCallbacks {
  onDecompressed: (id: number, data: Uint8Array, done: boolean) => Awaitable<void>;
  onError: (id: number, e: string) => Awaitable<void>;
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
      console.log('Task ' + id + 'done. Received: ' + totalReceived);
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

// Received data for task 0: 2728509
// Received data for task 0: 6307939
// Received data for task 0: 13515059
// Received data for task 0: 5403683
// Received data for task 0: 3598647
// Received data for task 0: 21116892
```

## Migrating from v1

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
  },
});
```

## Caveats

- You might need to install a polyfill for `buffer`. You can do so by running `npm i buffer`.
- There's no CRC validation for the entire file at the end - only the per-block ones. There's no proper BZ2 formet eof detection. That's why `onDataFinished` is required.

## Contributing

- Currently, there are no tests for this repository. PRs are welcome to add tests.
- If you want to help with polyfilling `buffer`, PRs are welcome.

## Credits

This library is based on the following repositories:

- [seek-bzip by openpgpjs](https://github.com/openpgpjs/seek-bzip)
- [seek-bzip by cscott](https://github.com/cscott/seek-bzip)
- [bzip2.js by antimatter15](https://github.com/antimatter15/bzip2.js)

## License

This project is licensed under the MIT License.
