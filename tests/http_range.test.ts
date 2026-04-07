import { expect, test, describe } from "bun:test";
import { parseBytesRanges } from "../src/http_ranges";

describe("parseBytesRanges", () => {
  const toBuf = (str: string | null) =>
    str === null ? null : Buffer.from(str);

  test("Valid Single Ranges", () => {
    expect(parseBytesRanges(toBuf("bytes=0-0"))).toEqual([[0, 1]]);
    expect(parseBytesRanges(toBuf("bytes=10-"))).toEqual([
      [10, Number.MAX_SAFE_INTEGER],
    ]);
    expect(parseBytesRanges(toBuf("bytes=-10"))).toEqual([[-1, 10]]);
  });

  test("Valid Multiple Ranges", () => {
    expect(parseBytesRanges(toBuf("bytes=0-5,8-13"))).toEqual([
      [0, 6],
      [8, 14],
    ]);
    expect(parseBytesRanges(toBuf("bytes=0-0,-100,20-"))).toEqual([
      [0, 1],
      [-1, 100],
      [20, Number.MAX_SAFE_INTEGER],
    ]);
  });

  test("Invalid Syntax (Returns empty array to ignore header)", () => {
    expect(parseBytesRanges(null)).toBeEmpty();
    expect(parseBytesRanges(toBuf("1-2"))).toBeEmpty();
    expect(parseBytesRanges(toBuf("bytes=foobar"))).toBeEmpty();
    expect(parseBytesRanges(toBuf("bytes=--1"))).toBeEmpty();
    expect(parseBytesRanges(toBuf("bytes=-0"))).toBeEmpty();
    expect(parseBytesRanges(toBuf("bytes=-0xx"))).toBeEmpty();
  });

  test("Logical Errors (Returns empty array to ignore header)", () => {
    expect(parseBytesRanges(toBuf("bytes=4-3"))).toBeEmpty();
    expect(parseBytesRanges(toBuf("bytes=70-60"))).toBeEmpty();
  });

  test("Malformed Multi-ranges", () => {
    expect(parseBytesRanges(toBuf("bytes=0-5, 4-3"))).toBeEmpty();
    expect(parseBytesRanges(toBuf("bytes=0-5, , 10-12"))).toBeEmpty();
  });

  test("Whitespace Resiliency", () => {
    expect(parseBytesRanges(toBuf("bytes=  0-5 ,  10-15  "))).toEqual([
      [0, 6],
      [10, 16],
    ]);
  });
});
