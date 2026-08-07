# Gateway Auth

Authentication and authorization modules for the API gateway.

## Features

- Email/password authentication with JWT access + refresh tokens
- OAuth2 login via Google and GitHub providers
- Refresh token rotation with reuse detection
- Audit event logging for all auth actions

## OAuth2 Integration

### Supported Providers

| Provider | Authorization URL | Token URL | User Info URL |
|----------|-------------------|-----------|---------------|
| Google   | `https://accounts.google.com/o/oauth2/v2/auth` | `https://oauth2.googleapis.com/token` | `https://www.googleapis.com/oauth2/v3/userinfo` |
| GitHub   | `https://github.com/login/oauth/authorize` | `https://github.com/login/oauth/access_token` | `https://api.github.com/user` |

### Environment Variables

```bash
# Google OAuth2
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Redirect URI (must match provider configuration)
OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/auth/oauth/callback
```

### Endpoints

- `GET /api/v1/auth/oauth/authorize?provider={google|github}&redirect_uri={uri}` - Returns authorization URL
- `POST /api/v1/auth/oauth/callback` - Exchanges code for tokens and authenticates user

### Account Linking

When a user authenticates via OAuth:
1. If an OAuth account link exists for the provider/userId, the existing user is authenticated
2. If no link exists but a user with the same email is found, the OAuth account is linked to that user
3. If neither exists, a new user is created (without a password) and the OAuth account is linked

### Database Migration

Run migration `013_oauth_providers.sql` to create the `oauth_accounts` table:

```sql
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  display_name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_user_id)
);
```

## Planned

- Wallet signature verification (Stellar)
- Rate limiting per user
- API key support for merchant integrations
