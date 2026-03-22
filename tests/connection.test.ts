import { expect, test, describe } from "bun:test";
import * as net from "net";
import { Connection } from "../src/connection";

describe("Connection Class", () => {
  test("should echo data back", async () => {
    const server = net
      .createServer((socket) => {
        const conn = new Connection(socket);
        socket.on("data", async (data) => {
          await conn.write(data);
        });
      })
      .listen(9000);

    const clientSocket = net.connect(9000, "127.0.0.1");
    const clientConn = new Connection(clientSocket);

    const message = Buffer.from("hello");
    await clientConn.write(message);

    const response = await clientConn.read();
    expect(response.toString()).toBe("hello");

    clientConn.close();
    server.close();
  });
});
