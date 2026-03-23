import { expect, test, describe } from "bun:test";
import { ByteArray } from "../src/bytearray";

describe("ByteArray", () => {
  test("should initialize with correct length", () => {
    const buf = new ByteArray(0, 10);
    expect(buf.len).toBe(0);
    expect(buf.data.length).toBe(10);
  });

  test("should grow when data exceeds capacity", () => {
    const buf = new ByteArray(0, 2);
    const data = Buffer.from("hello world");
    buf.push(data);

    expect(buf.len).toBe(11);
    expect(buf.data.length).toBeGreaterThanOrEqual(11);
    expect(buf.data.subarray(0, 11).toString()).toBe("hello world");
  });

  test("should append multiple buffers correctly", () => {
    const buf = new ByteArray(0, 5);
    buf.push(Buffer.from("abc"));
    buf.push(Buffer.from("def"));
    expect(buf.data.subarray(0, 6).toString()).toBe("abcdef");
  });

  test("should handle pop and capacity of zero correctly", () => {
    const buf = new ByteArray(0, 0);
    buf.push(Buffer.from("abc"));
    buf.push(Buffer.from("def"));
    expect(buf.data.subarray(0, 6).toString()).toBe("abcdef");
    expect(buf.len).toBe(6);
    buf.pop(3);
    expect(buf.data.subarray(0, 3).toString()).toBe("def");
    expect(buf.len).toBe(3);
  });
});
