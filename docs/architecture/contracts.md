# Smart Contract Architecture

Delego uses Soroban smart contracts to anchor trust-critical state on the Stellar blockchain, ensuring security, transparency, and programmable trust for agent-mediated commerce.

## 📋 Table of Contents

- [Overview](#overview)
- [Contract Types](#contract-types)
- [On-Chain vs Off-Chain](#on-chain-vs-off-chain)
- [Contract Interactions](#contract-interactions)
- [State Management](#state-management)
- [Upgrade Patterns](#upgrade-patterns)
- [Security Considerations](#security-considerations)

## Overview

Smart contracts are used for trust-critical operations that require blockchain guarantees, while off-chain services handle high-throughput operations like catalog search and product discovery.

### Design Principles

- **Trust-Critical On-Chain**: Only trust-critical state on-chain
- **Off-Chain Efficiency**: High-throughput operations off-chain
- **Minimal Gas**: Optimize for minimal gas usage
- **Upgradeability**: Design for contract upgrades
- **Security First**: Prioritize security in all contracts

## Contract Types

### Escrow Contract

**On-chain State**: Locked funds per order

#### Purpose

The escrow contract holds funds in trust during agent-mediated purchases, releasing funds only when predefined conditions are met.

#### Key Functions

- `lock_funds(order_id, amount, buyer, merchant)`: Lock funds for an order
- `release_funds(order_id)`: Release funds to merchant
- `refund_funds(order_id)`: Refund funds to buyer
- `get_balance(order_id)`: Get locked balance for an order
- `get_status(order_id)`: Get escrow status

#### State

```rust
struct EscrowState {
    order_id: Bytes,
    buyer: Address,
    merchant: Address,
    amount: i128,
    status: EscrowStatus,
    created_at: u64,
    time_lock: u64,
}

enum EscrowStatus {
    Locked,
    Released,
    Refunded,
    Disputed,
}
```

#### Use Cases

- Buyer approves purchase → funds locked in escrow
- Delivery confirmed → funds released to merchant
- Delivery failed → funds refunded to buyer
- Dispute → funds held until resolution

### Permissions Contract

**On-chain State**: Delegate spending limits

#### Purpose

The permissions contract manages delegated spending authority, allowing users to grant agents limited permission to spend on their behalf.

#### Key Functions

- `grant_permission(delegator, delegate, limit, expiry)`: Grant spending permission
- `revoke_permission(delegator, delegate)`: Revoke spending permission
- `check_permission(delegator, delegate, amount)`: Check if amount is within limit
- `get_permission(delegator, delegate)`: Get permission details
- `update_limit(delegator, delegate, new_limit)`: Update spending limit

#### State

```rust
struct Permission {
    delegator: Address,
    delegate: Address,
    limit: i128,
    spent: i128,
    expiry: u64,
    created_at: u64,
}
```

#### Use Cases

- User creates delegation → permission granted to agent
- Agent attempts payment → permission checked
- Spending limit reached → payment blocked
- User revokes delegation → permission revoked

### Reputation Contract (Planned)

**On-chain State**: Cumulative scores

#### Purpose

The reputation contract tracks on-chain reputation scores for merchants and agents, enabling trust-based decision making.

#### Key Functions

- `record_transaction(merchant, amount, rating)`: Record transaction and rating
- `get_reputation(entity)`: Get reputation score
- `update_reputation(entity, score)`: Update reputation score
- `get_transaction_history(entity)`: Get transaction history

#### State

```rust
struct Reputation {
    entity: Address,
    score: i128,
    transaction_count: u64,
    total_amount: i128,
    average_rating: i128,
}

struct Transaction {
    entity: Address,
    amount: i128,
    rating: i128,
    timestamp: u64,
}
```

#### Use Cases

- Merchant completes order → reputation updated
- User rates merchant → rating recorded
- Agent selects merchant → reputation considered
- Reputation threshold → merchant eligibility

### Marketplace Contract (Planned)

**On-chain State**: Merchant registry, listing anchors

#### Purpose

The marketplace contract maintains a registry of merchants and anchors, enabling discovery and verification of trusted merchants.

#### Key Functions

- `register_merchant(merchant, metadata)`: Register merchant
- `verify_merchant(merchant)`: Verify merchant
- `get_merchant(merchant)`: Get merchant details
- `list_merchants(criteria)`: List merchants by criteria
- `update_merchant(merchant, metadata)`: Update merchant metadata

#### State

```rust
struct Merchant {
    address: Address,
    name: String,
    metadata: Bytes,
    verified: bool,
    reputation: Address, // Reference to reputation contract
    registered_at: u64,
}
```

#### Use Cases

- Merchant registers → added to registry
- Merchant verified → verification status updated
- User searches marketplace → merchant list returned
- Merchant updates info → metadata updated

## On-Chain vs Off-Chain

### On-Chain (Smart Contracts)

Trust-critical operations that require blockchain guarantees:

- **Escrow**: Fund locking and release
- **Permissions**: Spending authority delegation
- **Reputation**: Reputation score tracking
- **Marketplace**: Merchant registry and verification

### Off-Chain (Services)

High-throughput operations that don't require blockchain guarantees:

- **Catalog**: Product catalog and search
- **Search**: Product search and comparison
- **Analytics**: Spending analytics and reporting
- **Notifications**: Email and push notifications

### Hybrid Approach

Some operations use a hybrid approach:

- **Order Creation**: Off-chain order creation, on-chain escrow
- **Payment**: Off-chain payment initiation, on-chain settlement
- **Reputation**: Off-chain rating collection, on-chain aggregation

## Contract Interactions

### Cross-Contract Calls

Contracts can call other contracts:

```rust
// Escrow contract calling Permissions contract
let permission = permissions::check_permission(
    &e,
    &buyer,
    &agent,
    &amount
);
```

### Contract-to-Service Communication

Services interact with contracts via the wallet service:

```
Wallet Service
    ↓
Soroban RPC
    ↓
Smart Contracts
```

### Event Emission

Contracts emit events for off-chain services:

```rust
// Emit event when funds are locked
events::publish(
    &e,
    (Symbol::new(&e, Symbol::short("locked")), order_id, amount)
);
```

## State Management

### Persistent Storage

Contract state is stored in persistent Soroban storage:

```rust
// Store permission
e.storage().persistent().set(
    &StorageKey::from(b"permission"),
    &permission
);

// Retrieve permission
let permission: Permission = e.storage()
    .persistent()
    .get(&StorageKey::from(b"permission"))
    .unwrap();
```

### Temporary Storage

Temporary storage for ephemeral data:

```rust
// Store temporary data
e.storage().temporary().set(
    &StorageKey::from(b"temp"),
    &data
);
```

### Instance Storage

Instance storage for contract instances:

```rust
// Store instance data
e.storage().instance().set(
    &StorageKey::from(b"instance"),
    &data
);
```

## Upgrade Patterns

### Upgradeable Contracts

Contracts are designed to be upgradeable:

```rust
// Check if upgrade is authorized
require!(
    e.storage().instance().has(&StorageKey::from(b"upgrade_authority")),
    "Not authorized"
);

// Upgrade contract
e.deployer()
    .update_current_contract_wasm(new_wasm);
```

### Migration Strategy

When upgrading contracts:

1. Deploy new contract
2. Migrate state from old contract
3. Update references
4. Decommission old contract

### Versioning

Contracts include version information:

```rust
struct ContractInfo {
    version: u32,
    name: String,
    upgraded_at: u64,
}
```

## Security Considerations

### Access Control

Contracts implement strict access control:

```rust
// Only owner can call this function
require!(
    e.invoker() == owner,
    "Not authorized"
);
```

### Input Validation

All inputs are validated:

```rust
// Validate amount is positive
require!(
    amount > 0,
    "Amount must be positive"
);
```

### Reentrancy Protection

Contracts protect against reentrancy:

```rust
// Reentrancy guard
let guard = ReentrancyGuard::new(&e);
guard.enter();
// ... contract logic
guard.exit();
```

### Overflow Protection

Contracts protect against overflow:

```rust
// Use checked arithmetic
let new_amount = amount.checked_add(spent).unwrap();
```

### Audit Trail

All contract operations are logged:

```rust
// Log operation
events::publish(
    &e,
    (Symbol::new(&e, Symbol::short("operation")), operation_id, details)
);
```

## Gas Optimization

### Efficient Storage

Optimize storage for minimal gas usage:

```rust
// Use compact data structures
struct CompactPermission {
    delegator: Address,
    delegate: Address,
    limit: i128,  // Use i128 instead of u256
    expiry: u64,
}
```

### Batch Operations

Batch operations to reduce gas:

```rust
// Batch multiple operations
for permission in permissions {
    check_permission(&e, &permission);
}
```

### Lazy Evaluation

Defer expensive operations:

```rust
// Only compute when needed
if needs_computation {
    compute_expensive_operation();
}
```

## Testing

### Unit Tests

Test individual contract functions:

```rust
#[test]
fn test_lock_funds() {
    let env = Env::default();
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);

    client.lock_funds(&env, &order_id, &amount, &buyer, &merchant);
    
    let balance = client.get_balance(&env, &order_id);
    assert_eq!(balance, amount);
}
```

### Integration Tests

Test contract interactions:

```rust
#[test]
fn test_escrow_permissions_integration() {
    let env = Env::default();
    // Test interaction between escrow and permissions contracts
}
```

### Fuzzing

Use fuzzing to find edge cases:

```rust
#[test]
fn fuzz_lock_funds() {
    // Fuzz test with random inputs
}
```

## Deployment

### Testnet Deployment

Deploy contracts to Stellar testnet:

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source alice \
  --network testnet
```

### Mainnet Deployment

Deploy contracts to Stellar mainnet:

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source alice \
  --network mainnet
```

### Verification

Verify contract deployment:

```bash
soroban contract inspect \
  --contract-id <contract-id> \
  --network testnet
```

## Monitoring

### Contract Events

Monitor contract events:

```bash
soroban contract events \
  --contract-id <contract-id> \
  --network testnet
```

### State Queries

Query contract state:

```bash
soroban contract invoke \
  --id <contract-id> \
  --fn get_balance \
  --arg <order-id> \
  --network testnet
```

### Analytics

Track contract analytics:

- Transaction volume
- Gas usage
- Error rates
- Active contracts

## Documentation

See [contracts/README.md](../../contracts/README.md) for detailed contract documentation including:

- Contract implementation details
- Development setup
- Testing procedures
- Deployment guides
- Security best practices

---

**Last Updated**: June 2026
