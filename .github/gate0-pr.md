The repository previously contained only a README. This PR establishes the first Gate 0 workspace and executable technical probes from the supplied v1.0 design, without implementing the full product.

The pnpm/TypeScript monorepo separates portable RP Core and Provider contracts from injected HTTP/SSE transport, Expo UI and native storage. The Android lab has 1000 synthetic SQLite messages with keyset paging/FlashList v2, cancellation, a new expo/fetch HTTPS probe, and user-selected JSON/PNG card import. The codecs bound input size/depth, validate PNG container CRC, prefer ccv3 metadata, and preserve unknown JSON fields without executing them.

The full design remains in docs/design/source-v1.0.md; docs/ROADMAP.md and .github/planning.json retain all P0/P1/P2 goals across five milestones and twenty issue specifications. The author selected Apache-2.0. Actual upstream card verification downloads a pinned external Seraphina PNG with checksum and attribution; no AGPL implementation, character text or image is vendored or relicensed.

Validation on Node 24.19.0 / pnpm 11.25.0:

- Frozen installation, format, lint, narrow sensitive-file checks, core boundary checks and package/App/test type checks pass.
- 83 tests pass in 7 files, with no failures or skipped tests. They exercise host HTTP/SSE, fragmentation, cancellation/errors, persisted 1000-row paging, and bounded JSON/PNG decoding.
- An external real CCv3 PNG selects ccv3 over chara, retains four extension fields, and round-trips its extracted JSON. This is one host Read/data test, not complete format/behavior or native compatibility.
- Android Hermes export succeeds (1408 modules). Expo prebuild succeeds. SDK/NDK/CMake and checksum-verified JDK17 are prepared; local Release ARM64 Gradle build reaches 69 executed tasks but fails because the official AAR redirect repo.reactnative.dev is proxy-denied. No APK exists yet.
- Production audit remains failed on upstream node-forge/braces high advisories with no published fixes. The CI audit gate remains enabled.

GitHub API policy currently prevents publishing the prepared milestone/Issue specifications or querying remote CI. Required API/AAR hosts and the missing EXPO_TOKEN requirement are saved in the environment draft; draft saving is not runtime policy application or publication.

Gate 0 remains open: an installable APK, HONOR 90 Pro native networking/import/paging/performance evidence, EAS account/project/signing, trusted dependency fixes and human review are still required. No production chat workflow, complete lorebook, branch DAG, memory system or plugin platform is implemented. All APIs remain experimental/private and production storage is distinct from probe tables.

See docs/validation/gate0-followup.md, docs/CARD_COMPATIBILITY.md and docs/LOCAL_ANDROID.md for exact outcomes, limitations and recovery. Keep the PR as draft; do not mark Gate 0 passed or merge automatically.
