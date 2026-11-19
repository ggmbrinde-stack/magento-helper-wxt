# Conversão completa dos PPs, candidato v1

Este candidato é independente da correcção dos quatro bolsos. Reutiliza o leitor Excel corrigido e o executor com diário, verificação das escritas, quarentena por PP e continuação dos restantes. Não altera a extensão nem o Magento. Nesta sessão não foram feitas escritas no Notion.

O piloto proposto é o PP39, uma página original sem New/Old. O plano transforma a página inteira: imagens próprias, descrição própria, revisão Sim/Não e motivo, New à esquerda e Old à direita, tabelas com duas colunas e notas/fonte/histórico recolhíveis. Old vem das células verificadas do próprio código; grupos de locais partilhados continuam partilhados. O estado final só passa a `Para revisão` depois de todas as escritas e leituras de confirmação.

Os planos representativos incluem PP42, PP50, PP261 e PP262. As notas, decisões e imagens próprias ficam preservadas. PP42 conserva a opção Laser Metal que existe actualmente na página mas não no Excel, com a discrepância explícita. PP50 mantém a questão das duas cores. PP261/262 têm evidência real recolhida no navegador para os contentores afectados. As pendências de negócio continuam visíveis: estes planos podem completar o layout, mas não podem declarar sucesso integral nem sincronizar parcialmente as propriedades. Nesse caso, o resultado é parcial, tenta-se `Erro` com segurança e passa-se ao PP seguinte.

## Origem e cobertura

- Inventário actual: 814 códigos únicos na Working Copy `431b6705-ae1f-83db-b71c-0739778f9e1a`.
- Excel real: 823 blocos nas três folhas suportadas, 816 códigos distintos, sete códigos repetidos com as ocorrências enumeradas.
- Ligação exacta: 806 PPs com origem única utilizável, sete erros de origem e PP601 protegido. Esta contagem não prova conversão das páginas nem resolução das decisões técnicas.
- Erros: 492/964/965/966/967 sem código exacto neste Excel; PP735 contém uma instrução não classificada na coluna de opções; PP787 repete Peito Esquerdo em grupos diferentes, E168/E170. Não são escolhidas ocorrências por aproximação ou pela primeira posição.
- O relatório `verification/excel-format-coverage.json` inclui TODOS os 823 blocos, limites, classificação de cada célula de localização/opção, notas, imagens, comentários Excel, estilos e intervalos unidos. O relatório de ligação tem uma entrada para cada um dos 814 códigos Notion.
- Foram encontrados 276 intervalos unidos. Os seis que atravessam nominalmente as colunas de localização/opção são rótulos de secção ancorados na coluna do código; não se propagaram valores por suposição. As restantes uniões relevantes conservam descrições/notas. Não foram encontrados textos multilinha nem texto rico nas células das três folhas; há regressão sintética para multilinearidade e preservação do texto original.
- As bordas efectivas usam cores de tema e indexadas. RGB e cor automática sem atributo não ocorreram nesta origem. Não se apresenta ausência de ocorrências como validação visual desses formatos.
- O último bloco de cada faixa usa o fim real dessa faixa. Por exemplo, PP840 fica em `PPs BRINDE TÊXTIL!M126:P135`, sem estender o bloco até à última linha de outra faixa.

## Executar localmente

Python 3.12 e Node existentes, sem instalar dependências. Partindo da pasta deste pacote:

```powershell
python -B source/batch_cli.py inventory --index input/workbook-index.json --inventory input/inventory-current.json
python -B source/batch_cli.py prepare-full --captures captures --workbook input/workbook.xlsx --index input/workbook-index.json --inventory input/inventory-current.json --codes 39 --output runtime/pilot.json
python -B source/batch_cli.py inspect --plan runtime/pilot.json
```

O Excel incluído conserva o SHA-256 autorizado. Os dados de origem, os planos congelados e os pacotes anteriores não devem ser editados. Novos planos, capturas e diários ficam numa pasta de execução separada. O comando `index-workbook` recria o índice utilizando o mesmo leitor.

## Preparar com leituras actuais da sessão

`source/prepare_bridge.js` é uma função a executar numa sessão com as ferramentas Notion e de código. Recebe `script`, `plan`, `captures`, `workbook`, `index`, `inventory` e `codes`. Consulta apenas os códigos seleccionados, o esquema, as regras e a referência de layout PP428. Não escreve no Notion. Obtém o texto da função com `python -B source/batch_cli.py prepare-bridge-source`.

As páginas com contentores existentes precisam de evidência limitada real, ligada ao estado lido, em `captures/browser-regions.json`. A evidência de PP261/262 deste pacote só corresponde a esses blocos e a esses estados. Não autoriza outras páginas, outros blocos nem cobertura global. Um estado alterado, um conteúdo opaco ou uma estrutura não suportada produz erro por PP. Não se inventam identificadores nem campos de cobertura.

## Aplicar, continuar ou reconciliar

O Engineering Lead obtém primeiro a revisão independente do pacote exacto. A referência de revisão dos ficheiros de aprovação está intencionalmente vazia. Só depois se completa a aprovação com a referência real e se usa `execution-pilot.json` com `source/session_bridge.js`, obtido pelo comando `bridge-source`. O operador fornece o hash exacto do plano, mantém `apply: true` e usa os ficheiros operacionais fora da pasta congelada. Sem `apply: true`, a ponte só inspecciona o plano local.

O protocolo também tem comandos locais `session-start`, `session-step`, `session-continue`, `session-reconcile --code CODIGO` e `session-cancel`, com plano/aprovação/hash explícitos. A ponte suporta `continueBatch: true`, `reconcileOnly: true` com `reconcileCode` e `cancelOnly: true`; são mutuamente exclusivos.

`continueBatch` põe o PP interrompido em quarentena e avança para os restantes aprovados, sem repetir a operação pendente. `reconcileOnly` faz apenas leitura e termina; não retoma a escrita. Uma nova tentativa sobre um PP incerto exige reconciliação e revisão de um novo plano. Não há rollback destrutivo nem repetição cega.

O diário é persistido antes de emitir qualquer escrita. Se houver falha entre a substituição do conteúdo e a gravação do histórico na página, a versão original permanece no diário local. O relatório conserva motivo, operação, recibos e resultado conhecido. `Erro` é uma tentativa separada, limitada ao PP e ao esquema actuais; se não for possível confirmar esse estado, o relatório local permanece e o lote continua.

## Limites da entrega

Não foram aplicadas conversões completas no Notion por esta sessão. O primeiro piloto real e a confirmação do resultado guardado pertencem ao coordenador, após revisão independente. Não há validação automática da aprovação humana, criação de opções de esquema, upload de imagens, alteração de PP601 ou escrita nos catálogos originais/arquivados. A evidência visual é limitada aos contentores efectivamente lidos de PP261/262.
