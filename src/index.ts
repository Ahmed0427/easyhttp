import { Listener } from "./listener";
import { Connection } from "./connection";
import { ByteArray } from "./bytearray";
import { HTTPError, HTTPStatus } from "./http_status";
import { BodyReader, readerFromReq, readerFromMemory } from "./bodyreader";
import { HTTPRequest, parseReqHdr } from "./http_request";
import { HTTPResponse, writeResponse } from "./http_response";

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

async function serveClient(conn: Connection): Promise<void> {
  const buf = new ByteArray(4096);

  try {
    while (true) {
      const data = await conn.read();
      if (data.length === 0) return;

      buf.push(data);

      let reqHdr: HTTPRequest | null;
      while ((reqHdr = getFullHeaders(buf)) !== null) {
        console.log(`[REQUEST] ${reqHdr.method} ${reqHdr.path}`);

        const reqBody: BodyReader = readerFromReq(conn, buf, reqHdr);

        const resp: HTTPResponse = {
          status: HTTPStatus.OK,
          headers: new Map<string, string>(),
        };
        await writeResponse(conn, resp, reqBody);

        if (reqHdr.version === "HTTP/1.0") return;

        let body: Buffer;
        while ((body = await reqBody.read()).length > 0) {
          console.log(`[BODY] ${body.toString()}`);
        }
      }
    }
  } catch (e) {
    if (e instanceof HTTPError) {
      await conn.write(
        Buffer.from(
          `HTTP/1.1 ${e.status.code} ${e.status.message}\r\nConnection: close\r\n\r\n`,
        ),
      );
      console.warn(`[INFO] Client error ${e.status.code}: ${e.status.message}`);
      return;
    }

    throw e;
  }
}

async function handleSocket(socket: net.Socket) {
  console.log(
    `[INFO] connection started: ${socket.remoteAddress}:${socket.remotePort}`,
  );

  const conn = new Connection(socket);

  try {
    await serveClient(conn);
  } catch (e) {
    console.error("[ERROR] Client exception:", e);
  } finally {
    conn.close();
    console.log(
      `[INFO] connection ended: ${socket.remoteAddress}:${socket.remotePort}`,
    );
  }
}

async function main() {
  const listener = new Listener("127.0.0.1", 8080);
  console.log("[INFO] Listening on http://127.0.0.1:8080");

  const shutdown = async () => {
    console.log("\n[INFO] Shutting down server...");
    await listener.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    while (true) {
      const socket = await listener.accept();
      handleSocket(socket);
    }
  } catch (err: any) {
    if (err) {
      console.error("[ERROR] Run loop failed:", err);
    } else {
      console.log("[INFO] server is down");
    }
  }
}

main();
