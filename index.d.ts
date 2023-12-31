export interface DecompressStreamCallbacks {
  onDecompressed: (id: number, data: Uint8Array, done: boolean) => void;
  onError: (id: number, e: string) => void;
}

export interface DecompressStreamActions {
  dataFinished: () => void;
  addData: (data: Uint8Array) => void;
  cancel: () => void;
}

declare function decompressStream(callbacks: DecompressStreamCallbacks): DecompressStreamActions;

export default decompressStream;
