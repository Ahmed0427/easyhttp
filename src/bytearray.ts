export class ByteArray {
  buf: Buffer;
  len: number;

  constructor(len: number, cap: number) {
    console.assert(len <= cap);
    this.buf = Buffer.alloc(cap);
    this.len = len;
  }

  push(data: Buffer): void {
    let newLen = data.length + this.len;
    let currentCap = this.buf.length;

    if (newLen > currentCap) {
      while (newLen > currentCap) {
        currentCap *= 2;
      }
      let newBuf = Buffer.alloc(currentCap);
      this.buf.copy(newBuf);
      this.buf = newBuf;
    }
    data.copy(this.buf, this.len);
    this.len = newLen;
  }
}
