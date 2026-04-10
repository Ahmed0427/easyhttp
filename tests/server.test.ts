import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { writeFile, unlink } from "node:fs/promises";
import { createConnection, connect } from "net";
import { spawn, type Subprocess } from "bun";
import { randomBytes } from "crypto";

const PORT = 8080;
const BASE_URL = `http://0.0.0.0:${PORT}`;

describe("EasyHTTP Server Integration", () => {
  let serverProcess: Subprocess;

  beforeAll(async () => {
    serverProcess = spawn(["bun", "run", "src/index.ts"], {
      stdout: "inherit",
      stderr: "inherit",
    });

    // wait a bit for the server to bind to the port
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  // kill the server after tests finish
  afterAll(() => {
    serverProcess.kill();
  });

  test("Static File - Should serve a text file correctly", async () => {
    const filename = "test_text.txt";
    const content = "Hello, this is a test file on disk.";
    await writeFile(filename, content);

    try {
      const res = await fetch(`${BASE_URL}/${filename}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(content);
      expect(res.headers.get("Content-Length")).toBe(content.length.toString());
    } finally {
      await unlink(filename);
    }
  });

  test("Static File - Should return 404 for non-existent files", async () => {
    const res = await fetch(`${BASE_URL}/ghost_file_${Date.now()}.txt`);
    expect(res.status).toBe(404);
  });

  test("Static File - Should serve large binary files without corruption", async () => {
    const filename = "test_data.bin";
    const payload = randomBytes(1024 * 128);
    await writeFile(filename, payload);

    try {
      const res = await fetch(`${BASE_URL}/${filename}`);
      expect(res.status).toBe(200);

      const body = await res.arrayBuffer();
      expect(new Uint8Array(body)).toEqual(new Uint8Array(payload));
      expect(res.headers.get("Content-Length")).toBe(payload.length.toString());
    } finally {
      await unlink(filename);
    }
  });

  test("Static File - Should block directory traversal with 403 Forbidden", async () => {
    const promise = new Promise<string>((resolve, reject) => {
      const client = connect(8080, "127.0.0.1", () => {
        client.write(
          "GET /../../../../etc/passwd HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
      });

      client.on("data", (data) => {
        resolve(data.toString());
        client.end();
      });

      client.on("error", reject);
    });

    const response = await promise;
    expect(response).toContain("403");
  });

  test("Range - bytes=0-9 returns first 10 bytes", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij"; // 20 bytes
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=0-9" },
      });
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("0123456789");
      expect(res.headers.get("Content-Range")).toBe("bytes 0-9/20");
      expect(res.headers.get("Content-Length")).toBe("10");
    } finally {
      await unlink(filename);
    }
  });

  test("Range - completely out of range returns 416", async () => {
    const filename = "range_test.txt";
    const content = "0123456789"; // 10 bytes
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=20-30" },
      });
      expect(res.status).toBe(416);
      expect(res.headers.get("Content-Range")).toBe("bytes */10");
    } finally {
      await unlink(filename);
    }
  });

  test("Range - invalid syntax (4-3) server ignore Range and send full file", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij";
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=4-3" },
      });
      // according to RFC, invalid ranges cause the header to be ignored -> full response 200
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(content);
      expect(res.headers.get("Content-Range")).toBeNull();
    } finally {
      await unlink(filename);
    }
  });
  test("Range - bytes=10- returns from byte 10 to EOF", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij"; // 20 bytes
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=10-" },
      });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("abcdefghij");
      expect(res.headers.get("Content-Range")).toBe("bytes 10-19/20");
      expect(res.headers.get("Content-Length")).toBe("10");
    } finally {
      await unlink(filename);
    }
  });

  test("Range - bytes=-5 returns last 5 bytes", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij"; // 20 bytes
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=-5" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 15-19/20");
      expect(await res.text()).toBe("fghij");
      expect(res.headers.get("Content-Length")).toBe("5");
    } finally {
      await unlink(filename);
    }
  });

  test("Range - bytes=15-30 (beyond EOF) returns bytes 15-19 only", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij"; // 20 bytes
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=15-30" },
      });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("fghij");
      expect(res.headers.get("Content-Range")).toBe("bytes 15-19/20");
      expect(res.headers.get("Content-Length")).toBe("5");
    } finally {
      await unlink(filename);
    }
  });
});
