# Repository instructions

Read docs/PRD.md, docs/ARCHITECTURE.md, docs/GATE0_PLAN.md and the relevant design sections before changes. Full user-provided design is docs/design/source-v1.0.md; do not silently remove P0/P1/P2 goals.

- Use the existing checkout; each Codex task is isolated. Do not create a worktree unless explicitly requested.
- Work in a task branch and one reviewable PR. Do not push to main, auto-merge, or mark device gates complete from host tests.
- Node 24 LTS, pnpm 11.25.0, committed pnpm-lock.yaml. Install with pnpm install --frozen-lockfile. Explicit dependency changes require a deliberate lockfile update and review.
- Run pnpm check, pnpm export:android and pnpm audit --audit-level high --prod. Report each result honestly, including upstream advisory failures. Capture commands and results in docs/validation/. Do not disable checks to get green CI.
- rp-core and rp-provider contracts are portable. No RN/Expo/SQLite/network/filesystem imports, ambient time/random, dynamic runtime loading or external wrapped I/O. Inject capabilities. Run the boundary guard and its negative tests.
- UI/native I/O belongs to apps/mobile; transport belongs to provider adapters. Preserve unknown card fields but never execute them. creator_notes are not default Prompt text.
- Core APIs are experimental; version/migration/rollback notes accompany storage, format or public-contract changes. Never reset user databases to fix migration errors.
- No keys, signing files or private chats in Git, fixtures, logs, exports or EXPO_PUBLIC variables. SecureStore holds future user keys by profile ID. Tests use only explicit synthetic values.
- Gate 0 is not passed until real Android APK/network/cancel/1000-message/card evidence exists. Do not start broad Gate 1–3 implementation before its exit review.
- Apache-2.0 was explicitly chosen by the author. Independently implement protocol behavior; do not copy incompatible GPL/AGPL source.
