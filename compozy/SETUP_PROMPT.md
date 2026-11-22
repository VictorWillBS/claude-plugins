Configure no Compozy, nesta máquina (WSL), o time de agentes descrito em `~/claude-plugins/compozy/`. O Compozy já está instalado. Siga o `~/claude-plugins/compozy/README.md`; este prompt diz a ordem e os limites.

## Antes de começar

1. Atualize o clone e mude para o branch do time:
   `cd ~/claude-plugins && git fetch origin claude/friendly-sagan-yynf62 && git checkout claude/friendly-sagan-yynf62`.
   Se o clone não estiver em `~/claude-plugins`, me pergunte onde está e ajuste os caminhos `~/claude-plugins` do `config.toml` e dos prompts dos agendamentos.
2. Leia o README, o `config.toml`, o `rules.sh` e os `AGENT.md` e `HEARTBEAT.md` de `compozy/agents/`.
3. Confira o que já existe: `compozy status`, `compozy doctor -o json`, `cat ~/.compozy/config.toml`, `ls ~/.compozy/agents`, `compozy workspace list`. Me mostre o que já está configurado antes de mexer.
4. Me pergunte de uma vez, numa única pergunta, os valores que só eu sei, e não invente nenhum:
   - caminho do clone do `erural-mkp-app`;
   - intervalo da checagem do Slack;
   - horário da zeladoria e dias sem atividade para uma sessão contar como abandonada;
   - máximo de rodadas de revisão e correção por entrega;
   - teto diário em dólar da `gabi` e do `acompanhamento`.

## Ordem

1. **Serviço.** Confira se o systemd está ligado (`systemctl --user status`). Se não estiver, me diga para pôr `[boot]` e `systemd=true` no `/etc/wsl.conf` e rodar `wsl --shutdown` no Windows, e pare até eu voltar. Com o systemd ligado, crie o serviço do usuário como no passo 1 da Instalação do README e ligue-o. Comandos com `sudo` (`loginctl enable-linger`, `apt install`): me passe o comando exato para eu rodar, não tente rodar.
2. **Pré-requisitos.** `jq` instalado e `gh auth status` autenticado na organização `pastar-br`. Faltando algum, me passe o comando.
3. **Config.** Faça backup do `~/.compozy/config.toml` (`cp` com a data no nome). Junte o trecho do `compozy/config.toml` ao arquivo existente, sem apagar o que já está lá: chave repetida, mostre as duas versões e me pergunte qual fica. Preencha os valores que eu dei. Valide com `compozy config validate` (ou o equivalente que o `compozy config --help` mostrar) e reinicie o serviço.
4. **Agentes.** Copie `compozy/agents/*` para `~/.compozy/agents/`. Se já existir um agente com o mesmo nome, mostre a diferença e me pergunte antes de sobrescrever. Confira com `compozy agent list` e `compozy agent show <nome> -o json` que os 10 agentes carregaram sem erro.
5. **Skills.** `compozy skill list` precisa mostrar `specify`, `outbound-message`, `voice-profile` e `weekly-deploy`.
6. **Workspace e agentes sempre ligados.** Do clone do `erural-mkp-app`: `compozy workspace add` (se ainda não estiver registrado), depois `compozy agent instance create gabi` e `compozy agent instance create acompanhamento` nesse workspace.
7. **Regras.** Preencha o `MAX_RODADAS` do `rules.sh` com o valor que eu dei e rode. Confira com `compozy agent memory inspect gabi`.
8. **Aprovações.** Para cada uma (`heartbeat authority` da `gabi` e do `acompanhamento`, `heartbeat sources` do script `prs`), rode o `show`, me mostre o bloco ou o script e só aprove depois do meu "pode".
9. **Teto diário.** `compozy agent instance budget` dos dois, com os valores que eu dei.
10. **Git local.** No clone do `erural-mkp-app`, acrescente `.specs/**/_run.md` ao `.git/info/exclude`, se ainda não estiver lá.

## Testes, sem efeito externo

1. `compozy agent instance check acompanhamento --workspace erural-mkp-app --dry-run`: deve listar meus PRs.
2. Abra uma sessão do agente `release` e mande: "Siga a skill weekly-deploy com --ask --dry-run. Scripts: ~/claude-plugins/plugins/deploy-announcer/scripts/." Deve mostrar a mensagem de quinta sem enviar. Não rode sem `--dry-run`.
3. Abra uma sessão da `gabi` e peça só para listar as ferramentas do ClickUp e do Slack que ela enxerga, sem enviar nada.
4. Por último, me diga para fechar o terminal do WSL e conferir no PowerShell, com `wsl --list --running`, que a distribuição continua de pé.

## Limites

- Não envie mensagem no Slack nem no ClickUp, não abra PR, não comente no GitHub. Os testes são só leitura ou `--dry-run`.
- Não dispare nenhum agendamento (`compozy automation jobs trigger`).
- Não mexa em nenhum repositório além do `.git/info/exclude` do passo 10.
- Erro que você não sabe resolver: pare, me mostre o comando e a saída exatos.

## No fim

Uma tabela com cada passo, o resultado e o comando que comprova, e a lista do que ficou pendente comigo.
