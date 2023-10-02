export interface DecompressStreamCallbacks {
  onDecompressed: (id: number, data: DecompressedCallbackParams) => void;
  onError: (id: number, e: string) => void;
}

export interface DecompressStreamActions {
  onDataFinished: () => void;
  onCompressedData: (data: Uint8Array) => void;
  cancel: () => void;
}

declare function decompressStream(callbacks: DecompressStreamCallbacks): void;

export default decompressStream;
