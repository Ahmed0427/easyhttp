import * as fs from "fs/promises";
import { HTTPError, HTTPStatus } from "./http_status";

export interface Reader {
  readonly length: number; // bytes to send; 0 for out-of-range
  readonly size?: number; // full file size
  readonly endRange?: number; // exclusive
  readonly startRange?: number;
  readonly isRange?: boolean;
  readonly isOutOfRange?: boolean;

  read(): Promise<Buffer>; // returns 0-length Buffer on EOF
  close(): Promise<void>;
}

const READ_BUFFER_SIZE = 65_536;

/**
 * opens `path` and returns a reader scoped to [start, end).
 *
 * special values:
 *   - start === -1             - suffix range; `end` is the suffix length
 *   - end === MAX_SAFE_INTEGER - read to end of file
 */
export async function readerFromFile(
  path: string,
  start: number,
  end: number,
): Promise<Reader> {
  let handle: fs.FileHandle | null = null;

  try {
    handle = await fs.open(path, "r");
    const stat = await handle.stat();

    if (!stat.isFile()) {
      throw new HTTPError(HTTPStatus.BadRequest);
    }

    const fileSize = stat.size;
    const isSuffixRange = start === -1;

    if (isSuffixRange) {
      const suffixLen = end;
      start = Math.max(fileSize - suffixLen, 0);
      end = fileSize;
    }

    if (start >= fileSize || start < 0) {
      await handle.close();
      return outOfRangeReader(fileSize);
    }

    const actualEnd = Math.min(end, fileSize);
    const isRange = end !== Number.MAX_SAFE_INTEGER || start !== 0;
    const contentLength = actualEnd - start;

    const reader = fileRangeReader(
      handle,
      start,
      actualEnd,
      contentLength,
      isRange,
      fileSize,
    );

    handle = null; // ownership transferred to reader
    return reader;
  } catch (e: unknown) {
    await handle?.close();

    if (e instanceof HTTPError) throw e;

    if (isNodeError(e) && e.code === "ENOENT") {
      throw new HTTPError(HTTPStatus.NotFound);
    }

    throw new HTTPError(HTTPStatus.InternalServerError);
  }
}

function outOfRangeReader(fileSize: number): Reader {
  return {
    isOutOfRange: true,
    size: fileSize,
    length: 0,
    read: async () => Buffer.alloc(0),
    close: async () => {},
  };
}

function fileRangeReader(
  handle: fs.FileHandle,
  start: number,
  end: number,
  contentLength: number,
  isRange: boolean,
  fileSize: number,
): Reader {
  const buf = Buffer.allocUnsafe(READ_BUFFER_SIZE);
  let offset = start;
  let got = 0;

  return {
    length: contentLength,
    isRange,
    startRange: start,
    endRange: end,
    size: fileSize,

    read: async (): Promise<Buffer> => {
      if (got >= contentLength) return Buffer.alloc(0);

      const maxRead = Math.min(buf.length, contentLength - got);
      const result = await handle.read({
        buffer: buf,
        position: offset,
        length: maxRead,
      });

      if (result.bytesRead === 0) {
        throw new HTTPError(HTTPStatus.InternalServerError);
      }

      offset += result.bytesRead;
      got += result.bytesRead;
      return buf.subarray(0, result.bytesRead);
    },

    close: async () => {
      await handle.close();
    },
  };
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}
