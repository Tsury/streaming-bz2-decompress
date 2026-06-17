declare module '@digitaldefiance/bzip2-wasm/bzip2-1.0.8/bzip2.mjs' {
  interface Bzip2WasmModule {
    HEAPU8: Uint8Array;
    _BZ2_bzBuffToBuffDecompress(
      destPtr: number,
      destLengthPtr: number,
      sourcePtr: number,
      sourceLength: number,
      small: number,
      verbosity: number
    ): number;
    _free(ptr: number): void;
    _malloc(size: number): number;
    getValue(ptr: number, type: string): number;
    setValue(ptr: number, value: number, type: string): void;
  }

  interface Bzip2WasmOptions {
    wasmBinary?: Uint8Array;
  }

  const loadBzip2Wasm: (options?: Bzip2WasmOptions) => Promise<Bzip2WasmModule>;
  export default loadBzip2Wasm;
}
