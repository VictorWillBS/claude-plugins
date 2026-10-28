---
name: notify-pr-update
description: >
  Avisa os revisores de uma Pull Request aberta que ela recebeu commits novos: posta um comentário na
  PR mencionando todos com a lista de commits e depois manda uma DM no ClickUp para cada um com o link.
  Roda quando o hook do pr-notify pede, depois de um `git push` que atualizou uma branch, ou quando o
  usuário diz "avisa os revisores que atualizei a PR", "notifica o revisor da atualização", "manda pro
  revisor que subi as correções". Não use para branch sem PR aberta, para PR em rascunho, para pedir
  review pela primeira vez (use gh pr edit --add-reviewer), para avisar de um comentário que o usuário
  postou (use notify-github-comment) nem para revisar a PR de novo.
---

# Aviso de PR atualizada

Avisa os revisores de que a PR mudou: um comentário na PR e depois uma DM no ClickUp por revisor.

## Entrada

- Do hook: um JSON com `cwd` e `refs`, uma entrada por branch atualizada, cada uma com `old`, `new`, `forced` e `remote` (o nome da branch no remoto). Rode todo `gh` e `git` abaixo nesse `cwd`.
- Do usuário: o número da PR ou a branch atual. Sem `refs`, `new` é o head da PR e `old` é o `commit_id` do review mais recente (`gh api repos/{repo}/pulls/{n}/reviews --jq 'last | .commit_id'`); sem review ainda, liste os commits da PR em vez de um intervalo.

Trate cada ref separadamente; a maioria dos pushes tem uma só.

## 1. Achar a PR

```bash
gh api user --jq '{login, name}'
gh repo view --json nameWithOwner --jq .nameWithOwner
gh pr list --head "{remote}" --state open --json number,title,url,isDraft,author
```

Pare com uma linha, sem avisar ninguém, quando não houver PR aberta para a branch ou quando ela estiver em rascunho ("PR em rascunho, revisores não avisados").

## 2. Quem são os revisores

```bash
gh pr view {n} --json author,reviewRequests,latestReviews
```

- Usuários em `reviewRequests` (entradas com `login`) e autores de `latestReviews`.
- O autor da PR também, quando não é o usuário (a PR de outra pessoa mudou).
- Times em `reviewRequests` (entradas com `slug`) são mencionados no GitHub como `@{org}/{slug}`, mas não recebem DM no ClickUp; vão para o relatório.

Tire o próprio usuário e todo bot (sufixo `[bot]`). Sem ninguém: pare com "PR sem revisor para avisar".

## 3. O que mudou

```bash
git log --first-parent --format='%h %s' {old}..{new}
```

Quando `old` não existe no repositório local (comum depois de force push vindo de outro clone), use `gh api repos/{repo}/compare/{old}...{new} --jq '.commits[] | "\(.sha[0:7]) \(.commit.message | split("\n")[0])"'`, e quando isso também falhar, liste só `{new}`. Mostre no máximo 15 commits e feche com `- e mais {k} commits` quando houver mais.

## 4. Comentar na PR

Coloque `PR_NOTIFY=0` na frente do comando, para o hook não tratar este comentário como um que precisa de `notify-github-comment`:

```bash
PR_NOTIFY=0 gh pr comment {n} --repo {repo} --body-file - <<'EOF'
{menções} a PR recebeu novos commits:

- `{sha}` {assunto}

[Ver o que mudou](https://github.com/{repo}/compare/{old}...{new})
EOF
```

`{menções}` são todos os revisores e times, cada um com `@`. Num force push, a primeira linha vira `{menções} a PR foi reescrita com force push. Commits desde a versão anterior:` e o link de comparação sai, porque pode apontar para um commit que o GitHub não serve mais. Guarde a URL que o `gh pr comment` imprime: as DMs apontam para ela.

## 5. Avisar no ClickUp

Siga `${CLAUDE_PLUGIN_ROOT}/skills/notify-github-comment/clickup-dm.md` para cada revisor que é usuário, com a mensagem:

`{meu nome} atualizou a [{repo}#{n} {título}]({url do comentário}) com {k} commits novos.` (`foi reescrita com force push` num force push)

## 6. Relatório

Uma linha com a URL do comentário, depois uma linha por revisor como em `clickup-dm.md`, e volte ao que a sessão estava fazendo.
