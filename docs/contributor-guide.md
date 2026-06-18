# Contributor Guide

This guide helps you get started contributing to Delego. For detailed contribution guidelines, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## 📋 Table of Contents

- [Repository Map](#repository-map)
- [Local Setup](#local-setup)
- [Picking Work](#picking-work)
- [Development Workflow](#development-workflow)
- [PR Checklist](#pr-checklist)
- [Getting Help](#getting-help)

## Repository Map

### Root Directory

```
Delego/
├── README.md              # Main project documentation
├── ARCHITECTURE.md        # System architecture overview
├── CONTRIBUTING.md        # Detailed contribution guidelines
├── CODE_OF_CONDUCT.md     # Code of conduct
├── ROADMAP.md             # Project roadmap
├── package.json           # Root package configuration
├── pnpm-workspace.yaml    # pnpm workspace configuration
├── tsconfig.base.json     # Base TypeScript configuration
└── docker-compose.yml     # Local development infrastructure
```

### Key Directories

- **apps/**: Applications (frontend, backend)
- **agents/**: AI agent runtime and packages
- **contracts/**: Soroban smart contracts
- **database/**: Database schema, migrations, seed data
- **docs/**: Project documentation
- **infrastructure/**: Infrastructure as code
- **packages/**: Shared libraries
- **tests/**: Test suites

### Recommended Reading Order

1. [README.md](../README.md) - Project overview and quick start
2. [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
3. [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
4. [ROADMAP.md](../ROADMAP.md) - Project roadmap
5. Service-specific READMEs for areas of interest

## Local Setup

### Prerequisites

- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **Docker**: >= 24.0.0
- **Docker Compose**: >= 2.20.0
- **Rust**: >= 1.70.0 (for contract development)

### Installation Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/delego.git
cd delego

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Start infrastructure services
pnpm docker:up

# 5. Run database migrations
pnpm db:migrate

# 6. Seed database (optional, for development)
pnpm db:seed

# 7. Build all packages
pnpm build

# 8. Start development servers
pnpm dev
```

### Verifying Setup

```bash
# Check TypeScript compilation
pnpm typecheck

# Run tests
pnpm test

# Check service health
curl http://localhost:3000/health
curl http://localhost:3010/health
curl http://localhost:3011/health
curl http://localhost:3012/health
curl http://localhost:3014/health
curl http://localhost:3015/health
```

## Picking Work

### Good First Issues

Look for issues labeled `good first issue` in GitHub Issues. These are ideal for new contributors.

### Roadmap Items

Check [ROADMAP.md](../ROADMAP.md) for planned features and milestones. Pick an unchecked item that interests you.

### TODO Comments

Search for `TODO:` comments in the codebase:

```bash
grep -r "TODO:" --include="*.ts" --include="*.tsx" --include="*.rs"
```

### Recommended Starting Points

Based on your interests:

#### For Frontend Developers

- **apps/frontend/**: Customer web application
- **packages/ui/**: Shared UI components
- **packages/sdk/**: API client SDK

#### For Backend Developers

- **apps/backend/gateway/**: API gateway
- **apps/backend/orchestrator/**: Workflow orchestration
- **apps/backend/wallet/**: Wallet service

#### For Smart Contract Developers

- **contracts/escrow/**: Escrow contract
- **contracts/permissions/**: Permissions contract

#### For AI/ML Developers

- **agents/**: AI agent runtime and packages

## Development Workflow

### 1. Create a Branch

```bash
# Create a new branch from main
git checkout -b feature/your-feature-name

# Or for a fix
git checkout -b fix/your-fix-name
```

### 2. Make Changes

- Write code following the project's code standards
- Add tests for your changes
- Update documentation as needed
- Commit frequently with clear messages

### 3. Test Your Changes

```bash
# Run type checking
pnpm typecheck

# Run tests
pnpm test

# Run specific test suite
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm test:e2e

# Build the project
pnpm build
```

### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit with a clear message
git commit -m "feat: add user profile page"

# Use conventional commit format:
# feat: new feature
# fix: bug fix
# docs: documentation changes
# style: formatting changes
# refactor: code refactoring
# test: test changes
# chore: maintenance tasks
```

### 5. Push and Create PR

```bash
# Push your branch
git push origin feature/your-feature-name

# Create a pull request on GitHub
# Link to relevant issues
# Request review from maintainers
```

### 6. Address Feedback

- Respond to review comments
- Make requested changes
- Push updates to your branch
- Request re-review when ready

## PR Checklist

Before submitting a PR, ensure:

### Code Quality

- [ ] Code follows project style guidelines
- [ ] Code is properly formatted (use `pnpm format`)
- [ ] TypeScript compilation passes (`pnpm typecheck`)
- [ ] No console.log statements in production code
- [ ] No commented-out code

### Testing

- [ ] Tests added for new functionality
- [ ] All tests pass (`pnpm test`)
- [ ] Test coverage is maintained or improved
- [ ] Tests are well-documented and readable

### Documentation

- [ ] README updated if adding new service/package
- [ ] API documentation updated for API changes
- [ ] Inline code comments where necessary
- [ ] Changelog updated for significant changes

### Security

- [ ] No secrets or API keys committed
- [ ] No hardcoded credentials
- [ ] Environment variables used for sensitive data
- [ ] Security best practices followed

### Performance

- [ ] No performance regressions introduced
- [ ] Database queries optimized
- [ ] N+1 query issues avoided
- [ ] Efficient algorithms used

## Getting Help

### Documentation

- [README.md](../README.md) - Main project documentation
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [docs/](./) - Additional documentation

### Community

- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and discuss ideas
- **Discord/Slack**: Real-time chat (link coming soon)

### Contact

- **Email**: conduct@delego.dev (for conduct issues)
- **GitHub**: @your-org/delego (for general inquiries)

## Common Tasks

### Adding a New Service

1. Create service directory in `apps/backend/`
2. Add package.json with service configuration
3. Implement service with health check endpoint
4. Add service to docker-compose.yml
5. Update apps/backend/README.md
6. Add tests for the service
7. Update CI/CD configuration

### Adding a New Package

1. Create package directory in `packages/`
2. Add package.json with package configuration
3. Implement package functionality
4. Add tests for the package
5. Update packages/README.md
6. Export from package index

### Adding a New Smart Contract

1. Create contract directory in `contracts/`
2. Add Cargo.toml with contract configuration
3. Implement contract with Soroban SDK
4. Add tests for the contract
5. Update contracts/README.md
6. Document contract functions

### Adding a New Database Migration

1. Create migration file in `database/migrations/`
2. Write SQL for schema changes
3. Test migration locally
4. Update database/README.md
5. Document schema changes

## Troubleshooting

### Common Issues

**Dependencies won't install**
```bash
# Clear pnpm cache
pnpm store prune

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

**Docker containers won't start**
```bash
# Check Docker is running
docker ps

# Restart Docker
# (platform-specific)

# Rebuild containers
docker-compose down
docker-compose up -d --build
```

**Tests failing locally**
```bash
# Check test environment
echo $NODE_ENV

# Reset database
pnpm db:reset

# Run tests with verbose output
pnpm test --verbose
```

**TypeScript errors**
```bash
# Check TypeScript version
pnpm list typescript

# Rebuild TypeScript
pnpm clean
pnpm build
```

## Resources

### External Documentation

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [React Documentation](https://react.dev/)
- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Docker Documentation](https://docs.docker.com/)

### Project-Specific Documentation

- [Architecture Documentation](./architecture/)
- [API Reference](./api-reference.md)
- [Grant Deliverables](./grant-deliverables.md)

---

**Last Updated**: June 2026
