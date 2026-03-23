import { expect, test, describe, afterAll } from "bun:test";
import { Listener } from "../src/listener";
import { connect } from "net";

describe("Listener", () => {
  const HOST = "127.0.0.1";
  const PORT = 8081;

  test("should accept an incoming connection", async () => {
    const listener = new Listener(HOST, PORT);

    const client = connect(PORT, HOST);

    const socket = await listener.accept();
    expect(socket).toBeDefined();
    expect(socket.remoteAddress).toBe(HOST);

    socket.destroy();
    client.destroy();
    await listener.close();
  });
});
