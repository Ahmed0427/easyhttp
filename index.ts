import * as net from "net";

class Listener {
  private server: net.Server;
  private backlog: net.Socket[];
  private pendingAccepts: {
    resolve: (socket: net.Socket) => void;
    reject: (err: Error) => void;
  }[];

  constructor(host: string, port: number) {
    this.backlog = [];
    this.pendingAccepts = [];
    this.server = net.createServer({ pauseOnConnect: true });
    this.setupEvents();
    this.server.listen({ host: host, port: port });
  }

  private setupEvents() {
    this.server.on("connection", (socket: net.Socket) => {
      if (this.pendingAccepts.length == 0) {
        this.backlog.push(socket);
      } else {
        const { resolve } = this.pendingAccepts.shift()!;
        resolve(socket);
      }
    });

    this.server.on("error", (err: Error) => {
      while (this.pendingAccepts.length > 0) {
        const { reject } = this.pendingAccepts.shift()!;
        reject(err);
      }
    });
  }

  accept(): Promise<net.Socket> {
    return new Promise((res, rej) => {
      if (this.backlog.length == 0) {
        this.pendingAccepts.push({ resolve: res, reject: rej });
      } else {
        res(this.backlog.shift()!);
      }
    });
  }
}

class Connection {
  private isEOF: boolean = false;
  private err: Error | null = null;
  private reader: {
    resolve: (data: Buffer) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(private socket: net.Socket) {
    this.setupEvents();
  }

  private setupEvents() {
    this.socket.on("data", (data: Buffer) => {
      this.socket.pause();
      if (this.reader) {
        this.reader.resolve(data);
        this.reader = null;
      }
    });

    this.socket.on("error", (err: Error) => {
      this.err = err;
      if (this.reader) {
        this.reader.reject(err);
        this.reader = null;
      }
    });

    this.socket.on("end", () => {
      this.isEOF = true;
      if (this.reader) {
        this.reader.resolve(Buffer.alloc(0)); // empty buffer as an EOF signal
        this.reader = null;
      }
    });
  }

  async read(): Promise<Buffer> {
    console.assert(!this.reader);
    return new Promise((res, rej) => {
      if (this.err) return rej(this.err);
      if (this.isEOF) return res(Buffer.alloc(0));
      this.reader = { resolve: res, reject: rej };
      this.socket.resume();
    });
  }

  async write(data: Buffer): Promise<void> {
    return new Promise((res, rej) => {
      if (this.err) return rej(this.err);
      if (this.isEOF) return rej("cannot write to a closed connection");
      this.socket.write(data, (err) => {
        if (err) rej(err);
        else res();
      });
    });
  }

  close() {
    this.socket.destroy();
  }
}

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
  console.log("[INFO] Listening for connections...");

  while (true) {
    try {
      const socket = await listener.accept();
      handleSocket(socket);
    } catch (err) {
      console.error("[ERROR] Accept failed:", err);
      break;
    }
  }
}

main();
