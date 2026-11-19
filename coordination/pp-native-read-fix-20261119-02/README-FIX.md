# Seguimento mínimo: paragraph.icon nulo

Base: `pp-native-read-fix-20261119-01`, implementação `52dc0cbecf02302adda8269ad9579d20204bac62fa217ef3c508c2d70a7ff5e6`. O GO anterior `PP-NATIVE-READ-FIX-20261119-GET428-GO` estava limitado ao reteste GET428 dessa implementação; não aprova este sucessor, planos ou escritas.

O diagnóstico real em `coordination/pp428-native-retest-20261119-01/attribute-diagnostic.json` confirmou `paragraph.icon: null` no bloco `41bb6705-ae1f-8146-bc33-ed4d473a1eb3`. Esse atributo era recusado por não constar dos campos permitidos do parágrafo.

## Correcção

- Apenas o tipo `paragraph` passa a permitir explicitamente a chave `icon`.
- A validação recusa qualquer valor diferente de JSON `null`, incluindo ícones emoji, objectos desconhecidos, strings e booleanos. Atributos desconhecidos continuam recusados por `exact_keys`.
- `semantic_native` aplica a mesma recusa, incluindo quando chamado directamente. `icon: null` significa ausência de ícone e não acrescenta conteúdo à representação semântica.
- A captura canonicalizada e o manifesto conservam a chave e o valor `null`. Não há remoção genérica de `icon`, nem alterações à política de URLs temporários.
- A comparação de blocos protegidos continua exacta. Até uma alteração de `icon: null` para chave ausente permanece detectável; um ícone não nulo continua bloqueado. Os restantes tipos não ganharam suporte para esta chave.

Só mudaram `source/native_evidence.py` e `source/tests/test_native_evidence.py`. `batch_cli.py`, `native_session.py` e as guardas de escrita permanecem iguais à base.

## Provas

Passaram seis testes focados: captura simulada/manifesto/semântica com o atributo nulo; recusa de valores não nulos e atributos desconhecidos; preservação exacta da chave no bloco protegido; revisão com cinco filhos; diário antes da escrita simulada; discrepância posterior tratada como incerta. Ver `verification/null-icon-focused-tests.log`.

Não houve pedidos ao Notion, leitura da chave, alterações de configuração, delegação ou repetição de baterias globais. V2/v3/v4, sucessor -01, capturas e handoff foram preservados. A base Git foi informada pela coordenação como `746159f4228f0cf24ac7e230dad99248c369459b`, sem investigação Git nesta tarefa.

Limite: esta correcção só resolve o atributo nulo observado. Não prova que o próximo GET428, manifesto ou plano passe todas as outras guardas. É necessária revisão independente deste hash antes de outro reteste autenticado, exclusivamente GET428. Não há aprovação de conversão ou escrita.
