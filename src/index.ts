import decode from './bunzip.js';

const findSubArray = (A: Uint8Array, B: Uint8Array): number => {
  // Check for empty arrays or if B is larger than A
  if (A.length === 0 || B.length === 0 || B.length > A.length) {
    return -1;
  }

  for (let i = 0; i <= A.length - B.length; i++) {
    let match = true;

    for (let j = 0; j < B.length; j++) {
      if (A[i + j] !== B[j]) {
        match = false;
        break;
      }
    }

    if (match) {
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

        if (isFirst) {
          // On first block, in case we have 2 magic numbers, skip the first one by adding 1 to the index
          newMagicIndex = findSubArray(value.slice(1), magic);
        } else {
          newMagicIndex = findSubArray(value, magic);

          if (newMagicIndex === -1 && chunks.length > 0) {
            // If we didn't find the magic number, try to combine the last chunk with the current one
            // This is to handle the case where the magic number is split between 2 blocks
            const newValue = new Uint8Array([...Array.from(chunks[chunks.length - 1]), ...Array.from(value)]);

            // We skip the first byte to not match the magic number in the last block (chunks.length - 1)
            newMagicIndex = findSubArray(newValue.slice(1), magic);

            if (newMagicIndex !== -1) {
              // If we found the magic number, replace the last chunk with the new value
              value = newValue;
              chunks.pop();
            }
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
