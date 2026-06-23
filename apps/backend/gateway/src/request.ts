import type { IncomingMessage } from "node:http";

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export class InvalidJsonError extends Error {
  constructor(message: string = "Invalid JSON body") {
    super(message);
    this.name = "InvalidJsonError";
  }
}

export class BodyTooLargeError extends Error {
  constructor(message: string = "Body too large") {
    super(message);
    this.name = "BodyTooLargeError";
  }
}

export async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        req.destroy();
        reject(new BodyTooLargeError());
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new InvalidJsonError());
      }
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}
