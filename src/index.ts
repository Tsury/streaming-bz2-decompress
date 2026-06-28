import type { DecompressStreamActions, DecompressStreamCallbacks } from '../index.js';
import { findBzip2BlockHits, makeBzip2BlockStream } from './bzip2Blocks.js';
import decode from './bunzip.js';
import { createParallelBzip2Decoder, decompressParallelWasm, type ParallelBzip2Options } from './parallelWasm.js';

const DEFAULT_STREAMING_CHUNK_SIZE = 500_000;
const MAX_STREAMING_YIELDS = 32;

interface DecompressStreamOptions extends DecompressStreamCallbacks, ParallelBzip2Options {
  streamingChunkSize?: number;
}

type ParallelBzip2Decoder = NonNullable<Awaited<ReturnType<typeof createParallelBzip2Decoder>>>;

interface DecompressionTask extends DecompressStreamOptions {
  id: number;
  compressedBytes: number;
  compressedBuffer: Uint8Array;
  compressedData: Uint8Array;
  cancelled: boolean;
  blockStarts: number[];
  blockStartSet: Set<number>;
  decodedBlocks: Map<number, Uint8Array>;
  decoder?: ParallelBzip2Decoder;
  decoderPromise?: Promise<ParallelBzip2Decoder | undefined>;
  decodeError?: Error;
  emitQueue: Promise<void>;
  eosBit?: number;
  finalBlockIndex?: number;
  inputDone: boolean;
  nextBlockToDispatch: number;
  nextBlockToEmit: number;
  pendingDecodes: Promise<void>[];
  queue: Promise<void>;
  scanStartByte: number;
  streamingStarted: boolean;
  streamYieldCount: number;
}

let currId = 0;

const decompressStream = (params: DecompressStreamOptions): DecompressStreamActions => {
  const id = currId++;

  const task: DecompressionTask = {
    id,
    ...params,
    compressedBytes: 0,
    compressedBuffer: new Uint8Array(),
    compressedData: new Uint8Array(),
    cancelled: false,
    blockStarts: [],
    blockStartSet: new Set(),
    decodedBlocks: new Map(),
    emitQueue: Promise.resolve(),
    inputDone: false,
    nextBlockToDispatch: 0,
    nextBlockToEmit: 0,
    pendingDecodes: [],
    scanStartByte: 4,
    streamingStarted: false,
    streamYieldCount: 0,
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
      task.decoder?.terminate();
    }
  };
};

const decompressFull = async (chunks: Uint8Array[], compressedBytes: number) => {
  const { decompressWasmChunks } = await import('./wasmBzip.js');

  for (const multiplier of [1.5, 2, 3, 4, 8, 16]) {
    try {
      return await decompressWasmChunks(chunks, compressedBytes, Math.ceil(compressedBytes * multiplier));
    } catch (e) {
      if (e instanceof Error && e.message === 'BZ_OUTBUFF_FULL') {
        continue;
      }

      throw e;
    }
  }

  throw new Error('BZ_OUTBUFF_FULL');
};

const appendCompressedData = (task: DecompressionTask, data: Uint8Array) => {
  const nextLength = task.compressedBytes + data.byteLength;

  if (task.compressedBuffer.byteLength < nextLength) {
    const nextBuffer = new Uint8Array(Math.max(nextLength, task.compressedBuffer.byteLength * 2, data.byteLength));
    nextBuffer.set(task.compressedData);
    task.compressedBuffer = nextBuffer;
  }

  task.compressedBuffer.set(data, task.compressedBytes);
  task.compressedBytes += data.byteLength;
  task.compressedData = task.compressedBuffer.subarray(0, task.compressedBytes);
};

const scanBlockMarkers = (task: DecompressionTask) => {
  if (task.compressedData.length < 10) {
    return;
  }

  const hits = findBzip2BlockHits(task.compressedData, task.scanStartByte);

  for (const hit of hits) {
    if (hit.type === 'block') {
      if (!task.blockStartSet.has(hit.bit)) {
        task.blockStartSet.add(hit.bit);
        task.blockStarts.push(hit.bit);
      }
    } else if (task.eosBit === undefined || hit.bit > task.eosBit) {
      task.eosBit = hit.bit;
    }
  }

  task.blockStarts.sort((left, right) => left - right);
  task.scanStartByte = Math.max(4, task.compressedData.length - 12);
};

const flushDecodedBlocks = (task: DecompressionTask) => {
  task.emitQueue = task.emitQueue.then(async () => {
    while (!task.cancelled && task.decodedBlocks.has(task.nextBlockToEmit)) {
      const index = task.nextBlockToEmit;
      const data = task.decodedBlocks.get(index);

      if (!data) {
        return;
      }

      task.decodedBlocks.delete(index);
      task.nextBlockToEmit++;
      await task.onDecompressed(task.id, data, task.inputDone && index === task.finalBlockIndex);
    }
  });

  return task.emitQueue;
};

const getDecoder = async (task: DecompressionTask) => {
  task.decoderPromise ??= createParallelBzip2Decoder(async (index, data) => {
    if (task.cancelled) {
      return;
    }

    task.decodedBlocks.set(index, data);
    await flushDecodedBlocks(task);
  }, task).catch(() => undefined);

  task.decoder = await task.decoderPromise;
  return task.decoder;
};

const dispatchBlock = async (task: DecompressionTask, index: number, startBit: number, endBit: number) => {
  const decoder = await getDecoder(task);

  if (!decoder) {
    return false;
  }

  const segment = makeBzip2BlockStream(task.compressedData, startBit, endBit);
  const decode = decoder.enqueue(index, segment).catch((e) => {
    task.decodeError = e instanceof Error ? e : new Error(String(e));
  });

  task.pendingDecodes.push(decode);
  task.streamingStarted = true;
  return true;
};

const dispatchClosedBlocks = async (task: DecompressionTask, includeFinalBlock: boolean) => {
  while (task.nextBlockToDispatch + 1 < task.blockStarts.length) {
    const index = task.nextBlockToDispatch;
    const dispatched = await dispatchBlock(task, index, task.blockStarts[index], task.blockStarts[index + 1]);

    if (!dispatched) {
      return;
    }

    task.nextBlockToDispatch++;
  }

  if (includeFinalBlock && task.eosBit !== undefined && task.nextBlockToDispatch < task.blockStarts.length) {
    const index = task.nextBlockToDispatch;
    const dispatched = await dispatchBlock(task, index, task.blockStarts[index], task.eosBit);

    if (dispatched) {
      task.finalBlockIndex = index;
      task.nextBlockToDispatch++;
    }
  }
};

const yieldToWorkerMessages = async (task: DecompressionTask) => {
  if (
    !task.streamingStarted ||
    task.streamYieldCount >= MAX_STREAMING_YIELDS ||
    task.nextBlockToDispatch - task.nextBlockToEmit < 8
  ) {
    return;
  }

  task.streamYieldCount++;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const emitFallback = async (task: DecompressionTask, compressedData: Uint8Array) => {
  let decompressedChunks: Uint8Array[];
  let done = true;

  const parallelChunks = await decompressParallelWasm(compressedData, task).catch(() => undefined);

  try {
    decompressedChunks = parallelChunks ?? [await decompressFull([compressedData], compressedData.byteLength)];
  } catch {
    const res = decode(compressedData, false);

    if (!res) {
      throw Error('Failed to decode');
    }

    decompressedChunks = [res.data];
    done = res.done;
  }

  if (!task.cancelled) {
    for (let i = 0; i < decompressedChunks.length; i++) {
      await task.onDecompressed(task.id, decompressedChunks[i], done && i === decompressedChunks.length - 1);
    }
  }
};

const processCompressedData = async (task: DecompressionTask, data: Uint8Array, isDone: boolean) => {
  if (task.cancelled) {
    return;
  }

  try {
    if (data.byteLength) {
      const streamingChunkSize = Math.max(64 * 1024, task.streamingChunkSize ?? DEFAULT_STREAMING_CHUNK_SIZE);

      for (let offset = 0; offset < data.byteLength; offset += streamingChunkSize) {
        appendCompressedData(task, data.subarray(offset, Math.min(offset + streamingChunkSize, data.byteLength)));
        scanBlockMarkers(task);
        await dispatchClosedBlocks(task, false);
        await yieldToWorkerMessages(task);
      }
    }

    if (!isDone) {
      return;
    }

    scanBlockMarkers(task);
    await dispatchClosedBlocks(task, true);

    if (task.streamingStarted) {
      task.inputDone = true;
      await Promise.all(task.pendingDecodes);

      if (task.decodeError) {
        throw task.decodeError;
      }

      await flushDecodedBlocks(task);
      await task.emitQueue;
      await task.decoder?.finish();

      if (task.finalBlockIndex === undefined) {
        throw Error('Failed to find final bzip2 block');
      }

      return;
    }

    await emitFallback(task, task.compressedData);
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
  } finally {
    if (isDone || task.cancelled) {
      task.decoder?.terminate();
    }
  }
};

export default decompressStream;
