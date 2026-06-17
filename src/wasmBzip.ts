import loadBzip2Wasm from './bzip2WasmLoader.js';
import { BZIP2_WASM_BASE64 } from './bzip2WasmBinary.js';

const ERROR_MESSAGES: { [key: number]: string } = {
  [-2]: 'BZ_PARAM_ERROR',
  [-3]: 'BZ_MEM_ERROR',
  [-4]: 'BZ_DATA_ERROR',
  [-5]: 'BZ_DATA_ERROR_MAGIC',
  [-7]: 'BZ_UNEXPECTED_EOF',
  [-8]: 'BZ_OUTBUFF_FULL'
};

type Bzip2WasmModule = Awaited<ReturnType<typeof loadBzip2Wasm>>;

let wasmModulePromise: Promise<Bzip2WasmModule> | undefined;
let sourcePtr = 0;
let sourceCapacity = 0;
let destPtr = 0;
let destCapacity = 0;
let destLengthPtr = 0;

const decodeBase64 = (value: string) => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  const BufferCtor = (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer;

  if (BufferCtor) {
    return new Uint8Array(BufferCtor.from(value, 'base64'));
  }

  throw new Error('No base64 decoder available for bzip2 wasm');
};

const getWasmModule = () => {
  if (typeof process !== 'undefined') {
    (globalThis as typeof globalThis & { __dirname?: string }).__dirname ??= '';
  }

  wasmModulePromise ??= loadBzip2Wasm({ wasmBinary: decodeBase64(BZIP2_WASM_BASE64) });
  return wasmModulePromise;
};

const ensureWasmBuffers = (module: Bzip2WasmModule, sourceLength: number, destLength: number) => {
  if (sourceCapacity < sourceLength) {
    if (sourcePtr) {
      module._free(sourcePtr);
    }

    sourcePtr = module._malloc(sourceLength);
    sourceCapacity = sourceLength;
  }

  if (destCapacity < destLength) {
    if (destPtr) {
      module._free(destPtr);
    }

    destPtr = module._malloc(destLength);
    destCapacity = destLength;
  }

  if (!destLengthPtr) {
    destLengthPtr = module._malloc(4);
  }
};

export const decompressWasm = async (compressed: Uint8Array, decompressedLength: number) => {
  return decompressWasmChunks([compressed], compressed.length, decompressedLength);
};

export const decompressWasmChunks = async (
  compressedChunks: Uint8Array[],
  compressedLength: number,
  decompressedLength: number
) => {
  const module = await getWasmModule();
  ensureWasmBuffers(module, compressedLength, decompressedLength);

  let sourceOffset = sourcePtr;

  for (const chunk of compressedChunks) {
    module.HEAPU8.set(chunk, sourceOffset);
    sourceOffset += chunk.byteLength;
  }

  module.setValue(destLengthPtr, decompressedLength, 'i32');

  const returnValue = module._BZ2_bzBuffToBuffDecompress(destPtr, destLengthPtr, sourcePtr, compressedLength, 0, 0);

  if (returnValue !== 0) {
    throw new Error(ERROR_MESSAGES[returnValue] || `BZ_UNKNOWN_ERROR_${returnValue}`);
  }

  const actualLength = module.getValue(destLengthPtr, 'i32');
  const output = new Uint8Array(actualLength);
  output.set(module.HEAPU8.subarray(destPtr, destPtr + actualLength));

  return output;
};
