## Summary

- Implement event-driven choreography pattern for workflow coordination (#50)
- Add request signing and verification for API authentication (#55)
- Enhance circuit breaker with bulkhead pattern and health checks (#53)
- Build multi-language email template engine with DSL, versioning, and preview (#56)

## Changes

### Orchestrator — Event Choreography (#50)
- Event schema registry with validation
- Dead letter queue for failed event processing
- Event ordering guarantees per correlation ID
- Subscription registry with retry policies and filtering
- Event replay mechanism for recovery

### Gateway — Request Signing (#55)
- HMAC-SHA256 request signing with timing-safe verification
- Replay attack prevention via nonce + timestamp
- Key rotation support with overlap period
- SDK helper for client signing
- Middleware enforcing signatures on mutating endpoints

### Gateway — Circuit Breaker Enhancements (#53)
- Bulkhead pattern for resource isolation per downstream service
- Automatic recovery with health check probing
- Configurable max concurrent/queued limits per service

### Notifications — Template Engine (#56)
- Template DSL with variables, conditionals, and loops
- Multi-language support with locale fallback
- Template versioning and rollback
- Preview endpoint with sample data
- Layout inheritance (base templates)
- Template analytics (open/click tracking)

Closes #50, Closes #55, Closes #53, Closes #56
