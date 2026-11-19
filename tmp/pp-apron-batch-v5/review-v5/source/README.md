# Lote de aventais V5

Candidato para revisão independente, sem autorização de aplicação real. A política aprovada exclui os comentários/sugestões nativos do Notion. Os comentários, notas, tabelas de revisão, decisões Sim/Não e motivos escritos no corpo continuam protegidos. Não é feita qualquer afirmação de ausência de comentários nativos ou preservação das suas ligações aos blocos.

## Contrato e limite confirmado

`targeted-contract.json` define `TARGETED_SECTION/1`, ligado ao hash do plano, da implementação e das descrições/especificação efectivamente consultadas em `captures/contract/`. A documentação descreve `update_content` como pesquisa e substituição dirigida, com o menor `old_str` exacto e único. É o contrato público para limitar a alteração; não é uma prova da implementação interna do serviço nem uma validação real de escrita.

A especificação estabelece que títulos Markdown simples não têm filhos. O adaptador consegue certificar essa fronteira para os títulos de apresentação conhecidos. Nesses casos, a falta de indicadores globais não bloqueia a operação. Um contentor equilibrado, porém, pode ter descendentes que não aparecem na exportação. Não foi encontrado um contrato que ateste a completude dos descendentes de colunas, toggles ou tabelas exportados. Essas operações continuam bloqueadas sem prova explícita de completude do conteúdo afectado. Indicadores negativos de truncagem/conteúdo desconhecido ou formatos recusados continuam a impedir a execução. Não são fabricados campos nem declarada uma exportação global completa.

Nos planos reais deste candidato: PP428 é NO_OP; há 28 operações de títulos elegíveis individualmente e 20 operações de contentores bloqueadas. As dez páginas permanecem BLOCKED, pois a aprovação tem de incluir todo o plano de corpo de cada página. Não se inicia uma execução parcial apenas para remover títulos. O candidato ainda não está pronto para um piloto real do lote completo.

As entradas locais são capturas congeladas herdadas da V4, não leituras novas, nem uma cópia de segurança integral. A única chamada real nesta tarefa foi a leitura da especificação. Nenhuma escrita ou piloto foi feito.

## Preparar e rever

Python 3.11 ou posterior, biblioteca padrão. Node só para os testes da ponte. Trabalhar numa cópia, nunca em `review-v5`:

```powershell
Set-Location 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v5'
python -B batch_cli.py prepare --captures captures/current --workbook 'C:/Users/user/Desktop/CLEAN__Perfis de Personalização.xlsx' --evidence captures/current/excel-evidence.json --output plans/batch.json
python -B batch_cli.py inspect --plan plans/batch.json
python -I -B -m unittest discover -s tests -v
node --test tests/test_session_bridge.cjs
```

`prepare` valida códigos, títulos, células/grupos e hash do Excel, Working Copy e fonte de dados. Produz `plans/batch.json` e provas/diferenças em `plans/reports/`. As operações usam exclusivamente `update_content` com um único `old_str` exacto, único e limitado a uma secção de topo completa, `replace_all_matches:false`. A inclusão de histórico usa a última secção existente como âncora exacta, com o conteúdo original preservado no novo texto; sendo um contentor, exige a respectiva prova local. Não há substituição da página inteira, `insert_content`, alterações a propriedades, esquema, aprovação ou opções técnicas novas nesta política. As propriedades continuam como propostas separadas; as dúvidas dos PP430/558/661/662 mantêm-se explícitas.

Rever cada secção, respectivas fronteiras e separadores, New próprio, Old verificado, texto de revisão, motivos, notas, imagens, fonte e histórico. Os snapshots registam hashes do texto protegido e da sua associação a contentores, incluindo tabelas de comentários e notas em células. Mudanças de texto, associação ou ordem dentro da secção bloqueiam a operação; copiar para o histórico não basta. Os prefixos/sufixos visíveis são verificados à parte. O adaptador conserva também a recusa conservadora de formatos exportados não suportados.

Os 20 ficheiros `fixtures/historical/` estão incluídos e têm hashes no manifesto. São regressões históricas. Os testes não precisam do Excel real nem de pastas vizinhas. O gerador herdado `tests/build_reports.py` conserva entradas nativas externas e não é um comando de preparação/verificação V5.

## Aprovação e ponte

Obter revisão independente e resolver as provas das operações bloqueadas antes de preparar um novo plano. Uma aprovação humana explícita posterior tem de identificar o hash canónico do plano, hash da implementação, referência da revisão, códigos e todos os IDs de operações de corpo seleccionados. Copiar `approval.example.json`, deliberadamente inválido; só depois de autorização real usar `EXPLICIT_HUMAN_APPROVAL`. Qualquer mudança ao código, contrato, política, plano ou caminhos/prova Excel exige nova revisão e aprovação. O hash canónico apresentado por `inspect` não é o hash dos bytes do JSON.

Python não se liga ao MCP. `session_bridge.js` corre numa sessão com `exec_command`, `apply_patch` e o conector Notion. Na via V5 só chama `mcp__codex_apps__notion_fetch` e `mcp__codex_apps__notion_notion_update_page`; não consulta comentários nativos. O parser legado de comentários permanece apenas para compatibilidade/testes da via anterior.

Exemplo para `functions.exec`. Substituir o hash pelo valor revisto de `review-v5/manifest-v5.json`, campo `files["source/session_bridge.js"]`:

```javascript
const loaded = await tools.exec_command({
  cmd: "python -B 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v5/review-v5/source/batch_cli.py' bridge-source",
  max_output_tokens: 8000
});
if (loaded.exit_code !== 0) throw new Error('Falha ao carregar a ponte');
const bridge = JSON.parse(loaded.output);
if (bridge.sha256 !== '<SHA256 DO MANIFESTO REVISTO>') throw new Error('Ponte alterada');
const run = eval(bridge.source);
text(await run({
  script: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v5/review-v5/source/batch_cli.py',
  plan: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v5/plans/batch.json'
}, tools));
```

Sem `apply:true`, só inspecção local. Uma aplicação realmente autorizada acrescentaria `apply:true`, `approval:'C:/caminho/approval.json'` e `approvedPlanSha:'<HASH CANÓNICO APROVADO>'`. Isso não torna operações bloqueadas elegíveis. Planos sintéticos nunca usam a via real. Fazer primeiro um piloto de uma única página elegível, explicitamente autorizado e revisto antes de autorizar o lote restante. PP428 sem escrita não comprova aplicação.

## Execução, cancelamento e reconciliação

Antes de cada operação, leituras actuais confirmam identidade exacta de página/fonte, selecção autorizada, texto/hash/fronteira da secção revista, edição, corpo e propriedades observados. Uma segunda leitura imediatamente antes da escrita detecta alterações entretanto ocorridas. A intenção é gravada antes do envio. Após a escrita, o motor confirma o resultado da secção, prefixo/sufixo visíveis, texto protegido e metadados antes de avançar. Estes são controlos locais, não uma condição atómica no servidor nem uma afirmação de que foi lido todo o conteúdo omitido. Um escritor concorrente continua a ser um risco.

Registo: `plans/runs/<hash-canónico>/journal.json`. Barreira: `plans/runs/.batch-apply-active.json`. Usar uma cópia operacional e um único escritor; a barreira não coordena outras pastas/utilizadores. Respostas privadas, sem consultas HTTPS assinadas, passam por ficheiros `<plano>.event-<nonce>.json`, evitando limites de tamanho no Windows. São eliminados após processamento; uma interrupção pode deixá-los para diagnóstico. Referências assinadas no corpo são recusadas.

Falhas, avisos com resultado divergente ou mudanças visíveis impedem a operação seguinte. Não repetir uma escrita incerta, não reiniciar, apagar a barreira ou repor conteúdo antigo automaticamente. Consultar `receipts` para operações anteriores concluídas. O mesmo plano/aprovação pode ser usado na ponte com `apply:true,reconcileOnly:true`, via apenas de leitura:

| Estado | Interpretação |
|---|---|
| RECONCILED_STOPPED | Resultado dirigido confirmado; não repetir. Preparar/rever o restante trabalho. |
| NOT_APPLIED_CONFIRMED | Estado anterior confirmado; não repetir automaticamente. Preparar/rever novo plano. |
| RECONCILIATION_CONFLICT | Estado parcial ou alteração humana; preservar e investigar. Barreira mantida. |
| UNCERTAIN | Ainda não é possível concluir. Resolver a leitura antes de continuar. |

Para parar antes de outra escrita, usar a mesma configuração com `apply:true,cancelOnly:true`. Não combinar com `reconcileOnly`. O cancelamento conserva os recibos e devolve CANCELLED quando não há escrita pendente; se houver intenção enviada/por esclarecer, devolve UNCERTAIN e exige reconciliação, conservando a barreira. Não envia alterações ao Notion. Os comandos internos são `session-start`, `session-step`, `session-reconcile` e `session-cancel`; todos exigem plano/aprovação/hash e `--apply`. Sem `--apply`, só inspecção. Um `.step.lock` residual só pode ser removido após confirmar que não existe processo activo e inspeccionar o registo; nunca apagar a barreira para contornar uma escrita incerta.

A comparação estrita pode parar perante normalização benigna de Markdown. Não enfraquecer a verificação durante a execução. Todos os testes positivos de escrita usam transporte simulado, explicitamente identificado. Não comprovam apresentação visual, comportamento autenticado, preservação de comentários nativos ou completude de contentores reais.
