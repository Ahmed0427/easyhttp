import { Listener } from "./listener";
import { Connection } from "./connection";

async function serveClient(conn: Connection): Promise<void> {
  for (;;) {
    const data = await conn.read();

    if (data.length === 0) {
      console.log("[INFO] Connection closed by client");
      break;
    }

    console.log(`[INFO] Received: ${data.toString().trim()}`);

    await conn.write(data);
  }
}

async function handleSocket(socket: net.Socket) {
  console.log(
    `[INFO] New connection: ${socket.remoteAddress}:${socket.remotePort}`,
  );

  const conn = new Connection(socket);

  try {
    await serveClient(conn);
  } catch (e) {
    console.error("[ERROR] Client exception:", e);
  } finally {
    conn.close();
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
      // handleSocket(socket); ...
    }
  } catch (err: any) {
    if (err.code === "ERR_SERVER_NOT_RUNNING") {
      return;
    }
    console.error("[ERROR] Run loop failed:", err);
  }
}

main();
