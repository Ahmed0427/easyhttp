export class ByteArray {
  private buffer: Buffer;
  private head = 0;
  private tail = 0;

  constructor(initialCapacity = 1024) {
    this.buffer = Buffer.allocUnsafe(initialCapacity);
  }

  get length(): number {
    return this.tail - this.head;
  }

  get view(): Buffer {
    return this.buffer.subarray(this.head, this.tail);
  }

  push(src: Buffer): void {
    const required = this.tail + src.length;

    if (required > this.buffer.length) {
      this.ensureCapacity(src.length);
    }

    src.copy(this.buffer, this.tail);
    this.tail += src.length;
  }

  pop(n: number): Buffer {
    const amount = Math.min(n, this.length);
    const result = this.buffer.subarray(this.head, this.head + amount);
    this.head += amount;

    if (this.head === this.tail) {
      this.head = 0;
      this.tail = 0;
    }
    return result;
  }

  private ensureCapacity(addedLen: number): void {
    const currentLen = this.length;

    if (this.buffer.length >= currentLen + addedLen) {
      this.buffer.copyWithin(0, this.head, this.tail);
    } else {
      const newCap = Math.max(this.buffer.length * 2, currentLen + addedLen);
      const newBuf = Buffer.allocUnsafe(newCap);
      this.buffer.copy(newBuf, 0, this.head, this.tail);
      this.buffer = newBuf;
    }

    this.tail = currentLen;
    this.head = 0;
  }

  toString(): string {
    return this.buffer.toString("utf8", this.head, this.tail);
  }
}
