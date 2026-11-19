# Estado das branches e publicação do conversor completo, 19 de Novembro de 2026

## Porque o clone novo não encontrava o trabalho

O trabalho existia apenas nesta máquina. A branch `experimental/drime-integration` e o commit
`946e7514d0fe90f4f89029f9c0eb3bdf47619031` nunca foram enviados para o GitHub, por isso um clone
novo só via as três branches remotas. Não era falha de fetch, de shallow clone nem de refspec.

## Branches locais antes desta publicação

| Branch | Commit | Data | No GitHub |
| --- | --- | --- | --- |
| `main` | `dba3f42` | 2026-11-06 | sim |
| `develop` | `dba3f42` | 2026-11-06 | sim |
| `codex/release-baseline` | `cd3d2ab` | 2026-11-10 | sim |
| `experimental/drime-integration` | `14de503` | 2026-11-19 | não |
| `codex/pp-catalog-selection`, `codex/pp-native-url`, `codex/pp-scan`, `codex/pp-dashboard-preview` | `dba3f42` | 2026-11-06 | não |
| `codex/pp-catalog-task1`, `codex/pp-scan-candidate` | `cd3d2ab` | 2026-11-10 | não |
| `codex/audit-release-fixes` | `c99d1cc` | 2026-11-10 | não |
| `codex/ui-release-fixes` | `09bbcb1` | 2026-11-10 | não |

A branch `experimental/drime-integration` estava 12 commits à frente de `origin/main`, incluindo a
documentação de continuação do conversor, os diagnósticos read-only e a integração Drime.

## Publicação

Esta publicação envia `experimental/drime-integration` com o estado `14de503` e um commit novo com o
pacote `tmp/pp-full-conversion-candidate/review-full-v2` e as notas de recuperação. O pacote v1, os
dois ZIP e o `workbook.xlsx` ficam fora do Git por excederem o limite de 100 MB por ficheiro; os
hashes estão em `tmp/pp-full-conversion-candidate/RECOVERY-GITHUB-2026-11-19.md`.

## Credencial

O `patch_colored.cjs` em `origin/main` contém um token Notion hardcoded, com o mesmo valor que
`946e751:patch_colored.cjs`. O valor já estava público no histórico de `main`, mas deve ser revogado
e substituído, porque continua exposto. O `14de503` já corrige o ficheiro para ler
`NOTION_TOKEN` do ambiente. Outras branches locais antigas (`4e3c195`, `2210459`, `2b6d249`) também
têm cópias do mesmo ficheiro em `tmp/` e não foram publicadas.

## Estado do conversor

Revisão independente do v2: `PENDING`. Sem escritas no Notion ou no Magento, sem aplicação de
conversões e sem aprovação do piloto v2. O PP601 continua protegido e o lote continua limitado a
428, 429, 430, 467, 558, 612, 633, 661, 662, 786 e 840.
