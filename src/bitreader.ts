export const BITMASK = new Uint32Array(32);

for (let i = 0; i < BITMASK.length; i++) {
  BITMASK[i] = 2 ** i - 1;
}

class BitReader {
  input: Uint8Array;
  pos: number;
  bitBuffer: number;
  bitCount: number;

  // offset in bytes
  constructor(input: Uint8Array, pos: number) {
    this.input = input;
    this.pos = pos;
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  // reads bits from the buffer
  read(bits: number): number {
    if (bits === 32) {
      return ((this.read(16) << 16) | this.read(16)) >>> 0;
    }

    while (this.bitCount < bits) {
      this.bitBuffer = ((this.bitBuffer << 8) | this.input[this.pos++]) >>> 0;
      this.bitCount += 8;
    }

    this.bitCount -= bits;
    const result = (this.bitBuffer >>> this.bitCount) & BITMASK[bits];
    this.bitBuffer &= BITMASK[this.bitCount];
    return result;
  }

  eof() {
    return this.bitCount === 0 && this.pos >= this.input.length;
  }

  // reads 6 bytes worth of data using the read method
  pi() {
    return this.read(24) * 0x1000000 + this.read(24);
  }
}

export default BitReader;
