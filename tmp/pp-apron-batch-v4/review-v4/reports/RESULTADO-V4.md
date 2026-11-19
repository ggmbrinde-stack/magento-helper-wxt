# Resultado V4

Duas correcções locais concluídas. Candidato para nova revisão independente, sem aplicação real.

## Correcções verificadas

- Comentários: ambas as representações são comparadas. Respostas vazias estruturadas com texto upgrade_required, e o inverso, são recusadas. Erros externos/internos, formatos desconhecidos, XML inválido, omissões, texto inesperado e paginação não provam ausência de comentários. Representações completas válidas continuam aceites. O executor pára sem escrever nos dois casos contraditórios.
- Pacote: os 20 ficheiros históricos usados por test_rendered.py foram incluídos e identificados por hash. A bateria foi executada numa cópia isolada com Python -I, sem depender do Excel real nem de pastas vizinhas. A V3 congelada permanece intacta; os seus 44 testes no ambiente de desenvolvimento não comprovavam a completude do pacote distribuído.

## Testes executados

- 49 testes Python e 5 testes Node passaram na cópia isolada. Registos e hashes exactos dessa cópia em verification/isolated-results.json e respectivos ficheiros .log.
- Duas preparações V4 com leituras limitadas das células XML e verificação do hash do Excel produziram bytes idênticos. Não foi feita extracção integral do livro nem das imagens.
- Todos os corpos, operações, propriedades propostas, dúvidas e estados reais coincidem com a V3. Mudaram a versão, hashes da implementação/plano e a localização da prova de entrada.
- O ZIP final será verificado e os testes repetidos numa extracção limpa; os registos dessa última verificação ficam no directório verification/ do candidato, fora do congelamento, para preservar os bytes do arquivo testado.

| PP | Estado real | Operações de corpo |
|---|---|---:|
| 428 | NO_OP | 0 |
| 429 | BLOCKED | 4 |
| 430 | BLOCKED | 5 |
| 467 | BLOCKED | 5 |
| 558 | BLOCKED | 5 |
| 612 | BLOCKED | 5 |
| 633 | BLOCKED | 5 |
| 661 | BLOCKED | 4 |
| 662 | BLOCKED | 5 |
| 786 | BLOCKED | 5 |
| 840 | BLOCKED | 5 |

## Aplicação real continua bloqueada

As exportações reais não comprovam completude das regiões afectadas. A consulta de comentários devolve upgrade_required, sem prova de ausência de comentários/sugestões ou preservação das ligações aos blocos. Não existe contrato alternativo verificado que resolva estes pontos. Não foram fabricados indicadores nem relaxadas salvaguardas.

Para um piloto: obter prova fiável de completude da região ou contrato documentado de edição que preserve conteúdo omitido, e prova de preservação de comentários e das suas ligações aos blocos; rever independentemente o código e um novo plano com leituras actuais; obter autorização humana explícita para uma página elegível. Só depois do piloto revisto poderá ser autorizado o lote restante. PP428 sem escrita não serve como prova de aplicação.

PP430/558/661/662 mantêm dúvidas técnicas no próprio plano. A revisão de texto no histórico não preserva ligações de comentários. Os controlos locais não são uma condição atómica no servidor, e a comparação estrita pode parar perante normalização de Markdown. Não houve chamadas Notion/Magento/rede, piloto, escrita real, commit ou staging nesta correcção.

Hash canónico do plano: `cdf131d6f8aec63035fb4c9c6c17f51f74dccb543601514edd89b0c1588d13da`

Hash da implementação: `f9fccf90e92bf687b2a76faad08360cabeca0afd4992ece39d23ff939a5c3ccb`
