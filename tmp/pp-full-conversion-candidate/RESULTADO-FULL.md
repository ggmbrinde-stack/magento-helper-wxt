# Conversão completa de PPs: entrega para revisão independente

O candidato v1 está congelado em `review-full-v1`. A verificação do ZIP extraído passou: **141 testes Python e 14 testes Node**, sem falhas. Os hashes dos ficheiros extraídos e congelados permaneceram iguais. A interface local de inspecção também confirmou o piloto em modo de simulação. Nenhuma conversão foi aplicada ao Notion por esta sessão.

## Artefactos exactos

- ZIP: `PP_Full_Conversion_REVIEW_v1.zip`
- SHA-256 do ZIP: `31347cce013fc1c9bec308914e6f1b7c9a081ab91d72e1b0fe42f20d3b1b7cc0`
- Manifesto: `review-full-v1/manifest-full-v1.json`
- SHA-256 do manifesto: `e4124b4069b52587a8c4a18758e07a2fec1c65e72776427cc3d304806d5b2752`
- Implementação: `37a14565f13e4dfa5df6e8c3e4a2f7941b9ad4067c84a97726da38ff2d124cf3`
- Plano piloto PP39: `28d0e799311c6f282d43a033c8e4314763b1740db1d8e9a38f064884c011d014`
- Plano representativo: `0c75c99d9ac224d17fdccafc0b6809b814e648615f3d9c4cf02b5a1027d01923`
- Prova final e logs: `verification/archive-results.json`, `archive-python.log`, `archive-node.log` e `cli-dry-run.log`.

O ZIP inclui o Excel autorizado, os índices, capturas, observações limitadas do navegador, fontes, testes, planos, manifesto e instruções operacionais. O diff de código compara com o executor Batch Status v1 e com o importador corrigido v1. Os artefactos anteriores foram preservados.

## Fluxo utilizável

`prepare_bridge.js` usa as ferramentas reais da sessão para ler a selecção, esquema, regras e referência PP428, sem escritas no Notion. O Python prepara o plano a partir do código exacto do Excel, incluindo páginas originais sem New/Old. `session_bridge.js` aplica o plano revisto através do conector existente. Os comandos de continuação, cancelamento e reconciliação usam o diário persistente e a quarentena existentes.

O primeiro piloto é **PP39**: página original, tabela partilhada Face1/Face2, imagens e descrição próprias, revisão própria, New/Old em colunas iguais e tabelas de duas colunas, notas e histórico. São duas operações de conteúdo, seguidas do estado final após confirmação. As propriedades já correspondem a este New e não têm alterações propostas neste piloto. O fluxo de sincronização de propriedades foi testado separadamente contra o New efectivamente guardado.

Os planos de PP42/50/261/262 já produzem o layout completo. As pendências técnicas impedem sucesso integral e sincronização parcial das propriedades. PP42 conserva a opção actual Laser Metal360 que não existe na célula F10 do Excel. PP50 mantém a questão das duas cores. PP261/262 mantêm as dúvidas de técnicas/áreas e as próprias notas. A leitura no navegador confirmou os blocos afectados e os seus identificadores reais, incluindo os descendentes das colunas do PP262; não se declarou cobertura global nem se controlou a aplicação de computador.

Um PP com falha de leitura inicial, origem ambígua, conteúdo não suportado, escrita parcial ou resposta perdida não impede os PPs independentes aprovados. O motivo e os recibos ficam no relatório. `Erro` só é tentado quando a identidade, estado e esquema permitem uma escrita segura; caso contrário conserva-se o relatório local. Uma operação incerta não é repetida. A reconciliação só lê.

## Cobertura efectiva do Excel

Foram verificados os **823 blocos das três folhas**, com limites e classificação de cada célula de localização/opção. Há 5994 células de opção atribuídas a grupos, 2667 células de localização atribuídas, duas localizações repetidas explicitamente assinaladas, uma célula de texto não classificado, 1066 cabeçalhos e 8234 células vazias. Zero erros estruturais de contabilização não significa que todas as decisões de negócio estejam resolvidas.

As 276 uniões foram inventariadas. As seis que atravessam nominalmente colunas de localização/opção são rótulos de secção; não se propagaram valores. Não há texto multilinha/rico nas células destas folhas. As bordas observadas são de tema ou indexadas. Há testes do leitor corrigido e uma regressão sintética de texto multilinha; não se reivindica observação real de formatos ausentes. O limite final das faixas deixou de depender da última linha de outras faixas: PP840 fica limitado a M126:P135.

O relatório de ligação enumera os 814 códigos Notion: **806 com origem exacta utilizável, sete com erro e PP601 protegido**. Os erros são 492/964/965/966/967 ausentes no Excel, PP735 com «Retirar no magento Tampografia» em S674, e PP787 com Peito Esquerdo em E168/E170 em grupos diferentes. Os sete códigos repetidos do Excel e todas as suas ocorrências estão enumerados no relatório, assim como o bloco órfão P9:S18. Não se escolheram primeiras ocorrências nem se inventaram equivalências de códigos.

## Próximo passo e limitações

O Reviewer deve rever este pacote exacto, o diff e as provas antes da aceitação. O Engineering Lead preenche a referência real de revisão nas aprovações operacionais de `tmp/pp-full-conversion-run`, usa `review-full-v1/execution-pilot39.json` e confirma a primeira página completa efectivamente guardada. Se o PP ou as regras tiverem mudado, deve preparar e rever o novo plano; não substituir o hash à mão.

Não executar o plano representativo como se as escolhas pendentes estivessem resolvidas. As decisões de negócio continuam na Manutenção. O sucesso do piloto real e a conversão dos restantes PPs ainda não foram demonstrados. A aprovação de um trabalho anterior limitado aos bolsos não serve de recibo de conversão completa.

Base verificada: `experimental/drime-integration` em `946e7514d0fe90f4f89029f9c0eb3bdf47619031`. Não houve alterações à extensão/Magento, commits, pushes, alterações de esquema ou mensagens entre sessões nesta implementação. As alterações e ficheiros de outros responsáveis foram preservados.
