import { Socket } from "net";

export class Connection {
  private isEOF: boolean = false;
  private err: Error | null = null;
  private reader: {
    resolve: (data: Buffer) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(private socket: Socket) {
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
