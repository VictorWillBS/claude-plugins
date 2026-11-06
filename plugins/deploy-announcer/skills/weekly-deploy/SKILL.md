---
name: weekly-deploy
description: >
  Rotina semanal de deploy em produção. Descobre os repositórios ativos da pastar-br, infere o fluxo de
  deploy em produção de cada um a partir dos deploys anteriores, abre a PR de deploy onde há mudança
  pendente, cruza as mudanças com as Histórias do ClickUp e envia o aviso de deploy no canal Produto
  marcando todos. Use quando a routine de sexta disparar, ou quando o usuário disser "prepara o deploy da
  semana", "avisa o deploy no Produto" ou "/deploy-announcer:weekly-deploy". Aceita "--dry-run", que só
  mostra o que faria, sem abrir PR nem enviar mensagem.
---

# Deploy semanal

Roda sem conversa. Não pergunte nada ao usuário: decida pelas regras abaixo e reporte no fim.

Argumento opcional: `--dry-run`. Nesse modo, faça toda a coleta e a inferência, mas **não** crie PR e
**não** envie mensagem no ClickUp. Responda com o plano de PRs e a mensagem exatamente como seria enviada.

## Constantes

| O que | Valor |
|---|---|
| Organização no GitHub | `pastar-br` |
| Canal Produto (ClickUp) | `2kza71bc-8417` |
| Lista de Histórias (ClickUp) | `901717139346` |
| Marcação de todos do canal | `[@followers](#task_user_group_mention#followers_tag)` |
| Horário do deploy | 10h (horário de Brasília) |

Scripts: `${CLAUDE_PLUGIN_ROOT}/scripts/`. Se `CLAUDE_PLUGIN_ROOT` não estiver definido (execução pela
routine na nuvem, com o repositório `claude-plugins` clonado), use `plugins/deploy-announcer/scripts/`.

## 0. Pré-requisitos

1. Rode `gh auth status`. Se o `gh` não existir ou não estiver autenticado, vá direto para a seção
   **Falha**.
2. Chame `clickup_get_user` e guarde o `id` do usuário e a data local de hoje (`current_time`).

## 1. Evidências de deploy

```bash
bash <scripts>/deploy_evidence.sh
```

O script lista só repositórios com push nos últimos 30 dias e com workflow de deploy ou release. Para
cada um, traz as branches de longa duração, o gatilho de cada workflow, as últimas execuções
bem-sucedidas e as últimas PRs mergeadas entre branches de longa duração.

## 2. Inferir o fluxo de produção de cada repositório

Classifique cada repositório em uma das categorias. Baseie-se nos deploys anteriores, não no nome das
branches.

1. **Identifique o workflow de produção**: nome ou caminho com `prod`/`production`, gatilho ou input que
   cita produção, ou execuções com título `Deploy → production`. Workflow só de staging não conta.
2. **Identifique a branch de produção `P`**: a branch cujo push ou merge de PR dispara esse workflow.
3. **Identifique a branch de origem `S`**: nas execuções de produção bem-sucedidas mais recentes, títulos
   como `Merge pull request #N from pastar-br/<S>`, ou nas PRs mergeadas `<S> -> <P>`. `S` precisa ser
   uma branch de longa duração.

| Categoria | Quando | O que fazer |
|---|---|---|
| Fluxo por PR | Produção recebe merge de `S` para `P` e isso dispara o deploy | Seguir para o passo 3 |
| Deploy contínuo | Todo merge de funcionalidade em `P` já publica (ex.: release a cada push em `main`, sem `S`) | Pular |
| Manual | Execuções de produção recentes só por `workflow_dispatch`, sem PR para `P` | Pular |
| Sem produção via CD | Nenhum workflow de produção | Pular |
| Ambíguo | Evidências contraditórias ou insuficientes | Pular e registrar o motivo |

Hotfix direto em `P` (branch de funcionalidade para `P`) não muda a categoria: o fluxo regular é o de `S`.

## 3. Mudanças pendentes

Para cada repositório com fluxo por PR:

```bash
bash <scripts>/pending_changes.sh pastar-br/<repo> <P> <S>
```

Se `ahead_by` for 0, não há deploy nesse repositório: pule.

## 4. Histórias no ClickUp

1. Junte todos os `clickup_custom_ids` (ex.: `DEV-851`) e `clickup_task_ids` das PRs de todos os
   repositórios.
2. Busque cada tarefa com `clickup_get_task` (aceita o custom id). Guarde nome, status e URL. Se uma
   tarefa não existir, trate a PR como sem história.
3. Busque as Histórias da lista `901717139346` com status `pronto para produção` (`clickup_filter_tasks`).
   As que não aparecem em nenhuma PR pendente vão para a seção "fora do deploy" da mensagem.

## 5. PR de deploy

Para cada repositório com mudança pendente:

- Se `open_deploy_pr` já existir, reutilize essa PR. Não crie outra.
- Caso contrário, crie com o título da PR `<S> -> <P>` mergeada mais recente, copiado exatamente:

```bash
gh pr create -R pastar-br/<repo> --base <P> --head <S> --title "<título>" --body-file <arquivo>
```

Corpo da PR (escreva o arquivo no diretório temporário da sessão, nunca no repositório clonado):

```markdown
## O que sobe

### Histórias
- [DEV-851 Adicionar consulta Serasa Agro na aba do CRM](<url>): pronto para produção
  - #6076 <título da PR>

### PRs sem história no ClickUp
- #6074 <título da PR>

### Commits sem PR
- <sha> <título do commit>
```

Omita uma subseção quando ela estiver vazia. Uma PR pode citar mais de uma História: liste-a sob cada uma.

Se `gh pr create` falhar, não invente o número: registre a falha e siga com os outros repositórios.

## 6. Mensagem no canal Produto

Uma única mensagem com todos os repositórios que têm deploy. Envie com `clickup_send_chat_message`,
`channel_id: "2kza71bc-8417"`, `content_format: "text/md"`. Siga o padrão abaixo sem variação:

```markdown
[@followers](#task_user_group_mention#followers_tag)
🚀 **Aviso de deploy em produção: sexta, DD/MM, às 10h**

**<repo>** (<S> → <P>): [PR #<n>](<url>)
- [DEV-851 Adicionar consulta Serasa Agro na aba do CRM](<url>): pronto para produção
- [DEV-390 API pública, autenticação do visitante](<url>): ⚠️ em staging, ainda não validada
- <título da PR> ([#6074](<url>)): sem história no ClickUp

**<repo>** (<S> → <P>): [PR #<n>](<url>)
- ...

⚠️ Pronto para produção no ClickUp, mas fora do deploy:
- [DEV-799 <nome>](<url>)

Algo impede o deploy de algum desses itens? Respondam aqui na thread até as 10h.
```

Regras:

- Uma linha por História, com o status atual. Status `pronto para produção` ou `concluído` vai sem alerta.
  Qualquer outro status leva `⚠️` e o nome do status (`em staging` vira "⚠️ em staging, ainda não validada").
- PRs sem história: no máximo 10 linhas por repositório. Passando disso, liste as 10 mais recentes e
  feche com `- e mais N PRs sem história (lista completa na PR de deploy)`.
- Commits sem PR não entram na mensagem, só no corpo da PR.
- Omita a seção "fora do deploy" quando ela estiver vazia.
- Repositório sem mudança pendente não aparece.
- Se nenhum repositório tiver deploy, **não envie mensagem** no canal.
- A data é a de hoje no fuso do usuário (passo 0), no formato `DD/MM`.

## 7. Relatório final

Responda com:

1. A mensagem enviada (ou, em `--dry-run`, a que seria enviada).
2. Uma tabela com cada repositório avaliado: categoria, fluxo inferido (`S → P`), commits pendentes e PR.
3. Os repositórios pulados como ambíguos, com o motivo.

## Falha

Quando um pré-requisito falhar, ou quando a mensagem do canal não puder ser enviada, não envie nada no
canal Produto. Mande uma mensagem direta para o usuário (`clickup_send_chat_message` com
`user_ids: ["<id do passo 0>"]`) dizendo o que falhou, com a mensagem de erro, e encerre. Fora do
`--dry-run`, faça o mesmo ao fim da execução se algum repositório foi pulado como ambíguo ou se a criação
de alguma PR falhou, listando cada caso. Se nem o ClickUp responder, registre a falha no relatório final.
