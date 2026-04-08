import { Socket } from "net";
import { Listener } from "./listener";
import { Connection } from "./connection";
import { ByteArray } from "./bytearray";
import { HTTPError, HTTPStatus } from "./http_status";
import { HTTPRequest, parseRequest, printRequest } from "./http_request";
import { HTTPResponse, writeResponse } from "./http_response";
import { readerFromFile } from "./reader";
import { parseBytesRanges } from "../src/http_ranges";

const DEFAULT_MAX_HEADER_LEN = 1024 * 32;

function getFullRequest(buf: ByteArray): null | HTTPRequest {
  const currentView = buf.view;
  const idx = currentView.indexOf("\r\n\r\n");
  if (idx < 0) {
    if (buf.length >= DEFAULT_MAX_HEADER_LEN) {
      throw new HTTPError(HTTPStatus.HeaderFieldsTooLarge);
    }
    return null;
  }
  const req = parseRequest(buf.view.subarray(0, idx + 4));
  buf.pop(idx + 4);
  return req;
}

async function serveResponseFromStatus(conn: Connection, status: HTTPStatus) {
  const buf = new ByteArray(1024);

  const body = status.message;
  const statusHdr = `${status.code} ${status.message}`;

  buf.push(Buffer.from(`HTTP/1.1 ${statusHdr} \r\n`));
  buf.push(Buffer.from(`Connection: close\r\n`));
  buf.push(Buffer.from(`Content-Length: ${body.length}\r\n`));
  buf.push(Buffer.from(`\r\n${body}`));

  await conn.write(buf.view).catch(() => {});
}

async function serveClient(conn: Connection): Promise<void> {
  const buf = new ByteArray(4096);
  while (true) {
    const data = await conn.read();
    if (data.length === 0) break;
    buf.push(data);

    let req: HTTPRequest | null;
    while ((req = getFullRequest(buf)) !== null) {
      console.log(`[REQUEST] ${req.method} ${req.path}`);

      const resp: HTTPResponse = {
        status: HTTPStatus.OK,
        headers: new Map<string, string>(),
      };

      resp.headers.set("Accept-Ranges", "bytes");

      const filePath = `./${req.path.slice("/files".length)}`;
      let ranges = parseBytesRanges(req.headers.get("Range"));
      if (!ranges || ranges.length === 0) {
        ranges = [[0, Number.MAX_SAFE_INTEGER]];
      }
      const fileReader = await readerFromFile(
        filePath,
        ranges[0][0],
        ranges[0][1],
      );
      await writeResponse(conn, resp, fileReader);
      await fileReader.close();
    }
  }
}

function isConnectionError(e: unknown): boolean {
  return (
    e instanceof Error &&
    "code" in e &&
    (e.code === "ERR_SOCKET_CLOSED" ||
      e.code === "ECONNRESET" ||
      e.code === "EPIPE")
  );
}

async function handleSocket(socket: Socket) {
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[INFO] Connection started: ${addr}`);
  const conn = new Connection(socket);
  try {
    await serveClient(conn);
  } catch (e) {
    if (e instanceof HTTPError) {
      console.warn(`[CLIENT_ERROR] ${e.status.code}: ${e.status.message}`);
      await serveResponseFromStatus(conn, e.status);
    } else if (!isConnectionError(e) && e instanceof Error) {
      console.error("[ERROR]", e.message);
    }
  } finally {
    conn.close();
    console.log(`[INFO] connection ended: ${addr}`);
  }
}

async function main() {
  const listener = new Listener("127.0.0.1", 8080);
  console.log("[INFO] Listening on http://127.0.0.1:8080");

  process.once("SIGINT", () => {
    console.log("\n[INFO] Shutting down...");
    listener.close().catch(() => {});
  });

  try {
    while (true) {
      const socket = await listener.accept();
      handleSocket(socket).catch((err) =>
        console.error("[FATAL] Uncaught in socket handler:", err),
      );
    }
  } catch {
    // listener was closed
  }
}

main();
