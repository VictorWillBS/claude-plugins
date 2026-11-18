---
name: specify
description: >
  Fase de especificação da coordenação de sessões. Interroga o usuário sobre os pontos-chave da feature,
  em rodadas, até não sobrar nenhuma premissa em aberto, grava o escopo pelo spec-driven e apresenta o
  escopo fechado e a divisão em frentes para aprovação antes de qualquer sessão receber trabalho. Use
  quando a coordenadora for iniciar uma feature, quando o usuário disser "vamos especificar", "fecha o
  escopo", "monta o plano das frentes" ou "/session-coordinator:specify". Não distribui trabalho e não
  escreve código.
---

# Especificação antes das sessões

Nenhuma sessão recebe trabalho enquanto existir premissa em aberto. O custo de uma pergunta a mais aqui é menor do que o de duas sessões implementando entendimentos diferentes.

## 1. Ler antes de perguntar

Leia o que já existe: a História ou o Épico citado, o `CLAUDE.md` do projeto, o código da área e as specs anteriores em `.specs/`. Não pergunte ao usuário o que o repositório responde.

## 2. Tabela de premissas

Crie no log da coordenação a seção **Premissas**, uma linha por ponto, com estado `aberta` ou `confirmada` e a fonte (usuário, código, documento). Cubra pelo menos:

| Ponto-chave | O que precisa estar respondido |
| --- | --- |
| Objetivo | Que problema resolve, para quem, e como se mede que resolveu |
| Fora do escopo | O que não será feito agora, dito pelo usuário |
| Comportamento | Fluxo principal, fluxos alternativos e casos de erro |
| Contratos | Endpoints, eventos, esquemas e telas que mudam, e quem consome |
| Dados | Tabelas e migrações, volume real, dados existentes afetados |
| Regras de negócio | Cada regra com a origem dela |
| Dependências | Outras equipes, serviços, PRs ou decisões que precisam vir antes |
| Critérios de pronto | Como cada requisito será verificado (teste, tela, medida) |
| Riscos | O que pode dar errado e o que já foi validado e não pode mudar |
| Divisão em frentes | Quais frentes, o que cada uma entrega, a ordem e onde elas se tocam |

## 3. Interrogar em rodadas

- Pergunte por `AskUserQuestion`, até quatro perguntas por rodada, começando pelas que travam mais coisas.
- Cada pergunta traz opções concretas tiradas do código ou dos documentos, e a sua recomendação quando houver.
- Resposta vaga não fecha premissa. "Depende", "o normal" e "como já é hoje" pedem a pergunta seguinte: depende de quê, qual é o normal, onde está hoje.
- Seja crítico. Se uma resposta parece pior para a feature do que outra opção, diga por quê e peça o dado ou a justificativa. Se o usuário reafirmar, registre como confirmada, com a justificativa dele.
- Não invente cenário nem número. Quando a decisão depende de volume ou de uso real, peça o dado real.
- Continue até a tabela não ter nenhuma linha `aberta`. Premissa que só outra pessoa responde vira pendência `P-xx` e bloqueia apenas a frente que depende dela.

## 4. Gravar o escopo

Com a tabela fechada, grave o escopo pela skill `erural-product:spec-driven` (fase de especificação), passando as premissas confirmadas como entrada. Siga a regra do projeto sobre onde os artefatos de spec ficam e não os misture na branch da feature.

Se o `spec-driven` não existir no ambiente, grave um plano em `.claude/local/coordination/<tema>-plano.md` com: objetivo, fora do escopo, requisitos numerados, contratos, critérios de pronto e riscos.

## 5. Apresentar antes de mandar

Mostre ao usuário, nesta ordem:

1. O escopo em poucas linhas: o que entra, o que fica de fora.
2. Os requisitos numerados, cada um com o critério de pronto.
3. As frentes: o que cada uma entrega, a ordem, os pontos de contato entre elas e o modelo escolhido para cada sessão (regra de roteamento na skill `session-coordinator`).
4. Os riscos e as pendências externas.
5. Os pontos em que você discordou e o que o usuário decidiu.

Peça a aprovação explícita. Só depois dela monte os briefings e abra as sessões. Qualquer mudança de escopo depois da aprovação volta para esta skill: atualize as premissas, o escopo e avise as sessões afetadas.
