---
version: 1
enabled: true
summary: "Releia o log, confira as sessões e siga o trabalho sem esperar o usuário."
preferences:
  min_interval: "30m"
context:
  include: [session_health, sessions_idle, monitors_fired]
  sources:
    - id: slack
      script: slack
    - id: clickup
      script: clickup
actions:
  - id: cobrar-relatorio
    title: Cobrar relatório de sessão parada
    instructions: >-
      Para cada sessão do time ociosa sem relatório completo (SHA, testes, changelog), mande um
      prompt pedindo o que falta e registre no log.
    auto_accept: true
  - id: redistribuir
    title: Mandar sessão parada para outra parte do plano
    instructions: >-
      Para a sessão que espera algo que não chega, mande a próxima parte do plano que não depende
      disso. Se nada sobra, encerre a sessão. Registre no log.
    auto_accept: true
  - id: seguir-pos-codigo
    title: Seguir o fluxo de pós-código
    instructions: >-
      Para a frente cuja etapa terminou (implementação, revisão, crítica, correção), abra a
      próxima etapa do fluxo do AGENT.md e registre no log.
    auto_accept: true
  - id: tratar-mensagens
    title: Tratar as mensagens novas do Slack e do ClickUp
    instructions: >-
      Siga a seção "Mensagens no Slack e no ClickUp" do seu AGENT.md para as mensagens das
      fontes slack e clickup listadas na proposta.
    auto_accept: true
  - id: atualizar-relatorio
    title: Atualizar o relatório do dia
    instructions: >-
      Atualize o relatório do dia com o que avançou, o que está parado e as perguntas prontas
      para o usuário.
    auto_accept: true
---

Leia `.claude/local/coordination/` (o log do tema ativo e o relatório do dia) e cruze com o estado das sessões e dos monitores. Os itens da fonte `slack` são mensagens novas de outras pessoas nas DMs, nos grupos de DM e nos canais `#lançamento-novo-mkp` e `#marketplace-produto`; os da fonte `clickup`, mensagens novas nas DMs, nos grupos de DM e nos canais do chat do ClickUp que o usuário segue. Havendo algum, proponha `tratar-mensagens` com as chaves dos itens. Proponha a ação que destrava cada frente: sessão ociosa sem relatório, monitor que disparou e não foi lido, etapa terminada sem a próxima aberta, sessão esperando algo que não chega. Este turno só lê e propõe. Sem novidade, responda `NOTHING_TO_REPORT`.
