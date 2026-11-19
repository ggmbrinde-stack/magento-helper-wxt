# Git / PP recovery investigation — 2026-11-19

## Conclusion

The missing November Python PP conversion runner, handoff, and frozen candidate are not recoverable from the accessible GitHub repository. This is not a shallow-clone or missing-fetch problem. They must come from the old PC or an approved archive/transfer.

## Evidence

Repository inspected: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\magento-helper-wxt`

- Remote: `https://github.com/ggmbrinde-stack/magento-helper-wxt.git`
- Fetch refspec: `+refs/heads/*:refs/remotes/origin/*`
- `git rev-parse --is-shallow-repository`: `false`
- No partial-clone marker was present.
- `git fetch --all --prune` completed without adding any PP branch.
- Accessible remote heads after fetch:
  - `main` → `dba3f426cb528a3c49679e586604cddec054ff0e`
  - `develop` → `dba3f426cb528a3c49679e586604cddec054ff0e`
  - `codex/release-baseline` → `cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071`
- No remote tags were returned.
- `refs/remotes/origin/experimental/drime-integration` is absent.
- Object `946e7514d0fe90f4f89029f9c0eb3bdf47619031` is absent.
- `git log --all` found no history for:
  - `docs/shared/PP-FULL-CONVERSION-CONTINUE-2026-11-19.md`
  - `tmp/pp-full-conversion-candidate/`
- `git rev-list --objects --all` found no November conversion runner, review-v2 ZIP, or candidate package. The only PP-related tracked script is `scripts/probe-pp-source.js`, introduced by `7ed36ac` on 2026-11-04; it is a read-only DevTools PP-location probe, not the Python conversion runner.
- The clone remained on clean `main`; no checkout, reset, merge, cherry-pick, or file overwrite occurred.

## What GitHub can and cannot recover

GitHub can provide the three published branches above and their tracked history. It cannot provide the expected experimental branch/commit or the PP artifacts because they are not advertised refs, reachable objects, or tracked paths in the accessible repository.

The following therefore must be transferred from the old PC or a preserved archive, without reconstruction:

- `C:\Users\user\Videos\BestOfGifts_Master\magento-helper-wxt`
- the exact `experimental/drime-integration` ref and commit `946e7514...`
- `docs/shared/AGENT-WORKFLOW.md`
- `docs/shared/PP-FULL-CONVERSION-CONTINUE-2026-11-19.md`
- `tmp/pp-full-conversion-candidate/review-full-v2/`
- `tmp/pp-full-conversion-candidate/PP_Full_Conversion_REVIEW_v2.zip`
- all handoff-listed dirty/untracked PP files and journals

No credentials were inspected or exposed. No source, Notion, Magento, commit, push, merge, release, journal, or frozen-package write was performed.
