#!/usr/bin/env bash
# Internal helper — generates minimal service package stubs
set -euo pipefail

SERVICES=(
  "gateway:3000"
  "orchestrator:3010"
  "agents:3011"
  "wallet:3012"
  "catalog:3013"
  "payments:3014"
  "notifications:3015"
  "analytics:3016"
)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for entry in "${SERVICES[@]}"; do
  name="${entry%%:*}"
  port="${entry##*:}"
  dir="$ROOT/services/$name"

  cat > "$dir/package.json" <<EOF
{
  "name": "@delego/$name",
  "version": "0.0.1",
  "private": true,
  "description": "Delego $name service",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'TODO: add eslint'",
    "test": "echo 'No tests yet'"
  },
  "dependencies": {
    "@delego/config": "workspace:*",
    "@delego/types": "workspace:*",
    "@delego/utils": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
EOF

  cat > "$dir/tsconfig.json" <<EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/config" },
    { "path": "../../packages/utils" }
  ]
}
EOF

  mkdir -p "$dir/src"

  cat > "$dir/src/index.ts" <<EOF
/**
 * @delego/$name — Entry point
 * TODO: Implement service logic
 */
import { loadEnv } from "@delego/config";
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";

const SERVICE_NAME = "$name";
const DEFAULT_PORT = $port;

const env = loadEnv();
const log = createLogger(SERVICE_NAME, env.logLevel);
const port = Number(process.env.${name^^}_PORT ?? process.env.GATEWAY_PORT ?? DEFAULT_PORT);

log.info("Starting service", { port, nodeEnv: env.nodeEnv });

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [],
});

// TODO: Wire routes, database, and domain logic
EOF

  cat > "$dir/README.md" <<EOF
# @delego/$name

Delego **$name** service.

## Development

\`\`\`bash
pnpm --filter @delego/$name dev
\`\`\`

Health check: \`GET http://localhost:$port/health\`
EOF

done

echo "Service stubs created."
