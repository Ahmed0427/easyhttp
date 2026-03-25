import { HTTPRequest } from "./http_request";

export type BodyReader = {
  length: number; // -1 if unknown (chunked)
  read: () => Promise<Buffer>; // returns 0-length Buffer on EOF
};

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
    req.headers.get("Transfer-Encoding")?.equals("chunked") || false;

  if (!bodyAllowed && (bodyLen > 0 || chunked)) {
    throw new HTTPError(HTTPStatus.BadRequest);
  }

  if (!bodyAllowed) {
    bodyLen = 0;
  }

  if (bodyLen >= 0) {
    return readerFromConnLength(conn, buf, bodyLen);
  } else if (chunked) {
    throw new HTTPError(HTTPStatus.NotImplemented);
  } else {
    throw new HTTPError(HTTPStatus.NotImplemented);
  }
}

function readerFromConnLength(
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
        const data = await conn.read();
        buf.push(data);

        if (data.length === 0) {
          throw new Error("Unexpected EOF from HTTP body");
        }
      }

      const consume = Math.min(buf.length, remain);

      remain -= consume;

      const data = Buffer.from(buf.view.subarray(0, consume));
      buf.pop(consume);

      return data;
    },
  };
}
