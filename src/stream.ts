/* very simple input/output stream interface */
class Stream {
  pos: number;
  buffer: Uint8Array;

  constructor() {
    this.pos = 0;
    this.buffer = new Uint8Array(0);
  }

  // input streams //////////////
  /** Returns the next byte, or -1 for EOF. */
  readByte = (): number => {
    throw new Error('abstract method readByte() not implemented');
  };

  /** Attempts to fill the buffer; returns number of bytes read, or
   *  -1 for EOF. */
  read = (buffer: Uint8Array, bufOffset: number, length: number) => {
    let bytesRead = 0;

    while (bytesRead < length) {
      const c = this.readByte();

      if (c < 0) {
        // EOF
        return bytesRead === 0 ? -1 : bytesRead;
      }

      buffer[bufOffset++] = c;
      bytesRead++;
    }

    return bytesRead;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  seek = (_pos: number): void => {
    throw new Error('abstract method seek() not implemented');
  };

  eof = (): boolean => {
    throw new Error('abstract method eof() not implemented');
  };

  // output streams ///////////
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  writeByte = (_byte: number): void => {
    throw new Error('abstract method readByte() not implemented');
  };

  getBuffer = (): Uint8Array => {
    throw new Error('abstract method getBuffer() not implemented');
  };

  write = (buffer: Uint8Array, bufOffset: number, length: number) => {
    for (let i = 0; i < length; i++) {
      this.writeByte(buffer[bufOffset++]);
    }

    return length;
  };

  flush = () => {};
}

export default Stream;

