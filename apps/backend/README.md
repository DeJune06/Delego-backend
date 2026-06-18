# Backend Services

This directory contains the backend microservices that power the Delego platform. Each service is independently deployable and exposes a health check endpoint.

## 📋 Table of Contents

- [Overview](#overview)
- [Services](#services)
- [Architecture](#architecture)
- [Development](#development)
- [Service Communication](#service-communication)
- [Monitoring](#monitoring)
- [Deployment](#deployment)

## Overview

The backend services directory contains microservices that implement the core business logic of the Delego platform. Each service is designed to be:

- **Independent**: Can be developed and deployed independently
- **Scalable**: Can scale horizontally based on demand
- **Resilient**: Handles failures gracefully
- **Observable**: Provides metrics and logging
- **Secure**: Implements proper security measures

### Service Principles

- **Single Responsibility**: Each service has a single, well-defined purpose
- **API-First**: Services expose well-defined APIs
- **Stateless**: Services are stateless where possible
- **Event-Driven**: Services communicate via events
- **Fail-Safe**: Services degrade gracefully on failure

## Services

### Gateway Service (`apps/backend/gateway`)

**Package**: `@delego/gateway`
**Port**: 3000
**Health Check**: `GET /health`

The API gateway serves as the single entry point for all client requests.

#### Responsibilities

- HTTP API endpoint management
- JWT authentication and validation
- Role-based access control (RBAC)
- Wallet-based authorization
- Rate limiting and throttling
- Request routing to backend services
- API versioning
- Request/response logging
- CORS handling

#### Tech Stack

- Node.js with Express/Fastify
- JWT for authentication
- Redis for rate limiting
- PostgreSQL for user data

#### Endpoints

- `POST /api/v1/auth/login` - User authentication
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/wallet/connect` - Wallet connection
- `GET /api/v1/delegations` - List user delegations
- `POST /api/v1/delegations` - Create delegation
- `GET /api/v1/orders` - List orders
- `POST /api/v1/orders` - Create order

### Orchestrator Service (`apps/backend/orchestrator`)

**Package**: `@delego/orchestrator`
**Port**: 3010
**Health Check**: `GET /health`

The orchestrator service coordinates purchase workflows across multiple services.

#### Responsibilities

- Purchase workflow coordination
- State machine management
- Event publishing/subscribing
- Service orchestration
- Workflow persistence
- Error handling and retries
- Timeout management

#### Workflow States

1. `INITIATED` - Order created by user
2. `SEARCHING` - Agent searching for products
3. `FOUND` - Products found, awaiting approval
4. `APPROVED` - User approved purchase
5. `ESCROW_FUNDED` - Funds locked in escrow
6. `PURCHASED` - Purchase completed
7. `DELIVERING` - Delivery in progress
8. `DELIVERED` - Delivery confirmed
9. `COMPLETED` - Order completed
10. `CANCELLED` - Order cancelled
11. `FAILED` - Order failed

#### Tech Stack

- Node.js with TypeScript
- State machine library (XState)
- Event bus (Redis Pub/Sub)
- PostgreSQL for workflow persistence

### Wallet Service (`apps/backend/wallet`)

**Package**: `@delego/wallet`
**Port**: 3012
**Health Check**: `GET /health`

The wallet service manages Stellar wallets and Soroban permissions.

#### Responsibilities

- Stellar account management
- Soroban permission grants
- Transaction signing
- Transaction submission
- Balance tracking
- Key management
- Soroban contract simulation

#### Security Features

- Encrypted key storage
- Hardware Security Module (HSM) integration (Planned)
- Multi-signature support (Planned)
- Session keys for delegated operations

#### Tech Stack

- Node.js with TypeScript
- Stellar SDK for JavaScript
- Soroban RPC client
- PostgreSQL for wallet data

### Payments Service (`apps/backend/payments`)

**Package**: `@delego/payments`
**Port**: 3014
**Health Check**: `GET /health`

The payments service coordinates payment and escrow operations.

#### Responsibilities

- Escrow contract coordination
- Payment event processing
- Settlement execution
- Refund processing
- Payment status tracking
- Transaction monitoring

#### Payment Flow

1. User approves purchase
2. Wallet service signs transaction
3. Payments service funds escrow
4. Escrow contract locks funds
5. Delivery confirmed
6. Escrow releases funds to merchant
7. Settlement recorded

#### Tech Stack

- Node.js with TypeScript
- Soroban SDK
- Stellar SDK
- PostgreSQL for payment records

### Notifications Service (`apps/backend/notifications`)

**Package**: `@delego/notifications`
**Port**: 3015
**Health Check**: `GET /health`

The notifications service sends customer-facing updates.

#### Responsibilities

- Email notifications
- Push notifications
- SMS notifications (Planned)
- Notification templates
- User preferences
- Delivery tracking
- Retry logic

#### Notification Types

- Order status updates
- Payment confirmations
- Approval requests
- Delivery notifications
- Security alerts

#### Tech Stack

- Node.js with TypeScript
- SendGrid for email
- Web Push API for push notifications
- Twilio for SMS (Planned)

## Architecture

### Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      API Gateway                         │
│                   (Port 3000)                             │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        v            v            v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Orchestrator  │ │    Wallet    │ │   Payments   │
│  (Port 3010)  │ │  (Port 3012) │ │  (Port 3014)  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │               │               │
       v               v               v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    Agents    │ │   Stellar    │ │   Soroban    │
│  (Port 3011)  │ │   Network    │ │   Contracts  │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Service Dependencies

```
Gateway
  ├─> Orchestrator
  │    ├─> Agents
  │    └─> Wallet
  ├─> Wallet
  └─> Payments
       ├─> Wallet
       └─> Soroban Contracts

Notifications (independent, receives events)
```

## Development

### Service Structure

Each service follows a consistent structure:

```
apps/backend/
├── gateway/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── auth/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── orchestrator/
│   ├── src/
│   │   ├── workflows/
│   │   ├── state/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
└── ...
```

### Running Services

```bash
# Start all services
pnpm dev

# Start specific service
pnpm dev:gateway
pnpm dev:orchestrator
pnpm dev:agents
pnpm dev:wallet
pnpm dev:payments
pnpm dev:notifications
```

### Building Services

```bash
# Build all services
pnpm build

# Build specific service
pnpm --filter @delego/gateway build
```

### Testing Services

```bash
# Test all services
pnpm test

# Test specific service
pnpm --filter @delego/gateway test
```

## Service Communication

### HTTP/REST

Services communicate via HTTP/REST for synchronous operations:

```typescript
// Service A calling Service B
const response = await axios.get('http://wallet-service:3012/balance');
```

### Event-Driven

Services communicate via events for asynchronous operations:

```typescript
// Publish event
redis.publish('order:created', JSON.stringify(order));

// Subscribe to event
redis.subscribe('order:created', (message) => {
  // Handle event
});
```

### Service Discovery

Services discover each other via:
- **Development**: Hardcoded localhost URLs
- **Staging**: Kubernetes service discovery
- **Production**: Service mesh (Istio)

## Monitoring

### Health Checks

All services expose a health check endpoint:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "service": "gateway",
  "version": "0.0.1",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### Metrics

Services expose metrics for monitoring:
- Request count
- Request duration
- Error rate
- Active connections
- Custom business metrics

### Logging

Structured logging with correlation IDs:

```typescript
logger.info('Processing request', {
  requestId: 'abc-123',
  userId: 'user-123',
  action: 'create_delegation'
});
```

## Deployment

### Development

Services run locally via Docker Compose:

```bash
pnpm docker:up
pnpm dev
```

### Staging

Services deployed to Kubernetes staging cluster:

```bash
kubectl apply -f k8s/staging/
```

### Production

Services deployed to Kubernetes production cluster with blue-green deployment:

```bash
kubectl apply -f k8s/production/
```

### Scaling

Services can be scaled horizontally:

```bash
# Scale gateway to 3 replicas
kubectl scale deployment gateway --replicas=3
```

## Best Practices

### Service Design

- **Single Responsibility**: Each service does one thing well
- **API Design**: RESTful API design principles
- **Error Handling**: Consistent error handling across services
- **Idempotency**: Operations should be idempotent where possible
- **Timeouts**: Implement appropriate timeouts for external calls

### Security

- **Authentication**: JWT-based authentication
- **Authorization**: Role-based access control
- **Encryption**: Encrypt sensitive data
- **Secrets Management**: Use secret management systems
- **Input Validation**: Validate all inputs

### Performance

- **Caching**: Cache frequently accessed data
- **Connection Pooling**: Use connection pooling for databases
- **Async Operations**: Use async/await for I/O operations
- **Load Testing**: Perform load testing before deployment

### Reliability

- **Circuit Breakers**: Implement circuit breakers for external calls
- **Retries**: Implement exponential backoff for retries
- **Health Checks**: Implement health checks for monitoring
- **Graceful Shutdown**: Handle shutdown signals gracefully

## Troubleshooting

### Common Issues

**Service won't start**
```bash
# Check logs
pnpm dev:gateway

# Check port availability
lsof -i :3000

# Check dependencies
pnpm install
```

**Service communication issues**
```bash
# Check service health
curl http://localhost:3000/health

# Check network connectivity
ping wallet-service

# Check logs for errors
```

**Database connection issues**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL
```

## Documentation

- [Gateway Service README](./gateway/README.md)
- [Orchestrator Service README](./orchestrator/README.md)
- [Agents Service README](../../agents/README.md)
- [Wallet Service README](./wallet/README.md)
- [Payments Service README](./payments/README.md)
- [Notifications Service README](./notifications/README.md)

---

**Last Updated**: June 2026
