import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { writeFile, unlink } from "node:fs/promises";
import { spawn, type Subprocess } from "bun";
import { createConnection } from "net";
import { randomBytes } from "crypto";

const PORT = 8080;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
      const res = await fetch(`${BASE_URL}/file/${filename}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(content);
      expect(res.headers.get("Content-Length")).toBe(content.length.toString());
    } finally {
      await unlink(filename);
    }
  });

  test("Static File - Should return 404 for non-existent files", async () => {
    const res = await fetch(`${BASE_URL}/file/ghost_file_${Date.now()}.txt`);
    expect(res.status).toBe(404);
  });

  test("Static File - Should serve large binary files without corruption", async () => {
    // 128kb of random data ensures the bodyreader loop runs multiple times
    const filename = "test_data.bin";
    const payload = randomBytes(1024 * 128);
    await writeFile(filename, payload);

    try {
      const res = await fetch(`${BASE_URL}/file/${filename}`);
      expect(res.status).toBe(200);

      const body = await res.arrayBuffer();
      expect(new Uint8Array(body)).toEqual(new Uint8Array(payload));
      expect(res.headers.get("Content-Length")).toBe(payload.length.toString());
    } finally {
      await unlink(filename);
    }
  });

  test("Range - bytes=0-9 returns first 10 bytes", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij"; // 20 bytes
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/file/${filename}`, {
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
      const res = await fetch(`${BASE_URL}/file/${filename}`, {
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
      const res = await fetch(`${BASE_URL}/file/${filename}`, {
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
      const res = await fetch(`${BASE_URL}/file/${filename}`, {
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
      const res = await fetch(`${BASE_URL}/file/${filename}`, {
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
      const res = await fetch(`${BASE_URL}/file/${filename}`, {
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
