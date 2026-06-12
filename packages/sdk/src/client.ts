import type {
  ApiResponse,
  Delegation,
  HealthCheckResponse,
  Order,
} from "@delego/types";

export interface DelegoClientOptions {
  baseUrl: string;
  /** Bearer token for authenticated requests */
  token?: string;
}

/**
 * HTTP client for the Delego API Gateway.
 * TODO: Implement full endpoint coverage as routes are added.
 */
export class DelegoClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: DelegoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(
    path: string,
    init?: RequestInit
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    return response.json() as Promise<ApiResponse<T>>;
  }

  async health(): Promise<ApiResponse<HealthCheckResponse>> {
    return this.request<HealthCheckResponse>("/health");
  }

  // TODO: Implement delegation endpoints
  async getDelegations(): Promise<ApiResponse<Delegation[]>> {
    return this.request<Delegation[]>("/api/v1/delegations");
  }

  // TODO: Implement order endpoints
  async getOrders(): Promise<ApiResponse<Order[]>> {
    return this.request<Order[]>("/api/v1/orders");
  }
}
