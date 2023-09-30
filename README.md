# streaming-bz2-decompress

## Description

This library allows you to decompress a stream of a bzip2 archive in the browser, no Node.js required.

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
3. [API](#api)
4. [Example](#example)
5. [Caveats](#caveats)
6. [Contributing](#contributing)
7. [Credits](#credits)
8. [License](#license)

## Installation

To install the package, run the following command:

```bash
npm i streaming-bz2-decompress
```

## Usage

After installing, you can use it as follows:

```javascript
import decompressStream from 'streaming-bz2-decompress';
```

## API

The library exposes only one function:

```typescript
declare function decompressStream(
  url: string,
  onData: (data: { data: Uint8Array; done: boolean }) => void,
  onError: (e: string) => void
): Promise<void>;
```

## Example

Here is a quick example to get you started:

```javascript
let total = 0;

await decompressStream(
  'http://url/to/file.bz2',
  (newData) => {
    console.log(`Received ${newData.data.length} bytes`);
    total += newData.data.length;

    if (newData.done) {
      console.log(`Done. Received a total of ${total} bytes`);
    }
  },
  (error) => {
    console.log(`Error: ${error}`);
  }
);
```

## Caveats

You might need to polyfill `buffer`. You can install it by running:

```bash
npm i buffer
```

If you wish to contribute to make this library polyfill `buffer` for the consumer, PRs are welcome.

## Contributing

Currently, there are no tests for this repository. If you would like to contribute, PRs are welcome.

## Credits

This library is based on the following repositories:
- [openpgpjs/seek-bzip](https://github.com/openpgpjs/seek-bzip)
- [cscott/seek-bzip](https://github.com/cscott/seek-bzip)
- [antimatter15/bzip2.js](https://github.com/antimatter15/bzip2.js)

## License

This project is licensed under the MIT License.
