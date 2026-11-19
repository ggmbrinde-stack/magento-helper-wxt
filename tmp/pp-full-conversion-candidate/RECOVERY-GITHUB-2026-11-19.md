# Recuperação no GitHub, 19 de Novembro de 2026

Cópia de preservação do candidato de conversão completa v2, publicada a partir da máquina local
`C:\Users\user\Videos\BestOfGifts_Master\magento-helper-wxt`.

## Incluído

- `review-full-v2/` completo, excepto `review-full-v2/input/workbook.xlsx`.
- `pp-full-conversion-input-20261119/` (pacote de origem autorizado).
- `pp-full-conversion-run/` (planos operacionais, relatórios PP e diários de execução).
- `README-FULL.md`, `RESULTADO-FULL.md`, `seal_and_verify.py` e os `.sha256` dos dois ZIP.

## Excluído por limite do GitHub (100 MB por ficheiro)

| Ficheiro | Bytes | SHA-256 |
| --- | --- | --- |
| `review-full-v2/input/workbook.xlsx` | 122350875 | `c2a99e711658a63a09d83156a8c6c7a3b512bf8c59b8c0b9688c017ee6ab4348` |
| `PP_Full_Conversion_REVIEW_v1.zip` | 125421463 | `31347cce013fc1c9bec308914e6f1b7c9a081ab91d72e1b0fe42f20d3b1b7cc0` |
| `PP_Full_Conversion_REVIEW_v2.zip` | 125430758 | `36a9241f8e751dd9488ef9a51a762c1755916a495c9afada13b353bd9ee815cd` |

O `review-full-v1/` também não foi publicado: está superado pelo v2 e continua preservado apenas
localmente.

O `review-full-v2/manifest-full-v2.json` não foi alterado e continua a listar `input/workbook.xlsx`.
A verificação completa do manifesto exige restaurar esse ficheiro com o SHA-256 acima.

## Verificação local

Executada nesta máquina em 19 de Novembro de 2026, a partir de `review-full-v2/source`:

- 141 testes Python, 0 falhas (10 ficheiros `tests/test_*.py`).
- 14 testes Node, 0 falhas (`test_prepare_bridge.cjs`, `test_session_bridge.cjs`).

## Estado

Revisão independente do v2: `PENDING`. Não houve escritas no Notion nem no Magento e nenhuma
conversão foi aplicada. O piloto PP39 continua limitado ao pacote v1.
