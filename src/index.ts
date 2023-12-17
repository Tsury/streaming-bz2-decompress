import type { DecompressStreamActions, DecompressStreamCallbacks } from '../index.js';
import decode from './bunzip.js';
import kmpSearch from './kmpSearch.js';

interface DecompressionTask extends DecompressStreamCallbacks {
  id: number;
  chunks: Uint8Array[];
  header: Uint8Array;
  magic: Uint8Array;
}

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

  // TODO: Consider adding some queueing mechanism to avoid blocking the main thread
  // (setTimeout?)
  return {
    dataFinished: () => {
      processCompressedData(id, new Uint8Array(), true);
    },
    addData: (data: Uint8Array) => {
      processCompressedData(id, data, false);
    },
    cancel: () => {
      decompressionTasks.delete(id);
    }
  };
};

const processCompressedData = (id: number, data: Uint8Array, isDone: boolean) => {
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
        task.header = header = data.slice(0, 4);
        task.magic = magic = data.slice(4, 10);
        data = data.slice(4);
        isFirst = true;
      }

      // Find the magic number in the current block
      // If this is the first chunk, we skip the first byte to not match the magic number in the first block
      newMagicIndex = kmpSearch(data, magic, isFirst);

      if (newMagicIndex === -1 && chunks.length > 0) {
        // If we didn't find the magic number, try to combine the last chunk with the current one
        // This is to handle the case where the magic number is split between 2 blocks
        const magicLength = magic.length;
        const lastChunk = chunks[chunks.length - 1];

        // To optimize, we slice potentialMagicData to only contain (magicLength - 1) from each of its parts (the last chunk and the current one)
        // It will have a final size of (magicLength * 2 - 2)
        const potentialMagicData = new Uint8Array([
          ...Array.from(lastChunk.slice(lastChunk.length - (magicLength - 1))),
          ...Array.from(data.slice(0, magicLength - 1))
        ]);

        newMagicIndex = kmpSearch(potentialMagicData, magic, false);

        if (newMagicIndex !== -1) {
          // Concat the last chunk with the current one
          const newValue = new Uint8Array([...Array.from(lastChunk), ...Array.from(data)]);

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
    decompressionTasks.get(id)?.onDecompressed(id, res.data, res.done);
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
