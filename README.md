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

## API

### decompressStream

The only function exposed by this library is `decompressStream`.

```typescript
export interface DataCallbackParams {
  data: Uint8Array;
  done: boolean;
  progress?: number;
}

declare function decompressStream(
  url: string,
  onData: (data: DataCallbackParams) => void,
  onError: (e: string) => void
): Promise<void>;
```

## Example

Here is a basic example to demonstrate the usage:

```javascript
let total = 0;

await decompressStream(
  'http://url/to/file.bz2',
  (newData) => {
    console.log(`Received ${newData.data.length} bytes.` + (newData.progress ? ` Progress: ${newData.progress}%` : ``));
    total += newData.data.length;

    if (newData.done) {
      console.log(`Done. Received a total of ${total} bytes`);
    }
  },
  (error) => {
    console.log(`Error: ${error}`);
  }
);

// Received 2728509 bytes. Progress: 6%
// Received 6307939 bytes. Progress: 19%
// Received 13515059 bytes. Progress: 44%
// Received 5403683 bytes. Progress: 54%
// Received 3598647 bytes. Progress: 61%
// Received 21116892 bytes. Progress: 100%
// Done. Received a total of 52670729 bytes
```

## Caveats

- You might need to install a polyfill for `buffer`. You can do so by running `npm i buffer`.
- There's no CRC validation for the entire file at the end - only the per-block ones.
- Progress depends on a proper Content-Length header being returned.

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
