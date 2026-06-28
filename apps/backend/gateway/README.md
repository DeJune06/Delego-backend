# @delego/gateway

Delego **gateway** service.

## Development

```bash
pnpm --filter @delego/gateway dev
```

## Middleware

### Delegation Ownership Middleware

The gateway includes a reusable middleware for verifying delegation ownership before update or revoke actions.

**Location**: `apps/backend/gateway/middleware/delegationOwnership.ts`

**Interface**:

```typescript
export interface DelegationOwnershipCheck {
  userId: string;
  delegationId: string;
  owned: boolean;
}
```

**Functions**:

- `verifyDelegationOwnership(delegationIdParam?: string)` - Middleware function that verifies delegation ownership before allowing update or revoke actions. Returns 404 if delegation doesn't exist, 403 if user is not the owner.

- `checkDelegationOwnership(userId: string, delegationId: string)` - Helper function for programmatic ownership checks without middleware.

**Usage Example**:

```typescript
import { verifyDelegationOwnership } from "../middleware/delegationOwnership.js";

// In route handlers
router.patch(
  "/api/v1/delegations/:id",
  verifyDelegationOwnership(),
  updateDelegationHandler,
);
router.delete(
  "/api/v1/delegations/:id",
  verifyDelegationOwnership(),
  revokeDelegationHandler,
);
```

**Error Responses**:

- `404 NOT_FOUND` - Delegation does not exist
- `403 FORBIDDEN` - User does not have permission to modify the delegation

**Testing**: Unit tests are located in `apps/backend/gateway/routes/delegations.test.ts`

## Health Check

Health check endpoint: `GET http://localhost:3000/health`

### Response Format

```json
{
  "data": {
    "status": "ok" | "degraded",
    "service": "gateway",
    "version": "0.0.1",
    "timestamp": "2026-06-24T12:00:00.000Z",
    "dependencies": [
      {
        "name": "postgresql",
        "status": "ok" | "degraded",
        "latencyMs": 15
      }
    ]
  },
  "error": null
}
```

### Dependency Checks

- **PostgreSQL**: Performs a lightweight `SELECT 1` query with a 5-second timeout
  - Status: `ok` when database responds successfully
  - Status: `degraded` when database is unavailable or times out
  - `latencyMs`: Query response time in milliseconds (0 when degraded)

### Overall Status

- `ok`: All dependencies are healthy
- `degraded`: One or more dependencies are unhealthy

The endpoint always returns HTTP 200, even when degraded, to distinguish between endpoint unavailability and service degradation.
