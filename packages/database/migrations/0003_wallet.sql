ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_email_length;
ALTER TABLE users ADD CONSTRAINT users_email_length CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 320);
ALTER TABLE users DROP CONSTRAINT users_password_hash_length;
ALTER TABLE users ADD CONSTRAINT users_password_hash_length CHECK (
  password_hash IS NULL OR char_length(password_hash) BETWEEN 20 AND 512
);
ALTER TABLE users ADD CONSTRAINT users_email_requires_password CHECK (password_hash IS NOT NULL OR email IS NULL);

ALTER TABLE wallets ADD COLUMN label text NOT NULL DEFAULT '';
ALTER TABLE wallets ADD COLUMN preferred boolean NOT NULL DEFAULT false;
ALTER TABLE wallets ADD COLUMN disconnected_at timestamptz;
ALTER TABLE wallets ADD COLUMN last_connected_at timestamptz;

DROP INDEX IF EXISTS wallets_identity_unique;
CREATE UNIQUE INDEX wallets_address_exact ON wallets (chain_family, network, address);
CREATE UNIQUE INDEX wallets_one_preferred ON wallets (user_id) WHERE preferred = true AND disconnected_at IS NULL;

ALTER TABLE auth_challenges ADD COLUMN message text NOT NULL DEFAULT '';

CREATE TABLE wallet_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL,
  address text NOT NULL,
  network text NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_auth_events_protocol_check CHECK (protocol IN ('siwe', 'siws')),
  CONSTRAINT wallet_auth_events_result_check CHECK (result IN ('succeeded', 'failed'))
);

CREATE INDEX wallet_auth_events_address_idx ON wallet_auth_events (protocol, address, created_at DESC);

CREATE TABLE wallet_preferences (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  preferred_wallet_id uuid REFERENCES wallets (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blockchain_networks (
  caip2 text PRIMARY KEY,
  family text NOT NULL,
  name text NOT NULL,
  chain_ref text,
  explorer_tx text NOT NULL,
  native_symbol text NOT NULL,
  native_decimals integer NOT NULL,
  environment text NOT NULL,
  CONSTRAINT blockchain_networks_family_check CHECK (family IN ('evm', 'solana')),
  CONSTRAINT blockchain_networks_environment_check CHECK (environment IN ('mainnet', 'testnet'))
);

INSERT INTO blockchain_networks (
  caip2, family, name, chain_ref, explorer_tx, native_symbol, native_decimals, environment
) VALUES
  ('eip155:1', 'evm', 'Ethereum', '1', 'https://etherscan.io/tx/', 'ETH', 18, 'mainnet'),
  ('eip155:8453', 'evm', 'Base', '8453', 'https://basescan.org/tx/', 'ETH', 18, 'mainnet'),
  ('eip155:11155111', 'evm', 'Ethereum Sepolia', '11155111', 'https://sepolia.etherscan.io/tx/', 'ETH', 18, 'testnet'),
  ('eip155:84532', 'evm', 'Base Sepolia', '84532', 'https://sepolia.basescan.org/tx/', 'ETH', 18, 'testnet'),
  ('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'solana', 'Solana', 'mainnet-beta', 'https://explorer.solana.com/tx/', 'SOL', 9, 'mainnet'),
  ('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'solana', 'Solana Devnet', 'devnet', 'https://explorer.solana.com/tx/', 'SOL', 9, 'testnet');

CREATE TABLE blockchain_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL REFERENCES blockchain_networks (caip2),
  kind text NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  contract_address text NOT NULL DEFAULT '',
  decimals integer NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  CONSTRAINT blockchain_assets_kind_check CHECK (kind IN ('native', 'erc20', 'spl', 'token2022')),
  CONSTRAINT blockchain_assets_identity UNIQUE (network, contract_address)
);

INSERT INTO blockchain_assets (network, kind, symbol, name, contract_address, decimals, verified) VALUES
  ('eip155:1', 'native', 'ETH', 'Ether', '', 18, true),
  ('eip155:8453', 'native', 'ETH', 'Ether', '', 18, true),
  ('eip155:11155111', 'native', 'ETH', 'Ether', '', 18, true),
  ('eip155:84532', 'native', 'ETH', 'Ether', '', 18, true),
  ('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'native', 'SOL', 'Solana', '', 9, true),
  ('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'native', 'SOL', 'Solana', '', 9, true),
  ('eip155:1', 'erc20', 'USDC', 'USD Coin', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6, true),
  ('eip155:8453', 'erc20', 'USDC', 'USD Coin', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, true);

CREATE TABLE wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  wallet_id uuid REFERENCES wallets (id) ON DELETE SET NULL,
  network text NOT NULL,
  hash text NOT NULL,
  log_index integer NOT NULL DEFAULT -1,
  sender text NOT NULL,
  recipient text NOT NULL,
  asset_symbol text NOT NULL,
  asset_address text NOT NULL DEFAULT '',
  amount_base_units text NOT NULL,
  fee_base_units text,
  status text NOT NULL,
  source text NOT NULL,
  block_number bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transactions_status_check CHECK (
    status IN ('pending', 'confirmed', 'failed', 'reverted', 'finalized', 'dropped')
  ),
  CONSTRAINT wallet_transactions_source_check CHECK (source IN ('erax', 'chain')),
  CONSTRAINT wallet_transactions_amount_check CHECK (amount_base_units ~ '^[0-9]+$'),
  CONSTRAINT wallet_transactions_identity UNIQUE (network, hash, log_index)
);

CREATE INDEX wallet_transactions_sender_idx ON wallet_transactions (network, sender, created_at DESC);
CREATE INDEX wallet_transactions_recipient_idx ON wallet_transactions (network, recipient, created_at DESC);

CREATE TABLE transaction_status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES wallet_transactions (id) ON DELETE CASCADE,
  status text NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transaction_status_updates_tx_idx ON transaction_status_updates (transaction_id, created_at);

CREATE TABLE indexer_checkpoints (
  network text PRIMARY KEY REFERENCES blockchain_networks (caip2),
  cursor text NOT NULL,
  head_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
