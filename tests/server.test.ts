import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { writeFile, unlink, mkdir, rmdir } from "node:fs/promises";
import { connect } from "net";
import { spawn, type Subprocess } from "bun";
import { randomBytes } from "crypto";

const PORT = 8080;
const BASE_URL = `http://0.0.0.0:${PORT}`;

describe("easyhttp integration", () => {
  let serverProcess: Subprocess;

  beforeAll(async () => {
    serverProcess = spawn(["bun", "run", "src/index.ts"], {
      stdout: "inherit",
      stderr: "inherit",
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(() => {
    serverProcess.kill();
  });

  test("get text file", async () => {
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

  test("get 404", async () => {
    const res = await fetch(`${BASE_URL}/ghost_file_${Date.now()}.txt`);
    expect(res.status).toBe(404);
  });

  test("get large binary", async () => {
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

  test("block traversal", async () => {
    const promise = new Promise<string>((resolve, reject) => {
      const client = connect(PORT, "127.0.0.1", () => {
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

  test("range start-end", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij";
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=0-9" },
      });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("0123456789");
      expect(res.headers.get("Content-Range")).toBe("bytes 0-9/20");
    } finally {
      await unlink(filename);
    }
  });

  test("range 416", async () => {
    const filename = "range_test.txt";
    const content = "0123456789";
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

  test("range invalid syntax", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij";
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=4-3" },
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(content);
    } finally {
      await unlink(filename);
    }
  });

  test("range suffix", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij";
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=10-" },
      });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("abcdefghij");
    } finally {
      await unlink(filename);
    }
  });

  test("range last bytes", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij";
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=-5" },
      });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("fghij");
    } finally {
      await unlink(filename);
    }
  });

  test("range overflow", async () => {
    const filename = "range_test.txt";
    const content = "0123456789abcdefghij";
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`, {
        headers: { Range: "bytes=15-30" },
      });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("fghij");
    } finally {
      await unlink(filename);
    }
  });

  // Helper to test MIME types quickly
  const mimeTest = async (
    filename: string,
    content: string | Buffer,
    expectedMime: string,
  ) => {
    await writeFile(filename, content);
    try {
      const res = await fetch(`${BASE_URL}/${filename}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain(expectedMime);
    } finally {
      await unlink(filename);
    }
  };

  test("returns text/html for .html files", async () => {
    await mimeTest("index.html", "<html></html>", "text/html");
  });

  test("returns application/javascript for .js files", async () => {
    await mimeTest("script.js", "console.log('hi')", "application/javascript");
  });

  test("returns image/png for .png files", async () => {
    await mimeTest("image.png", randomBytes(10), "image/png");
  });

  test("returns application/octet-stream for unknown extensions", async () => {
    await mimeTest("mystery.dat", randomBytes(10), "application/octet-stream");
  });

  test("directory listing returns HTML", async () => {
    const dirName = "test_dir_" + Date.now();
    await mkdir(dirName);
    await writeFile(`${dirName}/file_inside.txt`, "hello");

    try {
      const res = await fetch(`${BASE_URL}/${dirName}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");

      const text = await res.text();
      expect(text).toContain("file_inside.txt");
      expect(text.toLowerCase()).toContain("<!doctype html>");
    } finally {
      await unlink(`${dirName}/file_inside.txt`);
      await rmdir(dirName);
    }
  });
});
