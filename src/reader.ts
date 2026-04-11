import * as fs from "fs/promises";
import * as path from "path";
import { HTTPError, HTTPStatus } from "./http_status";
import { logger } from "./logger";
import { getMimeType } from "./mime_type";

export interface Reader {
  readonly length: number; // bytes to send; 0 for out-of-range
  readonly size?: number; // full file size
  readonly endRange?: number; // exclusive
  readonly startRange?: number;
  readonly contentType?: string;
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
  resolvedPath: string,
  reqPath: string,
  start: number,
  end: number,
): Promise<Reader> {
  let handle: fs.FileHandle | null = null;

  try {
    handle = await fs.open(resolvedPath, "r");
    const stat = await handle.stat();

    if (!stat.isFile()) {
      await handle.close();

      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      const listItems = entries
        .map((item) => {
          const isDir = item.isDirectory();
          const suffix = isDir ? "/" : "";
          const nameWithSuffix = `${item.name}${suffix}`;
          const hrefPath = path.join(reqPath, item.name);
          const cls = `class="${isDir ? "dir" : "file"}`;
          return `<li ${cls} "><a href="${hrefPath}">${nameWithSuffix}</a></li>`;
        })
        .join("");

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Index of ${reqPath}</title>
        </head>
        <body>
          <h1>Index of ${reqPath}</h1>
          <ul>
            ${listItems}
          </ul>
        </body>
        </html>
      `;

      return dirListingReader(Buffer.from(html));
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
      resolvedPath,
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

    logger.error(e.message);
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
  filePath: string,
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
    contentType: getMimeType(filePath),
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

function dirListingReader(buf: Buffer): Reader {
  return {
    contentType: "text/html",
    length: buf.length,
    read: async (): Promise<Buffer> => {
      return buf;
    },

    close: async () => {},
  };
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}
