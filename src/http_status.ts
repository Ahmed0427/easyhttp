export const HTTPStatus = {
  // 1xx Informational
  Continue: { code: 100, message: "Continue" },
  SwitchingProtocols: { code: 101, message: "Switching Protocols" },

  // 2xx Success
  OK: { code: 200, message: "OK" },
  Created: { code: 201, message: "Created" },
  NoContent: { code: 204, message: "No Content" },
  PartialContent: { code: 206, message: "Partial Content" },

  // 3xx Redirection
  MovedPermanently: { code: 301, message: "Moved Permanently" },
  Found: { code: 302, message: "Found" },

  // 4xx Client Errors
  BadRequest: { code: 400, message: "Bad Request" },
  Unauthorized: { code: 401, message: "Unauthorized" },
  Forbidden: { code: 403, message: "Forbidden" },
  NotFound: { code: 404, message: "Not Found" },
  MethodNotAllowed: { code: 405, message: "Method Not Allowed" },
  PayloadTooLarge: { code: 413, message: "Payload Too Large" },
  RangeNotSatisfiable: { code: 416, message: "Range Not Satisfiable" },
  HeaderFieldsTooLarge: {
    code: 431,
    message: "Request Header Fields Too Large",
  },

  // 5xx Server Errors
  InternalServerError: { code: 500, message: "Internal Server Error" },
  NotImplemented: { code: 501, message: "Not Implemented" },
  BadGateway: { code: 502, message: "Bad Gateway" },
  ServiceUnavailable: { code: 503, message: "Service Unavailable" },
} as const;

export class HTTPError extends Error {
  constructor(
    public status: HttpStatusType,
    public fileSize: number,
  ) {
    super(`${status.code} ${status.message}`);
    this.name = "HTTPError";
    this.fileSize = fileSize;
  }
}
