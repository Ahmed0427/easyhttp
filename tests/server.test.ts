import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { randomBytes } from "crypto";
import { createConnection } from "net";
import { spawn, type Subprocess } from "bun";

const PORT = 8080;
const BASE_URL = `http://127.0.0.1:${PORT}`;

describe("EasyHTTP Server Integration", () => {
  let serverProcess: Subprocess;

  beforeAll(async () => {
    serverProcess = spawn(["bun", "run", "src/index.ts"], {
      stdout: "inherit",
      stderr: "inherit",
    });

    // give the server a moment to bind to the port
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  // kill the server after tests finish
  afterAll(() => {
    serverProcess.kill();
  });

  /**
   * basic functionality
   */
  test("GET / - Should return 200 OK", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
  });

  /**
   * echo & streaming logic
   * verifies that the bodyreader is correctly piping data
   */
  test("POST - Should echo back large binary data", async () => {
    const payload = randomBytes(1024 * 64); // 64KB random data
    const res = await fetch(`${BASE_URL}/`, {
      method: "POST",
      body: payload,
    });

    const body = await res.arrayBuffer();
    expect(new Uint8Array(body)).toEqual(new Uint8Array(payload));
  });

  /**
   * connection pipelining
   * this is the "gold standard" test for custom http servers.
   * it ensures your loop correctly handles the next request remaining in the buffer.
   */
  test("Connection Pipelining - Multiple requests on one socket", async () => {
    const responseData = await new Promise<string>((resolve, reject) => {
      const client = createConnection({ port: PORT }, () => {
        // Write two requests immediately back-to-back
        client.write(
          "GET /first HTTP/1.1\r\nContent-Length: 0\r\n\r\n" +
            "GET /second HTTP/1.1\r\nContent-Length: 0\r\n\r\n",
        );
      });

      let buffer = "";
      client.on("data", (data) => {
        buffer += data.toString();
        // Check if we have received two "OK" status lines
        const occurrences = (buffer.match(/HTTP\/1.1 200 OK/g) || []).length;
        if (occurrences === 2) {
          client.end();
          resolve(buffer);
        }
      });

      client.on("error", reject);
      setTimeout(() => reject("Pipelining test timed out"), 2000);
    });

    expect(responseData).toContain("HTTP/1.1 200 OK");
  });

  /**
   * robustness: oversized headers
   * triggers the 431 header fields too large logic
   */
  test("Error Handling - Should reject massive headers", async () => {
    const bigHeader = "X-Long-Header: " + "A".repeat(1024 * 128) + "\r\n";

    const response = await new Promise<string>((resolve) => {
      const client = createConnection({ port: PORT }, () => {
        client.write(`GET / HTTP/1.1\r\n${bigHeader}\r\n`);
      });

      client.on("data", (data) => {
        resolve(data.toString());
        client.end();
      });
    });

    expect(response).toContain("431 Request Header Fields Too Large");
  });

  test("Chunked Encoding - Should handle Chunked Transfer Encoding", async () => {
    const responseData = await new Promise<string>((resolve, reject) => {
      const client = createConnection({ port: PORT }, () => {
        // Write the request
        client.write("POST /echo HTTP/1.1\r\n");
        client.write("Host: localhost\r\n");
        client.write("Transfer-Encoding: chunked\r\n");
        client.write("\r\n");

        // Chunk 1: "Hello" (5 bytes)
        client.write("5\r\nHello\r\n");
        // Chunk 2: " World" (6 bytes -> '6' in hex)
        client.write("6\r\n World\r\n");
        // Terminator
        client.write("0\r\n\r\n");
      });

      let buffer = "";
      client.on("data", (data) => {
        buffer += data.toString();

        if (buffer.endsWith("0\r\n\r\n")) {
          client.end();
          resolve(buffer);
        }
      });

      client.on("error", (err) => {
        client.destroy();
        reject(err);
      });
    });

    expect(responseData).toContain("200 OK");
    expect(responseData).toContain("Hello");
    expect(responseData).toContain("World");
  });
});
