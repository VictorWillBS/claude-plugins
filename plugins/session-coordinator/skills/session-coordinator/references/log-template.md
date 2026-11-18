# Coordenação: <tema>

Log da coordenadora. Fora do git. Cada evento entra numa linha nova no fim do **Registro**, com data.

## Sessões

| Frente | Função | Sessão (nome atual no ListAgents) | Modelo | Onde roda | Worktree e branch | Base |
| --- | --- | --- | --- | --- | --- | --- |
| <SIGLA> | <Backend, Testes...> | <nome> | <Haiku, Sonnet ou Opus, e o motivo> | local ou nuvem | <caminho>, `<branch>` | `<sha>` |

## Premissas

Preenchida pela skill `specify`. Nenhuma sessão recebe trabalho com linha `aberta`.

| Ponto-chave | Premissa | Estado | Fonte |
| --- | --- | --- | --- |
| <objetivo, contrato, dado...> | <o que foi respondido> | aberta ou confirmada | <usuário, código, documento> |

## Autorizações

O que a coordenadora e as sessões podem fazer sem perguntar, com a data e quem autorizou. Exemplo: "commit
local e push simples na branch da sessão (usuário, AAAA-MM-DD)". O que não está aqui pede pergunta.

## Ferramentas disponíveis

Quais existem nesta coordenação (start_session, SendMessage, get_usage, list_events...). Sem start_session,
as sessões são abertas pelo usuário a partir dos briefings.

## Decisões

| ID | Decisão | Base |
| --- | --- | --- |
| C-01 | <o que foi decidido, em uma linha> | <usuário, regra do projeto ou decisão anterior> |

## Pendências

| ID | Pendência | De quem |
| --- | --- | --- |
| P-01 | <o que falta> | <usuário, outra equipe, outro repositório> |

## Problemas conhecidos

| ID | Problema | Achado por | Causa e saída adotada | Repassado a |
| --- | --- | --- | --- | --- |
| K-01 | <o que quebrou ou surpreendeu> | <SIGLA> | <causa, como foi resolvido> | <frentes avisadas> |

## Modo noturno

Decisões provisórias (`N-xx`) e questões estacionadas (`E-xx`) de cada noite, com o caminho do relatório.

## Registro

- AAAA-MM-DD: <evento: o que aconteceu, SHA, contagens, para quem foi mandado>
