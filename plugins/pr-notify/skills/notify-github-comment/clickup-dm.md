# Avisar um usuário do GitHub no ClickUp

Usado por `notify-github-comment` e `notify-pr-update`. Entrada: uma lista de logins do GitHub (já sem o próprio usuário e sem bots) e a mensagem de cada um. Saída: uma linha por login dizendo se a DM saiu.

## Ferramentas

Use as ferramentas do ClickUp disponíveis na sessão. O nome delas leva um prefixo de servidor que muda entre máquinas: use a que acha membro do workspace por nome ou e-mail e a que manda mensagem de chat para pessoas por `user_ids` (mensagem direta, nunca canal). Sem ferramenta do ClickUp na sessão, diga isso em uma linha e pare esta parte; nada do que a skill chamadora já fez é desfeito.

## Do login do GitHub ao membro do ClickUp

Para cada login, nesta ordem, parando no primeiro acerto:

1. Uma tabela de correspondência (login do GitHub para nome ou e-mail no ClickUp) no `CLAUDE.md` do repo ou em `~/.claude/CLAUDE.md`, quando existir.
2. O perfil do GitHub: `gh api users/{login} --jq '{name, email}'`. Busque pelo `email` quando não for nulo, depois pelo `name`.
3. O próprio login.

Aceite só um membro que a ferramenta devolveu para aquela busca. **Nunca escolha um membro por semelhança** e nunca mande mensagem para alguém que você não tem certeza de que é a pessoa: sem correspondência, o login vai para o relatório como "sem correspondência no ClickUp" e a skill segue. A correção que o relatório sugere é a tabela no `CLAUDE.md`.

## Envio

Uma mensagem direta por pessoa (`user_ids` com um id só), nunca DM em grupo, porque cada pessoa recebe o texto escrito para o papel dela. O conteúdo é markdown em PT-BR, começa com o nome de quem enviou e sempre leva o link do GitHub. Não peça confirmação: ter o plugin ligado ou o próprio pedido do usuário é a autorização.

Envio que falha vai para o relatório com o erro que a ferramenta devolveu. Não tente de novo em laço e não relate como enviado.

## Relatório

Termine com uma linha por login, por exemplo:

```
ClickUp: @ana avisada por DM; @bruno sem correspondência no ClickUp
```
