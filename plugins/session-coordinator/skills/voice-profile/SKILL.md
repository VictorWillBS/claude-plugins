---
name: voice-profile
description: >
  Lê as mensagens recentes do próprio usuário no ClickUp e no Slack e atualiza o perfil do jeito de
  falar dele, que a coordenadora de sessões usa para escrever a outras pessoas. Use no início de uma
  coordenação quando o perfil não existe ou a última análise tem mais de 7 dias, ou quando o usuário
  disser "atualiza meu perfil de voz", "aprende meu jeito de falar" ou "/session-coordinator:voice-profile".
  Somente leitura nos serviços: não envia, não reage e não altera mensagem.
---

# Perfil de voz

O perfil fica em `~/.claude/session-coordinator/profile.md`, fora de qualquer repositório, e vale para todas as coordenações.

## 1. Quando rodar

Leia a linha `Última análise:` do perfil. Rode se o arquivo não existir, se a data tiver mais de 7 dias ou se o usuário pedir. Caso contrário, não faça nada.

## 2. Coletar

Só mensagens escritas pelo usuário, desde a última análise (ou dos últimos 30 dias, na primeira vez):

- **Slack:** busca por mensagens do próprio usuário em canais e conversas a que ele tem acesso.
- **ClickUp:** comentários em tarefas e mensagens de chat do usuário.

Se um dos serviços não estiver conectado, siga com o outro e anote isso no perfil. Sem nenhum dos dois, avise o usuário e não invente um perfil.

Ignore mensagens escritas por IA em nome dele (as assinadas pela Gabi) e textos colados, como logs e trechos de código.

## 3. Analisar

Extraia padrões, com contagem ou exemplo curto que sustente cada um:

- saudação e despedida: quais usa, com quem e em que momento do dia;
- tamanho de mensagem e de frase, e se quebra em várias mensagens;
- vocabulário recorrente, gírias, abreviações e termos do trabalho;
- pontuação, uso de maiúsculas e de emoji;
- como pede algo, como cobra, como discorda, como agradece;
- diferença de tom entre canal de equipe, DM e comentário de tarefa.

Um padrão só entra com pelo menos três ocorrências. O que apareceu uma vez não é padrão.

## 4. Gravar

Atualize o perfil sem apagar o que continua valendo. Estrutura:

```markdown
# Perfil de voz: <nome>

Última análise: AAAA-MM-DD
Fontes: <Slack, ClickUp> (<quantas mensagens lidas em cada>)

## Como ele fala
<padrões, um por linha, com exemplo curto>

## Como a Gabi escreve
<o mesmo tom, um pouco mais corporativo: o que mantém e o que troca>

## Não usar
<gírias, abreviações e formas que ficam só com ele>
```

Regras:

- Exemplos curtos e sem dado sensível: nada de nome de cliente, valor, credencial ou assunto pessoal. Troque por um marcador quando precisar.
- A seção "Como a Gabi escreve" nunca copia o usuário por inteiro. A Gabi soa como uma colega simpática e um pouco mais formal que ele, não como ele.
- Se um padrão antigo deixou de aparecer, marque como "em desuso" em vez de apagar na primeira vez; remova na análise seguinte se continuar ausente.

Ao terminar, diga ao usuário em duas ou três linhas o que mudou no perfil.
