import { Socket } from "net";
import { Listener } from "./listener";
import { Connection } from "./connection";
import { ByteArray } from "./bytearray";
import { HTTPError, HTTPStatus } from "./http_status";
import { HTTPRequest, parseReqHdr, printRequest } from "./http_request";
import { HTTPResponse, writeResponse } from "./http_response";
import { gen } from "./buffer_generator";
import {
  readerFromReq,
  readerFromGenerator,
  readerFromFile,
} from "./bodyreader";

const DEFAULT_MAX_HEADER_LEN = 1024 * 32;

function getFullHeaders(buf: ByteArray): null | HTTPRequest {
  const currentView = buf.view;
  const idx = currentView.indexOf("\r\n\r\n");
  if (idx < 0) {
    if (buf.length >= DEFAULT_MAX_HEADER_LEN) {
      throw new HTTPError(HTTPStatus.HeaderFieldsTooLarge);
    }
    return null;
  }
  const reqHdr = parseReqHdr(buf.view.subarray(0, idx + 4));
  buf.pop(idx + 4);
  return reqHdr;
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

    let reqHdr: HTTPRequest | null;
    while ((reqHdr = getFullHeaders(buf)) !== null) {
      console.log(`[REQUEST] ${reqHdr.method} ${reqHdr.path}`);

      const reqBody = readerFromReq(conn, buf, reqHdr);

      const resp: HTTPResponse = {
        status: HTTPStatus.OK,
        headers: new Map<string, string>(),
      };

      if (reqHdr.path === "/gen") {
        await writeResponse(conn, resp, readerFromGenerator(gen()));
      } else if (reqHdr.path.startsWith("/file/")) {
        const filePath = `./${reqHdr.path.slice("/files".length)}`;
        const fileReader = await readerFromFile(filePath);
        await writeResponse(conn, resp, fileReader);
      } else {
        await writeResponse(conn, resp, reqBody);
      }

      // HTTP/1.0 got no body
      // other than that drain the body we don't need it for now
      if (reqHdr.version !== "HTTP/1.0") {
        while ((await reqBody.read()).length > 0) {}
      }
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
