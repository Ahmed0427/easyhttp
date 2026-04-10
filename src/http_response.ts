import { Connection } from "./connection";
import { HTTPError, HTTPStatus, HTTPStatusType } from "./http_status";
import { Reader } from "./reader";

export interface HTTPResponse {
  status: HTTPStatusType;
  headers: Map<string, string>;
}

function encodeResponse(resp: HTTPResponse): Buffer {
  const version = "HTTP/1.1";
  const { code, message } = resp.status;

  // pre-calculate exact buffer size to avoid reallocations.
  // status line: "HTTP/1.1 200 OK\r\n"
  let size =
    version.length + 1 + code.toString().length + 1 + message.length + 2;

  // headers: "Key: value\r\n"
  resp.headers.forEach((val, key) => {
    size += key.length + 2 + val.length + 2;
  });

  // blank line terminating headers
  size += 2;

  const buf = Buffer.alloc(size);
  let offset = 0;

  offset += buf.write(`${version} ${code} ${message}\r\n`, offset);
  resp.headers.forEach((val, key) => {
    offset += buf.write(`${key}: ${val}\r\n`, offset);
  });
  buf.write("\r\n", offset);

  return buf;
}

export async function writeResponse(
  conn: Connection,
  resp: HTTPResponse,
  reader: Reader,
): Promise<void> {
  resp.headers.set("Content-Length", reader.length.toString());

  if (reader.isOutOfRange) {
    resp.headers.set("Content-Range", `bytes */${reader.size}`);
    resp.status = HTTPStatus.RangeNotSatisfiable;
  } else if (reader.isRange) {
    const rng = `bytes ${reader.startRange}-${(reader.endRange ?? 1) - 1}/${reader.size}`;
    resp.headers.set("Content-Range", rng);
    resp.status = HTTPStatus.PartialContent;
  }

  await conn.write(encodeResponse(resp));

  for (;;) {
    const data = await reader.read();
    if (data.length === 0) break;
    await conn.write(data);
  }
}

export async function writeErrorResponse(
  conn: Connection,
  status: HTTPStatusType,
): Promise<void> {
  const body = status.message;
  const lines = [
    `HTTP/1.1 ${status.code} ${status.message}\r\n`,
    `Connection: close\r\n`,
    `Content-Type: text/plain\r\n`,
    `Content-Length: ${body.length}\r\n`,
    `\r\n`,
    body,
  ].join("");

  await conn.write(Buffer.from(lines)).catch(() => {});
}
