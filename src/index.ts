import { Socket } from "net";
import { Listener } from "./listener";
import { Connection } from "./connection";
import { ByteArray } from "./bytearray";
import { HTTPError, HTTPStatus } from "./http_status";
import { HTTPRequest, parseRequest, parseByteRange } from "./http_request";
import { HTTPResponse, writeResponse } from "./http_response";
import { writeErrorResponse } from "./http_response";
import { readerFromFile } from "./reader";
import { logger } from "./logger";
import { parseArgs } from "util";
import * as path from "path";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    port: { type: "string", short: "p", default: "8080" },
    dir: { type: "string", short: "d", default: process.cwd() },
  },
  strict: true,
  allowPositionals: true,
});

const CWD = path.resolve(values.dir!)!;
const PORT = parseInt(values.port!);
const MAX_HEADER_BYTES = 1024 * 32;
const HOST = "0.0.0.0";

function extractRequest(buf: ByteArray): HTTPRequest | null {
  const view = buf.view;
  const headerEnd = view.indexOf("\r\n\r\n");

  if (headerEnd < 0) {
    if (buf.length >= MAX_HEADER_BYTES) {
      throw new HTTPError(HTTPStatus.HeaderFieldsTooLarge);
    }
    return null;
  }

  const req = parseRequest(view.subarray(0, headerEnd + 4));
  buf.pop(headerEnd + 4);
  return req;
}

async function serveClient(conn: Connection): Promise<void> {
  const buf = new ByteArray(4096);

  while (true) {
    const data = await conn.read();
    if (data.length === 0) break; // client disconnected
    buf.push(data);

    let req: HTTPRequest | null;
    while ((req = extractRequest(buf)) !== null) {
      logger.info(`${req.method} ${req.path}`);

      const requestedPath = path.resolve(path.join(CWD, req.path));

      if (!requestedPath.startsWith(CWD)) {
        throw new HTTPError(HTTPStatus.Forbidden);
      }

      logger.info(`requestedPath: ${requestedPath}`);

      const resp: HTTPResponse = {
        status: HTTPStatus.OK,
        headers: new Map([["Accept-Ranges", "bytes"]]),
      };

      const rangeHeader = req.headers.get("Range");
      const rangeParsed = parseByteRange(rangeHeader);

      const [start, end] =
        rangeParsed.length === 2 ? rangeParsed : [0, Number.MAX_SAFE_INTEGER];

      const fileReader = await readerFromFile(requestedPath, start, end);
      try {
        await writeResponse(conn, resp, fileReader);
      } finally {
        await fileReader.close();
      }
    }
  }
}

function isConnectionResetError(e: unknown): boolean {
  return (
    e instanceof Error &&
    "code" in e &&
    ((e as NodeJS.ErrnoException).code === "ERR_SOCKET_CLOSED" ||
      (e as NodeJS.ErrnoException).code === "ECONNRESET" ||
      (e as NodeJS.ErrnoException).code === "EPIPE")
  );
}

async function handleSocket(socket: Socket): Promise<void> {
  const conn = new Connection(socket);
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;

  logger.info(`Connection opened: ${addr}`);

  try {
    await serveClient(conn);
  } catch (e: unknown) {
    if (e instanceof HTTPError) {
      logger.warn(
        `Client error ${e.status.code} ${e.status.message} — ${addr}`,
      );
      await writeErrorResponse(conn, e.status);
    } else if (isConnectionResetError(e)) {
      logger.info(`Connection reset by peer: ${addr}`);
    } else {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`Unhandled error for ${addr}: ${message}`);
    }
  } finally {
    conn.close();
    logger.info(`Connection closed: ${addr}`);
  }
}

async function main(): Promise<void> {
  const listener = new Listener(HOST, PORT);

  logger.info(`Ready at port: ${PORT} (Dir: ${CWD})`);

  process.once("SIGINT", () => {
    logger.info("Shutting down...");
    listener.close();
  });

  while (true) {
    try {
      const socket = await listener.accept();
      handleSocket(socket).catch((err) =>
        logger.error(`Uncaught error in socket handler: ${err}`),
      );
    } catch {
      // ignore listener error when we close it
    }
  }
}

main();
