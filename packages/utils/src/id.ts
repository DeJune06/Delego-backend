import { randomUUID } from "node:crypto";

/** Generate a UUID v4 identifier */
export function generateId(): string {
  return randomUUID();
}
