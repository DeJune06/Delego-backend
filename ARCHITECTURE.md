# Delego Architecture

## Overview

Delego implements a microservices architecture designed for AI-powered delegated commerce on the Stellar blockchain. The system enables users to delegate shopping and payment tasks to AI agents while maintaining approval and spending controls through Soroban smart contracts.

### Core Components

- **Frontend**: Customer web application (`apps/frontend`)
- **Backend Services**: Gateway, orchestrator, wallet, payments, notifications (under `apps/backend/`)
- **Agents**: AI agent runtime (`agents/`)
- **Smart Contracts**: Soroban escrow and permissions contracts
- **Shared Libraries**: UI components, SDK, types, utilities

### Design Principles

1. **Service Isolation**: Each service has a single responsibility and can be deployed independently
2. **Blockchain Security**: Trust-critical operations (escrow, permissions) live on-chain
3. **Off-Chain Efficiency**: Catalog data, search, and AI processing run off-chain
4. **Event-Driven**: Services communicate via events for loose coupling
5. **Audit Trail**: All actions are logged for transparency and debugging

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Layer                              │
│                  Web App (apps/frontend)                        │
│              React/Next.js + Stellar Wallet                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                          │
│             (apps/backend/gateway - Port 3000)                  │
│  • Authentication (JWT)                                         │
│  • Authorization (RBAC + Wallet-based)                          │
│  • Rate Limiting (Redis)                                        │
│  • Request Routing                                              │
│  • API Versioning                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        v                    v                    v
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Orchestrator   │  │     Wallet      │  │    Payments     │
│   Service       │  │    Service      │  │    Service      │
│   (Port 3010)   │  │   (Port 3012)   │  │   (Port 3014)   │
│                 │  │                 │  │                 │
│ • Workflow      │  │ • Stellar      │  │ • Escrow        │
│   Coordination  │  │   Account Mgmt  │  │   Coordination  │
│ • State Machine │  │ • Soroban      │  │ • Settlement    │
│ • Event Pub/Sub │  │   Permissions  │  │ • Payment Events│
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         v                    v                    v
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     Agents      │  │   Stellar       │  │    Soroban      │
│    Service      │  │   Network       │  │    Contracts    │
│   (Port 3011)   │  │                 │  │                 │
│                 │  │ • Horizon API   │  │ • Escrow        │
│ • Buyer Agent   │  │ • Transaction   │  │   Contract      │
│ • Payment Agent │  │   Submission    │  │ • Permissions   │
│ • Runtime       │  │ • Account       │  │   Contract      │
│   Abstraction   │  │   Management    │  │ • Reputation    │
└─────────────────┘  └─────────────────┘  └────────┬────────┘
                                                   │
                            ┌──────────────────────┼──────────────────────┐
                            │                      │                      │
                            v                      v                      v
                     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                     │   Escrow     │     │ Permissions  │     │  Reputation  │
                     │   Contract   │     │   Contract   │     │   Contract   │
                     │              │     │              │     │              │
                     │ • Fund Lock  │     │ • Spending   │     │ • Scores     │
                     │ • Release    │     │   Limits     │     │ • History    │
                     │ • Refund     │     │ • Approvals  │     │ • Disputes   │
                     └──────────────┘     └──────────────┘     └──────────────┘
```

### Supporting Services

```
┌─────────────────────────────────────────────────────────────────┐
│                   Notifications Service                          │
│                    (Port 3015)                                  │
│  • Email Notifications (SendGrid)                               │
│  • Push Notifications (Web Push)                                 │
│  • SMS Notifications (Twilio) - Planned                           │
│  • Notification Templates                                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                  │
│                                                                  │
│  PostgreSQL (Port 5432)          Redis (Port 6379)               │
│  • Users                         • Sessions                      │
│  • Delegations                   • Rate Limits                   │
│  • Orders                        • Workflow State Cache         │
│  • Audit Logs                    • Pub/Sub Channels              │
│  • Transactions                  • Temporary Data                │
└─────────────────────────────────────────────────────────────────┘
```

## Service Boundaries

### Gateway Service (`apps/backend/gateway`)

**Responsibilities:**
- HTTP API endpoint management
- JWT authentication and validation
- Role-based access control (RBAC)
- Wallet-based authorization
- Rate limiting and throttling
- Request routing to backend services
- API versioning
- Request/response logging
- CORS handling

**Tech Stack:**
- Node.js with Express/Fastify
- JWT for authentication
- Redis for rate limiting
- PostgreSQL for user data

**API Endpoints:**
- `POST /api/v1/auth/login` - User authentication
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/wallet/connect` - Wallet connection
- `GET /api/v1/delegations` - List user delegations
- `POST /api/v1/delegations` - Create delegation
- `GET /api/v1/orders` - List orders
- `POST /api/v1/orders` - Create order

### Orchestrator Service (`apps/backend/orchestrator`)

**Responsibilities:**
- Purchase workflow coordination
- State machine management
- Event publishing/subscribing
- Service orchestration
- Workflow persistence
- Error handling and retries
- Timeout management

**Workflow States:**
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

**Tech Stack:**
- Node.js with TypeScript
- State machine library (XState)
- Event bus (Redis Pub/Sub)
- PostgreSQL for workflow persistence

### Agents Service (`agents`)

**Responsibilities:**
- AI agent runtime execution
- LLM provider abstraction
- Tool registry and execution
- Memory management
- Agent context management
- Prompt engineering
- Response parsing and validation

**Agent Types:**
- **Buyer Agent**: Product search, comparison, recommendation
- **Payment Agent**: Spending policy enforcement, payment execution
- **Merchant Agent** (Planned): Fulfillment assistance
- **Delivery Agent** (Planned): Tracking and confirmation

**Tech Stack:**
- Node.js with TypeScript
- LLM APIs (OpenAI, Anthropic, etc.)
- Vector database for memory (Planned)
- Tool execution framework

### Wallet Service (`apps/backend/wallet`)

**Responsibilities:**
- Stellar account management
- Soroban permission grants
- Transaction signing
- Transaction submission
- Balance tracking
- Key management
- Soroban contract simulation

**Security Features:**
- Encrypted key storage
- Hardware Security Module (HSM) integration (Planned)
- Multi-signature support (Planned)
- Session keys for delegated operations

**Tech Stack:**
- Node.js with TypeScript
- Stellar SDK for JavaScript
- Soroban RPC client
- PostgreSQL for wallet data

### Payments Service (`apps/backend/payments`)

**Responsibilities:**
- Escrow contract coordination
- Payment event processing
- Settlement execution
- Refund processing
- Payment status tracking
- Transaction monitoring

**Payment Flow:**
1. User approves purchase
2. Wallet service signs transaction
3. Payments service funds escrow
4. Escrow contract locks funds
5. Delivery confirmed
6. Escrow releases funds to merchant
7. Settlement recorded

**Tech Stack:**
- Node.js with TypeScript
- Soroban SDK
- Stellar SDK
- PostgreSQL for payment records

### Notifications Service (`apps/backend/notifications`)

**Responsibilities:**
- Email notifications
- Push notifications
- SMS notifications (Planned)
- Notification templates
- User preferences
- Delivery tracking
- Retry logic

**Notification Types:**
- Order status updates
- Payment confirmations
- Approval requests
- Delivery notifications
- Security alerts

**Tech Stack:**
- Node.js with TypeScript
- SendGrid for email
- Web Push API for push notifications
- Twilio for SMS (Planned)

## Data Stores

### PostgreSQL

**Schema:**
- `users` - User accounts and profiles
- `wallets` - Stellar wallet addresses and metadata
- `delegations` - Agent delegation configurations
- `orders` - Purchase orders and status
- `transactions` - On-chain transaction records
- `audit_logs` - System audit trail
- `notifications` - Notification history
- `sessions` - User sessions

**Connection:**
- Port: 5432
- Database: `delego`
- Migrations managed via `database/migrations`

### Redis

**Use Cases:**
- Session storage (JWT tokens)
- Rate limiting (sliding window)
- Workflow state cache
- Pub/Sub for service communication
- Temporary data storage
- Caching frequently accessed data

**Connection:**
- Port: 6379
- Database: 0 (default)

### Soroban Smart Contracts

**Contract Storage:**
- Escrow contract - Locked funds per order
- Permissions contract - Delegated spending limits
- Reputation contract - Cumulative scores (Planned)

**Network:**
- Testnet for development
- Mainnet for production

## Cross-Cutting Concerns

### Authentication

- **JWT Tokens**: Issued by gateway after login
- **Wallet Addresses**: Used as primary identity
- **Session Management**: Redis-based session storage
- **Token Refresh**: Automatic token refresh mechanism

### Authorization

- **Role-Based Access Control (RBAC)**: User roles and permissions
- **Wallet-Based Permissions**: Soroban contract permissions
- **Spending Limits**: Enforced by permissions contract
- **Approval Thresholds**: Configurable approval amounts

### Spending Controls

- **Permissions Contract**: On-chain spending limits
- **Wallet Service Policy**: Off-chain policy checks
- **Approval Workflows**: User approval for high-value transactions
- **Real-time Monitoring**: Continuous spending tracking

### Observability

- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Distributed Tracing**: Request tracing across services (Planned)
- **Metrics**: Prometheus metrics collection (Planned)
- **Alerting**: Alerting on critical failures (Planned)

### Security

- **Encryption**: End-to-end encryption for sensitive data
- **Key Management**: Secure key storage and rotation
- **Audit Logging**: Complete audit trail of all actions
- **Input Validation**: Strict input validation and sanitization
- **SQL Injection Prevention**: Parameterized queries
- **XSS Prevention**: Content Security Policy (CSP)

## Communication Patterns

### Service-to-Service Communication

- **HTTP/REST**: Synchronous communication between services
- **gRPC** (Planned): High-performance RPC for internal communication
- **Message Queue** (Planned): Asynchronous event processing

### Event-Driven Architecture

- **Redis Pub/Sub**: Real-time event publishing
- **Event Types**: Order events, payment events, notification events
- **Event Sourcing** (Planned): Event log for state reconstruction

### External Integrations

- **Stellar Horizon API**: Blockchain interaction
- **Soroban RPC**: Smart contract interaction
- **LLM APIs**: AI agent execution
- **Email Service**: SendGrid integration
- **Push Service**: Web Push API

## Deployment Architecture

### Development Environment

- **Docker Compose**: Local development with all services
- **Hot Reload**: Development mode with auto-reload
- **Shared Database**: Single PostgreSQL instance
- **Shared Redis**: Single Redis instance

### Production Environment (Planned)

- **Kubernetes**: Container orchestration
- **Service Mesh**: Istio for service communication
- **Database Clustering**: PostgreSQL with replication
- **Redis Cluster**: Redis with clustering
- **Load Balancing**: Multiple instances per service
- **Auto-scaling**: Horizontal pod autoscaling

## Monitoring and Observability (Planned)

- **Metrics**: Prometheus for metrics collection
- **Logging**: ELK stack for log aggregation
- **Tracing**: Jaeger for distributed tracing
- **Alerting**: AlertManager for alert management
- **Dashboards**: Grafana for visualization

## Security Architecture

### Network Security

- **TLS/SSL**: All communication encrypted
- **Service Mesh**: mTLS for service-to-service communication
- **Network Policies**: Kubernetes network policies
- **DDoS Protection**: Cloudflare or similar

### Application Security

- **Authentication**: JWT with short-lived tokens
- **Authorization**: RBAC with wallet-based permissions
- **Input Validation**: Strict validation on all inputs
- **Output Encoding**: Prevent XSS attacks
- **CSRF Protection**: CSRF tokens for state-changing operations

### Blockchain Security

- **Smart Contract Audits**: Professional security audits
- **Multi-signature**: Multi-sig for critical operations
- **Time-locks**: Time-locked transactions
- **Emergency Controls**: Emergency pause mechanisms

## Scalability Considerations

### Horizontal Scaling

- **Stateless Services**: Gateway, orchestrator, agents
- **Stateful Services**: Wallet, payments (with shared state)
- **Database Sharding**: Horizontal database scaling
- **Cache Layer**: Redis for caching

### Performance Optimization

- **Connection Pooling**: Database connection pooling
- **Caching Strategy**: Multi-level caching
- **Lazy Loading**: On-demand data loading
- **Batch Processing**: Batch operations for efficiency

### Disaster Recovery

- **Database Backups**: Regular automated backups
- **Multi-Region Deployment**: Geographic distribution
- **Failover Mechanisms**: Automatic failover
- **Data Replication**: Real-time data replication

## Future Expansions

### Planned Services

- **Merchant App**: Seller-facing application
- **Mobile Apps**: iOS and Android applications
- **Delivery Agent**: Delivery tracking and coordination
- **Catalog Service**: Product catalog management
- **Analytics Service**: Business intelligence and analytics

### Planned Features

- **Multi-Chain Support**: Support for other blockchains
- **Advanced AI**: More sophisticated AI agents
- **Social Features**: Social commerce capabilities
- **Marketplace**: Open marketplace for merchants

## Further Reading

- [System Design](./docs/architecture/system-design.md)
- [Agent Architecture](./docs/architecture/agents.md)
- [Wallet Architecture](./docs/architecture/wallet.md)
- [Smart Contract Architecture](./docs/architecture/contracts.md)
- [API Reference](./docs/api-reference.md)
- [Contributing Guide](./docs/contributor-guide.md)
