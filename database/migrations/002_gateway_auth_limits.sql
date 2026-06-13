-- Migration: 002_gateway_auth_limits.sql
-- Description: Add gateway authentication columns and spend limit, delegation policy, and permission level tables.

-- Up migration

-- Alter users table
ALTER TABLE users ALTER COLUMN stellar_address DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);

-- Wallets (if not exists)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stellar_address VARCHAR(56) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT,
    network VARCHAR(20) DEFAULT 'testnet',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_stellar_address ON wallets(stellar_address);

-- Spend Limits
CREATE TABLE IF NOT EXISTS spend_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    delegation_id UUID REFERENCES delegations(id) ON DELETE CASCADE,
    limit_per_transaction BIGINT,
    limit_daily BIGINT,
    limit_weekly BIGINT,
    limit_lifetime BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spend_limits_user_id ON spend_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_spend_limits_wallet_id ON spend_limits(wallet_id);
CREATE INDEX IF NOT EXISTS idx_spend_limits_delegation_id ON spend_limits(delegation_id);

-- Delegation Policies
CREATE TABLE IF NOT EXISTS delegation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delegation_id UUID NOT NULL REFERENCES delegations(id) ON DELETE CASCADE,
    restricted_merchants TEXT[] DEFAULT '{}',
    restricted_categories TEXT[] DEFAULT '{}',
    allowed_merchants TEXT[] DEFAULT '{}',
    allowed_categories TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delegation_policies_delegation_id ON delegation_policies(delegation_id);

-- Permission Levels
CREATE TYPE permission_type AS ENUM ('VIEW_ONLY', 'AUTO_APPROVE', 'SIGNER', 'ADMIN');

CREATE TABLE IF NOT EXISTS permission_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delegation_id UUID NOT NULL REFERENCES delegations(id) ON DELETE CASCADE,
    level permission_type DEFAULT 'VIEW_ONLY'::permission_type,
    description VARCHAR(255),
    can_sign BOOLEAN DEFAULT false,
    can_mutate_policy BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_levels_delegation_id ON permission_levels(delegation_id);

-- Down migration
-- (Would drop the tables and reverse modifications, but not run automatically)
