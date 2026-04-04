import { Server, Socket, createServer } from "net";

export class Listener {
  private server: Server;
  private backlog: Socket[];
  private pendingAccepts: {
    resolve: (socket: Socket) => void;
    reject: (err: Error) => void;
  }[];

  constructor(host: string, port: number) {
    this.backlog = [];
    this.pendingAccepts = [];
    this.server = createServer({ noDelay: true, pauseOnConnect: true });
    this.setupEvents();
    this.server.listen({ host: host, port: port });
  }

  private setupEvents() {
    this.server.on("connection", (socket: Socket) => {
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

  accept(): Promise<Socket> {
    return new Promise((res, rej) => {
      if (this.backlog.length == 0) {
        this.pendingAccepts.push({ resolve: res, reject: rej });
      } else {
        res(this.backlog.shift()!);
      }
    });
  }

  close(): Promise<void> {
    while (this.pendingAccepts.length > 0) {
      const { reject } = this.pendingAccepts.shift()!;
      reject(new Error("Listener closed"));
    }
    return new Promise((res, rej) => {
      this.server.close((err) => {
        if (err) rej(err);
        else res();
      });
    });
  }
}
