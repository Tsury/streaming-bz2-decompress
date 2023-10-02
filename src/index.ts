import type { DecompressStreamActions, DecompressStreamCallbacks } from '../index.js';
import decode from './bunzip.js';

interface DecompressionTask extends DecompressStreamCallbacks {
  id: number;
  chunks: Uint8Array[];
  header: Buffer;
  magic: Uint8Array;
}

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

let currId = 0;
const decompressionTasks = new Map<number, DecompressionTask>();

const decompressStream = (params: DecompressStreamCallbacks): DecompressStreamActions => {
  const id = currId++;

  const task: DecompressionTask = {
    id,
    ...params,
    chunks: [],
    header: Buffer.from([]),
    magic: new Uint8Array()
  };

  decompressionTasks.set(id, task);

  return {
    onDataFinished: () => {
      // TODO: If these setTimeouts introduce bugs, I will replace them with a proper queue/worker system
      setTimeout(() => {
        onCompressedData(id, new Uint8Array(), true);
      });
    },
    onCompressedData: (data: Uint8Array) => {
      setTimeout(() => {
        onCompressedData(id, data, false);
      });
    },
    cancel: () => {
      decompressionTasks.delete(id);
    }
  };
};

const onCompressedData = (id: number, data: Uint8Array, isDone: boolean) => {
  const task = decompressionTasks.get(id);

  if (!task) {
    throw Error('No task');
  }

  try {
    const { chunks } = task;
    let { header, magic } = task;

    let compressedData: Buffer;

    if (isDone) {
      // If isDone is true, it means data is empty, just decompress what's left in the chunks
      compressedData = Buffer.concat([header, ...chunks]);
    } else {
      let newMagicIndex = -1;
      let isFirst = false;

      if (!header.length && data.byteLength > 0) {
        task.header = header = Buffer.from(data).subarray(0, 4);
        task.magic = magic = data.slice(4, 10);
        data = data.slice(4);
        isFirst = true;
      }

      // Find the magic number in the current block
      // If this is the first chunk, we skip the first byte to not match the magic number in the first block
      newMagicIndex = findSubArray(data, magic, isFirst);

      if (newMagicIndex === -1 && chunks.length > 0) {
        // If we didn't find the magic number, try to combine the last chunk with the current one
        // This is to handle the case where the magic number is split between 2 blocks
        const newValue = new Uint8Array([...Array.from(chunks[chunks.length - 1]), ...Array.from(data)]);

        // We skip the first byte to not match the magic number in the last block (chunks.length - 1)
        newMagicIndex = findSubArray(newValue.slice(1), magic, false);

        if (newMagicIndex !== -1) {
          // If we found the magic number, replace the last chunk with the new value
          data = newValue;
          chunks.pop();
        }
      }

      if (newMagicIndex === -1) {
        chunks.push(data);
        return;
      }

      const newBlockData = data.slice(0, newMagicIndex);
      compressedData = Buffer.concat([header, ...chunks, newBlockData]) as Buffer;

      const newNextBlockData = data.slice(newMagicIndex);
      task.chunks = [newNextBlockData];
    }

    const res = decode(compressedData, false);

    if (!res) {
      throw Error('Failed to decode');
    }

    // We get the callback in the last second in case the user cancels the task
    decompressionTasks.get(id)?.onDecompressed(id, res);
  } catch (e) {
    const onError = decompressionTasks.get(id)?.onError;

    if (!onError) {
      return;
    }

    let errStr = '';

    if (e instanceof Error) {
      errStr = e.message;
    } else {
      errStr = String(e);
    }

    onError(id, errStr);
  }
};

export default decompressStream;
