# Wallet security

EraX is a non-custodial wallet surface. The server stores public addresses, signed messages, transaction hashes, and statuses. It does not store private keys, seed phrases, or wallet session secrets.

## What the server refuses

`assertNoWalletSecret` walks every JSON field name. `privateKey`, `seed`, `mnemonic`, `secretKey`, and `recoveryPhrase` are rejected with `wallet_secret_rejected` before the body is parsed as a challenge or a transfer. The auth test posts `{ "privateKey": "secret" }` to SIWS verify and expects that code.

Linking requires a signature over a challenge that EraX created. Submitting only an address is `invalid_input` and does not set a cookie.

## Challenge rules

- The nonce is 32 hex characters from `crypto.randomBytes`.
- The message is stored and must match byte for byte.
- Domain and URI come from `WEB_ORIGIN`. A signature for another site fails.
- Issued-at must be inside the challenge window. Expiration is 10 minutes.
- The nonce row is updated to `consumed_at` before the signature is checked. A second use cannot pass. A bad signature also burns the nonce.
- Sign-in and link use different statements. A sign-in message cannot be reused as a link, and the reverse is rejected.
- An address that already belongs to another user returns `wallet_owned_elsewhere`. Disconnect does not release it. There is no transfer flow.

Wallet-only accounts have a null email and a null password hash. Password login treats a null hash as a failure. A check constraint requires a password hash whenever an email is present.

## Transactions

- The preview is built from the selected wallet, asset, amount, and recipient. Changing the form drops the preview.
- The user approves every signature and every send in the wallet. EraX does not call a signer with a stored key.
- The record is inserted as `pending` and `source = erax`. The request body has no status field.
- Confirmation reads the chain. EVM success requires a matching receipt. Solana success requires a matching finalized parsed transfer.
- A submitted hash with no receipt stays pending. The UI says submission is not confirmation.
- Mainnet selections show a warning. Tests do not send mainnet transactions.

## Tokens and RPC

- Unknown token symbols are sanitized and shown as unverified.
- A symbol of `USDC` does not make a contract verified. The contract address has to match the trusted list, and the decimals have to match.
- RPC errors are returned as errors. Logs strip `http` and `https` URLs so a keyed endpoint is not written out.
- Server RPC variables are not `NEXT_PUBLIC_`. Production requires `https`.
- Rate limits apply to challenge and verify. Session mutations still require Origin and CSRF.

## Limits that are still true

- EIP-1271 is called only when an RPC URL exists. No contract wallet was used in the tests.
- The indexer and the Solana sync route do not claim a complete history.
- A browser extension approval was not completed in this session. The buttons call the wallet; they do not simulate approval.
- Two processes cannot both open the same PGlite directory. If the API holds `PGLITE_DIR`, the indexer logs that its database is unavailable and does not advance checkpoints.
