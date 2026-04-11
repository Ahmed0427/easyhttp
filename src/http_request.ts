import { HTTPError, HTTPStatus } from "./http_status";

export interface HTTPRequest {
  method: string;
  path: string;
  version: string;
  headers: Map<string, string>;
}

function splitLines(data: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  while (start < data.length) {
    const end = data.indexOf("\r\n", start);
    if (end < 0) break;
    lines.push(data.subarray(start, end));
    start = end + 2;
  }
  return lines;
}

function parseRequestLine(data: Buffer): [string, string, string] {
  const firstSpace = data.indexOf(" ".charCodeAt(0));
  const secondSpace = data.indexOf(" ".charCodeAt(0), firstSpace + 1);

  if (firstSpace === -1 || secondSpace === -1) {
    throw new HTTPError(HTTPStatus.BadRequest);
  }

  const method = data.subarray(0, firstSpace).toString("ascii");
  const path = data.subarray(firstSpace + 1, secondSpace).toString("ascii");
  const version = data.subarray(secondSpace + 1).toString("ascii");

  return [method, path, version];
}

export function parseRequest(data: Buffer): HTTPRequest {
  const lines = splitLines(data);
  if (lines.length === 0) throw new HTTPError(HTTPStatus.BadRequest);

  const [method, path, version] = parseRequestLine(lines[0]);
  const headers = new Map<string, string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;

    const sep = line.indexOf(":".charCodeAt(0));
    if (sep <= 0) throw new HTTPError(HTTPStatus.BadRequest);

    const key = line.subarray(0, sep).toString("ascii").trim();
    const val = line
      .subarray(sep + 1)
      .toString("ascii")
      .trim();
    headers.set(key, val);
  }

  return { method, path, version, headers };
}

/**
 * Parses a `Range: bytes=...` header value.
 *
 * Returns:
 *   - []            — header absent or malformed (treat as full file)
 *   - [start, end]  — a normal byte range (end is exclusive)
 *   - [-1, suffix]  — a suffix range (`bytes=-N`)
 */
export function parseByteRange(
  header: string | undefined,
): [number, number] | [] {
  if (!header) return [];

  const str = header.trim();
  if (!str.startsWith("bytes=")) return [];

  const rangesStr = str.substring(6);
  if (!rangesStr) return [];

  const part = rangesStr.split(",")[0].trim();
  if (!part) return [];

  const isStrictNum = (s: string): boolean =>
    s.length > 0 && [...s].every((c) => c >= "0" && c <= "9");

  if (part.startsWith("-")) {
    const suffix = parseInt(part.slice(1), 10);
    if (!isStrictNum(part.slice(1)) || isNaN(suffix) || suffix <= 0) return [];
    return [-1, suffix];
  }

  const dashIndex = part.indexOf("-");
  if (dashIndex === -1) return [];

  const startStr = part.substring(0, dashIndex);
  const endStr = part.substring(dashIndex + 1);

  if (!isStrictNum(startStr)) return [];
  const start = parseInt(startStr, 10);
  if (isNaN(start)) return [];

  if (endStr === "") {
    return [start, Number.MAX_SAFE_INTEGER];
  }

  if (!isStrictNum(endStr)) return [];
  const end = parseInt(endStr, 10);
  if (isNaN(end) || start > end) return [];

  return [start, end + 1]; // inclusive end -> exclusive
}

export function formatRequest(req: HTTPRequest): string {
  const lines: string[] = [`${req.method} ${req.path} ${req.version}`];
  for (const [key, value] of req.headers) {
    lines.push(`${key}: ${value}`);
  }
  const width = Math.max(...lines.map((l) => l.length), 20);
  const separator = "—".repeat(width);
  return `\n${separator}\n${lines.join("\n")}\n${separator}`;
}
