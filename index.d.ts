declare function decompressStream(
  url: string,
  onData: (data: { data: Uint8Array; done: boolean }) => void,
  onError: (e: string) => void
): Promise<void>;

export default decompressStream;