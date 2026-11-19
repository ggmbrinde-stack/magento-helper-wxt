# Correcção v2: bloquear decisões pendentes antes da escrita

O executor partilhado verifica `full_prepare_error`, `method_complete` e `technical_unresolved` ao entrar no PP, antes de emitir qualquer alteração de conteúdo ou propriedade de negócio. A quarentena anterior tem prioridade, evitando repetir até o marcador de erro. Uma rejeição inicial usa a fase interna de pré-verificação, sem herdar uma escrita pendente do PP anterior.

O PP rejeitado conserva motivo e relatório duráveis. Só o estado `Erro` pode ser tentado, com as verificações existentes de identidade, esquema e leitura imediata. Depois avança-se para o próximo PP independente aprovado. O PP39 resolvido mantém o comportamento anterior. As pré-visualizações de PP42/50/261/262 não autorizam a sua aplicação enquanto existirem decisões pendentes.

Passaram seis testes Python focados: PP50 sem escritas de negócio e PP39 com sucesso, nas duas ordens; preservação da quarentena; PP39 concluído; evidência visual de PP262 sem ultrapassar o bloqueio de negócio; resposta perdida sem repetição; continuação após interrupção; cancelamento. O cenário PP50 verifica conteúdo intacto, apenas o marcador `Erro`, motivo persistido e ausência de recibos de escrita de negócio.

Prova: `verification/focused-v2-python.log` e `verification/focused-results-v2.json`. Diff limitado da correcção: `fix-only-v2.patch`. As baterias globais e Node não foram repetidas, pois o transporte não mudou. Não houve escritas no Notion, delegação adicional ou alterações de definições.

Os planos, configurações e aprovações foram recalculados para esta implementação. As referências de revisão estão vazias. `PP-FULL-V1-20261119-PP39-PILOT-ONLY` continua limitado ao piloto v1 e não aprova o v2. É necessária revisão independente deste pacote exacto. O pacote v1 foi preservado.
