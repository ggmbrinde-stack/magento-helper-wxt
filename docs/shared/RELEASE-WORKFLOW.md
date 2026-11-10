# Entrega e piloto Chrome

## Estado e branches

`main` é a linha reservada a versões estáveis. O seu conteúdo actual ainda não é uma versão certificada. `develop` recebe a próxima versão e `codex/<tarefa>` contém cada alteração. A branch inicial `codex/release-baseline` preserva o trabalho local e destina-se a um PR para `develop`. Esta foi criada no commit original `dba3f426cb528a3c49679e586604cddec054ff0e`, mantendo o PR com diferenças úteis.

Não promover para `main` antes da revisão independente, do job `validate` no commit exacto e das verificações autenticadas descritas abaixo. Não criar tags de versão estável antes dessa decisão.

O repositório é privado. Em 2026-11-10, a API de protecção de branches devolveu 403, exigindo GitHub Pro ou repositório público. O responsável decidiu manter o repositório privado, sem GitHub Pro. A protecção não está aplicada: PR, revisão e CI são regras manuais, sem imposição pelo servidor. Não alterar o plano ou a visibilidade para contornar esta limitação. O workflow não faz merges, publicação ou escritas no produto.

## Compilação reproduzível e candidato

Usar Node.js 22 e o `package-lock.json` versionado, num checkout limpo do commit candidato:

```sh
npm ci
npm test
npm run typecheck
npm run check:ui
npm run check:notion
npm run zip
```

`npm ci` executa `postinstall` para preparar os tipos WXT. Se a instalação tiver usado `--ignore-scripts`, executar `npm run postinstall` antes de verificar tipos. `pretypecheck` e `prezip` verificam toolkit, limites entre áreas e funcionalidades. `npm run zip` compila para Chrome e cria `.output/magento-helper-wxt-0.2.1-chrome.zip`; o nome acompanha a versão de `package.json`. O manifesto e os dois indicadores visuais usam essa mesma versão. Não se promete um ZIP binariamente idêntico entre máquinas.

O workflow corre em PR para `main`/`develop`, push para `main`/`develop`/`codex/**` e execução manual. Tem um único job `validate`, permissões `contents: read` e publica apenas o ZIP candidato como artefacto de CI durante 14 dias. Guardar uma cópia local dos candidatos usados no piloto, com versão, SHA do commit, SHA-256 do ZIP, resultados e revisor. Esse artefacto não constitui aprovação de lançamento.

As versões das Actions foram consultadas nas páginas oficiais em 2026-11-10: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) e [upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2). O empacotamento usa o WXT já instalado, sem actualização geral de dependências.

## Instalação do piloto

Não há conta de programador Chrome nem lista de participantes definida. A publicação na Chrome Web Store fica adiada; este piloto usa o modo de programador.

1. Guardar o ZIP, o SHA-256 e o commit aprovados para teste. Extrair para uma pasta própria e versionada, por exemplo `BOG-Helper/0.2.1/<commit>/`. Não carregar directamente `.output/chrome-mv3`, que pode ser substituída por outra compilação, nem modificar a pasta da instalação estável.
2. Criar um perfil Chrome separado para o piloto. Abrir `chrome://extensions`, activar o modo de programador e escolher **Load unpacked**, seleccionando a pasta extraída que contém `manifest.json`. Consultar a [instalação oficial do Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
3. Confirmar versão `0.2.1`, caminho carregado e ausência de erros na página de extensões. Registar esses dados com o candidato. Manter apenas uma instalação do Helper activa nesse perfil.
4. Configurar o acesso Magento e, se necessário, Notion e modelos separadamente, nas definições locais. Não incluir tokens, palavras-passe, ficheiros de autenticação ou exportações de armazenamento no ZIP, Git, relatório ou mensagens. A configuração do perfil habitual não é copiada automaticamente para o perfil de piloto.

## Actualização e recuperação

Extensões carregadas desta forma não têm actualizações automáticas. Para uma nova candidata, conservar a pasta anterior, extrair o novo ZIP para outra pasta versionada e desactivar a candidata anterior antes de carregar a nova. Recarregar os separadores Magento e confirmar versão, permissões e configuração. Não assumir que o identificador da extensão ou os dados locais são mantidos ao mudar de pasta.

Se falhar, desactivar a nova candidata e reactivar a instalação anterior intacta; se necessário, carregar novamente a sua pasta preservada. Recarregar os separadores e confirmar o caminho e a versão anteriores. Reconfigurar credenciais localmente se necessário. Esta recuperação repõe o código, não desfaz alterações em Magento, Notion, pastas de provas ou dados locais. As verificações do piloto são apenas de leitura.

A cópia local anterior à baseline está em `tmp/release-backup-20261110-092644Z/`: contém a compilação `0.2.0`, ficheiros locais, patch e `snapshot.json` com hashes. Essa pasta de compilação foi arquivada fielmente; ainda não foi confirmada como o caminho anteriormente carregado no Chrome, nem como versão estável validada. Não a publicar.

## Condições para promover a estável

Executar no perfil de piloto autenticado e registar commit, ZIP, versão, percurso, resultado e limitações, sem dados sensíveis:

- **UI Magento:** abrir grelha e produto representativos; confirmar controlos nativos, separadores e menus, ausência de duplicação de controlos do Helper, visibilidade da árvore de categorias e raiz real `Default Category` seleccionada e activa. Não guardar formulários nem executar acções em massa.
- **Resolver:** consultar SKU simples e configurável conhecidos; confirmar identidade, ligações, origem/idade dos dados, variantes e tratamento de falhas. Comparar com factos visíveis no Magento sem gravar dados. Não confundir dados administrativos parciais com disponibilidade pública.
- **Disable -> Enable:** abrir a lista de prontidão de um produto desactivado; confirmar separação entre itens em falta, verificações manuais e evidência disponível. Não activar o produto, guardar o formulário ou enviar para Notion. Aprovação da lista não autoriza activação.

O verificador independente confirma os resultados e os bloqueios antes do PR `develop` para `main`. CI verde não substitui estes percursos reais. Só depois da aprovação se decide a versão estável e a sua distribuição; publicação na loja requer preparação e autorização próprias.
