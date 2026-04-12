# easyhttp

HTTP static file server built with **Bun** and low-level TCP primitives.

## Features

- Raw TCP-based HTTP server (no frameworks)
- Incremental request parsing
- Efficient byte buffer (`ByteArray`)
- Static file serving
- Directory listing
- HTTP Range requests (partial content)
- Streaming file responses
- Basic error handling with proper HTTP status codes

## Usage

To install deps:

```bash
bun install
```

Start the server:

```bash
bun run src/index.ts
```

Or using the script:

```bash
bun start
```

### Options

- `-p, --port` → Port to listen on (default: `8080`)
- `-d, --dir` → Directory to serve (default: current working directory)

Example:

```bash
bun run src/index.ts -p 3000 -d ./public
```

## How It Works

1.  **TCP Listener**
    - Accepts incoming connections using a custom `Listener`.
2.  **Connection Handling**
    - Each socket is wrapped in a `Connection` abstraction.
    - Supports async `read()` and `write()`.
3.  **Buffering**
    - Incoming data is accumulated in `ByteArray`.
    - Requests are extracted when `\r\n\r\n` is detected.
4.  **Request Parsing**
    - Request line (`METHOD PATH VERSION`)
    - Headers into a `Map<string, string>`
5.  **Request Handling**
    - Resolves path safely (prevents directory traversal)
    - If file -> Streams file using `fileRangeReader`
    - If directory -> Generates HTML listing
6.  **Response Writing**
    - Writes headers first
    - Streams body in chunks

## Range Requests

Supports:

- Full range:

  ```
  Range: bytes=0-499
  ```

- Open-ended:
  ```
  Range: bytes=500-
  ```
- Suffix:
  ```
  Range: bytes=-100
  ```

## Example

```bash
curl http://localhost:8080/file.txt
```

```bash
curl -H "Range: bytes=0-99" http://localhost:8080/file.txt
```

## Design Goals

- Minimal dependencies
- Clear separation of concerns
- Efficient memory usage
- understanding HTTP internals

## Future Improvements

- Keep-alive support
- Caching headers (ETag, Last-Modified)
- Gzip/Brotli compression
- Logging improvements
