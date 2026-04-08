import * as fs from "fs/promises";
import { HTTPRequest } from "./http_request";
import { HTTPError, HTTPStatus } from "./http_status";

export interface Reader {
  startRange?: number;
  endRange?: number;
  size?: number;
  isRange?: boolean;
  isOutOfRange?: boolean;

  length: number; // -1 if unknown (chunked)
  read: () => Promise<Buffer>; // returns 0-length Buffer on EOF
  close?: () => Promise<void>; // optional cleanup to release file handles.
}

export async function readerFromFile(
  path: string,
  start: number,
  end: number, // exclusive btw
): Promise<Reader> {
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
      // HTTPStatus.RangeNotSatisfiable;
      const reader: Reader = {
        isOutOfRange: true,
        size: fileSize,
        length: 0,
        read: async (): Promise<Buffer> => {
          return Buffer.alloc(0);
        },
        close: async () => {},
      };
      return reader;
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
    const reader: Reader = {
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
    } else if (!(e instanceof HTTPError)) {
      throw new HTTPError(HTTPStatus.InternalServerError);
    } else {
      throw e;
    }
  } finally {
    await f?.close();
  }
}
