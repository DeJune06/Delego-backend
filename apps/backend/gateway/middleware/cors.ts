import type { ServerResponse } from "node:http";

/** Apply CORS headers for browser clients */
export function applyCors(res: ServerResponse, origin?: string): void {
  const allowed = process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3001"];
  const requestOrigin = origin ?? "";

  if (allowed.includes(requestOrigin) || allowed.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin || allowed[0]);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
