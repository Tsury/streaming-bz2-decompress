# Streaming BZ2 Decompress

## Overview

This library enables you to decompress a stream of a bzip2 archive directly in the browser. It doesn't require Node.js, making it quite handy for client-side operations.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Example](#example)
- [Contributing](#contributing)
- [Caveats](#caveats)
- [Credits](#credits)
- [License](#license)

## Installation

To install the package, you can use npm as follows:

```bash
npm i streaming-bz2-decompress
```

## Usage

The library exposes a single function `decompressStream` which takes care of the decompression process.
It requires the callbacks `onDecompressed` and `onError` to it in order to pass decompressed data.
It returns the callbacks `onDataFinished`, `onCompressedData` and `cancel` in order to receive input from the consumer.

use `onCompressedData` to pass compressed data, once whole blocks of BZ2 compressed data are received, they be decompressed and `onDecompressed` will be called with the decompressed data.
Once finished passing compressed datam use `onDataFinished` to trigger the decompression of any remaining uncompressed data.

## API

### decompressStream

The only function exposed by this library is `decompressStream`.

```typescript
export interface DecompressStreamCallbacks {
  onDecompressed: (id: number, data: DecompressedCallbackParams) => void;
  onError: (id: number, e: string) => void;
}

export interface DecompressStreamActions {
  onDataFinished: () => void;
  onCompressedData: (data: Uint8Array) => void;
  cancel: () => void;
}

declare function decompressStream(callbacks: DecompressStreamCallbacks): void;
```

## Example

Here is a basic example to demonstrate the usage:

```javascript
let totalReceived = 0;

const decompressionActions = decompressStream({
  onDecompressed: (id, data) => {
    totalReceived += data.data.byteLength;
    console.log('Received data for task ' + id + ': ' + data.data.byteLength);

    if (data.done) {
      console.log('Task ' + id + 'done. Received: ' + totalReceived);
    }
  },
  onError: (id, e) => {
    console.error('Error for task ' + id + ': ' + e);
  }
});

const response = await fetch('http://url/to/file.bz2');

if (!response.ok || !response.body) {
  throw Error(`Failed to fetch with status: ${response.statusText || 'unknown'}`);
}

const reader = response.body.getReader();

while (true) {
  const readRes = await reader.read();
  const { done, value } = readRes;

  if (done) {
    decompressionActions.onDataFinished();
    break;
  }

  if (!value) {
    throw Error('No value');
  }

  decompressionActions.onCompressedData(value);
}

// Received data for task 0: 2728509
// Received data for task 0: 6307939
// Received data for task 0: 13515059
// Received data for task 0: 5403683
// Received data for task 0: 3598647
// Received data for task 0: 21116892
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
