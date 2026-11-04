# Blockchain indexer guide

The indexer is `services/indexer`. It is a long-running Fastify process, not a Vercel function. It shares the API database. On PostgreSQL that is `DATABASE_URL`. On local PGlite it is `PGLITE_DIR` (default `./var/pglite`).

Give the indexer the same database as the API. A second empty PGlite directory would not see the wallets the API linked. If the API already has the PGlite file open, the indexer logs that the database is unavailable and does not scan. That is expected on this machine when both processes use PGlite. PostgreSQL does not have that file lock.

## Start

```powershell
pnpm --filter @erax/indexer dev
```

`GET /health` answers even when no chain is configured. `GET /ready` reports `not_configured` until at least one RPC URL resolves. In development, empty RPC variables fall back to the public endpoints in `packages/blockchain-common`, so a local indexer will try those endpoints. In test and production, empty variables stay unconfigured.

The process ticks every 20 seconds.

## What a tick does

EVM (`runEvmIndexerTick`):

- The first successful tick stores the chain head and does not read older blocks.
- Later ticks scan at most 25 blocks.
- Native transfers and ERC-20 `Transfer` logs involving a verified linked wallet are inserted.
- The unique key is `(network, transaction hash, log index)`.
- If a block's parent hash does not match the stored head, the cursor rewinds up to 12 blocks and rows above that cursor are marked `dropped`.
- An RPC error does not move the cursor.

Solana (`runSolanaIndexerTick`):

- Reads are at `finalized` commitment.
- The tick stores decoded finalized system transfers from `getSignaturesForAddress`, at most 20 signatures per wallet.
- A confirmed-but-not-finalized status is not stored as success.
- An RPC error does not move the cursor.

Restarts read `indexer_checkpoints` and continue from the stored cursor. There is no backfill of history from before the first tick.

## Creator contracts

`CreatorTipping` forwards ETH with an internal call and emits `TipSent`. The indexer does not decode that event. A tip whose outer transaction has value would be stored as native ETH sent to the tipping contract, not as a payment to the creator payout. No contract address is configured because nothing has been deployed. Do not point the indexer at a guessed address.

## Coverage

This is a forward index of linked wallets after the process starts. It is not an archive of every historical transaction. The history API says so. EVM `history/sync` does not walk old blocks; it tells the caller the indexer fills that history. Solana `history/sync` stores only the recent decoded system transfers from one RPC page.

## Logs and retries

`withRpcRetry` retries rate-limit and network failures with delays of 0, 250, and 1000 milliseconds. Other errors are returned. Log lines replace RPC URLs with `[rpc]`.

## Schema

Migration `packages/database/migrations/0003_wallet.sql` adds `indexer_checkpoints`, `wallet_transactions`, and `transaction_status_updates`. The PGlite migration test applies it. A live PostgreSQL migration was not run on this Administrator account because PostgreSQL still does not start here.

## Tests

`services/indexer/src/tick.test.ts` uses an in-memory database and a fake block source. It covers the first head checkpoint, a later scan, a reorg rewind, and an RPC failure that leaves the cursor in place. It does not talk to a public chain. The Solana tick function is in the same module and was not given a separate unit test in this pass.
