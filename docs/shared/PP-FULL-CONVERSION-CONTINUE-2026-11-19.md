# Continuação: conversor completo dos PPs em Notion

Estado registado em 19 de Novembro de 2026, Europe/Lisbon. Este documento permite continuar noutra IA ou sessão se terminar o contexto ou a disponibilidade do Codex. É uma fotografia do trabalho em curso, não uma aprovação de execução.

Actualização mais recente: o candidato completo v2 foi entregue e congelado após uma correcção pedida pelo Reviewer. A coordenação confirmou os hashes do ZIP e do manifesto v2 e enviou esse alvo exacto para nova revisão. O parecer v2 e o primeiro piloto real completo continuam pendentes. Não retomar implementação na fonte mutável enquanto esse parecer estiver em curso. O v1 está preservado, mas não é o candidato actual.

## Pedido para a próxima IA

Continua a implementação e conclusão do conversor Python dos PPs na Working Copy do Notion. O objectivo é tratar Old do Excel, New segundo as regras actuais, propriedades e apresentação completa em todos os PPs elegíveis. Não basta corrigir bolsos, gerar prévias, contar registos ou passar testes. Lê este documento, confirma o estado actual da única sessão de programação e preserva todo o trabalho existente. Antes de escrever conteúdo real, exige revisão independente do candidato exacto e verifica a primeira conversão completa gravada. Não retomes o Magento, a API, a conversão para TypeScript ou a análise de branches neste trabalho.

Se não tiveres acesso às sessões ou aos conectores, identifica essa limitação e continua o que for possível localmente. Não inventes resultados, identificadores de blocos, autorizações, referências de revisão ou provas de cobertura.

## 1. Objectivo e âmbito autorizado

O trabalho actual é um conversor Python independente, para utilização pela sessão de Notion. A incorporação futura na extensão e a conversão para TypeScript ficam para depois.

Fluxo pretendido:

1. Inventariar a Working Copy e seleccionar um conjunto exacto de PPs.
2. Ler páginas, propriedades e regras actuais pelo conector real.
3. Localizar a fonte exacta de cada PP no Excel e verificar locais, opções e associações.
4. Preparar Old fiel ao Excel, New segundo regras confirmadas e a página completa segundo a referência PP428.
5. Rever o plano exacto e preservar conteúdo existente, decisões humanas e histórico.
6. Aplicar pelo código revisto, reler e verificar conteúdo e propriedades.
7. Só após sucesso completo, confirmar Estado = Para revisão.
8. Em falha, parcialidade ou incerteza, guardar erro por PP, tentar Estado = Erro em segurança e continuar o próximo PP independente.

O utilizador autorizou este trabalho na Working Copy. Esta autorização não permite alterar os originais, as cópias protegidas, o esquema sem necessidade autorizada ou inventar decisões técnicas de impressão. Manter as confirmações e os controlos existentes. Pedidos de aprovação efectivamente recusados pelas ferramentas têm de ser respeitados.

Prazo comunicado: terminar o conversor funcional na quinta-feira, 19 de Novembro. Ao retomar mais tarde, comunicar o estado real, sem apresentar o prazo como cumprido.

## 2. Local de trabalho e alterações a preservar

Raiz local:

`C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt`

Branch e commit confirmados durante a escrita deste documento:

- Branch: `experimental/drime-integration`.
- HEAD: `946e7514d0fe90f4f89029f9c0eb3bdf47619031`.
- Alterações existentes: `.gitignore`, `docs/README.md`, `docs/shared/AGENT-CHATS.md`, `package.json`, `patch_colored.cjs`; pastas e ficheiros novos em `.postman/`, `postman/`, `tmp/`, documentação e scripts de diagnóstico.

Confirmar novamente antes de trabalhar. Não limpar, reverter, reorganizar ou adicionar estes ficheiros a um commit. Preservar particularmente `tmp/` e `scripts/probe-associated-products.js`. A análise de branches/commits e de todo o PP Preview foi adiada pelo utilizador.

Ler as instruções locais, `C:/Users/user/.codex/RTK.md` e estes documentos sob a raiz:

- `docs/shared/PROJECT-HANDOFF-2026-11-05.md`.
- `docs/README.md`.
- `docs/shared/AGENT-WORKFLOW.md`.
- `docs/shared/AGENT-CHATS.md`.

O handoff de 5 de Novembro menciona main, mas é histórico. Não mudar de branch para o seguir. Manter respostas simples, sem travessões longos e sem mudar de modo automaticamente.

## 3. Sessões e responsabilidades

Todas as sessões abaixo são existentes, no host `local`. Não criar outras nem alterar os respectivos modelos ou configurações.

| Responsabilidade | ID da sessão |
|---|---|
| Engineering Lead, coordenação | `01a1d6b9-82ed-7703-96b8-a4eabf543971` |
| Complex Coding, único responsável pela implementação | `01a1e913-be98-76c1-a391-5a736ffd4d1d` |
| Reviewer, revisão independente | `01a1b055-9b7c-7040-9381-abe87bb9b07c` |
| Notion Manutenção, fonte e decisões de negócio | `01a1e93d-198b-7c63-be03-b7286480a2e5` |
| Command Center, contexto geral se necessário | `01a1b047-ae6e-7372-8182-6124e964e552` |

O utilizador autorizou a coordenação destas tarefas nas sessões existentes. Confirmar o estado actual antes de enviar outra tarefa. Não iniciar um segundo escritor enquanto Complex Coding estiver a trabalhar. Se essa sessão ficar indisponível, transferir explicitamente a responsabilidade antes de editar os mesmos ficheiros. Os especialistas não delegam recursivamente.

As dúvidas de impressão, materiais, cores e técnicas devem ser tratadas com Notion Manutenção. O utilizador prefere uma pergunta simples de cada vez, nesse contexto. Não decidir por adivinhação nem repetir aqui as perguntas complexas já rejeitadas.

Em Codex, descobrir as ferramentas existentes para `wait_threads`, `read_thread` e `send_message_to_thread`. Usar snapshots compactos, sem reler todo o histórico. Uma IA externa pode não ter essas ferramentas; os IDs não lhe concedem acesso.

## 4. Estado confirmado agora

### Conversor completo

- Complex Coding entregou o candidato completo v2 congelado em `tmp/pp-full-conversion-candidate/review-full-v2/`.
- A coordenação enviou o pacote v2 exacto ao Reviewer. Ainda não há neste handoff aceitação independente do v2 nem prova de uma conversão completa real aplicada por esse candidato.
- Existem planos representativos para PP39, PP42, PP50, PP261 e PP262.
- O piloto PP39 propõe duas operações de conteúdo, seguidas do estado Para revisão após verificação. As propriedades já coincidem com New nesse piloto. Isso não prova gravação real. PP42/50/261/262 continuam com pendências e não constituem um lote integralmente aprovado.
- As instruções actuais são `review-full-v2/README-FULL.md` e `review-full-v2/REVIEW-FIX-V2.md`. `RESULTADO-FULL.md` regista a entrega inicial v1. O README herdado da fonte de desenvolvimento pode descrever bolsos; não o usar para escolher uma execução completa.
- O v1 teve 141 testes Python e 14 Node passados no ZIP extraído. O v2 teve seis testes Python focados na correcção; não foram repetidas as baterias globais/Node inalteradas. Provas actuais: `review-full-v2/verification/focused-results-v2.json`, `focused-v2-python.log` e, fora da pasta congelada, `verification/archive-results-v2.json`. A coordenação confirmou os hashes do ZIP/manifesto de ambas as versões, sem repetir as suites. Isso não substitui o parecer independente nem a validação real.

Correcção v2: o v1 podia aplicar layout a um PP com decisões pendentes antes de recusar o sucesso final. O v2 recusa o PP antes de qualquer alteração de conteúdo ou propriedade de negócio se existir `full_prepare_error`, `method_complete` não for exactamente true ou houver `technical_unresolved`. Só permite tentar Erro com as guardas existentes, guarda o motivo e avança para o PP independente seguinte. Uma quarentena anterior tem prioridade e impede repetir até esse marcador. A regressão cobre PP50 seguido de PP39, a ordem inversa, conteúdo intacto no PP50 e sucesso no PP39.

Identificadores exactos da entrega actual v2:

| Artefacto | SHA256 |
|---|---|
| `PP_Full_Conversion_REVIEW_v2.zip` | `36a9241f8e751dd9488ef9a51a762c1755916a495c9afada13b353bd9ee815cd` |
| `review-full-v2/manifest-full-v2.json` | `a66b26f10f9361eca92e6d8355510955e2dcd04078188d9f3af714f9a0f776f7` |
| Implementação v2 declarada | `dafc80c641d650fb9311a66cd6c3298c229e2775f8bb8d2e43acc42b1178a676` |
| Plano piloto PP39 v2 | `a203c32efa2d97c1f367fbd402c75888abc73d6bf5a77e71d7de9d2542d70887` |
| Plano representativo v2 com pendências | `5af25462abc9e16a37dc502d2085826a28bbb5a2a2f39e4a068495eb9f66667c` |

Identificadores históricos da entrega v1, preservar mas não usar para aceitar v2:

| Artefacto | SHA256 |
|---|---|
| `PP_Full_Conversion_REVIEW_v1.zip` | `31347cce013fc1c9bec308914e6f1b7c9a081ab91d72e1b0fe42f20d3b1b7cc0` |
| `review-full-v1/manifest-full-v1.json` | `e4124b4069b52587a8c4a18758e07a2fec1c65e72776427cc3d304806d5b2752` |
| Implementação declarada no manifesto | `37a14565f13e4dfa5df6e8c3e4a2f7941b9ad4067c84a97726da38ff2d124cf3` |
| Plano piloto PP39 | `28d0e799311c6f282d43a033c8e4314763b1740db1d8e9a38f064884c011d014` |
| Plano representativo com pendências | `0c75c99d9ac224d17fdccafc0b6809b814e648615f3d9c4cf02b5a1027d01923` |

A configuração actual `review-full-v2/execution-pilot39.json` aponta para `tmp/pp-full-conversion-run/pilot39-v2.json` e a respectiva aprovação. Contém `apply: true`, pelo que não é um comando de consulta. A referência de revisão continua deliberadamente vazia nas aprovações v2. Não executar antes do parecer nem substituir hashes à mão. A referência anterior `PP-FULL-V1-20261119-PP39-PILOT-ONLY` tinha âmbito limitado ao piloto v1 e não aprova esta implementação.

### Leitura visual do Notion

A primeira tentativa foi recusada. O utilizador autorizou repetir e a leitura posterior pelo navegador funcionou. Foram lidos PP261 e PP262 e expandidas as notas/fontes, sem editar conteúdo. Foram identificados contentores reais, incluindo tabelas de três colunas.

Evidência guardada em `tmp/pp-full-conversion-candidate/captures/browser-regions.json`. A própria captura declara `global_export_claimed: false`. Prova apenas as regiões inspeccionadas, não a totalidade de todas as páginas. Não repetir essa investigação sem necessidade. Para novas ligações ao Chrome, avisar previamente o utilizador; nunca aceitar a autorização por ele. Preferência actual: navegador, sem controlar a aplicação de computador.

Os comentários nativos do Notion não são necessários neste âmbito. As notas e os comentários escritos no corpo da página são importantes e têm de permanecer.

### Verificação do Excel em curso

O inventário de entrada tem 814 linhas, 814 códigos distintos e nenhum código em falta: 144 Têxtil, 51 Brinde têxtil e 619 Brindes. Este inventário não contém uma leitura completa dos corpos das 814 páginas.

A leitura candidata encontrou 823 blocos nas três folhas: 144 em PPs TÊXTIL, 51 em PPs BRINDE TÊXTIL e 628 em PPs BRINDES. Os relatórios intermédios indicam sete códigos repetidos: 184, 266, 285, 394, 435, 700 e 737. Também indicam códigos Notion sem fonte Excel: 492, 964, 965, 966 e 967. Confirmar os relatórios regenerados antes de assumir que estas listas são definitivas.

Entrega final da programação: a ligação dos 814 códigos Notion indica 806 com origem utilizável, sete com erro e PP601 protegido. Os erros são 492/964/965/966/967 sem fonte, PP735 com texto não classificado em S674 e PP787 com Peito Esquerdo em E168/E170 em grupos distintos. O bloco órfão sem código P9:S18 e os sete códigos Excel repetidos estão enumerados nos relatórios. Uma origem utilizável não significa uma página convertida ou New aprovado.

A entrega declara contabilização por célula dos 823 blocos, 276 uniões inventariadas e correcção dos limites finais das faixas, anteriormente prolongados por dados noutras faixas. Declara não haver texto rico/multilinha real nas células destas folhas e ter observado bordas de tema/indexadas; outros formatos só devem ser apresentados como testes sintéticos quando aplicável. Estas afirmações e a correcção ainda precisam de revisão independente.

Não confundir contagens correctas com extracção correcta. Não certificar todos os casos a partir de quatro exemplos visuais.

## 5. Ficheiros e fontes a conservar

Todos os caminhos relativos desta secção partem da raiz do projecto.

| Local | Finalidade |
|---|---|
| `tmp/pp-full-conversion-candidate/source/` | Implementação em curso, único escritor: Complex Coding |
| `tmp/pp-full-conversion-candidate/review-full-v2/` | Candidato actual congelado, alvo exacto da revisão, não editar |
| `tmp/pp-full-conversion-candidate/PP_Full_Conversion_REVIEW_v2.zip` | Pacote actual para transferência e revisão |
| `tmp/pp-full-conversion-candidate/review-full-v1/` | Versão anterior preservada, não editar |
| `tmp/pp-full-conversion-candidate/PP_Full_Conversion_REVIEW_v1.zip` | Pacote anterior preservado |
| `tmp/pp-full-conversion-candidate/RESULTADO-FULL.md` | Entrega v1, cobertura e limitações; ler também a correcção v2 |
| `tmp/pp-full-conversion-candidate/input/` | Índice Excel e entradas de trabalho |
| `tmp/pp-full-conversion-candidate/captures/` | Capturas Notion e evidência visual |
| `tmp/pp-full-conversion-candidate/plans/representative.json` | Plano representativo, não aprovado para execução |
| `tmp/pp-full-conversion-candidate/plans/representative-reports/` | Antes/depois e resumo por PP |
| `tmp/pp-full-conversion-candidate/verification/excel-format-coverage.json` | Relatório de formatos, ainda em evolução |
| `tmp/pp-full-conversion-candidate/verification/notion-excel-join.json` | Reconciliação de códigos e ocorrências |
| `tmp/pp-full-conversion-input-20261119/` | Pacote de fontes da Manutenção, de 19 de Novembro |
| `tmp/pp-method-source-evidence-20261118/` | Regras, IMP, PDF/email e fontes anteriores |
| `tmp/pp-importer-python-candidate/review-v1/` | Base congelada do importador corrigido, não editar |
| `tmp/pp-pocket-batch-candidate/review-batch-v1/` | Executor de bolsos revisto e congelado, não editar |
| `tmp/pp-pocket-batch-run/` | Registos operacionais do trabalho de bolsos já concluído |

O pacote de entrada de 19 de Novembro contém `inventory.json`, `template428.json`, `schema.json`, `current-rules.json`, `source-cases.json`, `provenance.json`, `README.md` e `manifest.json`. Usar as versões actuais, preservando as anteriores.

Fonte Excel actual:

`C:/Users/user/Desktop/CLEAN__Perfis de Personalização.xlsx`

SHA256 registado nos relatórios actuais: `c2a99e711658a63a09d83156a8c6c7a3b512bf8c59b8c0b9688c017ee6ab4348`.

Outras fontes, apenas quando necessárias:

- `C:/Users/user/Desktop/AI_READ_Perfis de Personalização - Cópia.xlsx`, histórico, não substituir silenciosamente o CLEAN.
- `C:/Users/user/Downloads/Personalizações Regras.pdf`.
- `C:/Users/user/Downloads/ChatGPT Image Nov 17, 2026, 11_26_56 AM.png`.

Se mudar o conteúdo da fonte, invalidar planos dependentes e regenerar a respectiva prova. Não colocar tokens, palavras-passe, chaves de sessão Magento ou credenciais no handoff.

## 6. Alvos Notion e protecções

| Alvo | Identificador | Permissão neste trabalho |
|---|---|---|
| Working Copy, datasource | `431b6705-ae1f-83db-b71c-0739778f9e1a` | Único destino mutável autorizado |
| Página inicial Working Copy | `417b6705ae1f81aabd8bf1130a9b991c` | Contexto/regras, preservar estrutura |
| Catálogo original, datasource | `434b6705-ae1f-8372-9d2e-070435a4f043` | Não alterar |
| Arquivo independente, página | `41cb6705ae1f81ef87bacb4959e7518f` | Não alterar nem usar como ensaio |
| Arquivo independente, datasource | `166b6705-ae1f-83da-be92-87f8d804a1a5` | Não alterar |

A cópia do layout anterior que partilha a fonte original também está protegida. PP601 tem uma excepção explícita: não alterar.

O esquema capturado tem 15 propriedades. Estado já inclui Demo, Validado, A rever, Obsoleto, Para revisão e Erro. Existe a vista FOR REVEIW, com a grafia indicada, filtrada por Para revisão. Não criar novamente o esquema ou a fila.

## 7. Critérios da conversão completa

### Excel e associações

- Validar as três folhas e todos os blocos, com relatório por código, folha, faixa, limites e motivo de qualquer incerteza.
- Contabilizar cada célula relevante uma vez ou classificá-la explicitamente. Verificar faixas de colunas, linhas vazias, alturas variáveis, células unidas, bordas indexadas/automáticas/theme/RGB, texto rico/multilinha, notas e âncoras de imagens.
- Impedir contaminação por PPs vizinhos e colunas VISTO/revisão.
- Não escolher a primeira ocorrência de um código repetido nem juntar ocorrências cegamente. Usar a ligação exacta à fonte original quando demonstrada; caso contrário, erro por PP.
- Preservar grupos Old partilhados. PP39/50 têm Face 1 + Face 2 com opções partilhadas. Isso não autoriza inventar uma repartição individual.
- Não assumir que cada mudança de linha corresponde a uma opção nova.
- Exemplos reais de regressão: PP42 C9:F14, PP39 C15:F21, PP33 C22:F27 e PP50 C28:F33, na folha PPs BRINDES. Servem como exemplos, não como prova global.

### Conteúdo e apresentação

- Aceitar páginas só com Locais e personalização, sem New/Old, e versões anteriores com Antes/proposta, tabelas pipe/XML, colunas, notas e toggles.
- Usar a estrutura PP428: imagens próprias primeiro, descrição/referência própria, callout Sim/Não/motivo próprio, colunas nativas iguais New à esquerda e Old à direita e tabelas de duas colunas local/opções.
- Recolher notas técnicas, fonte Excel e histórico em secções adequadas, mantendo a associação ao lado e local correctos. Preservar o texto original e decisões humanas.
- Nunca copiar imagem, opções, referência, rejeição ou motivo do PP428 para outro PP. PP661 não deve receber uma imagem inventada.
- Sincronizar propriedades com New confirmado, respeitando os tipos e opções do esquema existente.
- Validar estrutura não equivale a aprovação humana. Nunca marcar Validado automaticamente.
- Registos de conclusão devem identificar o âmbito completo, a fonte, as regras, o layout e a versão. O estado Para revisão ou um recibo antigo de bolsos não permite saltar a conversão completa.

### Falhas e recuperação

- Falha/parcial/incerto: relatório durável por PP com código, ID, motivo, fase, operações e recibos; parar esse PP, tentar Erro em segurança e continuar outros PPs independentes.
- Se a marcação Erro não puder ser confirmada, manter o erro local e explicitar o estado externo desconhecido.
- Um erro global de contrato, alvo ou aprovação pode impedir a execução inteira. A política de continuar não permite ultrapassar essas validações.
- Guardar intenção antes da escrita. Não repetir pedidos com resultado incerto, apagar quarentenas ou reiniciar execuções para contornar recibos.
- A API do conector não garante uma transacção atómica entre leitura e escrita. Reler a secção exacta antes de alterar e verificar depois.
- Não inventar campos globais de completude que o conector não devolve. Evidência de uma região não certifica conteúdo opaco fora dela. Se houver sinais explícitos de truncagem ou blocos desconhecidos, respeitar a recusa.

## 8. Pendências conhecidas de negócio e fonte

Consultar as regras actuais e a Manutenção antes de resolver estas questões:

- PP42: a tabela actual inclui Laser Metal até 360 cm² além de Tampografia 1 Cor; há discrepância com a evidência original incorporada. Não apagar silenciosamente esse conteúdo.
- PP50: Tampografia de duas cores ainda precisa de decisão de negócio.
- PP261: laterais sem definição suficiente, opções Transfer sem correspondência New única e propriedades que não devem inventar opções do esquema.
- PP262: correspondências Transfer pendentes; preservar a regra A7 para mangas compridas.
- Transfer não é DTF. A conversão genérica de cores para DTF continua por decidir. Transfer Digital Têxtil foi retirado de New.
- A excepção Transfer 126 cm², uma cor, está confirmada apenas para PP428, PP430, PP558, PP661 e PP662. Não generalizar.
- Peito do PP661 e material/técnica da caixa do PP662 continuam a exigir decisões específicas quando afectarem New.

Regras dimensionais de referência, a confirmar contra a fonte actual: aventais peito A4/bolso A6; têxtil frente e costas A4, peito/mangas A7; bonés/gorros/bucket hats A7; toalhas pequenas A6 e toalhas de banho/mantas A4; sacos pequenos A6 e grandes A4. Não deduzir compatibilidade de material apenas pelo tamanho.

## 9. Trabalho já terminado: não repetir os quatro bolsos

O executor revisto foi realmente aplicado aos PP430, PP558, PP661 e PP662. Corrigiu sete linhas de bolso e três deltas estreitos de propriedades; os quatro terminaram confirmados em Para revisão. O lote não provou conversão completa de páginas.

- PP430/558/662: Transfer 126 cm², duas cores, passou para uma cor no âmbito aprovado.
- PP661: conservar/mostrar a opção confirmada de uma cor.
- PP558: só bolso esquerdo; não inventar nova atribuição DTF.
- Peitos, caixa, layout completo e outras decisões não foram abrangidos.

Referência da revisão aceite: `PP-POCKET-BATCH-V1-20261118-ACCEPTED`. Não a reutilizar para aceitar o conversor completo.

Relatórios operacionais sob `tmp/pp-pocket-batch-run/runs/`:

- Piloto PP430: `3bb21d558d4a8f9e357c4e241b2adda0f6c5c237882f1e575dc5f660803b8934/batch-report.json`.
- PP558/661/662: `80e51439f2facee4acafea1792a88681d37a4b08ef9740cd01a884def076824f/batch-report.json`.

Não reiniciar estes lotes concluídos. A continuação após falhas foi testada em simulação; estes lotes reais não tiveram falhas e não provaram esse caminho em produção.

## 10. Próximos passos, por ordem

1. Confirmar o estado do Reviewer e de Complex Coding. O pacote v2 já está congelado e foi enviado para nova revisão; não iniciar implementação concorrente ou repetir a entrega. O parecer anterior limitado ao v1 não o aprova.
2. Rever os erros e relatórios de cobertura/reconciliação entregues. Separar extracção incorrecta de decisões New ainda por confirmar. Resolver bloqueios de código com o único escritor, num novo candidato se o alvo congelado mudar.
3. Rever conversão completa, preservação, propriedades, falhas, continuação e idempotência. Casos sem decisão não recebem conteúdo inventado.
4. Confirmar manifesto/hashes, instruções correctas, plano e relatórios antes/depois do pacote imutável. Não confundir o README herdado com as instruções da entrega completa.
5. Obter o parecer do Reviewer sobre esse alvo exacto, incluindo chamadores, controlos, casos reais do Excel, preservação e perda de resposta/continuação. Testes a passar não substituem esta revisão nem uma gravação real. Se houver bloqueios, corrigir e rever a nova versão antes de aplicar.
6. Após aceitação independente, preparar a primeira página completa elegível. PP39 é actualmente o candidato no plano, não uma escolha irrevogável. Reler página/esquema/regras/fonte e invalidar planos desactualizados.
7. Executar apenas esse plano revisto pelo código/ponte real. Verificar imagens, descrição, callout, New/Old, associações Excel, notas, histórico, propriedades e estado final após gravação.
8. Só depois avançar em conjuntos delimitados e revistos. Registar sucessos completos, erros, decisões pendentes, excepções e não tentados; não apresentar todos os 814 como concluídos por terem sido inventariados.
9. Comunicar ao utilizador e à Manutenção os resultados verificados e os bloqueios concretos. A conclusão exige prestação de contas dos 814, com exclusões/pendências explícitas, não todos silenciosamente bloqueados.

## 11. Comandos locais de consulta e verificação

Exemplos de leitura/teste. Confirmar primeiro as instruções do candidato final; não escrever por engano planos revistos ou saídas que outra sessão está a gerar. Não executar testes simultaneamente com o escritor sem coordenação.

```powershell
Set-Location 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt'
git status --short
git log -1 --format="%H %D"
python -B tmp/pp-full-conversion-candidate/source/batch_cli.py --help
python -B tmp/pp-full-conversion-candidate/source/batch_cli.py prepare-full --help
python -B tmp/pp-full-conversion-candidate/source/batch_cli.py inspect --plan tmp/pp-full-conversion-candidate/plans/representative.json
```

Testes disponíveis no candidato, a executar pelo responsável pela verificação quando a versão estiver estável:

```powershell
Set-Location 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-full-conversion-candidate/source'
python -I -B -m unittest discover -s tests -v
node --test tests/test_session_bridge.cjs
```

Entradas de código a inspeccionar apenas conforme necessário: `full_excel.py`, `excel_proof.py`, `format_coverage.py`, `importar_pp.py`, `full_conversion.py`, `full_regions.py`, `format_layout.py`, `batch_cli.py`, `page_batch.py`, `session_bridge.js` e testes correspondentes.

Python não se liga directamente às ferramentas MCP. A ponte JavaScript usa as ferramentas reais da sessão e o executor Python. No pacote final, verificar o hash da ponte contra o manifesto revisto antes de carregar o código. Aplicação exige plano/aprovação/hashes/referência de revisão reais; não preencher os campos pendentes ficticiamente. Seguir as instruções do pacote final para execução, continuação, cancelamento e reconciliação.

## 12. Transferir para outra IA

Este Markdown não contém o código nem as fontes. Se a outra IA não partilhar este computador, entregar o `PP_Full_Conversion_REVIEW_v2.zip`, com o candidato actual, e acrescentar os relatórios operacionais anteriores necessários para não repetir trabalho concluído. Confirmar o manifesto e o conteúdo recebido, incluindo Excel, fontes, índices, capturas, planos e testes necessários. Rever o conteúdo antes de o enviar para um serviço externo e excluir credenciais, sessões autenticadas e dados fora do âmbito. Um ZIP antigo de bolsos, ou o v1 sem a correcção v2, não substitui o conversor actual.

Ao receber este documento, a próxima IA deve responder primeiro com: estado confirmado, responsabilidade de implementação disponível, próximo passo concreto e qualquer acesso realmente em falta. Não reiniciar o projecto, repetir o trabalho de bolsos ou declarar a conversão completa concluída sem prova.
