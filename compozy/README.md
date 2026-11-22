# Time de engenharia no Compozy

A GABI (Gestora de Agentes de Baixa Intervenção) coordena um time de agentes do Compozy. O usuário só entra no que é dele: produto, contrato, escopo, aprovação, merge, deploy e o que é perigoso. O resto o time resolve.

## O time

| Time | Agente | Tipo | Faz | Modelo |
| --- | --- | --- | --- | --- |
| Coordenação | `gabi` | sempre ligada | escopo, histórias pequenas no ClickUp, distribuição, conferência, reportes do Slack, relatório | Opus |
| Execução | `spec_conductor` | sob demanda (Compozy) | divide em fatias e integra numa branch | Opus |
| Execução | `code_implementer` | sob demanda (Compozy) | implementa uma fatia ou corrige um achado | Opus |
| Pós-código | `revisor` | sob demanda | revisão final: código (`pr-review`) e comportamento (abre o `qa`) | Opus |
| Pós-código | `qa` | sob demanda | `qa-playbook`, `qa-run` e `pixel-perfect` quando há desenho | Opus |
| Pós-código | `critico` | sob demanda | `falsify-findings` em cada achado e validação da solução proposta | Opus |
| Pós-código | `pr` | sob demanda | abre o PR, descreve e anexa imagens | Sonnet |
| Follow-up | `acompanhamento` | sempre ligado | vigia os PRs do usuário e dispara o fluxo certo | Sonnet |
| Follow-up | `investigador` | sob demanda | reproduz o reporte do Slack e abre a história de bug | Opus |
| Self-care | `zeladoria` | agendada | arquiva sessões e remove worktrees mortas, sem perder trabalho | Haiku |
| Comunicação | `comunicacao` | sob demanda | notas de lançamento para GitHub, Slack e WhatsApp | Sonnet |
| Comunicação | `release` | agendado | quinta 17h pergunta ao Produto; sexta 9h abre as PRs de staging para produção e avisa a release das 10h | Sonnet |

O `reviewer` do Compozy fica sem uso: a revisão é do time de pós-código.

## Fluxos

**Entrega.** GABI fecha o escopo com você, cria as histórias, uma fatia por história. `code_implementer` (ou `spec_conductor` com mais de uma fatia) implementa. `revisor` e `qa` revisam em paralelo. `critico` derruba o que não é real e corrige a solução. `code_implementer` corrige o que sobrou. Repete até sair limpo, até o máximo de rodadas. `pr` abre o PR.

**PR em que você é revisor.** O `acompanhamento` vê que é a sua vez. `revisor` e `qa` revisam, `critico` filtra, e o `acompanhamento` publica a revisão como comentário assinado pela GABI. Você decide se aprova ou pede mudança.

**PR seu com comentário ou CI vermelho.** O `acompanhamento` abre um `code_implementer` com a `babysit-pr`.

**Mensagens no Slack e no ClickUp.** Dois scripts do check-in da GABI leem, sem modelo, as mensagens novas de outras pessoas: no Slack, as suas DMs, os grupos de DM, `#lançamento-novo-mkp` e `#marketplace-produto`; no chat do ClickUp, as DMs, os grupos de DM e os canais que você segue. Só mensagem nova acorda o modelo. Para reporte, a GABI responde como você que vamos investigar e abre o `investigador`; o resto entra resumido no relato. Quando você for falar com a pessoa, a história de bug já tem a reprodução e a causa provável. Resposta que fica só dentro de uma thread do Slack não chega ao script.

**Release semanal.** Quinta, 17h: o `release` pergunta no canal Produto do ClickUp se há mudança importante para subir, com a lista do que já está em staging nos repositórios com mudança nos últimos 7 dias. Sexta, 9h: lê a thread; o repositório citado numa resposta fica segurado e você recebe DM; nos outros, confere o fluxo de branches pelos deploys anteriores, abre a PR de staging para produção (ou reusa a aberta) e avisa a release das 10h. Tudo pela skill `weekly-deploy` do `deploy-announcer`.

## O que custa modelo

| Gatilho | Custo |
| --- | --- |
| Check-in do `acompanhamento` | o script roda sem modelo; o modelo só acorda quando um PR muda |
| Check-in da `gabi` | só acorda o modelo quando o estado das sessões muda ou chega mensagem nova no Slack ou no ClickUp (os scripts rodam sem modelo) |
| Zeladoria | uma sessão Haiku por execução |
| Release | duas sessões Sonnet por semana |

Teto diário por agente sempre ligado: `compozy agent instance budget`.

## Instalação

1. Compozy instalado no WSL, com o Claude como provedor (`compozy install`). Os agendamentos só rodam com o serviço de pé, então ele roda como serviço do usuário no systemd, sem depender de terminal aberto. Pré-requisito: systemd ligado no WSL (`/etc/wsl.conf` com `[boot]` e `systemd=true`, e `wsl --shutdown` no Windows para aplicar).

   ```bash
   mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/compozy.service <<EOF
   [Unit]
   Description=CompozyOS daemon

   [Service]
   Type=simple
   Environment=PATH=$PATH
   EnvironmentFile=-%h/.config/compozy/secrets.env
   ExecStart=$(command -v compozy) daemon start --foreground
   ExecStop=$(command -v compozy) daemon stop
   Restart=on-failure
   RestartSec=3

   [Install]
   WantedBy=default.target
   EOF
   ```

   ```bash
   compozy daemon stop; systemctl --user daemon-reload && systemctl --user enable --now compozy
   ```

   ```bash
   sudo loginctl enable-linger "$USER"
   ```

   Crie o serviço no terminal onde `claude`, `node`, `gh` e `jq` respondem: o `PATH` dele fica gravado no serviço, e sem isso o Compozy não acha o Claude. O `enable-linger` mantém o serviço sem sessão aberta. O WSL ainda para quando o Windows dorme ou desliga; confira no Windows, com o terminal do WSL fechado, se a distribuição continua em `wsl --list --running`.

2. Pré-requisitos dos scripts: `jq` e o `gh` autenticado na organização (`weekly-deploy` e `prs`), `python3` (`slack` e `clickup`) e os dois tokens.

   ```bash
   sudo apt install -y jq
   ```

   ```bash
   gh auth status
   ```

   **Token do Slack** (de usuário, só leitura): em https://api.slack.com/apps, **Create New App**, **From a manifest**, no workspace da erural, com este manifest. Depois, **OAuth & Permissions**, **Install to Workspace**, e copie o **User OAuth Token** (`xoxp-`).

   ```json
   {
     "display_information": { "name": "GABI leitura" },
     "oauth_config": {
       "scopes": {
         "user": ["channels:history", "channels:read", "groups:history", "groups:read",
                  "im:history", "im:read", "mpim:history", "mpim:read", "users:read"]
       }
     },
     "settings": { "org_deploy_enabled": false, "socket_mode_enabled": false }
   }
   ```

   **Token do ClickUp** (pessoal): avatar, **Settings**, **Apps**, **API Token**, **Generate** (`pk_`).

   Grave os dois sem que apareçam na tela. O serviço carrega o arquivo, e o `env_allow` do `config.toml` libera as duas variáveis só para os scripts do check-in:

   ```bash
   mkdir -p ~/.config/compozy && chmod 700 ~/.config/compozy
   touch ~/.config/compozy/secrets.env && chmod 600 ~/.config/compozy/secrets.env
   read -rsp 'Token do Slack: ' T && printf 'SLACK_USER_TOKEN=%s\n' "$T" >> ~/.config/compozy/secrets.env && unset T; echo
   read -rsp 'Token do ClickUp: ' T && printf 'CLICKUP_API_TOKEN=%s\n' "$T" >> ~/.config/compozy/secrets.env && unset T; echo
   ```

   Com o daemon já rodando, reinicie pelo serviço para ele ler o arquivo: `compozy daemon stop; systemctl --user start compozy`.

3. Junte o `config.toml` desta pasta ao `~/.compozy/config.toml` e preencha os valores entre `<>`.

4. Copie os agentes:

   ```bash
   mkdir -p ~/.compozy/agents && cp -R compozy/agents/* ~/.compozy/agents/
   ```

5. Registre o repositório e ligue os dois agentes sempre ligados. Do clone do `erural-mkp-app`:

   ```bash
   compozy workspace add "$PWD" --name erural-mkp-app
   ```

   ```bash
   compozy agent instance create gabi --workspace erural-mkp-app
   ```

   ```bash
   compozy agent instance create acompanhamento --workspace erural-mkp-app
   ```

6. Preencha os valores do `rules.sh` e grave as regras:

   ```bash
   bash compozy/rules.sh
   ```

7. Aprove as ações dos check-ins e os scripts (o Compozy ignora tudo até você aprovar). Rode no seu terminal, de dentro do clone do `erural-mkp-app` e com `--workspace`: uma sessão de agente recebe `operator_only`, e sem o workspace a aprovação vai para outro escopo. O `show` dá o digest; o `approve` imprime o bloco como estava antes de aprovar, então confira com o `show` de novo.

   ```bash
   compozy agent heartbeat authority show gabi --workspace erural-mkp-app
   compozy agent heartbeat authority approve gabi --workspace erural-mkp-app --sha256 <digest> --yes
   ```

   ```bash
   compozy agent heartbeat authority show acompanhamento --workspace erural-mkp-app
   compozy agent heartbeat authority approve acompanhamento --workspace erural-mkp-app --sha256 <digest> --yes
   ```

   ```bash
   compozy agent heartbeat sources approve acompanhamento prs --workspace erural-mkp-app
   compozy agent heartbeat sources approve gabi slack --workspace erural-mkp-app
   compozy agent heartbeat sources approve gabi clickup --workspace erural-mkp-app
   ```

   Editar um script ou uma ação muda o hash ou o digest e exige aprovar de novo.

8. Ponha um teto diário nos dois:

   ```bash
   compozy agent instance budget gabi --workspace erural-mkp-app --usd <valor>
   ```

   ```bash
   compozy agent instance budget acompanhamento --workspace erural-mkp-app --usd <valor>
   ```

9. Deixe os arquivos locais do time fora do git, só na sua máquina:

   ```bash
   echo '.specs/**/_run.md' >> .git/info/exclude
   ```

10. Confira:

   ```bash
   compozy agent list
   ```

   ```bash
   compozy skill list
   ```

   ```bash
   compozy agent instance check acompanhamento --workspace erural-mkp-app --dry-run
   ```

   ```bash
   compozy agent instance check gabi --workspace erural-mkp-app --dry-run
   ```

   Na primeira passada, os scripts do Slack e do ClickUp só marcam o ponto de partida e devolvem zero mensagens: o histórico não entra.

## A conferir no primeiro uso

1. **Rotina de sexta na nuvem.** A rotina "Deploy semanal em produção (aviso no Produto)" segue ativa na nuvem, sexta às 9h. Com o `release` rodando no Compozy, desligue a da nuvem para não abrir PR e avisar duas vezes.

2. **`pixel-perfect`.** Não achei a skill em nenhum plugin instalado nem no GitHub alcançável. Sem ela, o `qa` registra que não houve conferência de design.
3. **Conectores.** `gabi`, `investigador`, `comunicacao` e `release` usam `lean_environment: false` para herdar o ClickUp e o Slack do seu Claude Code. Confira se o ClickUp e o Slack respondem dentro da sessão do Compozy.
4. **Trava dos implementadores.** Rodam em `auto`, e as regras do `rules.sh` só chegam aos agentes sempre ligados. Para uma trava dura, ponha os comandos perigosos no `permissions.deny` do `~/.claude/settings.json` e teste um `git push --force` numa branch descartável.
5. **Spec do erural no condutor.** O `spec_conductor` procura `_spec.md` e `_slices.md`; a GABI passa os caminhos absolutos da spec do `spec-driven` no prompt.
6. **`@me` no script de PRs.** É o usuário do `gh auth` da máquina.

## Documentação usada

Repositório público `compozy/compozy` (o site estava fora do alcance), versão de 21/11/2026: `agents/heartbeat` (check-in, fontes de script, ações), `automation/schedules` (jobs), `configuration/agent-md` e `skills/compozy/references/agent-definitions.md` (formato do agente), `sessions/permissions`, `skills/compozy/references/agent-memory.md` (regras do operador), `examples/deliver-a-spec` e `extensions/spec-cycle/agents/`.
