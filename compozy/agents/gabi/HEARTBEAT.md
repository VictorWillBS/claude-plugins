---
version: 1
enabled: true
summary: "Releia o log, confira as sessões e siga o trabalho sem esperar o usuário."
preferences:
  min_interval: "30m"
context:
  include: [session_health, sessions_idle, monitors_fired]
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
  - id: atualizar-relatorio
    title: Atualizar o relatório do dia
    instructions: >-
      Atualize o relatório do dia com o que avançou, o que está parado e as perguntas prontas
      para o usuário.
    auto_accept: true
---

Leia `.claude/local/coordination/` (o log do tema ativo e o relatório do dia) e cruze com o estado das sessões e dos monitores. Proponha a ação que destrava cada frente: sessão ociosa sem relatório, monitor que disparou e não foi lido, etapa terminada sem a próxima aberta, sessão esperando algo que não chega. Este turno só lê e propõe. Sem novidade, responda `NOTHING_TO_REPORT`.
