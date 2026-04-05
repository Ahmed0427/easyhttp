import { HTTPRequest } from "./http_request";
import { HTTPError, HTTPStatus } from "./http_status";
import { BufferGenerator, readChunks } from "./buffer_generator";

export interface BodyReader {
  length: number; // -1 if unknown (chunked)
  read: () => Promise<Buffer>; // returns 0-length Buffer on EOF
}

export function readerFromReq(
  conn: Connection,
  buf: ByteArray,
  req: HTTPRequest,
): BodyReader {
  let bodyLen = -1;
  const contentLen = req.headers.get("Content-Length");
  if (contentLen) {
    bodyLen = parseInt(contentLen);
    if (isNaN(bodyLen)) {
      throw new HTTPError(HTTPStatus.BadRequest);
    }
  }
  const bodyAllowed = !(req.method === "GET" || req.method === "HEAD");

  const chunked =
    req.headers.get("Transfer-Encoding")?.toLowerCase() === "chunked";

  if (!bodyAllowed && (bodyLen > 0 || chunked)) {
    throw new HTTPError(HTTPStatus.BadRequest);
  }

  if (!bodyAllowed) {
    bodyLen = 0;
  }

  if (bodyLen >= 0) {
    return readerFromContentLength(conn, buf, bodyLen);
  } else if (chunked) {
    return readerFromGenerator(readChunks(conn, buf));
  } else {
    throw new HTTPError(HTTPStatus.NotImplemented);
  }
}

function readerFromContentLength(
  conn: Connection,
  buf: ByteArray,
  remain: number,
): BodyReader {
  return {
    length: remain,
    read: async (): Promise<Buffer> => {
      if (remain === 0) {
        return Buffer.from("");
      }

      if (buf.length === 0) {
        let data = await conn.read();
        buf.push(data);

        if (data.length === 0) {
          throw new Error("Unexpected EOF from HTTP body");
        }
      }

      const consume = Math.min(buf.length, remain);

      remain -= consume;

      let data = Buffer.from(buf.view.subarray(0, consume));
      buf.pop(consume);

      return data;
    },
  };
}

export function readerFromMemory(buf: Buffer): BodyReader {
  let done = false;
  return {
    length: buf.length,
    read: async (): Promise<Buffer> => {
      if (done) {
        return Buffer.from("");
      } else {
        done = true;
        return buf;
      }
    },
  };
}

export function readerFromGenerator(gen: BufferGenerator): BodyReader {
  let done = false;
  return {
    length: -1,
    read: async (): Promise<Buffer> => {
      let y = await gen.next();
      if (y.done) return Buffer.from("");
      else return y.value;
    },
  };
}
