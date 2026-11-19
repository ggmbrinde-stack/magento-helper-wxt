# Pocket V3: explicit negative coverage stops before further writes

Minimal correction requested by independent review. Each present coverage field is validated before missing-field classification. Explicit truncated:true, unknown count, unknown IDs, invalid types and nested negative indicators are refused. Missing global fields remain UNKNOWN and are still allowed by the scoped row contract.

The executor persists UNCERTAIN when a saved-state/reconciliation read is refused; before mutation it persists BLOCKED. Exact regression: first PP430 saved read has only truncated:true with the other two fields absent. One mutation occurs, no second mutation occurs, no receipt falsely succeeds, the fence remains, and COMPLETE is never returned. The same regression covers an isolated unknown count and isolated unknown IDs.

35 affected Python tests and 8 Node tests passed before packaging. Clean ZIP verification repeats only those affected suites; logs are outside the immutable archive in ../verification/pocket-v3-final-archive-*. The earlier complete 80-test battery was not rerun for this bounded correction.

Business changes remain exactly seven pocket rows and three narrow property operations. Old, source, body notes/review/why, DTF and all unrelated choices remain identical to V2. Human approval scope remains valid; actual V3 independent review must be recorded before the coordinator runs PP430, verifies saved state, then runs the other three profiles. No live mutations were performed by the implementer.

Execution uses execution-pilot.json and execution-rest.json, with shallow operational plans pilot-v3.json/rest-v3.json under tmp/pp-pocket-run. The corresponding approval files still have an empty review_reference; do not reuse a V2 review as V3 acceptance.

Pilot canonical hash: 4e1044382e33cc7c07812be789ffeaf960377507dd5f64efd5b175937d6030ca

Rest canonical hash: afed3965ac1994346fc01930df4746b696eac42bccc3ed6b8d657b8c9046c13f

Implementation hash: 87f30592f6c5ab2879cb2526481c3af7ef724df9adbaa8a5bee9b13d4f0a9eda
