# Lote de aventais V3

Candidato executável para os PP 428, 429, 430, 467, 558, 612, 633, 661, 662, 786 e 840. Não aprovado para aplicação real. Não foi feita nenhuma escrita no Notion.

O Python prepara os planos e mantém o estado; não se liga ao MCP. `session_bridge.js` corre numa sessão com ferramentas e utiliza o conector já disponível: `mcp__codex_apps__notion_fetch`, `mcp__codex_apps__notion_notion_get_comments` e `mcp__codex_apps__notion_notion_update_page`. Usa `exec_command` para o motor local e `apply_patch` para ficheiros temporários de resposta. Não necessita de credenciais adicionais nem de dependências externas. Requer Python 3.11 ou posterior; os testes da ponte usam Node.

## Estado e preservação

PP428 permanece sem alterações, incluindo a escolha «Não» e o motivo. É referência visual, não fonte das escolhas técnicas dos outros perfis. Old é reconstruído pelos grupos/células confirmados no Excel. PP633 fica com Peito 3 opções e Bolso 2. Os grupos partilhados mantêm-se partilhados; PP786 tem três locais e duas opções, e P55 contém espaços.

Cada página mantém o próprio New, revisão/motivo, imagem, origem e metadados. O conteúdo anterior fica também no histórico. Notas repetidas são consolidadas por lado, local e texto; casos ambíguos são preservados. O histórico de texto não preserva, por si só, os comentários ligados a blocos.

As propriedades são propostas separadamente, apenas nos campos/opções existentes. Propostas incompletas não originam operações aplicáveis. Não há alterações ao esquema. As operações de corpo substituem secções completas e únicas com `update_content`, `replace_all_matches:false`, ou acrescentam histórico no fim. Consultar o conteúdo integral das operações: uma secção pode conter tabelas, colunas e toggles. Nunca se substitui a página inteira.

As onze leituras actuais omitem `truncated`, `unknown_block_count` e `unknown_block_ids`. As consultas de comentários dos PP428 e PP633 devolvem apenas `upgrade_required`; as restantes não foram repetidas após essa falha de capacidade. Isto não prova ausência de comentários ou sugestões. As dez páginas que necessitam de alterações estão bloqueadas.

É necessária prova fiável de completude da região afectada ou um contrato documentado de edição que preserve conteúdo omitido, além de prova de preservação dos comentários e das ligações aos blocos. Não foi encontrado esse contrato. Actualmente, o motor admite apenas a via conservadora de exportação explicitamente completa e comentários/sugestões explicitamente vazios, sem marcadores de discussão. A via positiva foi testada com dados sintéticos, não observada no conector real. Uma via contratual alternativa exige alteração e nova revisão do código. Não acrescentar indicadores às capturas nem alterar a elegibilidade manualmente.

## Preparar e rever

Trabalhar no candidato ou numa cópia, nunca dentro de `review-v3`. Estes comandos são locais:

```powershell
Set-Location 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v3'
python -B batch_cli.py prepare --captures captures/current --workbook 'C:/Users/user/Desktop/CLEAN__Perfis de Personalização.xlsx' --evidence captures/current/excel-evidence.json --output plans/batch.json
python -B batch_cli.py inspect --plan plans/batch.json
python -B -m unittest discover -s tests
node --test tests/test_session_bridge.cjs
```

`prepare` valida o hash do livro, a folha, códigos, títulos, células/grupos, Working Copy e fonte de dados. Gera `plans/batch.json` e diferenças/provas por página em `plans/reports/`, com propriedades propostas e dúvidas técnicas. Os mesmos ficheiros produzem o mesmo plano. As leituras actuais estão em `captures/current/`; as restantes capturas e os testes herdados são regressões históricas.

Rever todas as operações e diferenças, grupos Excel, New específico, revisão/motivo, conteúdo exterior às secções, origem, histórico, imagens, notas e propriedades. O hash canónico apresentado por `inspect` não é o hash dos bytes do JSON. O hash da implementação inclui os oito ficheiros de execução. O manifesto contém também hashes dos bytes de todos os ficheiros do pacote.

## Aprovação imutável e piloto

1. Obter revisão independente do candidato e resolver falhas. A opinião de adequação da sessão Notion Manutenção não equivale a revisão integral.
2. Resolver as provas externas em falta, obter novas capturas reais e preparar/rever um novo plano. Não inventar correcções para escolhas «por confirmar».
3. Após autorização humana explícita, seleccionar uma única página elegível para piloto. PP428, sem escrita, não valida esse caminho. Rever o resultado antes de autorizar o resto do lote.
4. Copiar `approval.example.json`. Preencher hash canónico do plano, hash da implementação, referência da revisão, códigos e IDs de operações autorizados. Só após autorização real usar `EXPLICIT_HUMAN_APPROVAL`. O exemplo é deliberadamente inválido.

A aprovação inclui todas as operações de corpo das páginas seleccionadas. Operações de propriedades resolvidas são opcionais, com os respectivos IDs explícitos. Operações bloqueadas não podem ser aprovadas. Qualquer alteração ao plano/implementação exige nova revisão. O livro e a prova Excel têm caminhos absolutos e hashes verificados em execução; uma mudança de localização exige preparar/rever um novo plano.

## Ponte na sessão

A sessão precisa das cinco ferramentas acima. Carregar o código local revisto e confirmar o hash contra `review-v3/manifest-v3.json`, campo `files["source/session_bridge.js"]`. Exemplo para `functions.exec`, com o hash retirado do manifesto revisto:

```javascript
const loaded = await tools.exec_command({
  cmd: "python -B 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v3/review-v3/source/batch_cli.py' bridge-source",
  max_output_tokens: 8000
});
if (loaded.exit_code !== 0) throw new Error('Falha ao carregar a ponte');
const bridge = JSON.parse(loaded.output);
if (bridge.sha256 !== '<SHA256 DO MANIFESTO REVISTO>') throw new Error('Ponte alterada');
const run = eval(bridge.source);
text(await run({
  script: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v3/review-v3/source/batch_cli.py',
  plan: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-apron-batch-v3/plans/batch.json'
}, tools));
```

Sem `apply:true`, só há inspecção local, sem conector nem criação de execução. O exemplo usa um plano de trabalho fora do congelamento. Para aplicação explicitamente autorizada, usar o novo plano realmente revisto e acrescentar à configuração:

```javascript
apply: true,
approval: 'C:/caminho/autorizado/approval.json',
approvedPlanSha: '<HASH CANÓNICO DO PLANO APROVADO>'
```

Isto não torna o plano actual elegível. A execução recusa páginas bloqueadas, dados sintéticos, hashes divergentes e aprovações incompletas. Não aplicar com base apenas neste documento.

Respostas do conector passam por ficheiros JSON locais, com consultas HTTPS assinadas removidas. O caminho, não o corpo, vai na linha de comando, evitando o limite do Windows. Os ficheiros `<plano>.event-<nonce>.json` são eliminados após processamento; uma interrupção pode deixá-los para diagnóstico. Referências assinadas no corpo são recusadas. Capturas/registos continuam privados.

## Resultado incerto e recuperação

`session-start`, `session-step` e `session-reconcile` são o protocolo da ponte. Todos exigem `--plan`, `--approval`, `--approved-plan-sha` e `--apply`; sem `--apply`, só inspeccionam. `session-step` recebe `--event-file` ou `--event-base64` para eventos pequenos. Não usar o protocolo para enviar operações manuais.

O registo fica em `plans/runs/<hash-canónico>/journal.json`. A barreira `plans/runs/.batch-apply-active.json` impede outra execução nesse directório. Usar uma única cópia operacional e um escritor; a barreira não coordena outros directórios/utilizadores.

Antes de cada escrita, o motor confirma identidade, conteúdo, revisão, propriedades, tempo de edição, completude, comentários e, quando necessário, esquema. Persiste a intenção antes de devolver a operação. Uma leitura posterior confirma corpo/metadados exactos antes da operação seguinte. Estes controlos locais não são uma condição atómica no servidor: alterações humanas entre leitura e escrita continuam a ser um risco. Evitar escritores concorrentes durante um eventual piloto.

Falha de transporte, erro do conector ou divergência posterior pára a execução. Não reiniciar, repetir o pedido, apagar a barreira/registo nem restaurar conteúdo antigo automaticamente. Pode haver operações anteriores concluídas; consultar `receipts` no registo.

Para reconciliar, carregar a mesma ponte com a mesma aprovação/configuração, `apply:true` e `reconcileOnly:true`. Esta via só lê:

| Resultado | Passo seguinte |
|---|---|
| `RECONCILED_STOPPED` | Estado novo confirmado; não repetir. Preparar/rever o restante trabalho. |
| `NOT_APPLIED_CONFIRMED` | Estado antigo confirmado; não repetir automaticamente. Preparar/rever novo plano. |
| `RECONCILIATION_CONFLICT` | Estado parcial ou alteração humana; preservar e investigar. A barreira permanece. |
| `UNCERTAIN` | Leitura inconclusiva; resolver antes de continuar. A barreira permanece. |

Uma interrupção em `WRITE_PENDING` ou `VERIFY_PAGE` exige reconciliação. Nenhum resultado é retomado automaticamente. Normalização benigna de Markdown pode falhar a comparação estrita; investigar/rever, sem enfraquecer o controlo durante a execução. Um `.step.lock` residual só deve ser removido depois de confirmar ausência de processo activo e inspeccionar a fase persistida. Nunca apagar uma barreira de escrita incerta para forçar outra execução.

## Evidência e limites

`review-v3` contém código, testes, capturas, planos, diferenças, resultados e manifesto para revisão independente. Os congelamentos anteriores da V2 e do importador mantêm os hashes originais. `catalog_names.py` reutiliza apenas funções determinísticas de nomes do importador, sem o escritor.

Os testes positivos usam conector simulado e completude sintética. Não demonstram capacidades reais do serviço, estabilidade dos blocos, preservação de comentários, apresentação visual ou comportamento autenticado. Não houve piloto, aplicação real, alteração Magento, commit, push ou publicação. Revisão independente, provas aplicáveis e autorização humana continuam em falta.
