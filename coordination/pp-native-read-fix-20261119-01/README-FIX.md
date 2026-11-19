# Correcção limitada da leitura nativa

Sucessor separado do código v4 em desenvolvimento. V2/v3/v4, capturas originais e handoff não foram alterados. Base Git informada pela coordenação: `746159f4228f0cf24ac7e230dad99248c369459b`. O `CANDIDATE.json` antigo do v4 ainda identificava v3; este sucessor tem identidade calculada a partir dos módulos efectivos, sem herdar qualquer GO.

## Alteração

`native_evidence.py` compara estados canonicalizados. Apenas `page.request_id` e a autenticação/expiração dos ficheiros alojados reconhecidos são normalizados. A mesma representação é devolvida para os blocos, permitindo que as comparações existentes de descendentes e de blocos protegidos funcionem sem alterações a `native_session.py`.

Os campos de página, URL geral da página, pais, IDs de bloco, datas de edição, conteúdo, legendas, ordem de blocos/ficheiros e restantes atributos continuam a ser comparados. Paginação, ciclos, limites, tipos e atributos não suportados mantêm as recusas existentes. Não foi criado qualquer endpoint de escrita.

`capture-native --codes 428` passa a aceitar o ID exacto `074b6705ae1f8257a53701d87a64eb32`. Mantém os quatro códigos que já aceitava; não alarga o comando aos restantes PPs nem a PP601. O próximo teste autenticado continua limitado a PP428, depois da revisão independente.

## Política explícita de persistência

O collector guarda `persistence_policy: NATIVE_HOSTED_FILE_LOCATORS_SHA256_V1`. O resultado **não é um export cru da resposta HTTP**:

- Só são reconhecidos ficheiros internos com `type: file` e os formatos de localizador previstos nos hosts `prod-files-secure.s3.us-west-2.amazonaws.com` e `secure.notion-static.com`. Hosts, portas, fragmentos, caminhos ou parâmetros desconhecidos são recusados com motivo, sem imprimir os valores.
- O caminho completo, host e parâmetros não ligados à autenticação fazem parte da impressão digital. Os segmentos UUID são validados como formato de localizador, sem os declarar IDs de ficheiro garantidos pela API.
- Só são retirados do localizador `X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Expires`, `X-Amz-Security-Token`, `X-Amz-Signature`, `X-Amz-SignedHeaders` e `X-Amz-Content-Sha256`. `versionId`, `x-id` e `x-amz-checksum-mode`, quando presentes, continuam a contar. Os restantes parâmetros são recusados, não ignorados.
- O URL é substituído por `notion-native-file-locator-sha256:<digest>`; a expiração é retirada apenas desses objectos de ficheiro. Nomes e ordem dos ficheiros, legendas e restantes atributos permanecem. URLs externos não são canonicalizados. URLs temporários que permaneçam fora dos campos reconhecidos impedem a persistência.
- A transformação limita-se a capa/ícone e propriedades de ficheiros da página, imagens e ícones de callouts. Não percorre genericamente todas as chaves chamadas `url`, `request_id` ou `expiry_time`.
- O hash do ficheiro JSON/manifesto e `snapshot_sha256` identificam estes dados canonicalizados. Não são hashes da resposta HTTP original nem dos bytes da imagem. Os dados originais só existem em memória durante a recolha. Capturas guardadas com URLs temporários são recusadas pelo leitor do manifesto.

Esta política precisa de aceitação independente, porque substitui a anterior intenção de guardar respostas cruas. A marca de persistência impede confundir os localizadores transformados com URLs recebidos directamente da API.

## Limite real

Uma impressão digital do localizador não prova o conteúdo binário da imagem nem fornece um ID estável de ficheiro garantido pela API. O contrato de substituição de imagens continua não suportado: `semantic_native` mantém a recusa. Não se faz correspondência por aproximação com referências de imagem do MCP, nem se autorizam regiões com ficheiros que não possam ser representados sem perda. Os blocos protegidos conservam a comparação dos atributos observáveis, com autenticação temporária excluída.

As datas de edição nativas/MCP continuam a ter de coincidir pela regra existente. Não se corrigiu nem presumiu equivalência entre precisões diferentes de timestamps. Não há alegação de que a captura real PP428 ou um plano de conversão já passe todos os passos seguintes.

## Verificação

Passaram os **20 testes de `test_native_evidence.py`**, incluindo as guardas do diário, captura e chamador 428 simulados, assinaturas/expirações variáveis, alteração real de ficheiro/legenda/conteúdo/ordem/pais, paginação incompleta, persistência explícita, recusa de localizadores desconhecidos e inclusão de ambos os módulos nativos na identidade da implementação.

Os testes usam apenas fixtures e funções GET simuladas. Não foi contactado o Notion, não se abriu o segredo DPAPI, não se repetiu setup e não se alteraram modelos/configurações. Não foram repetidas baterias globais. Ver `verification/native-focused-tests.log`.

Próximo passo: rever este diff e esta política exactos antes de repetir uma captura autenticada, apenas de PP428, através da configuração privada já existente no PC. Não há aprovação de plano nem de escrita.
