import { Connetion } from "./connection";
import { HTTPStatus } from "./http_status";
import { Reader } from "./reader";

export interface HTTPResponse {
  status: HTTPStatus;
  headers: Map<string, string>;
}

function encodeResponse(resp: HTTPResponse): Buffer {
  const version = "HTTP/1.1";
  const { code, message } = resp.status;

  // status line: "HTTP/1.1" + " " + "200" + " " + "OK" + "\r\n"
  let size =
    version.length + 1 + code.toString().length + 1 + message.length + 2;

  // headers: "key: value\r\n" for each
  resp.headers.forEach((val, key) => {
    size += key.length + 2 + val.length + 2; // ": " and "\r\n"
  });

  // final empty line to end headers: "\r\n"
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

  if (reader.isRange) {
    const val = `bytes ${reader.startRange}-${reader.endRange - 1}/${reader.size}`;
    resp.headers.set("Content-Range", val);
    resp.status = HTTPStatus.PartialContent;
  } else if (reader.isOutOfRange) {
    resp.headers.set("Content-Range", `bytes */${reader.size}`);
    resp.status = HTTPStatus.RangeNotSatisfiable;
  }

  const headerBuf = encodeResponse(resp);
  await conn.write(headerBuf);

  for (;;) {
    let data = await reader.read();
    if (data.length === 0) break;
    await conn.write(data);
  }
}
