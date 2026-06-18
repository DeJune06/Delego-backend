# Contributing to Delego

Thank you for your interest in contributing to Delego! We welcome contributions from everyone and are excited to have you join our community.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Project Areas](#project-areas)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [Security](#security)
- [Community Guidelines](#community-guidelines)

## 🚀 Getting Started

### Prerequisites

Before you begin contributing, ensure you have the following installed:

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** >= 24.0.0
- **Rust** >= 1.70.0 (for contract development)
- **Git** (for version control)

### Setup Instructions

1. **Fork the Repository**
   ```bash
   # Fork the repository on GitHub
   # Then clone your fork
   git clone https://github.com/YOUR_USERNAME/delego.git
   cd delego
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start Infrastructure**
   ```bash
   pnpm docker:up
   ```

5. **Run Database Migrations**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

6. **Start Development Server**
   ```bash
   pnpm dev
   ```

For detailed setup instructions, see [docs/contributor-guide.md](./docs/contributor-guide.md).

## 🔄 Development Workflow

### 1. Choose an Issue

- Browse [GitHub Issues](https://github.com/your-org/delego/issues) for open issues
- Look for issues labeled `good first issue` if you're new to the project
- Comment on the issue to claim it and ask questions if needed
- Create a new issue if you've found a bug or have a feature request

### 2. Create a Branch

```bash
# Ensure your main branch is up to date
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch Naming Convention:**
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or changes
- `chore/` - Maintenance tasks

### 3. Make Your Changes

- Write clear, focused commits
- Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification
- Add tests for new functionality
- Update documentation as needed

**Commit Message Format:**
```
type(scope): subject

body

footer
```

Examples:
```
feat(gateway): add JWT authentication middleware

Implement JWT-based authentication for the API gateway.
Includes token generation, validation, and refresh logic.

Closes #123
```

```
fix(agents): resolve memory leak in agent runtime

Fixed memory leak caused by unclosed agent sessions.
Added proper cleanup in the agent shutdown process.

Fixes #456
```

### 4. Test Your Changes

```bash
# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Run tests
pnpm test

# Run specific test suites
pnpm test:unit
pnpm test:integration
pnpm test:contracts
```

### 5. Submit a Pull Request

- Push your branch to your fork
- Open a pull request against the `main` branch
- Use the PR template and provide a detailed description
- Link related issues
- Request review from maintainers

## 📐 Code Standards

### TypeScript

- **Strict Mode**: All TypeScript projects use strict mode
- **No `any`**: Avoid using `any` type without justification
- **Type Safety**: Leverage TypeScript's type system fully
- **Interfaces**: Use interfaces for object shapes
- **Enums**: Use enums for fixed sets of values
- **Null Checks**: Enable strict null checks
- **Naming**: Use camelCase for variables, PascalCase for types/classes

```typescript
// Good
interface User {
  id: string;
  name: string;
  email: string;
}

function getUserById(id: string): Promise<User | null> {
  // Implementation
}

// Bad
function getUserById(id: any): any {
  // Implementation
}
```

### Rust (Soroban Contracts)

- **Best Practices**: Follow Soroban best practices
- **Error Handling**: Use `Result` types for error handling
- **Testing**: Include comprehensive contract tests
- **Documentation**: Document public functions and structs
- **Safety**: Leverage Rust's safety features

```rust
// Good
pub fn escrow_funds(env: Env, amount: i128) -> Result<(), Error> {
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    // Implementation
    Ok(())
}

// Bad
pub fn escrow_funds(env: Env, amount: i128) {
    // Implementation without error handling
}
```

### General Guidelines

- **TODO Comments**: Mark incomplete logic with `// TODO:` and link to an issue when possible
- **Code Comments**: Add comments for complex logic, not obvious code
- **Function Length**: Keep functions focused and reasonably short
- **File Organization**: Group related functionality together
- **Imports**: Organize imports logically (stdlib, external, internal)

## 🎯 Project Areas

### Customer Web Application (`apps/frontend`)

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS

**Good First Issues:**
- UI component improvements
- React hooks development
- Page layout enhancements
- Form validation
- State management

**Key Files:**
- `app/` - Next.js app directory
- `components/` - React components
- `hooks/` - Custom React hooks

### API Gateway (`apps/backend/gateway`)

**Tech Stack:** Node.js, Express/Fastify, TypeScript

**Good First Issues:**
- API endpoint implementation
- Authentication middleware
- Rate limiting improvements
- Request validation
- Error handling

**Key Files:**
- `routes/` - API route definitions
- `middleware/` - Express middleware
- `auth/` - Authentication logic

### Orchestrator Service (`apps/backend/orchestrator`)

**Tech Stack:** Node.js, TypeScript, XState

**Good First Issues:**
- Workflow state definitions
- Event handling
- Service orchestration
- State machine transitions

**Key Files:**
- `workflows/` - Workflow definitions
- `state/` - State machine logic
- `execution/` - Workflow execution

### Agents Service (`agents`)

**Tech Stack:** Node.js, TypeScript, LLM APIs

**Good First Issues:**
- Agent prompt engineering
- Tool implementation
- Memory management
- Response parsing

**Key Files:**
- `buyer-agent/` - Buyer agent implementation
- `payment-agent/` - Payment agent implementation
- `runtime/` - Agent runtime abstraction

### Wallet Service (`apps/backend/wallet`)

**Tech Stack:** Node.js, TypeScript, Stellar SDK

**Good First Issues:**
- Stellar account management
- Soroban permission grants
- Transaction signing
- Balance tracking

**Key Files:**
- `stellar/` - Stellar integration
- `soroban/` - Soroban contract interaction
- `keys/` - Key management

### Payments Service (`apps/backend/payments`)

**Tech Stack:** Node.js, TypeScript, Soroban SDK

**Good First Issues:**
- Escrow coordination
- Payment event processing
- Settlement logic
- Refund handling

**Key Files:**
- `escrow/` - Escrow contract coordination
- `settlement/` - Settlement logic
- `events/` - Payment event handling

### Smart Contracts (`contracts/`)

**Tech Stack:** Rust, Soroban SDK

**Good First Issues:**
- Contract function implementation
- Test coverage
- Documentation
- Gas optimization

**Key Files:**
- `escrow/src/` - Escrow contract
- `permissions/src/` - Permissions contract
- `tests/` - Contract tests

### Shared Packages (`packages/`)

**Tech Stack:** TypeScript

**Good First Issues:**
- Type definitions
- Utility functions
- SDK methods
- UI components

**Key Files:**
- `types/src/` - Shared TypeScript types
- `utils/src/` - Utility functions
- `sdk/src/` - API client SDK
- `ui/src/` - React components

## 🧪 Testing Guidelines

### Test Coverage

- Aim for high test coverage on critical paths
- Write unit tests for individual functions
- Write integration tests for service interactions
- Write contract tests for smart contracts
- Write E2E tests for critical user flows

### Test Structure

```typescript
// Unit test example
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      const user = await userService.createUser({
        name: 'Test User',
        email: 'test@example.com',
      });
      
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
    });

    it('should throw error for duplicate email', async () => {
      await expect(
        userService.createUser({
          name: 'Test User',
          email: 'existing@example.com',
        })
      ).rejects.toThrow('Email already exists');
    });
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Run contract tests only
pnpm test:contracts

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

## 📚 Documentation

### When to Update Documentation

- Adding new features or services
- Changing existing APIs
- Modifying architecture
- Updating configuration
- Adding new commands or scripts

### Documentation Files

- **README.md**: Project overview and quick start
- **ARCHITECTURE.md**: System architecture details
- **CONTRIBUTING.md**: Contribution guidelines (this file)
- **docs/**: Detailed documentation
  - `docs/architecture/`: Technical architecture
  - `docs/api-reference.md`: API documentation
  - `docs/contributor-guide.md`: Contributor guide

### Documentation Style

- Use clear, concise language
- Include code examples
- Provide step-by-step instructions
- Use proper formatting (headings, lists, code blocks)
- Keep documentation up to date with code changes

## 🔀 Pull Request Process

### Before Submitting

1. **Code Quality**
   - [ ] `pnpm typecheck` passes
   - [ ] `pnpm lint` passes
   - [ ] `pnpm test` passes
   - [ ] No console.log statements left in production code

2. **Testing**
   - [ ] Tests added for new functionality
   - [ ] All tests pass
   - [ ] Test coverage maintained or improved

3. **Documentation**
   - [ ] README updated if adding new service/package
   - [ ] API documentation updated if changing APIs
   - [ ] Comments added for complex logic

4. **Commit Messages**
   - [ ] Follows Conventional Commits specification
   - [ ] Clear and descriptive
   - [ ] Links to related issues

### Submitting the PR

1. **Title**: Use a clear, descriptive title following Conventional Commits
2. **Description**: Provide a detailed description of changes
3. **Related Issues**: Link to related issues using `Closes #123` or `Fixes #123`
4. **Screenshots**: Include screenshots for UI changes
5. **Checklist**: Complete the PR template checklist

### Review Process

- Maintainers will review your PR
- Address feedback in a timely manner
- Be open to suggestions and improvements
- Keep discussions focused and constructive

### After Merge

- Delete your feature branch
- Celebrate your contribution! 🎉

## 🐛 Reporting Issues

### Bug Reports

When reporting a bug, include:

1. **Clear Title**: Descriptive title for the issue
2. **Description**: Detailed description of the problem
3. **Reproduction Steps**: Steps to reproduce the issue
4. **Expected Behavior**: What you expected to happen
5. **Actual Behavior**: What actually happened
6. **Environment Details**:
   - OS: [e.g., macOS, Ubuntu, Windows]
   - Node version: [e.g., 20.0.0]
   - pnpm version: [e.g., 9.0.0]
   - Browser (if applicable): [e.g., Chrome 120]

**Example:**
```
Title: Wallet service fails to connect to Stellar testnet

Description:
The wallet service fails to connect when attempting to connect to Stellar testnet. The connection times out after 30 seconds.

Steps to Reproduce:
1. Start the wallet service
2. Attempt to connect to Stellar testnet
3. Observe timeout error

Expected Behavior:
Service should successfully connect to Stellar testnet

Actual Behavior:
Connection times out with error: "ETIMEDOUT"

Environment:
- OS: Ubuntu 22.04
- Node: 20.0.0
- pnpm: 9.0.0
```

### Feature Requests

When requesting a feature, include:

1. **Clear Title**: Descriptive title for the feature
2. **Description**: Detailed description of the feature
3. **Use Case**: Why this feature is needed
4. **Proposed Solution**: How you envision the feature working
5. **Alternatives**: Any alternative solutions considered
6. **Additional Context**: Any other relevant information

## 🔒 Security

### Reporting Security Vulnerabilities

**Do not** open public issues for security vulnerabilities.

To report a security vulnerability:

1. Email us at: security@delego.dev
2. Include details and reproduction steps
3. We will respond promptly and coordinate disclosure
4. We will work with you to fix the issue
5. We will coordinate the public disclosure timeline

### Security Best Practices

- Never commit secrets or API keys
- Use environment variables for sensitive configuration
- Review dependencies for known vulnerabilities
- Follow secure coding practices
- Test security-related functionality thoroughly

## 🤝 Community Guidelines

### Code of Conduct

Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

### Communication

- Be respectful and constructive in all communications
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

### Getting Help

- Check existing documentation first
- Search GitHub Issues for similar problems
- Ask questions in GitHub Discussions
- Join our community chat (link coming soon)

### Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

## 📞 Contact

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Security**: security@delego.dev (for security issues only)

## 🙏 Thank You

Thank you for contributing to Delego! Your contributions help make AI-powered delegated commerce more accessible and secure for everyone.

---

For more detailed information, see:
- [Contributor Guide](./docs/contributor-guide.md)
- [Architecture Documentation](./ARCHITECTURE.md)
- [API Reference](./docs/api-reference.md)
