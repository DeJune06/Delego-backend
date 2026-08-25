# @delegolabs/wallet

Delego **wallet** service.

## Development

```bash
pnpm --filter @delegolabs/wallet dev
```

Health check: `GET http://localhost:3012/health`

## Sequence Number Reservation System

To prevent sequence number conflicts during parallel transaction submission, we've implemented a pre-allocation block reservation system in Redis.

### Key Features

- **Non-overlapping sequence blocks**: Uses Redis locks to ensure concurrent workers get unique blocks
- **Expired reservation cleanup**: Automatically cleans up expired/invalid reservations
- **Backward compatible**: Falls back to the original cache mechanism if no reservations exist
- **Idempotent retries**: Safe for retries and multiple workers

### Redis Keys Used

- `seq:reservations:{account}`: List of active reservations for an account
- `seq:lock:{account}`: Lock used when creating new reservations
- `seq:res:{leaseId}:cursor`: Tracks progress within a reservation block
- `seq:{account}`: Legacy cache key for backward compatibility

### API

```typescript
import { reserveSequenceBlock } from "./src/queue/txQueue";

// Reserve a block of 10 sequence numbers
const reservation = await reserveSequenceBlock(
  "GDEMOACCOUNT...",  // Account address
  10,                 // Block size
  redisClient,        // Redis connection
  horizonServer       // Horizon server
);
```

### Configuration

No additional environment variables are required. Uses existing Redis configuration.
## Public Key Validation

This service uses `@delegolabs/utils` to validate Stellar public keys at route boundaries, and
`normalizeStellarAddress` in `src/normalizeStellarAddress.ts` before account lookups and persistence.

| Export | Purpose |
|---|---|
| `validatePublicKey(key)` | Returns `{ valid, normalized?, error? }` — trims whitespace, rejects secret seeds (`S...`), validates Ed25519 public key (`G...`) |
| `isValidStellarPublicKey(key)` | Boolean shorthand for `validatePublicKey(key).valid` |
| `validatePublicKeyMiddleware(paramName)` | Route-boundary helper that validates a route param and responds with HTTP 400 on failure |
| `normalizeStellarAddress(input)` | Returns `{ original, normalized, valid }` — trims whitespace, rejects secret seeds and malformed StrKey values per SDK behavior; used by `stellar/account.ts` before Horizon and vault lookups |

Malformed keys and secret keys are rejected before processing.

## Transaction Submission Retry Classification

`classifySubmissionFailure` in `src/queue/submissionFailure.ts` (re-exported from `txQueue.ts`) maps thrown submission errors to a `SubmissionFailure` before BullMQ requeues jobs:

| Field | Purpose |
|---|---|
| `code` | Stable failure code (e.g. `TX_RPC_TRANSIENT`, `TX_MALFORMED_XDR`) |
| `message` | Original error message |
| `retryable` | `true` for network/RPC faults, sequence conflicts, and poll timeouts; `false` for malformed XDR, auth failures, simulation, and on-chain execution errors |
| `txHash` | Optional hash when known at failure time |

Retryable failures are rethrown as standard errors so BullMQ applies backoff. Terminal failures throw `UnrecoverableError` to stop retries immediately.

## Multi-Signature Transaction Builder

`signMultisigTx` in `stellar/account.ts` appends multiple cryptographic signatures to a Stellar transaction envelope without submitting it, so the payments and wallet queues can reuse the builder independently.

### API

```typescript
import { signMultisigTx, MultisigTxRequest, MultisigTxResult } from "./stellar/account";

const result: MultisigTxResult = await signMultisigTx({
  xdr: "<base64-envelope>",          // Transaction envelope XDR to sign
  signers: ["GABC...", "GDEF..."],   // Public keys whose vault secrets will sign
  requiredWeight: 2,                 // Optional; defaults to signers.length
});

// result.signedXdr    — base64 envelope XDR with all signatures appended
// result.signerCount  — number of distinct signatures added
// result.thresholdMet — true when signerCount >= requiredWeight
```

### Behaviour

- **Separation of signing and submission** — callers sign first and enqueue the resulting XDR separately; this keeps the builder reusable across the payments service and wallet queue.
- **Deterministic / idempotent** — ED25519 signing is deterministic; re-calling `signMultisigTx` with the same inputs produces the same output, making retries safe.
- **Deduplication** — duplicate entries in `signers` are collapsed so each vault key signs exactly once.
- **Threshold validation** — `thresholdMet` is computed before returning. The caller decides whether to proceed with submission, request additional signers, or reject the envelope.

### Error surface

| Condition | Error message |
|---|---|
| `xdr` is empty | `"xdr is required"` |
| `signers` is empty or all-blank | `"At least one signer is required"` |
| XDR cannot be parsed | `"Invalid transaction XDR: <sdk message>"` |
| Vault key missing for signer | `"Failed to load key for signer <pubkey>: <vault message>"` |
| Vault key mismatch | `"Vault key mismatch: expected <pubkey> but retrieved key resolves to <actual>"` |

### No new environment variables

`signMultisigTx` reads keys from the existing encrypted file vault and resolves the network passphrase from the existing `STELLAR_NETWORK` variable. No additional configuration is required.

## HSM Key Signer Adapter

Transaction building and signing are separated behind a `KeySigner` interface in `src/vault.ts`. The adapter never exposes raw private keys from provider implementations — callers pass opaque `keyId` values and receive signatures or public keys only.

| Export | Purpose |
|---|---|
| `KeySigner` | `sign(data, keyId)` and `getPublicKey(keyId)` contract |
| `KeySignerProvider` | `{ provider, keyId }` configuration |
| `createKeySigner(provider?)` | Factory for `local`, `aws-kms`, or `hashicorp-vault` drivers |
| `getKeySigner()` / `setKeySigner()` | Process-wide signer singleton (override in tests) |
| `KeySignerError` | Stable `code` plus `retryable` flag for transient HSM outages |

### Providers

| Provider | Use case | `keyId` meaning |
|---|---|---|
| `local` | Development | Stellar public address (`G...`) stored in the encrypted file vault |
| `aws-kms` | Production | AWS KMS key id, ARN, or alias (ED25519 key spec) |
| `hashicorp-vault` | Production | Transit engine key name |

`sign()` is stateless and idempotent for identical inputs, so BullMQ retries and blockchain resubmission paths can safely re-invoke signing.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WALLET_KEY_SIGNER_PROVIDER` | `local` | `local`, `aws-kms`, or `hashicorp-vault` |
| `WALLET_KEY_SIGNER_KEY_ID` | _(empty)_ | Default key id when callers omit `keyId` |
| `AWS_REGION` | `us-east-1` | AWS region for the KMS client |
| `VAULT_ADDR` | _(required for Vault)_ | HashiCorp Vault base URL |
| `VAULT_TOKEN` | _(required for Vault)_ | Vault token with transit sign/read access |
| `VAULT_TRANSIT_MOUNT` | `transit` | Transit secrets engine mount path |

## Security & Encryption

### Hot Wallet Seed Phrase Encryption
To secure hot wallet secrets, BIP-39 seed phrases must be encrypted before being persisted. We use `aes-256-gcm` authenticated encryption:
- **Key Derivation**: The encryption key is derived by hashing the `WALLET_MASTER_SECRET` via SHA-256 to ensure a secure 32-byte key.
- **Initialization Vector**: A random 12-byte IV is generated for each encryption operation.
- **Authentication**: A 16-byte authentication tag is generated and validated on decryption to ensure integrity and prevent tampering.

### Key Rotation and Row Shape
Future key rotation is supported without database schema changes by storing the encrypted details as a unified JSON object representing `EncryptedSeedPhrase`:
```typescript
interface EncryptedSeedPhrase {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  algorithm: "aes-256-gcm";
}
```
This can be saved directly in a text or JSON/JSONB column. The `keyVersion` metadata determines which key version (e.g., `v1`, `v2`) was used for encryption, enabling seamless background rotation of legacy rows during decrypt-reencrypt operations.

## Soroban Permissions Contract Client

The Permissions Service (`permissions/index.ts`) provides a client for on-chain delegated spending limit enforcement on Soroban smart contracts.

### Core Features

- **On-Chain Spending Limits**: Enforces spend caps and expiration dates for delegated buyer and payment agents directly on Soroban smart contracts.
- **Pre-Submit Simulation**: All state-modifying invocations (`grant`, `revoke`) are simulated via `SorobanTransactionSimulator` before submission. Simulation failures abort immediately without broadcasting transactions or incurring unnecessary fees.
- **Versioned Vault Key Signing**: Transactions are signed using vault-managed keys with signing key version metadata recorded (`signing_key_versions`) for auditability. Private keys are never exposed in plaintext.
- **Idempotency**: Duplicate grant requests surface a typed `DuplicatePermissionError` rather than double-writing state. Revoking an inactive permission is a safe no-op.
- **Live State Queries**: `get()` and `list()` query live contract storage via Soroban RPC simulation.
- **Spend Authorization**: `checkSpend()` validates remaining limits and expiration on-chain, alongside defense-in-depth checks against off-chain policies.

### API Reference

```typescript
import { permissionsService, type PermissionGrant } from "./permissions/index.js";

// Grant spending permission to a delegate agent
const txHash = await permissionsService.grant({
  contractId: "CDLZFC3...",
  spender: "GDEMOSPENDER...",
  limit: 10_000_000n, // in stroops (1 XLM)
  expiresAt: "2026-12-31T23:59:59.000Z", // null for no expiry
  owner: "GDEMOOWNER...",
});

// Check if a spend amount is authorized
const isAuthorized = await permissionsService.checkSpend(
  "CDLZFC3...",
  "GDEMOOWNER...",
  "GDEMOSPENDER...",
  5_000_000n // amount in stroops
);

// Look up a specific grant
const grant = await permissionsService.get(
  "CDLZFC3...",
  "GDEMOOWNER...",
  "GDEMOSPENDER..."
);

// List all active grants for an owner
const grants = await permissionsService.list("GDEMOOWNER...", "CDLZFC3...");

// Revoke an active permission
await permissionsService.revoke("CDLZFC3...", "GDEMOSPENDER...", "GDEMOOWNER...");
```

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `SOROBAN_PERMISSIONS_CONTRACT_ID` / `PERMISSIONS_CONTRACT_ID` | _(empty)_ | Default Soroban permissions contract ID |
| `PERMISSIONS_OWNER_ADDRESS` | _(empty)_ | Default fallback wallet owner public address |
| `SOROBAN_RPC_URL` / `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC server endpoint |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Horizon endpoint for sequence lookups |
| `STELLAR_NETWORK` | `testnet` | Network identifier (`testnet`, `mainnet`, `futurenet`) |
| `STELLAR_NETWORK_PASSPHRASE` | _(derived from network)_ | Passphrase for transaction signing |

### Error Taxonomy

| Error Class | Code | Status | Description |
|---|---|---|---|
| `PermissionNotFoundError` | `PERMISSION_NOT_FOUND` | 404 | Thrown by `checkSpend()` when no grant exists for the specified owner/spender pair. |
| `PermissionExpiredError` | `PERMISSION_EXPIRED` | 400 | Thrown by `checkSpend()` when the delegation's `expiresAt` timestamp is in the past. |
| `LimitExceededError` | `LIMIT_EXCEEDED` | 400 | Thrown by `checkSpend()` when the requested amount exceeds the granted limit or off-chain limit. |
| `DuplicatePermissionError` | `DUPLICATE_PERMISSION` | 409 | Thrown by `grant()` when an identical active grant already exists on-chain. |
| `SimulationFailedError` | `SIMULATION_FAILED` | 400 | Thrown by `grant()` or `revoke()` when pre-submit contract simulation fails. |
| `InvalidPermissionInputError` | `INVALID_PERMISSION_INPUT` | 400 | Thrown on invalid addresses, negative limits, or malformed ISO dates. |
| `PermissionError` | `PERMISSION_ERROR` | 400 | Base error class for domain-level permissions exceptions. |


