import type {
  ApiResponse,
  HealthCheckResponse,
} from "@delego/types";
import {
  ApiResponseSchema,
  DelegationSchema,
  HealthCheckResponseSchema,
  OrderSchema,
  validateResponse,
} from "./schemas.js";

export interface DelegoClientOptions {
  baseUrl: string;
  /** Bearer token for authenticated requests */
  token?: string;
  /** Timeout in milliseconds for requests (default: 30000) */
  timeout?: number;
}

export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match?.[1];
}

/**
 * HTTP client for the Delego API Gateway.
 * TODO: Implement full endpoint coverage as routes are added.
 */
export class DelegoClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeout: number;

  constructor(options: DelegoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.timeout = options.timeout ?? 30000;
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { timeout?: number; signal?: AbortSignal },
    dataSchema?: import("zod").ZodType<unknown>
  ): Promise<ApiResponse<T>> {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (STATE_CHANGING_METHODS.has(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
    }

    const controller = new AbortController();
    const timeoutMs = init?.timeout ?? this.timeout;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const externalSignal = init?.signal;
    let onExternalAbort: (() => void) | undefined;
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        throw new DOMException("The operation was aborted", "AbortError");
      }
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener("abort", onExternalAbort, {
        once: true,
      });
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }

      const rawData = await response.json();
      if (dataSchema) {
        const schema = ApiResponseSchema(dataSchema);
        return validateResponse(rawData, schema) as ApiResponse<T>;
      }
      return rawData as ApiResponse<T>;
    } catch (error) {
      clearTimeout(timer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
      if (
        error instanceof DOMException &&
        error.name === "AbortError" &&
        controller.signal.aborted
      ) {
        if (externalSignal?.aborted) {
          throw new DOMException("The operation was aborted", "AbortError");
        }
        throw new TimeoutError();
      }
      throw error;
    }
  }

  async health(): Promise<ApiResponse<HealthCheckResponse>> {
    return this.request<HealthCheckResponse>(
      "/health",
      undefined,
      HealthCheckResponseSchema
    );
  }

  async getDelegations(): Promise<ApiResponse<import("@delego/types").Delegation[]>> {
    return this.request<import("@delego/types").Delegation[]>(
      "/api/v1/delegations",
      undefined,
      z.array(DelegationSchema)
    );
  }

  async getOrders(): Promise<ApiResponse<import("@delego/types").Order[]>> {
    return this.request<import("@delego/types").Order[]>(
      "/api/v1/orders",
      undefined,
      z.array(OrderSchema)
    );
  }
}

import { z } from "zod";
