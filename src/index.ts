import decode from './bunzip.js';

const findSubArray = (arr1: Uint8Array, arr2: Uint8Array, skipFirst: boolean) => {
  for (let i = 0; i <= arr1.length - arr2.length; i++) {
    // Ensuring there's enough space remaining in arr1 to contain arr2
    let found = true;

    for (let j = 0; j < arr2.length; j++) {
      if (arr1[i + j] !== arr2[j]) {
        found = false;
        break;
      }
    }

    if (found && (i > 0 || !skipFirst)) {
      return i;
    }
  }

  return -1;
};

const decompressStream = async (
  url: string,
  onData: (data: { data: Uint8Array; done: boolean }) => void,
  onError: (e: string) => void
) => {
  try {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
      throw Error(`Failed to fetch with status: ${response.statusText || 'unknown'}`);
    }

    const reader = response.body.getReader();

    let chunks: Uint8Array[] = [];
    let header: Buffer = Buffer.from([]);
    let magic: Uint8Array = new Uint8Array([]);
    let newMagicIndex = -1;
    let compressedData: Buffer;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const readRes = await reader.read();
      let { value } = readRes;
      const { done } = readRes;

      if (done) {
        compressedData = Buffer.concat([header, ...chunks]);
      } else {
        if (!value) {
          throw Error('No value');
        }

        let isFirst = false;

        if (!header.length && value.byteLength > 0) {
          header = Buffer.from(value).subarray(0, 4);
          magic = value.slice(4, 10);
          value = value.slice(4);
          isFirst = true;
        }

        // Find the magic number in the current block
        // If this is the first chunk, we skip the first byte to not match the magic number in the first block
        newMagicIndex = findSubArray(value, magic, isFirst);

        if (newMagicIndex === -1 && chunks.length > 0) {
          // If we didn't find the magic number, try to combine the last chunk with the current one
          // This is to handle the case where the magic number is split between 2 blocks
          const newValue = new Uint8Array([...Array.from(chunks[chunks.length - 1]), ...Array.from(value)]);

          // We skip the first byte to not match the magic number in the last block (chunks.length - 1)
          newMagicIndex = findSubArray(newValue.slice(1), magic, false);

          if (newMagicIndex !== -1) {
            // If we found the magic number, replace the last chunk with the new value
            value = newValue;
            chunks.pop();
          }
        }

        if (newMagicIndex === -1) {
          chunks.push(value);
          continue;
        }

        const newBlockData = value.slice(0, newMagicIndex);
        const newNextBlockData = value.slice(newMagicIndex);

        compressedData = Buffer.concat([header, ...chunks, newBlockData]) as Buffer;

        chunks = [newNextBlockData];
      }

      const data = decode(compressedData);

      if (!data) {
        throw Error('Failed to decode');
      }

      onData({ data, done });

      if (done) {
        break;
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      onError(e.message);
    } else {
      onError('Unknown error');
    }
  }
};

export default decompressStream;
