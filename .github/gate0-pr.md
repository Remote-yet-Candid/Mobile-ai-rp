The repository previously contained only a README. This introduces the first Gate 0 foundation from the supplied v1.0 design: a pnpm/TypeScript workspace, portable RP Core and Provider contracts, an injected SSE adapter, and an Android Expo probe with SQLite keyset paging, FlashList v2, and synthetic streaming cancellation.

The full design is preserved in docs/design/source-v1.0.md. docs/GATE0_PLAN.md scopes this PR to the first technical spike; docs/ROADMAP.md and .github/planning.json retain P0/P1/P2 across five milestones and twenty issue specifications. scripts/publish-planning.mjs can publish them without duplicating plan markers. The author selected Apache-2.0.

Validation on Node 24.19.0 / pnpm 11.25.0:

- Frozen installation, package build, formatting, lint, narrow sensitive-file checks, core boundary checks, and application/test type checks pass.
- 58 tests pass in 6 files, with no failures or skipped tests. Contracts exercise actual host HTTP, fragmented Unicode/SSE, cancellation/errors, and persisted 1000-row SQL paging.
- Android Hermes export succeeds (1383 modules). This is a JS bundle, not an APK or native-device result.
- The standalone mock HTTP service passes health and functional SSE requests.
- Production dependency audit fails on upstream node-forge and braces high advisories with no published patched versions currently available. The CI audit gate remains enabled. See docs/validation/gate0-foundation.md and planned G0-07.

Gate 0 remains open: EAS account/project/signing, installable APK, Android expo/fetch networking, physical-device performance, and licensed real CCv3 JSON/PNG evidence are still required. Codec support is only a reserved contract. No full lorebook, production chat workflow, branch DAG, memory system, or plugin platform is implemented here.

Storage is an isolated Gate 0 probe database rather than the production schema. SQL constraint failures are preserved; repeated deterministic seeding only ignores sequence conflicts. Provider errors omit raw exceptions, keys, and response bodies. No credentials or private chats are included. EAS preview is manual and receives no secrets from external PRs. Public APIs remain private/experimental; production migration and rollback requirements are documented before future implementation.

Keep this PR as draft until the audit and required validation blockers are reviewed. Do not mark the overall Gate 0 exit checklist complete or merge automatically.
