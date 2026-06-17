import { decompressWasmChunks } from './wasmBzip.js';

interface WorkerRequest {
  indexes: number[];
  segments: ArrayBuffer[];
}

interface WorkerOutput {
  data: Uint8Array;
  index: number;
}

const decompressFull = async (segment: Uint8Array) => {
  for (const multiplier of [1.5, 2, 3, 4, 8, 16]) {
    try {
      return await decompressWasmChunks([segment], segment.byteLength, Math.ceil(segment.byteLength * multiplier));
    } catch (e) {
      if (e instanceof Error && e.message === 'BZ_OUTBUFF_FULL') {
        continue;
      }

      throw e;
    }
  }

  throw new Error('BZ_OUTBUFF_FULL');
};

const handleMessage = async (request: WorkerRequest) => {
  const outputs: WorkerOutput[] = [];

  for (let i = 0; i < request.segments.length; i++) {
    outputs.push({
      data: await decompressFull(new Uint8Array(request.segments[i])),
      index: request.indexes[i]
    });
  }

  return outputs;
};

const asTransferList = (outputs: WorkerOutput[]) => outputs.map((output) => output.data.buffer);

const workerScope = globalThis as typeof globalThis & {
  postMessage?: (message: unknown, transfer?: Transferable[]) => void;
  onmessage?: (event: MessageEvent<WorkerRequest>) => void;
};
const importNodeModule = new Function('specifier', 'return import(specifier)') as <T>(specifier: string) => Promise<T>;

if (typeof workerScope.postMessage === 'function') {
  workerScope.onmessage = async (event) => {
    try {
      const outputs = await handleMessage(event.data);
      workerScope.postMessage?.({ outputs }, asTransferList(outputs));
    } catch (e) {
      workerScope.postMessage?.({ error: e instanceof Error ? e.message : String(e) });
    }
  };
} else if (typeof process !== 'undefined') {
  void (async () => {
    const { parentPort } = await importNodeModule<typeof import('node:worker_threads')>('node:worker_threads');

    parentPort?.on('message', async (request: WorkerRequest) => {
      try {
        const outputs = await handleMessage(request);
        parentPort.postMessage({ outputs }, asTransferList(outputs));
      } catch (e) {
        parentPort.postMessage({ error: e instanceof Error ? e.message : String(e) });
      }
    });
  })();
}
