# feat: escrow auto-settlement, gateway circuit breaker, notification scheduling, wallet multi-sig

## Summary
- **#363** Payments: delivery-confirmation webhook auto-releases escrow, idempotent on duplicate deliveries, rejects already-settled escrows.
- **#364** Gateway: per-service circuit breaker (orchestrator/wallet/payments) with configurable threshold/cooldown and graceful degraded responses instead of hanging requests.
- **#365** Notifications: scheduler for one-time and cron-recurring notifications (dependency-free cron parser), with cancel support.
- **#366** Wallet: async multi-sig signing sessions — collect partial signatures over time, auto-submit at threshold, signatures expire after a timeout.

## Testing
- `pnpm --filter @delego/payments --filter @delego/gateway --filter @delego/notifications --filter @delego/wallet test` — all new and existing unit tests pass (286 tests across the four packages).
- Typecheck run per package; two pre-existing unused-import errors (`payments/escrow/index.ts`, `gateway/src/swagger.ts`, `wallet/stellar/recovery.ts`) and one pre-existing broken test import (`wallet/stellar/recovery.test.ts`) predate this branch and were left untouched.

Closes #363
Closes #364
Closes #365
Closes #366
