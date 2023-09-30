import Stream from './stream.js';

const BITMASK = [0x00, 0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff];

class BitReader {
  stream: Stream;
  bitOffset: number;
  curByte: number;
  hasByte: boolean;

  // offset in bytes
  constructor(stream: Stream) {
    this.stream = stream;
    this.bitOffset = 0;
    this.curByte = 0;
    this.hasByte = false;
  }

  _ensureByte = () => {
    if (!this.hasByte) {
      this.curByte = this.stream.readByte();
      this.hasByte = true;
    }
  };

  // reads bits from the buffer
  read = (bits: number) => {
    let result = 0;

    while (bits > 0) {
      this._ensureByte();
      const remaining = 8 - this.bitOffset;

      // if we're in a byte
      if (bits >= remaining) {
        result <<= remaining;
        result |= BITMASK[remaining] & this.curByte;
        this.hasByte = false;
        this.bitOffset = 0;
        bits -= remaining;
      } else {
        result <<= bits;
        const shift = remaining - bits;
        result |= (this.curByte & (BITMASK[bits] << shift)) >> shift;
        this.bitOffset += bits;
        bits = 0;
      }
    }

    return result;
  };

  // seek to an arbitrary point in the buffer (expressed in bits)
  // seek = (pos: number) => {
  //   const n_bit = pos % 8;
  //   const n_byte = (pos - n_bit) / 8;
  //   this.bitOffset = n_bit;
  //   this.stream.seek(n_byte);
  //   this.hasByte = false;
  // };

  // reads 6 bytes worth of data using the read method
  pi = () => {
    const buf = new Uint8Array(6);

    for (let i = 0; i < buf.length; i++) {
      buf[i] = this.read(8);
    }

    return bufToHex(buf);
  };
}

const bufToHex = (buf: Uint8Array) => Array.prototype.map.call(buf, (x) => ('00' + x.toString(16)).slice(-2)).join('');

export default BitReader;

