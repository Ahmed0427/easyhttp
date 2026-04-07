type HTTPRange = [number, number];

export function parseBytesRanges(r: Buffer | null): HTTPRange[] {
  if (!r) return [];

  const str = r.toString().trim();

  if (!str.startsWith("bytes=")) return [];

  const rangesStr = str.substring(6);
  if (!rangesStr) return [];

  const parts = rangesStr.split(",");
  const results: HTTPRange[] = [];

  for (const part of parts) {
    const range = part.trim();
    if (!range) return [];

    const isStrictNum = (s: string) =>
      s.length > 0 && [...s].every((c) => c >= "0" && c <= "9");

    if (range.startsWith("-")) {
      if (!isStrictNum(range.slice(1))) return [];
      const suffix = parseInt(range.slice(1), 10);
      if (isNaN(suffix) || suffix <= 0) return [];
      results.push([-1, suffix]);
      continue;
    }

    const dashIndex = range.indexOf("-");
    if (dashIndex === -1) return [];

    const startStr = range.substring(0, dashIndex);
    const endStr = range.substring(dashIndex + 1);

    if (!isStrictNum(startStr)) return [];
    const start = parseInt(startStr, 10);
    if (isNaN(start)) return [];

    if (endStr === "") {
      results.push([start, Number.MAX_SAFE_INTEGER]);
    } else {
      if (!isStrictNum(endStr)) return [];
      const end = parseInt(endStr, 10);

      if (isNaN(end) || start > end) return [];

      results.push([start, end + 1]);
    }
  }

  return results;
}
