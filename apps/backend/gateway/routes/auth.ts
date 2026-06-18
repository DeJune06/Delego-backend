import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { registerUser, loginUser } from "../src/auth/authService.js";

async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

export async function registerHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const { email, password, displayName } = await readJsonBody(req);
    const result = await registerUser(email, password, displayName);
    json(res, 201, { data: result, error: null });
  } catch (err: any) {
    json(res, 400, {
      data: null,
      error: { code: "BAD_REQUEST", message: err.message },
    });
  }
}

export async function loginHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const { email, password } = await readJsonBody(req);
    const result = await loginUser(email, password);
    json(res, 200, { data: result, error: null });
  } catch (err: any) {
    json(res, 401, {
      data: null,
      error: { code: "UNAUTHORIZED", message: err.message },
    });
  }
}
