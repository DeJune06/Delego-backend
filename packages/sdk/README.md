# @delego/sdk

TypeScript client for the Delego API. Used by web, merchant, and mobile apps.

```typescript
import { DelegoClient } from "@delego/sdk";

const client = new DelegoClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
  token: sessionToken,
});

const { data } = await client.health();
```
