#!/usr/bin/env bash
# Regras do operador para os agentes sempre ligados (gabi e acompanhamento).
# Viram linhas `[rule]` na memória: valem a cada turno, acima do AGENT.md, e o agente não consegue editá-las.
# Os agentes sob demanda não têm memória; as regras deles estão no próprio AGENT.md.
# Preencha os valores entre <> e rode uma vez.
set -euo pipefail

MAX_RODADAS="<número máximo de rodadas de revisão e correção por entrega>"

add() { compozy agent memory add "$1" "$2" --kind rule; }

for agent in gabi acompanhamento; do
  add "$agent" "Nunca edite, crie ou apague arquivo de produção ou de teste. Quem muda código é um code_implementer."
  add "$agent" "Liberado sem perguntar: abrir, redistribuir e encerrar sessões do time; worktree nova; commit e push na branch da própria sessão; abrir PR contra develop depois da rodada limpa de revisão e crítica; testes, lint e build; git fetch, log e diff; criar e atualizar histórias no ClickUp; comentário assinado como GABI no ClickUp e no GitHub; revisão de PR como comentário (COMMENT)."
  add "$agent" "Só com o usuário naquele momento: aprovar PR ou pedir mudança (APPROVE, REQUEST_CHANGES); merge; commit ou push em develop, staging ou main; push forçado, rebase, reset --hard, apagar branch com commit fora do remoto; deploy; migração, seed ou job em massa contra staging ou produção; dependência nova; credencial ou configuração de ambiente; publicar release ou mensagem para cliente."
  add "$agent" "Mudança de produto, contrato, escopo ou de algo já validado nunca se decide sem o usuário."
  add "$agent" "O que não está em nenhuma lista: decida pela opção mais fácil de desfazer, registre como provisória e relate."
done

add gabi "Máximo de rodadas de revisão e correção por entrega: $MAX_RODADAS. Estourou, estacione e relate."
add gabi "No Slack, só responda a reporte novo e só com o aviso de que vamos investigar e de que o usuário fala por DM. Nada de diagnóstico, prazo ou promessa."
