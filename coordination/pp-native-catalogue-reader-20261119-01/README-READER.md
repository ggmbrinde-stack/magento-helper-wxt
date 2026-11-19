# Leitor nativo por inventário da Working Copy

Sucessor de `pp-native-read-fix-20261119-02`, separado e pendente de revisão independente. O GO anterior `PP-NATIVE-READ-FIX-02-20261119-GET428-GO` cobria apenas o reteste GET428 da implementação anterior; não aprova este delta, planos ou escritas.

## Alteração limitada

`capture-native` deixa de resolver páginas numa lista fixa. Exige `--inventory` e reutiliza a mesma função `selection` do comando de selecção, apoiada em `full_excel.inventory`. Aceita códigos explícitos presentes no inventário da Working Copy. PP601 é recusado antes de criar a pasta de saída ou iniciar pedidos. As listas antigas dos comandos de correcção de bolsos não foram alteradas.

A validação comum do inventário verifica a origem exacta, contagens, códigos e IDs únicos, URLs HTTPS do host previsto, UUIDs válidos e ausência de query/fragmento. Não se deduzem IDs a partir dos códigos. Um código ausente/repetido, UUID nulo, URL inválido, selecção ambígua ou inventário de outra colecção faz falhar a selecção antes de qualquer pedido.

Um UUID sintacticamente válido mas associado à página errada só pode ser confirmado pela resposta da API. Por isso, o collector verifica ID e pai Working Copy no primeiro GET da página, antes de percorrer filhos. Na captura por inventário verifica também `Código PP`, antes e depois da travessia. Um código ausente, incompatível ou diferente é uma falha. O leitor de manifestos aplica a mesma ligação por código às capturas reais.

Canonização de ficheiros, `paragraph.icon: null`, paginação, ordem, pais e guardas de atributos continuam em vigor. A evidência é estrutural/canonicalizada, não uma resposta HTTP crua nem prova dos bytes das imagens. Não foram alterados o transporte de escrita, as confirmações, os diários ou as guardas de preservação.

## Falhas por PP

Uma falha de estrutura, identidade, código ou captura produz uma entrada `FAILED` em `capture-report.json`, com motivo e ID seleccionado. Os PPs independentes seguintes continuam. Nenhum snapshot inválido, sintético ou resposta de erro é gravado como captura válida. O `manifest.json` mantém o esquema existente e contém apenas ficheiros validados, com os seus hashes. O relatório lateral conserva o hash do inventário e a selecção completa.

A saída distingue `VALIDATED_READ_ONLY_CAPTURE` de `COMPLETED_WITH_ERRORS`, com `codes` apenas para sucessos e `failed_codes` separados. Um manifesto sem sucessos não representa uma captura de página vazia. Falhas globais de validação da selecção e impossibilidade de persistir o relatório não são tratadas como sucesso.

## Próxima recolha, depois de revisão

Fonte existente: `coordination/pp-execution-746159f-20261119-01/input/inventory-current.json`. A capacidade é geral dentro desse inventário, mas o lote imediato autorizado contém só os onze aventais. A coordenação deve executar o comando através da configuração privada já existente, sem repetir setup:

```powershell
python -B source/batch_cli.py capture-native --inventory ../pp-execution-746159f-20261119-01/input/inventory-current.json --codes 428 429 430 467 558 612 633 661 662 786 840 --output ../pp-aprons-native-capture-REVIEWED
```

Exigir uma nova pasta de saída preserva as capturas anteriores. Não foram lidas as 814 páginas nem recolhidos os onze PPs nesta implementação; os testes usaram apenas o inventário local e respostas simuladas, sem rede ou chave.

## Verificação e limites

Passaram **30 testes focados** de `test_native_catalogue` e `test_native_evidence`, incluindo código fora dos cinco anteriores, os onze códigos pedidos, selecções/IDs/origem inválidos, exclusão de PP601, falha de um PP com continuação do seguinte, manifesto sem snapshots inválidos e verificação inicial de ID/pai/código antes dos filhos. Também passaram as regressões de canonização, ícone nulo e guardas nativas. Ver `verification/reader-focused-tests.log`. Não foram repetidas suites globais nem testes de escrita/Magento.

Continuam pendentes de contrato/revisão de preparação: `prepare_bridge.js` ainda não passa `native-manifest`; `proof` continua a comparar timestamps nativos/MCP exactamente. O API real do PP428 devolveu `2026-11-18T16:33:00.000Z`, enquanto o MCP observado devolveu `2026-11-18T16:33:16.219Z`. Esta discrepância não foi mascarada. A captura bem-sucedida do -02 não aprova a conversão nem resolve estes bloqueios.

Próximo passo: revisão independente deste delta de leitura, recolha real dos onze PPs e MCP actual pela coordenação, depois preparação de prévias e piloto concreto. Não há aprovação de plano, conversão ou escrita. Base Git informada: `746159f4228f0cf24ac7e230dad99248c369459b`. Não houve investigação Git, acesso à chave, alterações de definições, delegação ou alterações aos ficheiros PP Preview de outros responsáveis.
