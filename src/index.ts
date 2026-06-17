import type { DecompressStreamActions, DecompressStreamCallbacks } from '../index.js';
import decode from './bunzip.js';
import kmpSearch, { buildKmpTable } from './kmpSearch.js';

interface DecompressionTask extends DecompressStreamCallbacks {
  id: number;
  chunks: Uint8Array[];
  header: Uint8Array;
  magic: Uint8Array;
  magicTable: number[];
  cancelled: boolean;
  queue: Promise<void>;
}

let currId = 0;

const decompressStream = (params: DecompressStreamCallbacks): DecompressStreamActions => {
  const id = currId++;

  const task: DecompressionTask = {
    id,
    ...params,
    chunks: [],
    header: Buffer.from([]),
    magic: new Uint8Array(),
    magicTable: [],
    cancelled: false,
    queue: Promise.resolve()
  };

  const enqueue = (data: Uint8Array, isDone: boolean) => {
    task.queue = task.queue.then(() => processCompressedData(task, data, isDone));
    return task.queue;
  };

  return {
    dataFinished: () => {
      return enqueue(new Uint8Array(), true);
    },
    addData: (data: Uint8Array) => {
      return enqueue(data, false);
    },
    cancel: () => {
      task.cancelled = true;
    }
  };
};

const concatUint8Arrays = (left: Uint8Array, right: Uint8Array) => {
  const value = new Uint8Array(left.length + right.length);
  value.set(left);
  value.set(right, left.length);
  return value;
};

const processCompressedData = async (task: DecompressionTask, data: Uint8Array, isDone: boolean) => {
  if (task.cancelled) {
    return;
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
        task.header = header = data.subarray(0, 4);
        task.magic = magic = data.subarray(4, 10);
        task.magicTable = buildKmpTable(magic);
        data = data.subarray(4);
        isFirst = true;
      }

      // Find the magic number in the current block
      // If this is the first chunk, we skip the first byte to not match the magic number in the first block
      newMagicIndex = kmpSearch(data, magic, task.magicTable, isFirst);

      if (newMagicIndex === -1 && chunks.length > 0) {
        // If we didn't find the magic number, try to combine the last chunk with the current one
        // This is to handle the case where the magic number is split between 2 blocks
        const magicLength = magic.length;
        const lastChunk = chunks[chunks.length - 1];

        // To optimize, we slice potentialMagicData to only contain (magicLength - 1) from each of its parts (the last chunk and the current one)
        // It will have a final size of (magicLength * 2 - 2)
        const potentialMagicData = concatUint8Arrays(
          lastChunk.subarray(lastChunk.length - (magicLength - 1)),
          data.subarray(0, magicLength - 1)
        );

        newMagicIndex = kmpSearch(potentialMagicData, magic, task.magicTable, false);

        if (newMagicIndex !== -1) {
          // Concat the last chunk with the current one
          const newValue = concatUint8Arrays(lastChunk, data);

          // Fix newMagicIndex to be relative to the beginning of lastChunk
          newMagicIndex += lastChunk.length - (magicLength - 1);

          // If we found the magic number, replace the last chunk with the new value
          data = newValue;
          chunks.pop();
        }
      }

      if (newMagicIndex === -1) {
        chunks.push(data);
        return;
      }

      const newBlockData = data.subarray(0, newMagicIndex);
      compressedData = Buffer.concat([header, ...chunks, newBlockData]) as Buffer;

      const newNextBlockData = data.subarray(newMagicIndex);
      task.chunks = [newNextBlockData];
    }

    const res = decode(compressedData, false);

    if (!res) {
      throw Error('Failed to decode');
    }

    if (!task.cancelled) {
      await task.onDecompressed(task.id, res.data, res.done);
    }
  } catch (e) {
    if (task.cancelled) {
      return;
    }

    let errStr = '';

    if (e instanceof Error) {
      errStr = e.message;
    } else {
      errStr = String(e);
    }

    await task.onError(task.id, errStr);
  }
};

export default decompressStream;
