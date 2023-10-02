export interface DecompressStreamParams {
  onDecompressed: (id: number, data: DecompressedCallbackParams) => void;
  onError: (id: number, e: string) => void;
}

export interface DataCallbackParams {
  data: Uint8Array;
  done: boolean;
}

declare function decompressStream(
  url: string,
  onData: (data: DataCallbackParams) => void,
  onError: (e: string) => void
): Promise<void>;

export default decompressStream;
