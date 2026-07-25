-- Migration: 011_soroban_transaction_ledger
-- Description: Idempotent Soroban transaction ledger for tracking submission, confirmation, and failure states

CREATE TABLE IF NOT EXISTS soroban_transaction_ledger (
  hash VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(255),
  contract_id VARCHAR(255) NOT NULL,
  method VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
  error_details TEXT,
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_soroban_transaction_ledger_order_id
  ON soroban_transaction_ledger(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_soroban_transaction_ledger_contract_id
  ON soroban_transaction_ledger(contract_id);

CREATE INDEX IF NOT EXISTS idx_soroban_transaction_ledger_status
  ON soroban_transaction_ledger(status);

CREATE INDEX IF NOT EXISTS idx_soroban_transaction_ledger_submitted_at
  ON soroban_transaction_ledger(submitted_at DESC);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_soroban_transaction_ledger_submitted_at;
-- DROP INDEX IF EXISTS idx_soroban_transaction_ledger_status;
-- DROP INDEX IF EXISTS idx_soroban_transaction_ledger_contract_id;
-- DROP INDEX IF EXISTS idx_soroban_transaction_ledger_order_id;
-- DROP TABLE IF EXISTS soroban_transaction_ledger;
