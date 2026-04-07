import * as fs from "fs/promises";
import { HTTPRequest } from "./http_request";
import { HTTPError, HTTPStatus } from "./http_status";
import { BufferGenerator, readChunks } from "./buffer_generator";

export interface BodyReader {
  startRange: number; // if it is range reponse
  endRange: number; // if it is range reponse
  size: number; // if it is range reponse
  isRange: boolean; // if it is range reponse
  length: number; // -1 if unknown (chunked)
  read: () => Promise<Buffer>; // returns 0-length Buffer on EOF
  close?: () => Promise<void>; // optional cleanup to release file handles.
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
          throw new HTTPError(HTTPStatus.BadRequest);
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

export async function readerFromFile(
  path: string,
  start: number,
  end: number, // exclusive btw
): Promise<BodyReader> {
  let f: fs.FileHandle | null = null;
  const isSuffixRange = start === -1;
  start = Math.max(0, start);
  let offset = start;
  let got = 0;
  const buf = Buffer.allocUnsafe(65536);

  try {
    f = await fs.open(path, "r");
    const stat = await f.stat();

    if (!stat.isFile()) {
      throw new HTTPError(HTTPStatus.BadRequest);
    }

    const fileSize = stat.size;

    if (start >= fileSize || start < 0) {
      throw new HTTPError(HTTPStatus.RangeNotSatisfiable, fileSize);
    }

    let actualEnd = Math.min(end, fileSize);

    if (isSuffixRange) {
      actualEnd = fileSize;
      start = Math.max(fileSize - end, 0);
      offset = start;
    }

    let isRange = end !== Number.MAX_SAFE_INTEGER;
    isRange |= start !== 0;

    const contentLength = actualEnd - start;

    const handle = f;

    end = actualEnd;
    const reader: BodyReader = {
      length: contentLength,
      isRange: isRange,
      endRange: end,
      startRange: start,
      size: fileSize,
      read: async (): Promise<Buffer> => {
        if (got >= contentLength) {
          return Buffer.alloc(0); // EOF
        }

        const maxRead = Math.min(buf.length, contentLength - got);
        const res = await handle.read({
          buffer: buf,
          position: offset,
          length: maxRead,
        });

        if (res.bytesRead === 0) {
          throw new HTTPError(HTTPStatus.InternalServerError);
        }

        offset += res.bytesRead;
        got += res.bytesRead;

        return buf.subarray(0, res.bytesRead);
      },
      close: async () => {
        await handle.close();
      },
    };

    f = null;
    return reader;
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new HTTPError(HTTPStatus.NotFound);
    } else throw new HTTPError(HTTPStatus.InternalServerError);
  } finally {
    await f?.close();
  }
}
