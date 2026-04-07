import { Connetion } from "./connection";
import { HTTPStatus } from "./http_status";
import { BodyReader } from "./bodyreader";

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
  body: BodyReader,
): Promise<void> {
  if (typeof body.length !== "number" || body.length < 0) {
    resp.headers.set("Transfer-Encoding", "chunked");
  } else {
    resp.headers.set("Content-Length", body.length.toString());
  }

  if (body.isRange) {
    resp.headers.set(
      "Content-Range",
      `bytes ${body.startRange}-${body.endRange - 1}/${body.size}`,
    );
    resp.status = HTTPStatus.PartialContent;
  }

  const headerBuf = encodeResponse(resp);
  await conn.write(headerBuf);

  const crnl = Buffer.from("\r\n");
  for (let done = false; !done; ) {
    let data = await body.read();
    if (data.length === 0) {
      done = true;
    }
    if (resp.headers.get("Transfer-Encoding") === "chunked") {
      const separator = Buffer.from("\r\n");
      const sizeHex = Buffer.from(data.length.toString(16));
      data = Buffer.concat([sizeHex, separator, data, separator]);
    }
    if (data.length > 0) {
      await conn.write(data);
    }
  }
}
