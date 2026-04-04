import { Connection } from "./connection";
import { ByteArray } from "./bytearray";
import { HTTPError, HTTPStatus } from "./http_status";

export type BufferGenerator = AsyncGenerator<Buffer, void, void>;

export async function* gen(): BufferGenerator {
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    yield Buffer.from(`Chunk: ${i}\n`);
  }
}

export async function* readChunks(
  conn: Connection,
  buf: ByteArray,
): BufferGenerator {
  const crnl = "\r\n";

  while (true) {
    let idx = buf.view.indexOf(crnl);
    while (idx < 0) {
      let data = await conn.read();
      if (!data || data.length === 0) {
        throw new HTTPError(HTTPStatus.BadRequest);
      }
      buf.push(data);
      idx = buf.view.indexOf(crnl);
    }

    const line = buf.view.subarray(0, idx).toString();
    const sizeStr = line.split(";")[0];
    const size = parseInt(sizeStr, 16);

    if (isNaN(size)) {
      throw new HTTPError(HTTPStatus.BadRequest);
    }

    buf.pop(idx + 2);

    if (size === 0) {
      await consumeTrailers(conn, buf);
      return;
    }

    let remain = size;
    while (remain > 0) {
      if (buf.length === 0) {
        let data = await conn.read();
        if (!data || data.length === 0) throw new Error("Unexpected EOF");
        buf.push(data);
      }
      const consume = Math.min(remain, buf.length);
      yield buf.pop(consume);
      remain -= consume;
    }

    while (buf.length < 2) {
      let data = await conn.read();
      if (!data || data.length === 0) throw new Error("Unexpected EOF");
      buf.push(data);
    }

    if (buf.pop(2).toString() !== crnl) {
      throw new HTTPError(HTTPStatus.BadRequest);
    }
  }
}

async function consumeTrailers(conn: Connection, buf: ByteArray) {
  while (true) {
    let idx = buf.view.indexOf("\r\n");
    while (idx < 0) {
      buf.push(await conn.read());
      idx = buf.view.indexOf("\r\n");
    }

    const line = buf.pop(idx + 2).toString();
    if (line === "\r\n") {
      break;
    }
  }
}
