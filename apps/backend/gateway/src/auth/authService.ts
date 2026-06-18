import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}


export function verifyToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded === "object" && decoded !== null && "userId" in decoded) {
    return decoded as { userId: string };
  }
  throw new Error("Invalid token structure");
}

export interface RegisterResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  token: string;
}

export async function registerUser(email: string, password: string, displayName?: string): Promise<RegisterResult> {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    passwordHash,
    displayName: displayName ?? null,
  });

  const token = generateToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    token,
  };
}

export interface LoginResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    stellarAddress: string | null;
  };
  token: string;
}

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ where: { email } });
  if (!user || !user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  const token = generateToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      stellarAddress: user.stellarAddress,
    },
    token,
  };
}
