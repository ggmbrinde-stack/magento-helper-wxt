# Preparação local dos 11 aventais

Estado: candidato para revisão independente. As 11 prévias existem, mas nenhum piloto está elegível para escrita com estas provas. Não houve novos pedidos, leitura de credenciais, início de sessão de aplicação ou alterações no Notion.

Base: `pp-native-catalogue-reader-20261119-01`, implementação revista `18e250a02fd40c0b9945893055678c9d662790ae9c3488850b6048141020ba9f`, commit Git observado `746159f4228f0cf24ac7e230dad99248c369459b`. As alterações alheias em PP Preview, aplicação e testes foram preservadas. Não há herança de aprovação de escrita.

## Resultado para revisão

- `previews/eleven-reports/PP{código}-before.md` e `PP{código}-after.md`: antes/depois dos onze. São propostas locais, sem operações elegíveis.
- `previews/eleven-reports/PP{código}.json`: diferenças, propriedades pretendidas, pendências e motivo específico de bloqueio.
- `previews/eleven.json`: pacote local, `apply_allowed_now: false`.
- `previews/pilot-review.json`: PP429, seleccionado apenas para revisão da alteração concreta. Não é um plano aprovado nem executável.
- `verification/evidence-diagnostics.json`: contagens e impressões digitais das provas, sem URLs temporários.
- `preparation.patch`, `CANDIDATE.json` e `MANIFEST.json`: diferença mínima, identidade exacta e ficheiros verificáveis.

O PP429 tem uma alteração concreta: New passa de Bordado 240 cm², A6, para Bordado 600 cm², A4, segundo a regra existente para aventais. Estamparia A4 de 1 cor e DTF A4 já coincidem em New. A proposta sincroniza também as propriedades com esse New, conserva Old com os dados CLEAN e acrescenta o histórico previsto. Não inventa uma edição para testar. O prefixo, o callout humano, a imagem e a fonte existente ficam fora das substituições e não são duplicados no histórico.

PP428, PP429, PP430 e PP558 não têm escolhas de negócio pendentes neste diagnóstico. PP467, PP612, PP633, PP661, PP662, PP786 e PP840 conservam as pendências em `PP-USER-DECISIONS.md`. Os três bolsos do PP786 continuam agrupados. Nenhuma das quatro correcções parciais de bolsos é reaplicada. PP601 está excluído.

## Contrato e limites

`prepare_bridge.js` passa agora `config.nativeManifest` explicitamente para `--native-manifest`. A preparação desta entrega usou directamente os ficheiros existentes e nunca chamou a ponte de recolha. A ponte foi verificada com ferramentas simuladas.

O consumidor aceita a evidência produzida pelo leitor revisto somente quando coincidem o produtor exacto e o SHA-256 exacto do manifesto dos onze, `50702d15400a406e0048b2602799b2eb5f1c88bd0663b3c63fd6e50cdf5d7254`. Cada ficheiro continua sujeito ao seu hash, identidade, pai, código e validação recursiva. O plano regista separadamente produtor e consumidor. Os manifestos originais não foram reescritos; produtores ou consumidores arbitrários são recusados.

A diferença de precisão temporal só pode ser ligada quando o tempo nativo está no início do minuto observado e todos os nós, texto, estilos suportados e propriedades suportadas coincidem. Esta condição é uma política conservadora de vinculação de provas, não uma garantia sobre a precisão da API. Não basta truncar os tempos. Imagens e estruturas sem correspondência suportada continuam a bloquear. Listas MCP agrupadas são expandidas apenas quando cada linha é um item simples explícito; escapes de barra, underscore e separador são comparados com o texto nativo. Conteúdo aninhado ou desconhecido continua recusado.

A barreira imediatamente anterior à escrita continua a exigir uma nova árvore nativa exactamente igual à anterior e passa também a comparar a página nativa canonicalizada completa. Assim, alterações de conteúdo ou propriedades no mesmo minuto bloqueiam. A comparação MCP e os readbacks nativo/MCP existentes mantêm-se. Recibos incertos não são repetidos. Os testes usam simulações; não provam qualquer gravação real.

## Bloqueios reais que permanecem

Em dez páginas, a impressão digital do localizador nativo de `Imagem principal` difere da obtida a partir do URL MCP já expurgado. No PP429, por exemplo, são `94ad59a606ef676d8e986200e32c792f29bb2c1be6c21d577d7b02a77a5e136c` e `371e62417f32a53292fc048ad83a4238753b4f6b1606a4864c8f6f300fcad5a7`. A capa apresenta a mesma divergência. Isso não demonstra que os bytes da imagem mudaram: os contratos de persistência não são iguais e a prova nativa conserva certos parâmetros significativos. Não se eliminam parâmetros adicionais nem se presume equivalência para obter aprovação.

No PP661 há ainda 9 nós nativos de topo para 8 nós MCP. Não se descarta um nó para fazer coincidir as contagens. A representação MCP das imagens usa `notion-file-block://`; não foi acrescentado um mapeamento de substituição dessas imagens.

As prévias continuam disponíveis apesar do bloqueio, mas as operações de conteúdo, propriedades e estado destas páginas não são elegíveis. O PP429 é apenas o candidato de negócio preferido; falta prova suficiente para o promover a piloto executável. A coordenação deve rever estes motivos antes de qualquer nova recolha ou alteração do contrato. Não foi pedida nova escolha de impressão ao utilizador nesta tarefa.

## Verificação

34 testes focados aprovados, incluindo preparação real offline das onze prévias, manifesto/produtor/consumidor, passagem do manifesto na ponte, compatibilidade temporal suportada, alteração no mesmo minuto recusada, preservação de prefixo/callout/imagem/fonte e pendências de negócio intactas. Registo em `verification/focused-tests.log`.

Não foram repetidas suites globais, a indexação Excel ou recolhas remotas. A revisão independente deste sucessor e a autorização do plano exacto continuam pendentes.
