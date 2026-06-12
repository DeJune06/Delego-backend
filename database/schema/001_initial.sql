-- Delego initial schema
-- TODO: Add migrations tooling (e.g. node-pg-migrate, Drizzle, Prisma)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stellar_address VARCHAR(56) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delegations
CREATE TABLE IF NOT EXISTS delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    agent_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    policy JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delegations_user_id ON delegations(user_id);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    delegation_id UUID REFERENCES delegations(id),
    merchant_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    line_items JSONB NOT NULL DEFAULT '[]',
    total_stroops BIGINT NOT NULL DEFAULT 0,
    escrow_contract_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
