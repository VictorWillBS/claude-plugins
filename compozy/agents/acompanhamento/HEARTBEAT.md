---
version: 1
enabled: true
summary: "Lê os PRs que envolvem o usuário e dispara o fluxo certo para cada um que mudou."
preferences:
  min_interval: "15m"
context:
  include: [monitors_fired]
  sources:
    - id: prs
      script: prs
actions:
  - id: revisar-pr
    title: Revisar o PR em que é a vez do usuário
    instructions: >-
      Siga a seção "PR em que é a vez do usuário revisar" do seu AGENT.md para o PR da proposta.
    auto_accept: true
  - id: cuidar-do-pr
    title: Levar comentário ou CI vermelho a quem corrige
    instructions: >-
      Siga a seção "PR do usuário com novidade" do seu AGENT.md para o PR da proposta.
    auto_accept: true
  - id: seguir-revisao
    title: Seguir a revisão em andamento
    instructions: >-
      Para o monitor que disparou, abra a próxima etapa (crítico ou publicação) do seu AGENT.md.
    auto_accept: true
---

Os itens da fonte `prs` são os PRs abertos em que é a vez do usuário revisar (`review:`) e os PRs dele que tiveram atualização (`mine:`). Compare com `.claude/local/coordination/prs.md` e proponha uma ação por PR que ainda não foi tratado no estado atual. Para o PR do usuário, proponha `cuidar-do-pr` só se a atualização foi um comentário de outra pessoa ou um check vermelho. Sem novidade, responda `NOTHING_TO_REPORT`.
