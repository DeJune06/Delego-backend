# @delego/types

Shared domain types and interfaces used across apps, services, and the SDK.

## Usage

```typescript
import type { Delegation, Order, SpendingPolicy } from "@delego/types";
```

## Guidelines

- Keep types **framework-agnostic** (no React, Express, etc.)
- Use `bigint` for Stellar stroop amounts
- Add JSDoc for non-obvious fields
- Breaking changes require a version bump and migration notes
