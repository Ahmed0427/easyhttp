export interface HTTPRequest {
  method: string;
  path: string;
  version: string;
  headers: Map<string, string>;
}

export function printRequest(req: HTTPRequest): void {
  const lines: string[] = [];

  lines.push(`${req.method} ${req.path} ${req.version}`);

  for (const [key, value] of req.headers) {
    lines.push(`${key}: ${value}`);
  }

  const separator = "—".repeat(Math.max(...lines.map((l) => l.length), 20));

  console.log(`\n${separator}`);
  console.log(lines.join("\n"));
  console.log(`${separator}\n`);
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

function parseRequestLine(data: Buffer): [string, Buffer, string] {
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

export function parseReqHdr(data: Buffer): HTTPRequest {
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
