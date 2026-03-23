export class ByteArray {
  data: Buffer;
  len: number;

  constructor(len: number, cap: number) {
    console.assert(len <= cap);
    this.data = Buffer.alloc(cap);
    this.len = len;
  }

  push(buf: Buffer): void {
    let newLen = buf.length + this.len;
    let currentCap = Math.max(1, this.data.length);

    if (newLen > currentCap) {
      while (newLen > currentCap) {
        currentCap *= 2;
      }
      let newBuf = Buffer.alloc(currentCap);
      this.data.copy(newBuf);
      this.data = newBuf;
    }
    buf.copy(this.data, this.len);
    this.len = newLen;
  }

  pop(len: number): void {
    this.data.copyWithin(0, len, this.data.length);
    this.len -= len;
  }
}
