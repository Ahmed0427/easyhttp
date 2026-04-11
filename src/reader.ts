import * as fs from "fs/promises";
import { getMimeType } from "./mime_type";

export interface Reader {
  readonly length: number; // bytes to send; 0 for out-of-range
  readonly size?: number; // full file size
  readonly endRange?: number; // exclusive
  readonly startRange?: number;

  read(): Promise<Buffer>; // returns 0-length Buffer on EOF
  close(): Promise<void>;
}

const READ_BUFFER_SIZE = 65_536;

export function fileRangeReader(
  handle: fs.FileHandle,
  start: number,
  end: number,
  contentLength: number,
  fileSize: number,
): Reader {
  const buf = Buffer.allocUnsafe(READ_BUFFER_SIZE);
  let offset = start;
  let got = 0;

  return {
    length: contentLength,
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
        throw new Error("Unexpected EOF reading file");
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

export function dirListingReader(buf: Buffer): Reader {
  let served = false;
  return {
    length: buf.length,
    read: async (): Promise<Buffer> => {
      if (served) return Buffer.alloc(0);
      served = true;
      return buf;
    },
    close: async () => {},
  };
}
