# PP429: piloto preparado, sem execução autorizada

Sucessor separado de `pp-aprons-pilot-preparation-20261119-01`, implementação de base `8f6d11c933416c7a61e4f70ae9792878ee45385867b0e9cc806e0a0a64cc66a0`, com o parecer anterior `PP-APRONS-PREPARATION-20261119-NOGO` preservado. Este candidato exige nova revisão independente e aprovação humana do plano exacto. Não houve rede, acesso a chaves, `session-start`, gravações ou alterações de definições.

## Resultado concreto

- Plano só do PP429: `previews/pilot-429.json`. Identidade, implementação e hash do plano em `CANDIDATE.json`.
- Antes/depois: `previews/eleven-reports/PP429-before.md` e `PP429-after.md`.
- Proposta: Bordado de 240 cm², A6, para 600 cm², A4, em New, segundo a regra existente para aventais. Estamparia de 1 cor e DTF A4 mantêm-se. As propriedades passam a corresponder a New.
- Duas operações de conteúdo, uma de propriedades e o estado final condicional previsto no executor existente. Os valores de Old ficam iguais. Prefixo, callout humano, imagem e fonte existente ficam fora das substituições; não se acrescenta uma segunda imagem nem se altera a referência protegida.
- `previews/pilot-429.approval-pending.json` tem autorização nula e referência de revisão vazia. Não é uma aprovação. O plano continua com `apply_allowed_now: false`.
- `verification/result.json` descreve as onze páginas e a prova do piloto. Os restantes PPs não recebem equivalências nem decisões novas. PP601 continua excluído.

## Prova pareada de imagem

A captura MCP original expurgada continua a fornecer o corpo, os metadados e o hash de estado do plano. Isso mantém o contrato de comparação MCP já existente. A fonte adicional `pp429-paired-image-evidence-20261119-01/paired-mcp-input.json`, SHA-256 `0c7223dd59ceec68967127b60b4c7329301c49f5c36511f2bad766a50528bd59`, serve apenas para a vinculação da imagem.

A relação entre ambas exige os mesmos identificadores, código, corpo, tempo de edição e recibo. Os metadados só podem diferir pela transformação de URL anteriormente declarada, verificada nos hosts reconhecidos. A captura pareada completa, o seu hash de ficheiro e os hashes dos dois estados ficam embutidos na prova aprovada futuramente. Os ficheiros de origem permanecem intactos. Não foi acrescentado um novo cliente nem alterada a ponte de recolha.

O fragmento aceite tem exactamente a forma observada `notion_record=block.<UUID da página>.<UUID do espaço>`. Exige a página seleccionada, o espaço presente no caminho do URL reconhecido e UUIDs canónicos. O fragmento é uma referência MCP ao registo; não é usado como identidade do objecto servido. Nenhum outro fragmento é removido. Os parâmetros significativos `x-amz-checksum-mode=ENABLED&x-id=GetObject` são conservados e passam pela canonicalização nativa existente, que não foi alterada. Assim, a propriedade e a capa produzem a mesma impressão digital da captura nativa original, sem descartar parâmetros para fazer coincidir os hashes.

A referência de corpo `notion-file-block://` exige o mesmo bloco nativo, espaço, componente do objecto e nome de ficheiro. A posição e a legenda também são verificadas. Este contrato suporta apenas a representação observada sem legenda; uma legenda nova bloqueia, em vez de ser omitida. A prova mantém o nome apresentado na propriedade nativa e o nome do URL como dados distintos, sem presumir que são iguais. O nome da propriedade continua protegido pela comparação completa da página nativa anterior à escrita.

Isto prova uma associação de localizadores e referências neste formato suportado. Não prova os bytes da imagem nem estabelece um identificador universal garantido de ficheiro. Substituir imagens continua proibido: `semantic_native` e `semantic_mcp` não ganharam um contrato de escrita de imagem. Uma alteração real de localizador, parâmetro significativo, nome, referência, legenda ou ordem continua a bloquear.

## PP661: correcção da contagem

Os oito nós MCP contêm um parágrafo com dois bullets. O mesmo validador de listas já existente expande esses dois itens e conserva os limites de cada linha no texto original. São nove itens para nove blocos nativos, com igualdade semântica exacta. A prova, a associação de contentores e as operações usam a mesma expansão. Não se descarta conteúdo nem se altera a ordem. Uma operação sobre o primeiro bullet não abrange o segundo.

O PP661 fica com prova de conteúdo válida, mas as opções Transfer do peito continuam pendentes. Não recebe operações de negócio. Os outros nove PPs ainda não têm uma fonte de imagem pareada suficiente e mantêm os motivos de bloqueio. Não foi generalizada a prova do PP429 para esses PPs.

## Verificação e limites

Dez testes dos casos novos aprovados, em `verification/focused-tests.log`: bullets e limites do PP661, fragmento conhecido e formatos desconhecidos, parâmetros significativos, imagem/legenda/nome/referência/ordem alterados, relação entre as duas capturas e plano real com prova embutida, Old e callout preservados. A validação de fontes, identidade e propriedades do plano foi executada localmente, sem iniciar uma sessão de aplicação.

A vinculação produtor/consumidor continua limitada ao produtor revisto e ao manifesto nativo exacto. A barreira nativa fresca, a comparação MCP, os readbacks e o diário não foram alterados neste sucessor. Recibos incertos continuam sem repetição automática.

Não foram repetidas suites globais, o índice Excel, leituras remotas ou os testes anteriores sem relação com os casos novos. A prévia local e os testes não constituem prova de gravação real. A execução depende da revisão independente deste candidato e da aprovação humana do hash exacto do piloto.
