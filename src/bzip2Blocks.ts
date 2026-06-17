const BLOCK_MAGIC = new Uint8Array([0x31, 0x41, 0x59, 0x26, 0x53, 0x59]);
const EOS_MAGIC = new Uint8Array([0x17, 0x72, 0x45, 0x38, 0x50, 0x90]);
const EOS_MAGIC_BITS = 0x177245385090n;

export interface BlockHit {
  bit: number;
  type: 'block' | 'eos';
}

const matchesMagic = (input: Uint8Array, byteOffset: number, shift: number, pattern: Uint8Array) => {
  if (shift === 0) {
    return (
      input[byteOffset] === pattern[0] &&
      input[byteOffset + 1] === pattern[1] &&
      input[byteOffset + 2] === pattern[2] &&
      input[byteOffset + 3] === pattern[3] &&
      input[byteOffset + 4] === pattern[4] &&
      input[byteOffset + 5] === pattern[5]
    );
  }

  const rightShift = 8 - shift;

  for (let i = 0; i < pattern.length; i++) {
    if ((((input[byteOffset + i] << shift) | (input[byteOffset + i + 1] >> rightShift)) & 0xff) !== pattern[i]) {
      return false;
    }
  }

  return true;
};

const indexMagic = (
  input: Uint8Array,
  pattern: Uint8Array,
  shift: number,
  startByte: number,
  type: BlockHit['type'],
  hits: BlockHit[]
) => {
  const p0 = pattern[0];
  const end = input.length - 5 - (shift ? 1 : 0);

  for (let i = startByte; i < end; i++) {
    const firstByte = shift === 0 ? input[i] : ((input[i] << shift) | (input[i + 1] >> (8 - shift))) & 0xff;

    if (firstByte === p0 && matchesMagic(input, i, shift, pattern)) {
      const bit = i * 8 + shift;

      if (bit >= 32) {
        hits.push({ bit, type });
      }
    }
  }
};

export const findBzip2BlockHits = (input: Uint8Array, startByte = 4) => {
  const hits: BlockHit[] = [];
  const safeStartByte = Math.max(4, startByte);

  for (let shift = 0; shift < 8; shift++) {
    indexMagic(input, BLOCK_MAGIC, shift, safeStartByte, 'block', hits);
    indexMagic(input, EOS_MAGIC, shift, safeStartByte, 'eos', hits);
  }

  hits.sort((left, right) => left.bit - right.bit);
  return hits;
};

const readBits = (input: Uint8Array, bit: number, count: number) => {
  let value = 0;

  for (let i = 0; i < count; i++) {
    const position = bit + i;
    value = value * 2 + ((input[position >> 3] >> (7 - (position & 7))) & 1);
  }

  return value >>> 0;
};

const writeBit = (output: Uint8Array, bit: number, value: number) => {
  if (value) {
    output[bit >> 3] |= 1 << (7 - (bit & 7));
  }
};

const writeBits = (output: Uint8Array, bit: number, value: number | bigint, count: number) => {
  if (typeof value === 'bigint') {
    for (let i = 0; i < count; i++) {
      writeBit(output, bit + i, Number((value >> BigInt(count - 1 - i)) & 1n));
    }

    return;
  }

  for (let i = 0; i < count; i++) {
    writeBit(output, bit + i, (value >>> (count - 1 - i)) & 1);
  }
};

export const makeBzip2BlockStream = (input: Uint8Array, startBit: number, endBit: number) => {
  const blockBits = endBit - startBit;
  const blockBytes = Math.ceil(blockBits / 8);
  const totalBits = 32 + blockBits + 48 + 32;
  const output = new Uint8Array(Math.ceil(totalBits / 8));

  output[0] = 0x42;
  output[1] = 0x5a;
  output[2] = 0x68;
  output[3] = input[3];

  const shift = startBit & 7;
  const sourceByte = startBit >> 3;

  if (shift === 0) {
    output.set(input.subarray(sourceByte, sourceByte + blockBytes), 4);
  } else {
    const rightShift = 8 - shift;

    for (let i = 0; i < blockBytes; i++) {
      output[4 + i] = ((input[sourceByte + i] << shift) | (input[sourceByte + i + 1] >> rightShift)) & 0xff;
    }
  }

  const remainingBits = blockBits & 7;

  if (remainingBits) {
    output[4 + blockBytes - 1] &= (0xff << (8 - remainingBits)) & 0xff;
  }

  const blockCrc = readBits(input, startBit + 48, 32);
  writeBits(output, 32 + blockBits, EOS_MAGIC_BITS, 48);
  writeBits(output, 32 + blockBits + 48, blockCrc, 32);

  return output;
};

export const splitBzip2Blocks = (input: Uint8Array) => {
  if (input.length < 10 || input[0] !== 0x42 || input[1] !== 0x5a || input[2] !== 0x68) {
    return [];
  }

  const hits = findBzip2BlockHits(input);
  const eos = hits.filter((hit) => hit.type === 'eos').at(-1);

  if (!eos) {
    return [];
  }

  const blocks = hits.filter((hit) => hit.type === 'block' && hit.bit < eos.bit);

  if (blocks.length < 2 || blocks[0].bit !== 32) {
    return [];
  }

  const segments: Uint8Array[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const endBit = i + 1 < blocks.length ? blocks[i + 1].bit : eos.bit;
    segments.push(makeBzip2BlockStream(input, blocks[i].bit, endBit));
  }

  return segments;
};
