---
name: notify-github-comment
description: >
  Avisa por DM no ClickUp quem recebe um comentário que o usuário acabou de postar no GitHub pelo
  Claude: o autor da PR ou issue, o autor do comentário respondido e quem foi mencionado no texto.
  Roda quando o hook do pr-notify pede, depois de `gh pr comment`, `gh issue comment`, `gh pr review`
  ou `gh api` com POST de comentário ou review, ou quando o usuário diz "avisa no ClickUp quem recebeu
  meu comentário", "manda DM pro autor da PR sobre o comentário", "notifica o fulano do meu review".
  Não use para escrever ou postar o comentário, para buscar comentários, para review em rascunho nem
  para anunciar commits novos numa PR (use notify-pr-update).
---

# Aviso de comentário no GitHub

Avisa no ClickUp quem recebeu um comentário que o usuário postou no GitHub. Não posta nada no GitHub e nunca edita o comentário.

## Entrada

- Do hook: um JSON com `cwd`, o `command` que rodou e as `urls` do GitHub que ele imprimiu. Rode todo `gh` e `git` abaixo nesse `cwd`.
- Do usuário: a URL do comentário, do review ou da PR. Sem nenhuma, pergunte qual é o comentário.

## 1. Quem sou eu, qual repo

```bash
gh api user --jq '{login, name}'
gh repo view --json nameWithOwner --jq .nameWithOwner
```

Uma URL na entrada vence o repo atual.

## 2. Achar o que foi postado

Leia do GitHub, nunca do texto do comando, para que um comando que falhou não avise ninguém.

| Trecho da URL | Ler com |
| --- | --- |
| `#issuecomment-{id}` | `gh api repos/{repo}/issues/comments/{id}` |
| `#discussion_r{id}` | `gh api repos/{repo}/pulls/comments/{id}` |
| `#pullrequestreview-{id}` | `gh api repos/{repo}/pulls/{n}/reviews/{id}` |

Sem essa URL (`gh pr review` não imprime nenhuma, e um `gh api` com `--jq` pode não imprimir), pegue o número da PR ou issue no comando (um número posicional, ou o número no caminho do `gh api`; sem nenhum, `gh pr view --json number --jq .number` na branch atual) e liste os itens do usuário criados nos últimos 10 minutos:

```bash
gh api "repos/{repo}/issues/{n}/comments" --paginate --jq '[.[] | select(.user.login == "{me}")] | last'
gh api "repos/{repo}/pulls/{n}/comments" --paginate --jq '[.[] | select(.user.login == "{me}")] | last'
gh api "repos/{repo}/pulls/{n}/reviews" --paginate --jq '[.[] | select(.user.login == "{me}")] | last'
```

Fique com os que têm `created_at` (ou `submitted_at`) dentro desses 10 minutos e combinam com o comando (resposta vem do caminho `replies`, review vem de `gh pr review` ou de um caminho `reviews`). Comentários inline do mesmo review (mesmo `pull_request_review_id`) geram um aviso só, o do review.

Pare com uma linha, sem avisar ninguém, quando:

- nada combina: o comando não postou;
- o review está `PENDING`: rascunho ainda não é visível ("rascunho de review, ninguém foi avisado");
- o item não é do usuário.

## 3. Quem recebe

- O autor da PR ou issue: `gh api repos/{repo}/issues/{n} --jq '{author: .user.login, title, html_url}'`.
- Numa resposta a comentário inline (`in_reply_to_id`): o autor desse comentário.
- Todo `@login` mencionado no texto. Menção a time (`@org/time`) fica de fora e vai para o relatório.

Tire o próprio usuário e todo bot (`type == "Bot"` ou login terminado em `[bot]`). Sem ninguém: pare com "ninguém para avisar".

## 4. Avisar no ClickUp

Siga `${CLAUDE_PLUGIN_ROOT}/skills/notify-github-comment/clickup-dm.md` com estas mensagens:

- Autor ou pessoa respondida: `{meu nome} comentou na [{repo}#{n} {título}]({url do comentário}):` Num review, o verbo segue o estado: `aprovou`, `pediu alterações em` ou `revisou`.
- Pessoa só mencionada: `{meu nome} mencionou você na [{repo}#{n} {título}]({url do comentário}):`

Depois, uma citação com os primeiros 300 caracteres do texto (corte numa palavra e termine com `…` quando passar). Review sem texto não leva citação.

## 5. Relatório

Uma linha por destinatário, como em `clickup-dm.md`, e volte ao que a sessão estava fazendo.
