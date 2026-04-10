import * as fs from "fs/promises";
import * as path from "path";
import { HTTPError, HTTPStatus } from "./http_status";
import { logger } from "./logger";

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
  req_path: string,
  start: number,
  end: number,
): Promise<Reader> {
  let handle: fs.FileHandle | null = null;

  try {
    handle = await fs.open(req_path, "r");
    const stat = await handle.stat();

    if (!stat.isFile()) {
      await handle.close();

      const entries = await fs.readdir(req_path, { withFileTypes: true });

      const listItems = entries
        .map((item) => {
          const isDir = item.isDirectory();
          const suffix = isDir ? "/" : "";
          const nameWithSuffix = `${item.name}${suffix}`;
          const hrefPath = path.join(item.name);
          const cls = `class="${isDir ? "dir" : "file"}`;
          return `<li ${cls} "><a href="${hrefPath}">${nameWithSuffix}</a></li>`;
        })
        .join("");

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Index of ${req_path}</title>
          <style>
            body { font-family: sans-serif; padding: 2rem; line-height: 1.5; color: #333; }
            h1 { font-size: 1.2rem; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
            ul { list-style: none; padding: 0; }
            li { padding: 4px 8px; display: flex; align-items: center; }
            li:hover { background: #f0f0f0; }
            a { text-decoration: none; color: #0066cc; width: 100%; display: block; }
            a:hover { text-decoration: underline; }
            .dir { font-weight: bold; }
            .dir a { color: #d4a017; } /* Gold/Folder color */
          </style>
        </head>
        <body>
          <h1>Index of ${req_path}</h1>
          <ul>
            ${listItems}
          </ul>
        </body>
        </html>
      `;

      return dirListingReader(html);
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

function dirListingReader(buf: Buffer): Reader {
  return {
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
