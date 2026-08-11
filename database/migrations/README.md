# Database Migrations

Versioned SQL migrations applied in order.

Naming convention: `NNN_description.sql`

| Migration | Description |
|-----------|-------------|
| `002_gateway_auth_limits.sql` | Gateway auth columns; spend limit, delegation policy, and permission level tables |
| `003_refresh_tokens.sql` | Refresh token storage |
| `004_processed_contract_events.sql` | Persist processed escrow contract events for deduplication |
| `005_service_event_outbox.sql` | Transactional outbox for reliable Redis / service event publishing (Issue #216) |
| `006_processed_messages.sql` | Idempotent consumer deduplication for Redis and contract-derived events (Issue #217) |
| `007_signing_key_versions.sql` | Signing key version metadata for encrypted wallet seeds (Issue #198) |
| `008_workflow_transition_audit.sql` | Lightweight audit records for workflow transitions (Issue #206) |
| `009_payment_records.sql` | Payment records for escrow coordinator fund/release/refund tracking |
| `010_escrow_funding_locks.sql` | Escrow funding lock table for double-funding prevention |
| `010_workflow_events.sql` | Event sourcing for workflow state transitions (Issue #354) |
| `011_notification_preferences.sql` | Persistent notification preferences per user (#135) |
| `011_soroban_transaction_ledger.sql` | Idempotent Soroban transaction ledger for submission, confirmation, and failure states |
| `012_payment_records_dispute.sql` | Dispute transactions on payment_records for the escrow coordinator |
| `013_oauth_providers.sql` | OAuth2 provider account linking |

## Running Migrations

```bash
# Apply all pending migrations
pnpm db:migrate
```

Migrations are tracked by the migration runner at `scripts/setup/migrate.js`. Rollback is not currently supported; write new migrations to correct schema issues.
