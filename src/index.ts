import { Listener } from "./listener";
import { Connection } from "./connection";
import { ByteArray } from "./bytearray";

function getFullMessage(buf: ByteArray): null | Buffer {
  const idx = buf.data.subarray(0, buf.len).indexOf("\n");
  if (idx < 0) {
    return null;
  }
  const msg = Buffer.from(buf.data.subarray(0, idx + 1));
  buf.pop(idx + 1);
  return msg;
}

async function serveClient(conn: Connection): Promise<void> {
  const buf: ByteArray = new ByteArray(0, 256);
  for (;;) {
    const msg: null | Buffer = getFullMessage(buf);

    if (!msg) {
      const data = await conn.read();

      if (data.length === 0) {
        console.log("[INFO] Connection closed by client");
        return;
      }

      console.log("[INFO] got:", data);
      buf.push(data);
    } else {
      if (!msg.equals(Buffer.from("quit\n"))) {
        await conn.write(Buffer.concat([Buffer.from("Echo: "), msg]));
        continue;
      }
      await conn.write(Buffer.from("bye\n"));
      return;
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
