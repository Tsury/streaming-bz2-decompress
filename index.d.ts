export type Awaitable<T> = T | Promise<T>;

export interface DecompressStreamCallbacks {
  onDecompressed: (id: number, data: Uint8Array, done: boolean) => Awaitable<void>;
  onError: (id: number, e: string) => Awaitable<void>;
}

export interface DecompressStreamActions {
  dataFinished: () => Promise<void>;
  addData: (data: Uint8Array) => Promise<void>;
  cancel: () => void;
}

declare function decompressStream(callbacks: DecompressStreamCallbacks): DecompressStreamActions;

export default decompressStream;
