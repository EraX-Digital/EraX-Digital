# EraX Digital — Third-Party Licenses

Audit date: 2026-11-03

This inventory is an engineering compliance record. It is not a legal opinion. Before any future exception that would copy third-party source into this tree, counsel should review the exception.

EraX application code written in this repository is proprietary to EraX Digital unless a file states otherwise. Third-party code enters only as a declared dependency or as a short, reviewed excerpt that keeps its original copyright and license.

## Policy

1. GPL, AGPL, SSPL, and other strong-copyleft code is not copied into the EraX tree and is not linked into the application.
2. Commercial, non-OSI, or source-available community licenses are excluded unless a written commercial agreement exists. None exists for this repository.
3. A `package.json` or README license line without a `LICENSE` file is not enough to copy a repository, especially when those statements disagree.
4. Permissive dependencies (MIT, Apache-2.0, BSD, ISC, PostgreSQL License) are allowed. Their copyright and license notices stay intact. The lockfile is the version record.
5. Toolchains (Foundry, Anchor, Rust, Node) are installed by developers and CI. They are not vendored.
6. Unmodified network services used only in local development are acceptable when application code talks to them through a protocol and does not embed their source. If a service is AGPL or SSPL, it stays out of the proprietary source tree. The preferred local defaults below avoid that dependency.
7. Ideas, algorithms, and high-level architecture may be reimplemented. Source text, tests, and comments from excluded repositories may not be pasted in.
8. A future `NOTICE` file will list pinned distribution dependencies once they exist. This document is the gate; `NOTICE` will be the bill of materials.

## Allowed as dependencies or toolchains

These were verified against the commit in `docs/REFERENCE_REPOSITORY_AUDIT.md`. Versions are pinned when implementation installs them. Master branches are not the pin.

| Component | License | How EraX will use it | Notice obligation |
| --- | --- | --- | --- |
| OpenZeppelin Contracts 5.7.0 | MIT | Foundry dependency for access control, reentrancy guard, pausable, safe ERC-20 | Keep OZ license with the dependency. Do not strip headers |
| Foundry stable release | Apache-2.0 | Developer and CI toolchain | Do not vendor |
| Anchor stable 0.31.x | Apache-2.0 | Developer and CI toolchain | Do not vendor |
| RainbowKit | MIT | EVM connect UI. Peers require wagmi 2 and viem 2 | Keep MIT notice via the package |
| wagmi 2.x and viem 2.x | MIT | EVM chain and contract calls | Keep notices via the packages. Do not move to wagmi 3 until RainbowKit’s peers allow it |
| `@solana/wallet-adapter` packages | Apache-2.0 | Solana connect UI | Keep Apache notice |
| `@solana/web3.js` 1.x | MIT | Solana RPC and transaction construction used by the adapter | Keep MIT notice. Do not switch the adapter path to `@solana/kit` in the first release |
| `siwe` (spruceid/siwe) | Apache-2.0 | Build and parse EIP-4361 messages | Server-side verification. Keep Apache notice |
| Sign-In with Solana helpers | MIT | SIWS message format | Verify ed25519 with a reviewed library (`@noble/curves` or the audited successor chosen at implementation). Do not invent a signature scheme |
| Drizzle ORM and drizzle-kit | Apache-2.0 | Schema, SQL migrations, queries | Selected in the architecture document |
| PostgreSQL 16 | PostgreSQL License | Primary database | Server, not embedded source |
| Valkey | BSD-3-Clause | Cache, rate limits, short-lived challenge indexes | Redis protocol compatible client. Valkey is the server, because Redis’s RSALv2/SSPL licensing is excluded |
| Fastify 5 | MIT | HTTP and WebSocket API | Application framework |
| Next.js | MIT | Web and admin UI | Avoid proprietary Vercel-only features for core flows |
| React | MIT | UI | Standard notice |
| Mailpit | MIT | Local SMTP capture | Development only |
| Argon2 binding chosen at Phase 2 (`@node-rs/argon2` or equivalent) | MIT or Apache-2.0 only | Password hashing | Reject a binding whose license is not permissive |
| Zod | MIT | Request validation | Standard notice |
| Pino | MIT | Structured logs | Standard notice |

Exact resolved versions belong in the lockfile created in Phase 2. This table is the allow-list, not a claim that those packages are already installed.

## Excluded

| Source | License evidence | Why it stays out |
| --- | --- | --- |
| slymnoyann/hey.xyz | `LICENSE` is the GPL-3.0 text. README and `package.json` say AGPL-3.0 | Either reading is copyleft. The Affero claim would also cover network use. The repository is a frozen snapshot, not current production |
| lens-protocol/lens-v3 | `GPL-3.0-only` in `package.json` and contract SPDX headers | Copyleft. Also zkSync-specific and on OpenZeppelin 4.9. Lens audit reports in that repo are not EraX audits |
| farcasterxyz/snapchain | GitHub SPDX GPL-3.0 | Copyleft node implementation |
| farcasterxyz/protocol | `package.json` license field `unlicensed`. No `LICENSE` file | No grant to copy the specification text |
| reown-com/appkit | Reown Community License, SPDX `NOASSERTION` | Requires Reown’s network, is non-sublicensable, and imposes MAU and RPC thresholds that Reown can change. Terms of Service dated 2026-07-27 incorporate that license |
| chaalpritam/tribeeco and submodules | Root and several READMEs say MIT. `tribe-hub` `package.json` says ISC. GitHub did not detect `LICENSE` files. Fourteen submodules were not all file-checked after the API rate limit | Statements conflict, and the grant is not in a standard `LICENSE` file. Architecture only |
| quicknode/solana-program-examples | `package.json` says MIT. No `LICENSE` file found. GitHub SPDX none | Finance examples are out of scope. The missing license file blocks copying. Anchor 2 RC is not the chosen toolchain |
| MinIO server source | AGPL-3.0 | Not embedded. Local development uses a filesystem storage driver. Production uses an S3-compatible API selected by the operator |
| Redis server, current RSALv2/SSPL distributions | Non-OSI server license | Replaced by Valkey for local infrastructure |
| motion-plus-react, as used by hey.xyz | Not cleared; shipped inside an excluded AGPL/GPL snapshot | Not a candidate |

## Permissive references that are still not copied

MIT or Apache-2.0 would allow copying if notices were kept. EraX still will not fork these trees, because the product behavior is different and a fork would make EraX responsible for someone else’s protocol:

- `farcasterxyz/contracts` (MIT, Merkle Manufactory).
- `farcasterxyz/hub-monorepo` (MIT, Merkle Manufactory).
- `solana-foundation/program-examples` (MIT, Solana Foundation).

If a later change adapts a small excerpt, the commit message and the file header must name the upstream project, commit, and license, and the excerpt must remain under that license. The surrounding EraX file does not get to call that excerpt original.

## Conflicts found during inspection

1. Hey: GPL-3.0 license file versus AGPL-3.0 README and `package.json`. Treated as copyleft either way.
2. Tribe hub: README says MIT, package metadata says ISC, and no `LICENSE` file was detected.
3. Tribe parent: README says MIT, GitHub license API returned none.
4. Quicknode examples: package metadata says MIT, no `LICENSE` file was found.
5. Farcaster specification: `unlicensed`.
6. AppKit: not Apache-2.0. Older descriptions of WalletConnect as Apache do not describe current AppKit.

## Secrets and keys

No third-party repository’s keys, RPC URLs, `.env` samples with live credentials, or published program IDs will be committed as EraX production configuration. Tribe and Lens publish their own program and contract addresses. Those addresses are not EraX deployments.

## Review trigger

Re-run this inventory when:

- a dependency is added or upgraded,
- a license file upstream changes,
- someone proposes vendoring a reference repository,
- RainbowKit publishes wagmi 3 support,
- or a commercial wallet SDK is reconsidered.

The command record for the inspection is in `docs/IMPLEMENTATION_PROGRESS.md`.
