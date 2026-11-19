# Entrega urgente: Transfer126 nos bolsos

**Pronto para revisão independente do código e do piloto. Nenhuma escrita real foi executada pelo implementador.**

Autorização humana já registada na fonte Working Copy, secção User-confirmed extension: apron pocket Transfer, editada em 2026-11-18T14:30:39.044Z. A execução pela coordenação é posterior à revisão independente, primeiro PP430 e depois os restantes após aceitar a leitura/recibos do piloto. As aprovações não inventam uma revisão: a referência permanece vazia até existir.

| PP | Transfer1261Cor no New | Linhas / propriedades |
|---|---|---:|
| 430 | Bolso Esquerdo, Bolso Direito | 2 / 1 |
| 558 | Bolso Esquerdo | 1 / 1 |
| 661 | Bolso Esquerdo, Bolso Direito | 2 / 0 |
| 662 | Bolso Esquerdo, Bolso Direito | 2 / 1 |

Sete linhas, três propriedades. PP430/661/662 seguem a associação original partilhada de Transfer nos dois bolsos. PP558 mantém a assimetria real: só o esquerdo muda. Não se distribui DTF por novos locais, nem se altera A7/A6 nesta entrega. PP661 conserva a opção original de uma cor e precisa de a tornar visível no New; a propriedade global já a inclui.

Peito do PP661 e caixa do PP662 ficam exactamente como estavam. Old, fonte, imagens, notas nas linhas, revisão/Sim/Não/motivo/A rever e outros campos ficam intactos. O delta global limita-se ao Transfer126 confirmado e à técnica Transfer se faltar; não se faz a sincronização completa de New enquanto outras decisões estão abertas.

## Verificação

- 80 testes Python e 8 testes Node passaram a partir de uma cópia isolada. Incluem as regressões anteriores, o método dos onze e o novo percurso urgente de quatro.
- Entrada CLI real exercitada com transporte simulado e eventos em ficheiro, leitura actual da regra antes de cada operação, mudança de origem recusada, corrida no motivo de revisão, perda de resposta de linha/propriedade e reconciliação sem repetir.
- A extracção profunda do primeiro ZIP reproduziu MAX_PATH no Windows. V2 altera apenas três pastas temporárias de teste para a pasta do sistema e documenta execução operacional curta. O motor e os planos mantêm os mesmos bytes/hashes; nenhuma salvaguarda de gravação foi enfraquecida. O ZIP V1 e as falhas históricas são preservados.
- Planos full/pilot/rest reproduzidos de forma determinística. Capturas reais actuais dos quatro perfis, fonte nova confirmada e esquema existente. Não há indicadores de completude fabricados nem comentários nativos convertidos em vazios.
- O ZIP final é novamente extraído e testado; os registos ficam fora do congelamento em ../verification/pocket-final-archive-* para preservar os bytes do arquivo testado.

## Execução pela coordenação

1. Rever fonte, diferenças, capturas, fronteiras das linhas, deltas das propriedades e contrato de pesquisa/substituição. Registar a referência real do parecer nas cópias operacionais das aprovações.
2. Usar execution-pilot.json e a ponte do source/batch_cli.py para PP430. Confirmar três operações guardadas e estado final esperado.
3. Só após aceitação, usar execution-rest.json: sete operações nos PP558/661/662. Há planos/hashes/registos distintos, sem reiniciar a mesma execução com outra aprovação.
4. Qualquer resultado incerto pára. Reconciliar em modo de leitura com a mesma aprovação; nunca repetir/forçar rollback nem apagar barreiras para avançar.

## Limites

Não houve teste de escrita autenticada; a semântica e normalização reais da substituição de linhas exigem o piloto revisto. O contrato público permite pesquisa/substituição dirigida; as células são documentadas como conteúdo em linha. Não se certifica a árvore completa dos contentores, não se substituem colunas/toggles e não se reclama preservação de comentários nativos. Os controlos locais não são atómicos no servidor.

Esta entrega é apenas a correcção autorizada de quatro bolsos/perfis. As outras escolhas do método completo continuam na sessão Notion Manutenção; não estão implicitamente concluídas. O código mais amplo e os testes permanecem incluídos como dependência/regressão, sem autorização para aplicar planos fora desta entrega.

Hash piloto: `11f0555bc14cfa54039db1f0c419a83f0bd3023ec81ccd7656dbfc3188dfbd33`

Hash restante: `dbf3d075863991eb5a648509261b0a4e6e127a436ce051294bcd0df0db76902a`

Hash implementação: `66844aeada2e87b3775301f87683a389895967d50bcacfc1d3432cef1116ab36`

## Correcção V2 de empacotamento

A diferença contra V1 contém só README e três linhas de testes TemporaryDirectory. Código de execução, planos, autorizações e operações são idênticos. O ZIP V2 é testado depois de extraído, com os registos em ../verification/pocket-v2-final-archive-*. O caminho operacional curto tmp/pp-pocket-run tem 196 caracteres no nome máximo do ficheiro temporário do registo, abaixo de MAX_PATH. As configurações anexas já apontam para os planos e aprovações ali copiados, com review_reference ainda vazio.
