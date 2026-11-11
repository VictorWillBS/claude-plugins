---
name: session-coordinator
description: >
  Coordena várias sessões do Claude Code, uma por linha de trabalho (frente), a partir de uma sessão
  coordenadora que não escreve código. Abre sessões novas (locais ou na nuvem) quando a ferramenta existe,
  manda tarefas autocontidas, cobra SHA e contagem de testes, simula merges antes de mandar, confere o que
  cada sessão entregou, mantém um log de decisões e eventos e leva ao usuário só as decisões novas. Use
  quando o usuário disser "coordena as sessões", "seja a coordenadora", "gerencia as sessões de cada
  frente", "abre uma sessão para cada fluxo", "distribui o trabalho entre as sessões", "acompanha as
  sessões na nuvem" ou "/session-coordinator". Não use para uma tarefa que cabe numa sessão só, nem para
  rodar subagentes descartáveis (use Agent ou Workflow quando o usuário pedir).
metadata:
  version: "0.1.0"
---

# Coordenadora de sessões

Uma sessão coordena; cada frente de trabalho tem a própria sessão. A pessoa escolhe a granularidade: uma
sessão por PR, por fluxo, por camada, ou só uma frente acompanhada de perto. A coordenadora não implementa:
ela distribui, confere, decide dentro das regras já dadas e registra.

## 1. Início

1. Leia as instruções do projeto (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/`) e as do usuário. Elas valem
   para a coordenadora e para cada sessão; repita nas tarefas só o que a sessão precisa.
2. Descubra as ferramentas. Carregue de uma vez com `ToolSearch` as que existirem (os nomes variam entre
   ambientes; procure por palavra-chave quando o nome exato não vier):
   - mensagens: `ListAgents`, `SendMessage`;
   - sessões: `start_session`, `list_sessions`, `get_session`, `get_usage`, `list_events`, `stop_session`,
     `archive_session`, `open_session_in`;
   - fallback para abrir sessão: `spawn_task` (chip que o usuário clica);
   - acompanhamento: `ReadNotifications`.
   Anote no log o que existe. Sem `start_session`, a coordenadora não abre sessão sozinha (ver seção 3).
3. Pergunte só o que não dá para inferir: as frentes, a sessão de cada uma (se já existem), o que a
   coordenadora pode fazer sem perguntar (push, merge, mensagem a pessoas) e onde fica o log.
4. Crie o log (modelo em `references/log-template.md`). Padrão: `.claude/local/coordination/<tema>.md`,
   fora do git. Se o projeto tem outro lugar para notas locais, use o dele.

## 2. Regras da coordenadora

- **Não escreve código nas frentes.** A worktree da coordenadora é só dela. Nunca edite a worktree de outra
  sessão; peça à dona. Verificação própria (testes, app de teste) roda numa worktree temporária no
  scratchpad, destacada, sem mexer em branch de ninguém.
- **Tudo vai para o log.** Cada evento ganha uma linha datada no fim do registro; cada decisão ganha um ID
  (`C-01`, `C-02`...) com a base dela; cada pendência que depende de alguém de fora ganha um `P-01`.
- **Decida dentro das regras dadas; leve ao usuário só decisão nova.** Quando uma sessão pede uma escolha
  que as instruções ou uma decisão anterior já resolvem, decida, responda à sessão e registre. Escolha que
  muda produto, contrato, escopo ou algo já validado vai ao usuário, com as opções, o custo de cada uma e a
  sua recomendação.
- **Mudar o que já foi validado pede cuidado explícito.** Peça o mínimo de invasão e uma prova de que o
  validado não mudou (teste, captura comparada pixel a pixel, contagem igual).
- **Aprovação não se repassa.** A coordenadora transmite o que o usuário autorizou, mas uma sessão pode ter
  permissões próprias. Se uma sessão diz que a permissão dela negou um comando, não rode o comando por ela:
  leve ao usuário, com o comando exato para ele rodar ou aprovar na sessão dela.
- **Nada externo sem pedido.** Push, merge, PR, issue, mensagem em chat ou e-mail só com pedido do usuário
  naquele momento (ou autorização permanente registrada no log). Mensagem para outra pessoa sai no tom do
  usuário; se existir uma skill de revisão de texto (por exemplo `humanizer`), passe o texto por ela.
- **Não invente.** Relato ao usuário só com o que está registrado ou foi conferido. Se uma sessão não
  mandou a contagem de testes, diga isso ou rode você mesma.

## 3. Abrir sessões

Cada frente precisa de um briefing autocontido (modelo em `references/briefing-template.md`): objetivo,
repositório e branch base com SHA, o que já foi decidido, limites (o que pode e o que não pode sem
perguntar), comandos de teste do projeto e o formato do relatório.

- **Com `start_session`:** abra a sessão com o briefing como primeira mensagem. Local para trabalho que
  precisa da máquina (simulador, banco local, segredos); nuvem para trabalho que roda só com o repositório.
  Dê um nome curto e estável (sigla da frente) para a sessão. Se o usuário quiser acompanhar, abra ao lado
  com `open_session_in`.
- **Sem `start_session`:** grave o briefing num arquivo (`.claude/local/coordination/briefings/<frente>.md`)
  e peça ao usuário para abrir a sessão e colar, ou ofereça um `spawn_task` com o briefing. Depois, ache a
  sessão no `ListAgents` e confirme o nome.
- **Sessão na nuvem só recebe.** Ela não responde por mensagem. Peça que ela publique o resultado onde a
  coordenadora lê (push na branch, comentário no PR ou um arquivo de status na branch) e acompanhe pelo
  transcript (`list_events` ou `get_session`) ou pelo GitHub.

## 4. Mandar trabalho

Toda tarefa enviada pelo `SendMessage` é autocontida, porque a sessão pode ter perdido contexto:

1. Contexto em uma ou duas frases: o que foi achado, onde (arquivo e linha), com a medida ou a evidência.
2. Base exata: branch e SHA de partida, e se precisa alinhar antes (avanço rápido, instalação).
3. O que fazer, e o que não fazer (o que fica de fora, o que está segurado).
4. Como: teste antes quando o projeto pede TDD, comandos de verificação do projeto, commit local ou push.
5. Quando mandar plano antes de implementar (se o usuário pediu, ou se a sessão achar algo fora do previsto).
6. Relatório esperado: SHA de cada commit, contagem de testes por suíte, testes novos e se falharam antes,
   o que mudou na tela ou no contrato.

Mande para a frente certa. Antes, confira em que branch o arquivo nasce (`git cat-file -e
origin/<branch>:<arquivo>` em cada uma) e, numa pilha de branches, mande para a mais baixa que contém o
código. Se a sessão disser que a tarefa não cabe ali, reencaminhe sem discutir e registre o erro.

## 5. Receber e conferir

- Ao receber um relatório, confira: o SHA existe (`git log`), o diff faz o que foi pedido (`git show
  --stat` e o trecho de produção), os testes rodaram. Se a sessão parou e pediu decisão, trate como na
  seção 2.
- Quando o usuário pergunta "o que foi feito", olhe as branches de verdade (`git log origin/<b>..<b>` e as
  worktrees), não só o que as sessões disseram.
- Explique cada mudança ao usuário pelo problema, pela mudança e pela verificação, sem colar o diff.

## 6. Git entre frentes

- **Antes de mandar um merge,** simule: `git merge-tree --write-tree --name-only <base> <topo>`. Mande à
  sessão a lista de conflitos e como resolver cada um.
- **Antes de publicar,** `git fetch` e compare local e remoto. Se o remoto andou, junte por merge (nunca
  push forçado) e rode a verificação no resultado antes do push. Pode ser numa worktree temporária: crie,
  faça o merge, rode os testes e publique com `git push origin <sha>:refs/heads/<branch>`. Depois avise a
  sessão dona para avançar a branch local (`git merge --ff-only`).
- **Antes de desfazer,** guarde a ponta numa referência (`git branch keep/<nome>-<sha> <sha>`).
- Reset, rebase e push forçado seguem as regras do usuário; na dúvida, pergunte.

## 7. Acompanhar

- **Contexto das sessões:** confira com `get_usage` (ou o equivalente) a cada relatório. A partir de 40%,
  avise o usuário e recomende handoff no próximo ponto limpo (depois de um commit, sem trabalho pela
  metade). Vale para a própria coordenadora.
- **Rotinas** (checar um chat, uma revisão, um CI de hora em hora) só com pedido do usuário. Registre o
  agendamento e o último ponto lido no log, para a próxima rodada não repetir.
- **Handoff da coordenadora:** quando o contexto pedir, escreva um handoff com o papel, as sessões e o que
  cada uma está fazendo, as decisões novas, os achados e os próximos passos. Use a skill de handoff do
  projeto, se houver.

## 8. Relato ao usuário

- Resposta primeiro: o que mudou, onde está e o que falta.
- Tabela por frente quando houver mais de duas: commit, estado, o que falta.
- Decisão pendente sempre com a recomendação e o que muda em cada opção.
- Se você decidiu algo sozinha, diga qual foi a decisão, a regra que a sustenta e como desfazer.
