# Lote Pocket: estados finais e continuação após erro

**Candidato para revisão independente. Nenhuma escrita real foi executada pelo implementador.**

Mantém a correcção dos quatro perfis: sete linhas de bolso e três propriedades estreitas, com payloads idênticos aos do Pocket V3. Depois de cada PP integralmente verificado, acrescenta Estado=Para revisão. Falhas ficam registadas e isoladas; a tentativa independente de Estado=Erro confirma identidade/esquema actual. Se não conseguir marcar/ler o erro, conserva relatório local e avança.

As duas opções existem no esquema real recebido: Para revisão e Erro. Não houve alterações de esquema pelo código. O motivo é registado nos relatórios locais por PP, não substitui as razões/notas originais.

| PP | Linhas | Propriedades de negócio | Estado final de sucesso |
|---|---:|---:|---|
| 430 | 2 | 1 | Para revisão, só após leitura confirmada |
| 558 | 1 | 1 | Para revisão, só após leitura confirmada |
| 661 | 2 | 0 | Para revisão, só após leitura confirmada |
| 662 | 2 | 1 | Para revisão, só após leitura confirmada |

Em sucesso, são catorze escritas: sete linhas, três propriedades de negócio e quatro estados finais. As quatro operações Erro são condicionais e também constam da aprovação. O PP falhado nunca entra na contagem SUCCESS; cada relatório distingue ERROR, PARTIAL, UNCERTAIN e estado efectivamente confirmado.

## Verificação

- A bateria anterior de 98 testes Python e 10 Node passou. Após o último ajuste de libertação da barreira geral quando todos os alvos estão em quarentena, passaram os 17 testes específicos do lote.
- A verificação final do ZIP executa a bateria completa actual: 99 Python e 10 Node. Os registos ficam fora do congelamento em ../verification/batch-final-archive-*.
- Casos: primeiro PP falha e seguinte conclui; conteúdo aplicado com resposta perdida; parcial com recibo confirmado; Erro falha/está ausente; identidade protegida; estado final incerto; cancelamento; retoma explícita sem reenviar a operação; quarentena de um PP não impede outro; reconciliação só de leitura; CLI real com conector simulado.
- A correcção Pocket V3 de cobertura negativa mantém-se. Um único truncated:true/unknown count/IDs desconhecidos impede aceitar conteúdo e executar a operação de conteúdo seguinte no mesmo PP. Só a marcação de metadados segura e outros PPs independentes podem avançar.
- Planos full/pilot/rest determinísticos; código, política, selecção, payloads e aprovações ligados por hashes.

## Execução e recuperação

Usar execution-full.json para o lote contínuo, ou as configurações pilot/rest se a coordenação optar por primeiro validar PP430. A autorização humana já cobre esta política; preencher apenas a referência real da nova revisão independente nas cópias operacionais. O local curto é tmp/pp-pocket-batch-run.

O registo e relatórios ficam em runs/<hash do plano+aprovação>/. Barreira geral apenas durante execução; páginas incertas têm barreiras próprias persistentes em runs/page-quarantines/. Não apagar essas barreiras. COMPLETE implica todos os PPs verificados em Para revisão; COMPLETED_WITH_ERRORS inclui os resultados por código.

continueBatch:true é uma acção explícita após interrupção: põe o PP pendente em quarentena sem repetir a escrita, tenta a marcação segura se ainda não a tentou e passa aos outros PPs. Não retoma uma execução cancelada/concluída. reconcileOnly:true,reconcileCode:<codigo> só lê e regista a resolução; não envia alterações nem retoma o lote. Uma resolução confirmada mantém o ficheiro de barreira e exige nova revisão para trabalho posterior nesse PP.

## Limites

Sem teste autenticado de escrita pelo implementador. Os testes positivos usam transporte simulado identificado. Se as APIs não confirmarem Erro depois de uma escrita Para revisão incerta, o estado externo pode continuar desconhecido; o relatório não declara falsamente que a fila externa ficou corrigida. Não se repetem pedidos incertos nem se faz rollback.

As notas do corpo, decisões Sim/Não, razões, Old, fonte, imagens, agrupamentos, peito do PP661 e caixa do PP662 permanecem preservados. Não há autoValidado nem decisão cores para DTF. Original e arquivo continuam fora dos alvos. Os controlos locais não são uma condição atómica no servidor.

Hash plano completo: `e627a984b2e58a5d03cd643bb16b20db10dc847f4c19764ac893aee74822a9a9`

Hash implementação: `ff4fca13269a007af0ed59829053036df3b7e23623b3b5104d3ee6681a4df06e`
