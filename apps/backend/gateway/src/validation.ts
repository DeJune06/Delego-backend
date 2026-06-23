import { Ajv } from "ajv";

const ajv = new Ajv();

export interface ValidationErrorDetail {
  field: string;
  message: string;
  keyword: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface CreateDelegationPolicyPayload {
  agentId: string;
  walletId: string;
  label: string;
  policy: {
    maxPerTransaction: string;
    maxTotal: string;
    allowedMerchants: string[];
    allowedCategories: string[];
    expiresAt?: string | null;
  };
  permissionLevel: "VIEW_ONLY" | "AUTO_APPROVE" | "SIGNER" | "ADMIN";
}

export interface UpdateDelegationPayload {
  status?: "pending" | "active" | "paused" | "revoked" | "expired";
  policy?: {
    maxPerTransaction?: string;
    maxTotal?: string;
    allowedMerchants?: string[];
    allowedCategories?: string[];
    expiresAt?: string | null;
  };
}

export const RegisterSchema = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8 },
    displayName: { type: "string" }
  },
  required: ["email", "password"],
  additionalProperties: false
};

export const LoginSchema = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string" }
  },
  required: ["email", "password"],
  additionalProperties: false
};

export const CreateDelegationSchema = {
  type: "object",
  properties: {
    agentId: { type: "string", format: "uuid" },
    walletId: { type: "string", format: "uuid" },
    label: { type: "string" },
    policy: {
      type: "object",
      properties: {
        maxPerTransaction: { type: "string" },
        maxTotal: { type: "string" },
        allowedMerchants: { type: "array", items: { type: "string" } },
        allowedCategories: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string" }
      },
      required: ["maxPerTransaction", "maxTotal", "allowedMerchants", "allowedCategories"],
      additionalProperties: false
    },
    permissionLevel: { type: "string", enum: ["VIEW_ONLY", "AUTO_APPROVE", "SIGNER", "ADMIN"] }
  },
  required: ["agentId", "walletId", "label", "policy", "permissionLevel"],
  additionalProperties: false
};

export const UpdateDelegationSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["pending", "active", "paused", "revoked", "expired"] },
    policy: {
      type: "object",
      properties: {
        maxPerTransaction: { type: "string" },
        maxTotal: { type: "string" },
        allowedMerchants: { type: "array", items: { type: "string" } },
        allowedCategories: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string" }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

export function validateSchema(schema: any, data: unknown): { valid: boolean; errors?: ValidationErrorDetail[] } {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (valid) {
    return { valid: true };
  } else {
    const errors: ValidationErrorDetail[] = (validate.errors ?? []).map((err: any) => ({
      field: err.instancePath.slice(1) || "body",
      message: err.message ?? "Invalid value",
      keyword: err.keyword
    }));
    return { valid: false, errors };
  }
}
