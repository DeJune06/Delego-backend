/** Standard API response envelopes */

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface PaginatedRequest {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  version: string;
  timestamp: string;
}
