import { describe, it, expect } from "vitest";
import {
  validateResponse,
  ValidationError,
  DelegationSchema,
  OrderSchema,
  HealthCheckResponseSchema,
  ApiResponseSchema,
} from "./schemas.js";

describe("validateResponse", () => {
  it("validates valid response and returns typed data", () => {
    const data = {
      id: "123",
      userId: "user-1",
      agentId: "agent-1",
      status: "active",
      policy: {
        maxPerTransaction: 1000n,
        maxTotal: 10000n,
        allowedMerchants: [],
        expiresAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = validateResponse(data, DelegationSchema);
    expect(result.id).toBe("123");
    expect(result.status).toBe("active");
  });

  it("throws ValidationError with field path for missing required field", () => {
    const data = {
      id: "123",
      // missing userId
    };

    expect(() => validateResponse(data, DelegationSchema)).toThrow(
      ValidationError
    );
    expect(() => validateResponse(data, DelegationSchema)).toThrow(
      'Validation failed at "userId"'
    );
  });

  it("throws ValidationError for invalid enum value", () => {
    const data = {
      id: "123",
      userId: "user-1",
      agentId: "agent-1",
      status: "invalid-status",
      policy: {
        maxPerTransaction: 1000n,
        maxTotal: 10000n,
        allowedMerchants: [],
        expiresAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(() => validateResponse(data, DelegationSchema)).toThrow(
      ValidationError
    );
  });

  it("strips extra fields in strict mode", () => {
    const data = {
      id: "123",
      userId: "user-1",
      agentId: "agent-1",
      status: "active",
      policy: {
        maxPerTransaction: 1000n,
        maxTotal: 10000n,
        allowedMerchants: [],
        expiresAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      extraField: "should be stripped",
    };

    const result = validateResponse(data, DelegationSchema);
    expect(result).not.toHaveProperty("extraField");
  });

  it("validates ApiResponse wrapper", () => {
    const rawData = {
      data: {
        id: "123",
        userId: "user-1",
        agentId: "agent-1",
        status: "active",
        policy: {
          maxPerTransaction: 1000n,
          maxTotal: 10000n,
          allowedMerchants: [],
          expiresAt: null,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      error: null,
    };

    const schema = ApiResponseSchema(DelegationSchema);
    const result = validateResponse(rawData, schema);
    expect(result.data).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it("validates Order schema", () => {
    const data = {
      id: "order-1",
      userId: "user-1",
      delegationId: "del-1",
      merchantId: "merchant-1",
      status: "escrowed",
      lineItems: [
        {
          productId: "prod-1",
          quantity: 2,
          unitPriceStroops: 500n,
        },
      ],
      totalStroops: 1000n,
      escrowContractId: "escrow-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = validateResponse(data, OrderSchema);
    expect(result.id).toBe("order-1");
    expect(result.lineItems).toHaveLength(1);
  });

  it("validates HealthCheckResponse schema", () => {
    const data = {
      status: "ok",
      service: "gateway",
      version: "1.0.0",
      timestamp: "2024-01-01T00:00:00Z",
    };

    const result = validateResponse(data, HealthCheckResponseSchema);
    expect(result.status).toBe("ok");
  });
});
