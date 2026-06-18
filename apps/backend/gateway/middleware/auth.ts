import type { IncomingMessage } from "node:http";
import { verifyToken } from "../src/auth/authService.js";

export interface AuthContext {
  userId: string | null;
  token: string | null;
}

/**
 * Extract auth context from request headers.
 */
export function extractAuth(req: IncomingMessage): AuthContext {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, token: null };
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    return { userId: decoded.userId, token };
  } catch (err) {
    return { userId: null, token: null };
  }
}

