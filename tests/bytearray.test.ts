import { expect, test, describe } from "bun:test";
import { ByteArray } from "../src/bytearray";

describe("ByteArray", () => {
  test("initializes with zero length", () => {
    const buf = new ByteArray(10);
    expect(buf.length).toBe(0);
  });

  test("grows dynamically when capacity is exceeded", () => {
    const buf = new ByteArray(4);
    buf.push(Buffer.from("1234"));
    buf.push(Buffer.from("56"));
    expect(buf.length).toBe(6);
    expect(buf.toString()).toBe("123456");
  });

  test("pop returns a correct subarray view", () => {
    const buf = new ByteArray(16);
    buf.push(Buffer.from("hello world"));
    const slice = buf.pop(5);
    expect(slice.toString()).toBe("hello");
    expect(buf.length).toBe(6);
    expect(buf.toString()).toBe(" world");
  });

  test("resets pointers to zero when fully drained", () => {
    const buf = new ByteArray(10);
    buf.push(Buffer.from("test"));
    buf.pop(4);
    expect(buf.length).toBe(0);

    buf.push(Buffer.from("a"));
    expect(buf.toString()).toBe("a");
  });

  test("shifts data internally instead of growing when space allows", () => {
    const buf = new ByteArray(10);
    buf.push(Buffer.from("01234567")); // tail at 8
    buf.pop(4); // head at 4, length is 4

    // remaining space at end is 2 bytes.
    // pushing 4 bytes should trigger a shift (copywithin) rather than a resize
    // because total capacity (10) >= current length (4) + new data (4).

    buf.push(Buffer.from("8901"));
    expect(buf.length).toBe(8);
    expect(buf.toString()).toBe("45678901");
  });
});
