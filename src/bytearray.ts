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

  get capacity(): number {
    return this.buffer.length;
  }

  get view(): Buffer {
    return this.buffer.subarray(this.head, this.tail);
  }

  push(src: Buffer): void {
    if (src.length === 0) return;

    this.ensureCapacity(src.length);
    src.copy(this.buffer, this.tail);
    this.tail += src.length;
  }

  pop(n: number): Buffer {
    const amount = Math.max(0, Math.min(n, this.length));
    if (amount === 0) return Buffer.allocUnsafe(0);

    const result = Buffer.from(
      this.buffer.subarray(this.head, this.head + amount),
    );
    this.head += amount;

    if (this.head === this.tail) {
      this.head = 0;
      this.tail = 0;
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
  }

  toString(encoding: BufferEncoding = "utf8"): string {
    return this.buffer.toString(encoding, this.head, this.tail);
  }

  private ensureCapacity(required: number): void {
    const totalFree = this.buffer.length - this.length;
    const endFree = this.buffer.length - this.tail;

    if (totalFree >= required && endFree < required) {
      this.compact();
      return;
    }

    if (totalFree < required) {
      this.resize(required);
    }
  }

  private compact(): void {
    if (this.head === 0) return;
    this.buffer.copyWithin(0, this.head, this.tail);
    this.tail = this.length;
    this.head = 0;
  }

  private resize(required: number): void {
    const newCapacity = Math.max(
      this.buffer.length * 2,
      this.length + required,
    );
    const newBuffer = Buffer.allocUnsafe(newCapacity);
    this.buffer.copy(newBuffer, 0, this.head, this.tail);
    this.buffer = newBuffer;
    this.tail = this.length;
    this.head = 0;
  }
}
