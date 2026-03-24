import { Listener } from "./listener";
import { Connection } from "./connection";
import { ByteArray } from "./bytearray";

function getFullMessage(buf: ByteArray): null | Buffer {
  const currentView = buf.view;
  const idx = currentView.indexOf("\n");

  if (idx < 0) return null;

  const msg = Buffer.from(currentView.subarray(0, idx + 1));
  buf.pop(idx + 1);
  return msg;
}

async function serveClient(conn: Connection): Promise<void> {
  const buf = new ByteArray(1024);

  while (true) {
    const data = await conn.read();
    if (data.length === 0) return;

    buf.push(data);

    let msg: Buffer | null;
    while ((msg = getFullMessage(buf)) !== null) {
      if (msg.equals(Buffer.from("quit\n"))) {
        await conn.write(Buffer.from("bye\n"));
        return;
      }
      await conn.write(Buffer.concat([Buffer.from("Echo: "), msg]));
    }
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
