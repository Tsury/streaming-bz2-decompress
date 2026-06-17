import { splitBzip2Blocks } from './bzip2Blocks.js';
import { BZIP2_WORKER_SOURCE } from './bzip2WorkerSource.js';

interface WorkerGroup {
  bytes: number;
  indexes: number[];
  segments: Uint8Array[];
}

export interface ParallelBzip2Options {
  workerCount?: number;
}

interface WorkerResponse {
  error?: string;
  outputs?: Array<{
    data: Uint8Array;
    index: number;
  }>;
}

type BrowserWorker = Worker & {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
type WorkerLike =
  | BrowserWorker
  | {
      on(event: 'message', listener: (message: WorkerResponse) => void): void;
      on(event: 'error', listener: (error: Error) => void): void;
      postMessage(message: unknown, transfer: ArrayBuffer[]): void;
      terminate(): void;
    };
interface WorkerJob {
  index: number;
  reject(error: Error): void;
  resolve(): void;
  segment: Uint8Array;
}

const MAX_WORKERS = 12;
const MAX_SEGMENTS_PER_MESSAGE = 4;
const MIN_PARALLEL_BLOCKS = 4;
const NODE_WORKER_FILE = './' + 'bzip2Worker.js';
const importNodeModule = new Function('specifier', 'return import(specifier)') as <T>(specifier: string) => Promise<T>;
let browserWorkerUrl: string | undefined;

const getBrowserWorkerUrl = () => {
  browserWorkerUrl ??= URL.createObjectURL(new Blob([BZIP2_WORKER_SOURCE], { type: 'text/javascript' }));
  return browserWorkerUrl;
};

const getWorkerCount = async (blockCount = MAX_WORKERS, requestedWorkerCount?: number) => {
  if (requestedWorkerCount !== undefined) {
    return Math.max(0, Math.min(MAX_WORKERS, blockCount, Math.floor(requestedWorkerCount)));
  }

  if (typeof Worker !== 'undefined') {
    return Math.min(MAX_WORKERS, blockCount, Math.max(2, navigator.hardwareConcurrency || 2));
  }

  if (typeof process !== 'undefined') {
    const os = await importNodeModule<typeof import('node:os')>('node:os');
    return Math.min(MAX_WORKERS, blockCount, Math.max(2, os.cpus().length || 2));
  }

  return 0;
};

const createWorker = async () => {
  if (typeof Worker !== 'undefined') {
    return new Worker(getBrowserWorkerUrl(), { type: 'module' }) as BrowserWorker;
  }

  if (typeof process !== 'undefined') {
    const { Worker: NodeWorker } = await importNodeModule<typeof import('node:worker_threads')>('node:worker_threads');
    return new NodeWorker(new URL(NODE_WORKER_FILE, import.meta.url), { execArgv: [] }) as unknown as WorkerLike;
  }

  throw new Error('Workers are not available');
};

export const createParallelBzip2Decoder = async (
  onOutput: (index: number, data: Uint8Array) => void | Promise<void>,
  options: ParallelBzip2Options = {}
) => {
  const workerCount = await getWorkerCount(undefined, options.workerCount);

  if (workerCount < 2) {
    return undefined;
  }

  const workers: WorkerLike[] = [];

  try {
    for (let i = 0; i < workerCount; i++) {
      workers.push(await createWorker());
    }
  } catch (e) {
    for (const worker of workers) {
      worker.terminate();
    }

    throw e;
  }

  const idleWorkers = [...workers];
  const jobs: WorkerJob[] = [];
  const activeJobs = new Map<WorkerLike, WorkerJob[]>();
  const pending: Promise<void>[] = [];
  let closed = false;

  const failJobs = (error: Error) => {
    for (const job of jobs.splice(0)) {
      job.reject(error);
    }

    for (const batch of activeJobs.values()) {
      for (const job of batch) {
        job.reject(error);
      }
    }

    activeJobs.clear();
  };

  const terminateWorkers = () => {
    for (const worker of workers) {
      worker.terminate();
    }
  };

  const closeWithError = (error: Error) => {
    if (closed) {
      return;
    }

    closed = true;
    failJobs(error);
    terminateWorkers();
  };

  const rejectBatch = (batch: WorkerJob[], error: Error) => {
    for (const job of batch) {
      job.reject(error);
    }
  };

  const pump = () => {
    if (closed) {
      return;
    }

    while (idleWorkers.length && jobs.length) {
      const worker = idleWorkers.pop();
      const firstJob = jobs.shift();

      if (!worker || !firstJob) {
        return;
      }

      const batch = [firstJob];

      while (batch.length < MAX_SEGMENTS_PER_MESSAGE && jobs.length) {
        const nextJob = jobs.shift();

        if (nextJob) {
          batch.push(nextJob);
        }
      }

      const indexes = batch.map((job) => job.index);
      const segments = batch.map((job) => job.segment.buffer);

      activeJobs.set(worker, batch);
      worker.postMessage({ indexes, segments }, segments);
    }
  };

  const handleResponse = async (worker: WorkerLike, response: WorkerResponse) => {
    const batch = activeJobs.get(worker);
    activeJobs.delete(worker);
    idleWorkers.push(worker);

    if (!batch) {
      pump();
      return;
    }

    if (response.error) {
      const error = new Error(response.error);
      rejectBatch(batch, error);
      closeWithError(error);
      return;
    }

    try {
      const outputs = response.outputs ?? [];

      if (outputs.length !== batch.length) {
        throw new Error('Worker returned wrong output count');
      }

      for (const output of outputs) {
        await onOutput(output.index, output.data);
      }

      for (const job of batch) {
        job.resolve();
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      rejectBatch(batch, error);
      closeWithError(error);
      return;
    }

    pump();
  };

  const handleError = (worker: WorkerLike, error: Error | ErrorEvent) => {
    const normalizedError = error instanceof Error ? error : new Error(error.message);
    closeWithError(normalizedError);
  };

  for (const worker of workers) {
    if ('on' in worker) {
      worker.on('message', (response) => {
        void handleResponse(worker, response);
      });
      worker.on('error', (error) => handleError(worker, error));
    } else {
      worker.onmessage = (event) => {
        void handleResponse(worker, event.data);
      };

      worker.onerror = (event) => handleError(worker, event);
    }
  }

  return {
    enqueue(index: number, segment: Uint8Array) {
      const promise = new Promise<void>((resolve, reject) => {
        if (closed) {
          reject(new Error('Decoder terminated'));
          return;
        }

        jobs.push({ index, reject, resolve, segment });
      });

      pending.push(promise);
      pump();
      return promise;
    },
    async finish() {
      await Promise.all(pending);
      closed = true;
      terminateWorkers();
    },
    terminate() {
      if (closed) {
        return;
      }

      closed = true;
      failJobs(new Error('Decoder terminated'));
      terminateWorkers();
    }
  };
};

const createWorkerGroups = (segments: Uint8Array[], workerCount: number) => {
  const groups: WorkerGroup[] = Array.from({ length: workerCount }, () => ({
    bytes: 0,
    indexes: [],
    segments: []
  }));
  const sortedSegments = segments
    .map((segment, index) => ({ index, segment }))
    .sort((left, right) => {
      return right.segment.byteLength - left.segment.byteLength;
    });

  for (const item of sortedSegments) {
    groups.sort((left, right) => left.bytes - right.bytes);
    groups[0].segments.push(item.segment);
    groups[0].indexes.push(item.index);
    groups[0].bytes += item.segment.byteLength;
  }

  return groups;
};

const runWorker = async (group: WorkerGroup) => {
  const worker = await createWorker();

  return new Promise<NonNullable<WorkerResponse['outputs']>>((resolve, reject) => {
    const handleResponse = (response: WorkerResponse) => {
      worker.terminate();

      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      resolve(response.outputs ?? []);
    };

    const handleError = (error: Error | ErrorEvent) => {
      worker.terminate();
      reject(error instanceof Error ? error : new Error(error.message));
    };

    if ('on' in worker) {
      worker.on('message', handleResponse);
      worker.on('error', handleError);
    } else {
      worker.onmessage = (event) => handleResponse(event.data);
      worker.onerror = handleError;
    }

    const segments = group.segments.map((segment) => segment.buffer);
    worker.postMessage({ indexes: group.indexes, segments }, segments);
  });
};

export const decompressParallelWasm = async (input: Uint8Array, options: ParallelBzip2Options = {}) => {
  const segments = splitBzip2Blocks(input);

  if (segments.length < MIN_PARALLEL_BLOCKS) {
    return undefined;
  }

  const workerCount = await getWorkerCount(segments.length, options.workerCount);

  if (workerCount < 2) {
    return undefined;
  }

  const groups = createWorkerGroups(segments, workerCount);
  const outputs = (await Promise.all(groups.map(runWorker))).flat().sort((left, right) => left.index - right.index);

  return outputs.map((output) => output.data);
};
