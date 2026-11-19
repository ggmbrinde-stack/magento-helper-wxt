# Resultado V5

**Candidato local testado; lote real ainda não está pronto para piloto. Revisão independente pendente.**

## Mudança de política e evidência

TARGETED_SECTION/1 aceita a política humana explícita: os comentários/sugestões nativos não são requisito. Não se afirma que estejam vazios ou que as ligações aos blocos sejam preservadas. Comentários, notas, revisões e motivos no corpo continuam obrigatoriamente protegidos.

A descrição actual de update_content documenta pesquisa/substituição dirigida por old_str exacto e único; a especificação afirma que títulos simples não têm filhos. Isso suporta alterações dirigidas a folhas de apresentação conhecidas, mesmo sem indicadores de completude globais. A evidência está em source/captures/contract/ e os seus hashes no contrato e na implementação. Não foi observado nem testado o funcionamento interno do servidor.

A descrição e a especificação não atestam a exportação completa dos descendentes de colunas, toggles e tabelas. Equilíbrio de sintaxe e correspondência única não resolvem essa lacuna. As operações que substituem contentores mantêm o bloqueio específico. Quando o plano altera a associação de texto protegido dentro da secção, esse motivo também é registado. Não há uma nova garantia global nem um mecanismo especulativo para contornar estes pontos.

## Verificação concluída

- 59 testes Python e 7 testes Node passaram na cópia isolada. Os testes positivos usam transporte simulado; nenhum pedido de escrita real foi feito.
- Testes cobrem metadados globais ausentes numa folha real capturada, truncagem/conteúdo desconhecido explícitos, secção ausente/duplicada/nested/inteira, alterações humanas antes/depois, comentários e tabelas de corpo, motivo de rejeição próprio, ordem/associação, incerteza e cancelamento sem repetição. A consulta nativa upgrade_required não bloqueia a via excluída nem é convertida em vazia.
- A ponte correu em inspecção nesta sessão real: onze perfis, política correcta, zero chamadas Notion.
- Duas preparações produziram bytes idênticos. Corpos de origem/destino, códigos, opções próprias e propostas/dúvidas de negócio coincidem com a V4. As operações foram limitadas a update_content; não há operações de propriedades nesta política.
- Entradas são capturas congeladas, não leituras novas. O livro foi verificado por hash e leitura XML limitada, sem extracção integral/imagens.
- O ZIP final é novamente extraído e testado; os respectivos registos ficam em ../verification/final-archive-* fora do congelamento para preservar os bytes do arquivo efectivamente testado.

| PP | Estado | Operações elegíveis / bloqueadas |
|---|---|---:|
| 428 | NO_OP | 0 / 0 |
| 429 | BLOCKED | 2 / 2 |
| 430 | BLOCKED | 3 / 2 |
| 467 | BLOCKED | 3 / 2 |
| 558 | BLOCKED | 3 / 2 |
| 612 | BLOCKED | 3 / 2 |
| 633 | BLOCKED | 3 / 2 |
| 661 | BLOCKED | 2 / 2 |
| 662 | BLOCKED | 3 / 2 |
| 786 | BLOCKED | 3 / 2 |
| 840 | BLOCKED | 3 / 2 |

São 28 folhas elegíveis individualmente e 20 contentores bloqueados. Todas as operações de corpo de uma página seleccionada têm de ser aprovadas/elegíveis, impedindo execução parcial apenas de títulos. PP428 permanece byte a byte sem alterações, incluindo a sua decisão/motivo. O PP633 mantém Old 3+2 e o seu próprio New, sem copiar a rejeição do PP428. Os grupos partilhados, Caixa e Chapéu mantêm a prova Excel. As dúvidas técnicas dos PP430/558/661/662 não foram resolvidas por inferência.

## O que falta exactamente

1. Prova fiável da completude dos contentores afectados, ou um contrato documentado que garanta preservação de descendentes omitidos quando se substitui aquela secção exacta. A consulta actual não fornece essa prova; não é pedida completude global como requisito automático para folhas.
2. Nos casos assinalados, um plano que retenha comentários/notas do corpo e respectivas associações. Uma cópia em histórico não satisfaz esse requisito por si só. Consultar os motivos por operação em plans/reports/.
3. Revisão independente do candidato, novo plano com leituras actuais quando a prova estiver disponível e autorização humana explícita para um piloto elegível, seguida de revisão do piloto antes de autorizar o lote restante.

Não foram feitas leituras novas das páginas, alterações Notion/Magento, piloto, importação, alteração de esquema, aprovação, commit ou staging. A única chamada real ao conector foi a leitura da especificação. Controlos locais não são condições atómicas no servidor. Apenas o contrato público de substituição dirigida limita o efeito sobre conteúdo não exportado exterior à secção; não se certifica esse conteúdo como lido.

Hash canónico do plano: `f101a9f38974b7e9a163d810cb2a69d93aafee54fa6cb0e1148986b08d7b49d3`

Hash da implementação: `24af6e68f4b1ece24f718618651d7b804e89837ffbbf73f9cb9e05b8f867cbae`
