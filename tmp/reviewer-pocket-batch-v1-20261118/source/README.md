# Lote Pocket: estados e isolamento de falhas

Esta revisão parte do Pocket V3 e mantém a correcção aprovada dos PP430/558/661/662: sete linhas de bolso e três deltas estreitos de propriedades. Acrescenta o comportamento pedido pelo utilizador: concluir cada PP em «Para revisão»; registar falhas como «Erro» e continuar nos outros PPs independentes. A revisão independente do novo executor continua obrigatória. Não houve aplicação real pelo implementador.

## Resultado por PP

1. Ler e validar o alvo Working Copy, a regra aprovada, o estado revisto e o esquema actual.
2. Executar e confirmar cada alteração de conteúdo/propriedades. A intenção é persistida antes do envio; não há repetição automática de pedidos incertos.
3. Só depois de todos os recibos confirmados, escrever Estado=Para revisão e confirmar a leitura posterior. A fila só conta este PP como sucesso após essa confirmação.
4. Numa falha, guardar código, ID, motivo, operação, fase, recibos confirmados e pendentes e classificação ERROR/PARTIAL/UNCERTAIN. A restante transformação desse PP é abandonada nesta execução.
5. Tentar Estado=Erro numa operação independente: confirmar novamente identidade exacta, esquema/opção existente e estado imediatamente anterior. Não substituir um Estado diferente que tenha sido alterado por uma pessoa. Se a opção, identidade, escrita ou leitura não permitir confirmar a marcação, manter o erro local e avançar para o PP seguinte.

O esquema real capturado já contém Para revisão e Erro. O código não modifica o esquema. Os motivos ficam nos relatórios locais por PP, preservando as notas e razões originais no Notion. O PP falhado nunca é contado como sucesso. Se o serviço não permitir confirmar a marcação Erro depois de uma escrita Para revisão incerta, o estado externo pode continuar desconhecido; o relatório identifica essa situação em vez de declarar falsamente a fila corrigida.

O lote termina em COMPLETE apenas com todos os PPs confirmados. Caso contrário, termina em COMPLETED_WITH_ERRORS. A resposta da ponte apresenta o resultado de cada código e o caminho do relatório. Cancelar é distinto de falhar: pára o lote inteiro, não inicia marcações de erro adicionais e identifica os restantes como NOT_ATTEMPTED.

## Preparar e verificar

Python 3.11 ou posterior; biblioteca padrão. Node apenas para os testes da ponte. Trabalhar numa cópia, não no congelamento review-batch-v1.

```powershell
Set-Location 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-pocket-batch-candidate'
python -B batch_cli.py prepare-batch --captures captures/batch-current --output batch-plans/full.json
python -B batch_cli.py prepare-batch --captures captures/batch-current --codes 430 --output batch-plans/pilot.json
python -B batch_cli.py prepare-batch --captures captures/batch-current --codes 558 661 662 --output batch-plans/rest.json
python -B batch_cli.py inspect --plan batch-plans/full.json
python -I -B -m unittest discover -s tests -v
node --test tests/test_session_bridge.cjs
```

Os planos guardam as operações normais e duas operações de estado por PP: sucesso final e tentativa condicional de erro. A aprovação identifica os IDs de ambas. Erro só é enviado se for uma opção existente no esquema efectivamente lido. As sete linhas e três propriedades de negócio mantêm a mesma transformação, com novas leituras e hashes; no caso de sucesso acrescentam-se quatro estados finais.

As capturas actuais estão em captures/batch-current/. Os testes mantêm as capturas anteriores como regressões e usam transporte e metadados sintéticos identificados, sem escrever no Notion. As pastas temporárias dos testes usam o directório temporário do sistema para evitar MAX_PATH.

## Rever e executar com o conector real

A autorização humana já inclui esta correcção, estados e continuação. Registar a referência real do parecer independente nas cópias operacionais das aprovações; o campo review_reference está deliberadamente vazio nos modelos e impede execução antes da revisão. Não reutilizar a aceitação de um Pocket anterior para este comportamento novo.

Os ficheiros execution-full.json, execution-pilot.json e execution-rest.json contêm os caminhos e hashes exactos. Apontam para a fonte congelada e para o directório operacional curto tmp/pp-pocket-batch-run. A coordenação escolhe o lote revisto; pode validar primeiro PP430 e depois executar o restante grupo. Um erro não impede que outro plano com PPs independentes seja processado.

Python não se liga ao MCP. A função em session_bridge.js corre dentro de functions.exec, usando exec_command/apply_patch e o conector real Notion fetch/update_page. Exemplo de inspecção, sempre sem escrita por omissão:

```javascript
const loaded = await tools.exec_command({
  cmd: "python -B 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-pocket-batch-candidate/review-batch-v1/source/batch_cli.py' bridge-source",
  max_output_tokens: 8000
});
if (loaded.exit_code !== 0) throw new Error('Falha ao carregar a ponte');
const bridge = JSON.parse(loaded.output);
if (bridge.sha256 !== '<files[source/session_bridge.js] DO MANIFESTO REVISTO>') throw new Error('Ponte alterada');
const run = eval(bridge.source);
text(await run({
  script: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-pocket-batch-candidate/review-batch-v1/source/batch_cli.py',
  plan: 'C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/tmp/pp-pocket-batch-run/full.json'
}, tools));
```

Após o parecer, acrescentar apply:true, approval e approvedPlanSha da configuração correspondente. As aprovações reais não são simuladas; os campos de revisão pendentes não devem ser inventados. A ponte devolve status, pages, reportPath, leituras e tentativas de escrita.

## Registos, quarentena e recuperação

O nome da execução deriva dos hashes do plano e da aprovação, mantendo um comprimento fixo. Dentro de runs/<chave>/ ficam journal.json, batch-report.json e pages/PP<codigo>.json. O relatório distingue resultado de conteúdo, estado efectivamente confirmado, motivo, fase, recibos pendentes e tentativa de Erro. As páginas incertas têm uma barreira própria em runs/page-quarantines/<UUID>.json. A barreira geral só impede duas execuções simultâneas; uma página incerta não bloqueia os outros alvos aprovados.

Não reiniciar uma execução existente. Se o processo terminar com uma operação pendente, usar a mesma ponte/configuração com apply:true e continueBatch:true. Esta continuação explícita põe o PP interrompido em quarentena, não repete a sua alteração e passa a outros PPs após a tentativa segura de Erro. Uma marcação Erro interrompida também não é reenviada. Uma execução cancelada ou concluída não é retomada silenciosamente.

Para investigar uma página incerta, usar apply:true, reconcileOnly:true e reconcileCode:'430', com o plano e aprovação da execução original. É apenas leitura, sem retomar o PP nem o lote. Um resultado confirmado fica registado na barreira, que não é apagada. Qualquer novo trabalho nesse PP exige reconciliação conclusiva, fonte actual e uma nova referência de revisão. Uma aprovação antiga, outro nome de ficheiro ou mudar de plano não contorna uma página ainda incerta.

apply:true,cancelOnly:true cancela o lote. Não combinar os três modos. Um pedido já enviado pode continuar incerto e fica registado; nenhum PP seguinte é escrito depois do cancelamento. Não apagar barreiras ou registos, não restaurar conteúdo antigo e não repetir pedidos para forçar progresso. Usar um único directório operacional e um único escritor.

## Limites mantidos

A correcção Pocket V3 de cobertura explícita mantém-se: truncated:true, contagem/IDs desconhecidos ou valores inválidos presentes impedem aceitar uma leitura de conteúdo, mesmo que faltem os restantes campos. Os outros campos globais ausentes não são inventados. A marcação de erro usa apenas metadados e confirma a identidade; não certifica o conteúdo omitido como lido.

Preservam-se Old, fontes, imagens, associações de bolsos, notas, Sim/Não e motivos. Não há autoValidado, alterações ao peito do PP661/caixa do PP662 ou decisão cores para DTF. Comentários nativos continuam excluídos; comentários escritos no corpo continuam protegidos. Original e arquivo estão fora dos alvos permitidos. Erros globais de plano, aprovação, identidade autorizada, contrato ou prova Excel recusam a execução, sem os transformar em permissão para continuar.

Os controlos locais não são uma condição atómica no servidor. Os testes com transporte simulado não demonstram gravação autenticada; a coordenação verifica o primeiro resultado real depois da revisão.
