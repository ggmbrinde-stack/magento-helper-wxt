# Correcção aprovada: Transfer126 nos bolsos de quatro perfis

Entrada operacional urgente: `prepare-pocket`. Os PP430, 558 e 662 passam Transfer126 de duas para uma cor. O PP661 conserva a opção de uma cor, acrescentando-a ao New onde ainda estava omitida. O nome exacto é `Transfer - Até 126 cm2 - 1 Cor (aprox. 11,2x11,2cm - MOCHILA)`.

A autorização humana de aplicação já existe, condicionada ao fluxo revisto. A coordenação executa após revisão independente: primeiro PP430, leitura e aceitação do resultado, depois PP558/661/662. Este candidato não executou escritas reais. Os ficheiros de aprovação registam a autorização real, mas mantêm `review_reference` vazio enquanto a revisão não estiver concluída. Não inventar essa referência nem pedir novamente uma autorização genérica já dada.

## Alteração exacta

- PP430: Transfer1Cor nos dois bolsos da associação original partilhada.
- PP558: só Bolso Esquerdo; a assimetria original mantém-se e o direito fica intacto.
- PP661: Transfer1Cor nos dois bolsos da associação original partilhada; não se altera o peito.
- PP662: Transfer1Cor nos dois bolsos da associação original partilhada; a caixa fica intacta.

Não há nova distribuição de DTF: conserva-se exactamente a que está actualmente em New. O A7 existente não passa a A6 nesta correcção urgente. Old, fonte Excel, imagens, colunas, toggles, notas de linha, revisão própria, Sim/Não, motivo e A rever mantêm-se. As únicas propriedades possíveis são o delta Transfer1262C para Transfer1261C, quando não é necessário fora dos bolsos, e a inclusão de Transfer nas técnicas se estiver em falta. Todas as outras opções globais são preservadas, sem sincronização parcial do método completo. Não se criam opções de esquema.

São sete substituições exactas de linhas e três alterações estreitas de propriedade, dez operações no total. O PP661 precisa de duas inclusões no New, embora a propriedade global já retenha a opção correcta. A fonte actual é a secção `User-confirmed extension: apron pocket Transfer`, na Working Copy 417b6705ae1f81aabd8bf1130a9b991c, editada em 2026-11-18T14:30:39.044Z.

## Preparar e inspeccionar

Python 3.11 ou posterior, biblioteca padrão; Node para os testes. Trabalhar no candidato ou numa cópia, nunca alterar o congelamento:

```powershell
Set-Location 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-method-final-candidate'
python -B batch_cli.py prepare-pocket --captures captures/pocket-current --output pocket-plans/full.json
python -B batch_cli.py prepare-pocket --captures captures/pocket-current --codes 430 --output pocket-plans/pilot.json
python -B batch_cli.py prepare-pocket --captures captures/pocket-current --codes 558 661 662 --output pocket-plans/rest.json
python -B batch_cli.py inspect --plan pocket-plans/pilot.json
python -I -B -m unittest discover -s tests -v
node --test tests/test_session_bridge.cjs
```

Cada plano tem diferenças e provas por página em `<nome>-reports/`. Os planos de piloto e restante grupo são distintos, com hashes e registos diferentes. Não tentar reiniciar o plano completo com outra aprovação depois do piloto.

## Executar pelo código após revisão

Python mantém o estado local e não se liga ao MCP. `session_bridge.js` usa as ferramentas reais da sessão: `exec_command`, `apply_patch`, `mcp__codex_apps__notion_fetch` e `mcp__codex_apps__notion_notion_update_page`. A inspecção é o modo predefinido. Não há backend com token nem novas dependências.

O congelamento `review-pocket-v1` contém fonte, planos, diferenças, testes, capturas e manifesto. Copiar a aprovação do piloto para `pocket-approvals/pilot.json` e preencher apenas a referência real da revisão independente já concluída. Os hashes e IDs de operações têm de coincidir com o plano revisto. Para o restante grupo, usar `pocket-approvals/rest.json` só depois de aceitar os recibos e a leitura do piloto. Os modelos `.pending-review.json` têm autorização humana real, mas são deliberadamente recusados enquanto essa referência estiver vazia.

A configuração de execução exacta está em `execution-pilot.json` e `execution-rest.json`. Carregar apenas a ponte cujo hash foi verificado no manifesto. Exemplo para `functions.exec`:

```javascript
const loaded = await tools.exec_command({
  cmd: "python -B 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-method-final-candidate/review-pocket-v1/source/batch_cli.py' bridge-source",
  max_output_tokens: 8000
});
if (loaded.exit_code !== 0) throw new Error('Falha ao carregar a ponte');
const bridge = JSON.parse(loaded.output);
if (bridge.sha256 !== '<files[source/session_bridge.js] DO MANIFESTO REVISTO>') throw new Error('Ponte alterada');
const run = eval(bridge.source);
text(await run({
  script: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-method-final-candidate/review-pocket-v1/source/batch_cli.py',
  plan: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-method-final-candidate/pocket-plans/pilot.json'
}, tools));
```

O exemplo só inspecciona. Para o piloto aprovado e revisto, acrescentar `apply:true`, `approval` e `approvedPlanSha` com os valores de `execution-pilot.json`. A coordenação deve ler o resultado, os recibos e o estado guardado antes de usar a configuração do restante grupo. Não há novas alterações manuais às páginas neste fluxo.

## Salvaguardas e recuperação

Antes de cada operação, o motor lê a página actual, confirma a identidade e a fonte Working Copy exactas, verifica a secção actual da regra aprovada e faz outra leitura imediatamente antes da escrita. Código, plano, manifestação de alvos e aprovação ficam ligados por hashes. As propriedades exigem esquema actual e o delta estreito confirmado nos bolsos já guardados; as três alterações de propriedade não podem ser excluídas da aprovação das respectivas páginas.

Só se substitui uma linha completa e única, mantendo a largura da tabela. A especificação documenta células de conteúdo em linha; não se substitui um contentor com descendentes desconhecidos. O prefixo e sufixo visíveis, notas e localização são verificados depois da escrita, antes de avançar. Isto não certifica uma exportação global completa nem constitui uma condição atómica no servidor. O primeiro piloto tem de confirmar o comportamento real de gravação e eventual normalização de Markdown.

A intenção é registada antes do envio em `pocket-plans/runs/<hash>/journal.json`; a barreira está no mesmo directório runs. Uma falha ou divergência pára sem repetição, rollback destrutivo ou avanço automático. Nunca apagar o registo/barreira para contornar uma escrita incerta.

Com a mesma ponte, plano e aprovação, `apply:true,reconcileOnly:true` faz apenas leitura. `RECONCILED_STOPPED` confirma que o resultado existe, `NOT_APPLIED_CONFIRMED` confirma o estado anterior e `RECONCILIATION_CONFLICT` conserva alterações intervenientes para investigação. `UNCERTAIN` exige resolver a leitura. Nenhum destes estados repete automaticamente a escrita ou retoma o resto do lote.

`apply:true,cancelOnly:true` pára antes de novas escritas. Uma intenção pendente continua UNCERTAIN e exige reconciliação. Não combinar cancelamento e reconciliação. Sem `apply:true`, só há inspecção local.

## Método completo e grupos posteriores

`prepare-method` e `aprons-manifest.json` mantêm o trabalho mais amplo dos onze aventais: regras actuais por categoria/local, Old fiel aos grupos Excel e propriedades correspondentes a New revisto. Esta entrada não é a correcção urgente e não deve ser aplicada com a aprovação dos quatro bolsos.

A manifestação identifica explicitamente código, UUID actual, categoria/contexto e grupos Excel de cada grupo revisto. Não se presume o número total de PPs nem se permite uma escrita arbitrária no catálogo. Grupos futuros exigem identidades, fonte, contexto, regras e revisão próprios. PP601 é uma excepção obrigatória de não alteração. A colecção original 434b6705-ae1f-8372-9d2e-070435a4f043 e o arquivo 166b6705-ae1f-83da-be92-87f8d804a1a5 estão protegidos; só a Working Copy 431b6705-ae1f-83db-b71c-0739778f9e1a pode ser alvo.

As decisões sobre peito do PP661, caixa do PP662 e restantes escolhas do método completo continuam na sessão Notion Manutenção. Não bloqueiam esta correcção aprovada e não são resolvidas implicitamente. Transfer e DTF mantêm-se distintos; Transfer Digital Têxtil está excluído de New; cores para DTF continua adiado. O método completo ainda não foi aplicado.
