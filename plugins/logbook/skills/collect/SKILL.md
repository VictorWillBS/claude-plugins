---
name: collect
description: >
  Coleta a atividade de trabalho de um período (tarefas do ClickUp atribuídas ao usuário e atividade no
  GitHub da organização pastar-br) e devolve um rascunho do diário em Markdown. Recebe "<desde> <até>"
  em ISO 8601 UTC. Usada pelo cron diário do logbook e pela skill logbook quando não há rascunho pendente.
  Não conversa com o usuário e não salva nada no Anytype.
---

# Coleta do período

Argumentos: `<desde> <até>` em ISO 8601 UTC (ex.: `2026-10-26T18:00:00Z 2026-10-27T18:00:00Z`).
Se `<até>` faltar, use o horário atual. Se `<desde>` faltar, pare e informe o erro.

## 1. GitHub

Se os argumentos já trouxerem uma seção que começa com `## GitHub`, use-a como está e não rode o script.

Caso contrário, rode:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/github_activity.sh "<desde>" "<até>"
```

Se o script falhar, mantenha a seção `## GitHub` no rascunho com a linha `- falha na coleta: <mensagem de erro>`. Nunca omita a seção em silêncio.

## 2. ClickUp

1. Chame `clickup_get_user` para obter o fuso do usuário.
2. Chame `clickup_filter_tasks` com `assignees: ["me"]`, `include_closed: true`, `order_by: "updated"` e `fields: ["custom_id", "status", "date_updated", "list"]`.
3. Mantenha só as tarefas com `date_updated` (milissegundos desde a época) dentro de `[desde, até)`. Como a lista vem da mais recente para a mais antiga, pare de paginar quando aparecer uma tarefa anterior a `<desde>`. Caso contrário, siga `next_page` enquanto `has_more` for verdadeiro.

Atualizada no período não quer dizer alterada pelo usuário: outra pessoa pode ter mexido. Registre o que veio, sem afirmar quem mexeu.

Se o ClickUp falhar, mantenha a seção com `- falha na coleta: <mensagem de erro>`.

## 3. Saída

Responda **apenas** com o rascunho abaixo, sem texto antes ou depois. Horários no fuso do usuário.

```markdown
# Rascunho do diário: <desde local, DD/MM HH:MM> a <até local, DD/MM HH:MM>

## ClickUp

- [<custom_id> <nome>](<url>): <status>, lista <lista>, atualizada às <HH:MM>
  (ou "- nenhuma tarefa atualizada no período")

<seção ## GitHub, como veio do script>
```
