# Wallet Architecture

The wallet service bridges Delego to Stellar and Soroban, managing Stellar accounts, Soroban permissions, transaction signing, and blockchain interactions.

## 📋 Table of Contents

- [Overview](#overview)
- [Responsibilities](#responsibilities)
- [Architecture](#architecture)
- [Key Management](#key-management)
- [Soroban Permissions](#soroban-permissions)
- [Transaction Management](#transaction-management)
- [Security](#security)

## Overview

The wallet service is the bridge between the Delego platform and the Stellar blockchain. It manages Stellar accounts, handles Soroban smart contract interactions, signs transactions, and ensures secure key management.

### Design Principles

- **Security First**: Security is the highest priority
- **Non-Custodial**: Users maintain control of their keys
- **Flexibility**: Support multiple wallet types
- **Transparency**: All operations are logged and auditable
- **Reliability**: High availability and fault tolerance

## Responsibilities

### Account Management (Horizon API)

The wallet service manages Stellar accounts through the Horizon API:

- **Account Creation**: Create new Stellar accounts
- **Account Funding**: Fund accounts with XLM
- **Balance Tracking**: Track account balances
- **Transaction History**: Retrieve transaction history
- **Account Information**: Get account details

### Permission Grants (Permissions Contract)

The wallet service manages Soroban permissions:

- **Grant Permissions**: Grant spending permissions to agents
- **Revoke Permissions**: Revoke agent permissions
- **Check Permissions**: Check if permissions are valid
- **Update Permissions**: Update permission limits
- **Permission History**: Track permission changes

### Transaction Signing and Submission

The wallet service handles transaction signing and submission:

- **Transaction Building**: Build Stellar transactions
- **Transaction Signing**: Sign transactions with private keys
- **Transaction Submission**: Submit transactions to the network
- **Transaction Simulation**: Simulate transactions before submission
- **Transaction Status**: Track transaction status

### Soroban Contract Simulation

The wallet service simulates Soroban contract invocations:

- **Contract Simulation**: Simulate contract calls
- **Gas Estimation**: Estimate gas costs
- **Result Prediction**: Predict contract results
- **Error Detection**: Detect errors before submission
- **State Inspection**: Inspect contract state

## Architecture

### Service Components

```
┌─────────────────────────────────────────┐
│         Wallet Service                  │
│  ┌──────────┐  ┌──────────┐            │
│  │ Account  │  │ Permission│            │
│  │ Manager  │  │ Manager   │            │
│  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐            │
│  │ Transaction│  │ Contract  │            │
│  │ Manager  │  │ Simulator │            │
│  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐            │
│  │   Key    │  │   Event  │            │
│  │ Manager  │  │  Publisher│            │
│  └──────────┘  └──────────┘            │
└─────────────────────────────────────────┘
```

### External Dependencies

- **Stellar Horizon API**: Account and transaction management
- **Soroban RPC**: Smart contract interaction
- **Key Storage**: Secure key storage (HSM, KMS)
- **Database**: Wallet data persistence
- **Event Bus**: Event publishing

### API Endpoints

#### Account Endpoints

- `GET /wallet/accounts/:address` - Get account details
- `POST /wallet/accounts` - Create new account
- `GET /wallet/accounts/:address/balance` - Get account balance
- `GET /wallet/accounts/:address/transactions` - Get transaction history

#### Permission Endpoints

- `POST /wallet/permissions/grant` - Grant permission
- `POST /wallet/permissions/revoke` - Revoke permission
- `GET /wallet/permissions/:id` - Get permission details
- `POST /wallet/permissions/check` - Check permission

#### Transaction Endpoints

- `POST /wallet/transactions/build` - Build transaction
- `POST /wallet/transactions/sign` - Sign transaction
- `POST /wallet/transactions/submit` - Submit transaction
- `GET /wallet/transactions/:id` - Get transaction status

#### Contract Endpoints

- `POST /wallet/contracts/simulate` - Simulate contract call
- `POST /wallet/contracts/invoke` - Invoke contract
- `GET /wallet/contracts/:id/state` - Get contract state

## Key Management

### Key Storage Options

#### Environment Variables (Development)

Store keys in environment variables for development:

```bash
WALLET_PRIVATE_KEY=SABCD...
```

#### AWS KMS (Production)

Use AWS Key Management Service for production:

```typescript
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';

const kms = new KMSClient();
const command = new DecryptCommand({ CiphertextBlob: encryptedKey });
const response = await kms.send(command);
```

#### HSM Integration (Future)

Hardware Security Module integration for maximum security:

- **Key Generation**: Generate keys in HSM
- **Key Storage**: Store keys in HSM
- **Signing**: Sign transactions in HSM
- **Access Control**: Strict access controls

### Key Types

#### User Wallet Keys

- **Private Key**: User's Stellar private key
- **Public Key**: User's Stellar public key
- **Secret Seed**: User's secret seed (for recovery)

#### Session Keys

- **Temporary Keys**: Temporary keys for delegated operations
- **Time-Limited**: Keys expire after a set time
- **Revocable**: Keys can be revoked at any time
- **Limited Scope**: Keys have limited permissions

#### Service Keys

- **Service Keys**: Keys for service operations
- **Rotatable**: Keys can be rotated regularly
- **Access Controlled**: Strict access controls
- **Audited**: All key usage is audited

### Key Rotation

Regular key rotation for security:

- **User Keys**: Rotate on user request
- **Service Keys**: Rotate regularly (e.g., every 90 days)
- **Session Keys**: Rotate automatically on expiry
- **Compromised Keys**: Rotate immediately if compromised

## Soroban Permissions

### Permission Model

Soroban permissions enable delegated spending:

```rust
struct Permission {
    delegator: Address,  // User granting permission
    delegate: Address,   // Agent receiving permission
    limit: i128,        // Spending limit
    spent: i128,       // Amount spent
    expiry: u64,        // Expiration timestamp
}
```

### Permission Granting

Grant permission to an agent:

```typescript
const permission = await walletService.grantPermission({
  delegator: userAddress,
  delegate: agentAddress,
  limit: 10000000,
  expiry: Date.now() + 86400000, // 24 hours
});
```

### Permission Checking

Check if permission is valid:

```typescript
const isValid = await walletService.checkPermission({
  delegator: userAddress,
  delegate: agentAddress,
  amount: 5000000,
});
```

### Permission Revocation

Revoke agent permission:

```typescript
await walletService.revokePermission({
  delegator: userAddress,
  delegate: agentAddress,
});
```

## Transaction Management

### Transaction Building

Build Stellar transactions:

```typescript
const transaction = await walletService.buildTransaction({
  sourceAccount: userAddress,
  operations: [
    {
      type: 'payment',
      destination: merchantAddress,
      amount: '1000',
      asset: 'XLM',
    },
  ],
});
```

### Transaction Signing

Sign transactions securely:

```typescript
const signedTransaction = await walletService.signTransaction({
  transaction,
  privateKey: userPrivateKey,
});
```

### Transaction Simulation

Simulate transactions before submission:

```typescript
const simulation = await walletService.simulateTransaction({
  transaction,
  network: 'testnet',
});
```

### Transaction Submission

Submit transactions to the network:

```typescript
const result = await walletService.submitTransaction({
  signedTransaction,
  network: 'testnet',
});
```

### Transaction Status

Track transaction status:

```typescript
const status = await walletService.getTransactionStatus({
  transactionId,
  network: 'testnet',
});
```

## Security

### Key Security

Never store user secrets in plaintext:

- **Encryption**: Encrypt all keys at rest
- **Secure Storage**: Use secure key storage (KMS, HSM)
- **Access Control**: Strict access controls
- **Audit Logging**: Log all key access

### Transaction Security

Ensure transaction security:

- **Validation**: Validate all transaction parameters
- **Simulation**: Simulate transactions before submission
- **Signing**: Sign transactions in secure environment
- **Verification**: Verify transaction results

### Permission Security

Secure permission management:

- **Validation**: Validate permission parameters
- **Expiration**: Enforce permission expiration
- **Revocation**: Support immediate revocation
- **Auditing**: Log all permission changes

### Network Security

Secure network communication:

- **TLS**: Use TLS for all network communication
- **Authentication**: Authenticate all requests
- **Authorization**: Authorize all operations
- **Rate Limiting**: Rate limit API calls

### Audit Logging

Comprehensive audit logging:

- **Key Access**: Log all key access
- **Transactions**: Log all transactions
- **Permissions**: Log all permission changes
- **Errors**: Log all errors and exceptions

## Best Practices

### Development

- **Environment Variables**: Use environment variables for keys
- **Testnet**: Use testnet for development
- **Mocking**: Mock blockchain interactions for testing
- **Validation**: Validate all inputs

### Production

- **KMS**: Use AWS KMS for key storage
- **HSM**: Use HSM for critical operations
- **Monitoring**: Monitor all wallet operations
- **Alerting**: Alert on suspicious activity

### Key Management

- **Rotation**: Rotate keys regularly
- **Backup**: Secure backup of keys
- **Recovery**: Implement key recovery procedures
- **Compromise**: Have procedures for key compromise

### Transaction Management

- **Simulation**: Always simulate before submission
- **Validation**: Validate all transactions
- **Retry**: Implement retry logic for failed transactions
- **Monitoring**: Monitor transaction status

## Troubleshooting

### Common Issues

**Transaction Fails**

```bash
# Check transaction status
curl http://localhost:3012/transactions/:id

# Simulate transaction
curl -X POST http://localhost:3012/transactions/simulate
```

**Permission Denied**

```bash
# Check permission details
curl http://localhost:3012/permissions/:id

# Verify permission is not expired
```

**Key Not Found**

```bash
# Check key storage
# Verify key is properly stored
# Check key access logs
```

## Future Enhancements

### Multi-Chain Support

Support for multiple blockchains:

- **Ethereum**: Support for Ethereum transactions
- **Polygon**: Support for Polygon transactions
- **Other Chains**: Support for additional chains

### Advanced Key Management

Advanced key management features:

- **Multi-Signature**: Support for multi-signature wallets
- **Threshold Signatures**: Threshold signature schemes
- **Social Recovery**: Social key recovery
- **Biometric Authentication**: Biometric key authentication

### Enhanced Security

Enhanced security features:

- **Zero-Knowledge Proofs**: Zero-knowledge proof support
- **Hardware Wallets**: Hardware wallet integration
- **Secure Enclave**: Secure enclave integration
- **Quantum Resistance**: Quantum-resistant cryptography

---

**Last Updated**: June 2026
