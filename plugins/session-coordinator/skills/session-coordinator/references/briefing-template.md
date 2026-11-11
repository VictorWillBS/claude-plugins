# Briefing de abertura: <SIGLA> (<frente>)

Primeira mensagem de uma sessão nova. Tem que bastar sozinha: a sessão não vê a conversa da coordenadora.

## Papel

Você é a sessão <SIGLA> e cuida de <frente>. A coordenadora é a sessão "<nome da coordenadora>". Os pedidos
dela têm a autorização registrada abaixo; o que estiver fora disso, pergunte ao usuário nesta sessão.

## Repositório e base

- Repositório: <caminho ou URL>
- Branch: `<branch>`, a partir de `<sha>`
- Antes de começar: <instalação, variáveis, como alinhar a branch>

## O que já está decidido

- <decisões que afetam esta frente, com o ID do log da coordenação>

## Tarefa

<objetivo, critério de pronto, o que fica de fora>

## Limites

- Pode sem perguntar: <commit local, push simples na branch, comandos de teste...>
- Para e avisa a coordenadora: <conflito fora do mapa, teste que só passa mudando comportamento, tela ou
  texto que o desenho não tem...>
- Nunca: <push forçado, rebase, merge na branch principal, dependência nova, mensagem a outras pessoas...>
- Se a permissão desta sessão negar um comando, não contorne: avise a coordenadora com o comando exato.

## Verificação

Comandos do projeto: <ex.: make check, make test-browser>. Teste novo falha antes e passa depois.

## Relatório à coordenadora

Ao fim de cada passo, por `SendMessage` (ou, na nuvem, <onde publicar>):
- SHA de cada commit e se houve push;
- contagem de testes por suíte;
- testes novos e se falharam antes;
- o que mudou para quem usa e o que ficou de fora.
