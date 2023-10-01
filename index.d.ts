export interface DataCallbackParams {
  data: Uint8Array;
  done: boolean;
  progress?: number;
}

declare function decompressStream(
  url: string,
  onData: (data: DataCallbackParams) => void,
  onError: (e: string) => void
): Promise<void>;

export default decompressStream;
