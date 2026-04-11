import * as fs from "fs/promises";
import * as path from "path";
import { HTTPError, HTTPStatus } from "./http_status";
import { logger } from "./logger";
import { getMimeType } from "./mime_type";
import { HTTPRequest, parseByteRange } from "./http_request";
import { HTTPResponse } from "./http_response";
import { Reader, fileRangeReader, dirListingReader } from "./reader";

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

function buildRangeHeader(reader: Reader): string {
  return `bytes ${reader.startRange}-${(reader.endRange ?? 1) - 1}/${reader.size}`;
}

async function buildDirResponse(
  resp: HTTPResponse,
  resolvedPath: string,
  reqPath: string,
): Promise<HTTPResponse> {
  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

  const listItems = entries
    .map((item) => {
      const isDir = item.isDirectory();
      const suffix = isDir ? "/" : "";
      const nameWithSuffix = `${item.name}${suffix}`;
      const hrefPath = path.join(reqPath, item.name);
      const cls = isDir ? "dir" : "file";
      return `<li class="${cls}"><a href="${hrefPath}">${nameWithSuffix}</a></li>`;
    })
    .join("\n");

  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Index of ${reqPath}</title></head>
    <body>
      <h1>Index of ${reqPath}</h1>
      <ul>
        ${listItems}
      </ul>
    </body>
    </html>
  `;

  resp.reader = dirListingReader(Buffer.from(html));
  resp.headers.set("Content-Length", resp.reader.length.toString());
  resp.headers.set("Content-Type", "text/html");
  return resp;
}

async function buildFileResponse(
  resp: HTTPResponse,
  resolvedPath: string,
  handle: fs.FileHandle,
  rangeHeader: string | undefined,
): Promise<HTTPResponse> {
  const stat = await handle.stat();
  const fileSize = stat.size;

  const rangeParsed = parseByteRange(rangeHeader);
  let [start, end] =
    rangeParsed.length === 2 ? rangeParsed : [0, Number.MAX_SAFE_INTEGER];

  // suffix range: bytes=-N  -> last N bytes
  if (start === -1) {
    const suffixLen = end;
    start = Math.max(fileSize - suffixLen, 0);
    end = fileSize;
  }

  // Out of range
  if (start >= fileSize || start < 0) {
    await handle.close();
    const reader = {
      size: fileSize,
      length: 0,
      read: async () => Buffer.alloc(0),
      close: async () => {},
    };
    resp.headers.set("Content-Length", reader.length.toString());
    resp.headers.set("Content-Range", `bytes */${reader.size}`);
    resp.status = HTTPStatus.RangeNotSatisfiable;
    resp.reader = reader;
    return resp;
  }

  const actualEnd = Math.min(end, fileSize);
  const isRange = end !== Number.MAX_SAFE_INTEGER || start !== 0;
  const contentLength = actualEnd - start;

  const reader = fileRangeReader(
    handle,
    start,
    actualEnd,
    contentLength,
    fileSize,
  );

  if (isRange) {
    resp.headers.set("Content-Range", buildRangeHeader(reader));
    resp.status = HTTPStatus.PartialContent;
  }

  resp.headers.set("Content-Length", reader.length.toString());
  resp.headers.set("Content-Type", getMimeType(resolvedPath));
  resp.reader = reader;
  return resp;
}

export async function handleRequest(
  req: HTTPRequest,
  cwd: string,
): Promise<HTTPResponse> {
  let handle: fs.FileHandle | null = null;

  try {
    const resolvedPath = path.resolve(path.join(cwd, req.path));

    if (!resolvedPath.startsWith(cwd)) {
      throw new HTTPError(HTTPStatus.Forbidden);
    }

    const resp: HTTPResponse = {
      status: HTTPStatus.OK,
      headers: new Map([["Accept-Ranges", "bytes"]]),
    };

    handle = await fs.open(resolvedPath, "r");
    const stat = await handle.stat();

    if (!stat.isFile()) {
      await handle.close();
      handle = null;
      return buildDirResponse(resp as HTTPResponse, resolvedPath, req.path);
    }

    const response = await buildFileResponse(
      resp as HTTPResponse,
      resolvedPath,
      handle,
      req.headers.get("Range"),
    );
    handle = null; // ownership transferred to reader
    return response;
  } catch (e: unknown) {
    await handle?.close();

    if (e instanceof HTTPError) throw e;

    if (isNodeError(e) && e.code === "ENOENT") {
      throw new HTTPError(HTTPStatus.NotFound);
    }

    const msg = e instanceof Error ? e.message : String(e);
    logger.error(msg);
    throw new HTTPError(HTTPStatus.InternalServerError);
  }
}
