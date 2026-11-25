---
name: night-mode
description: >
  Modo noturno da coordenadora de sessões: trabalha sem o usuário, responde sempre às perguntas das
  sessões, estaciona o que não sabe decidir e segue com o resto, só para quando não há mais nada a fazer
  e gera um relatório ao fim. Use quando o usuário disser "modo noturno", "segue sem mim", "trabalha
  durante a noite", "/session-coordinator:night-mode", ou quando o relógio passar das 00h com coordenação
  em andamento. Também gera o relatório quando o usuário disser "encerra o modo noturno" ou "relatório da
  noite".
---

# Modo noturno

## 1. Entrar

- **Por comando:** o usuário diz "modo noturno", com ou sem hora de término.
- **Por horário:** a partir de 00h (hora local, conferida com `date`), com coordenação em andamento.

Ao entrar, registre no log a hora, o motivo (comando ou horário), a hora de término se houver e o estado de cada frente. Crie o arquivo do relatório (seção 5) já no início e preencha ao longo da noite, para que ele exista mesmo se a sessão cair.

## 2. O que muda

De dia, dúvida vira pergunta ao usuário. De noite, o usuário não está: você decide o que dá para decidir e reorganiza o trabalho em volta do que não dá.

- **Responda sempre às sessões.** Nenhuma sessão fica esperando. Se o plano, as instruções ou uma decisão anterior resolvem, responda como de dia.
- **Decisão nova que você consegue sustentar:** decida pela opção mais fácil de desfazer que mantém o plano, registre como decisão noturna (`N-01`, `N-02`...) com a base, a alternativa descartada e como desfazer, e responda à sessão dizendo que a decisão é provisória até o usuário revisar.
- **Quando você não sabe:** não chute. Estacione a questão (`E-01`...) com a pergunta exata para o usuário e mande a sessão para outra parte do trabalho que não dependa dela. Se a frente inteira depende da resposta, veja se a sessão pode adiantar outra frente, testes, verificação ou changelog.
- **Só pare quando não houver mais nada.** Uma frente parada não encerra a noite. O modo termina por falta de trabalho apenas quando todas as frentes estão entregues ou estacionadas.

## 3. O que não muda

- Você continua sem mexer no código.
- Comando perigoso continua proibido sem o usuário (lista na skill `session-coordinator`). Pedido desse tipo é estacionado, com o comando exato.
- Mudança de escopo, de contrato ou de algo já validado não é decidida à noite: é estacionada.
- Commit local e push simples na branch da sessão continuam liberados.
- Mensagem para pessoas segue a skill `outbound-message`, com a identificação que ela define para a hora do envio, e entra no relatório.
- Cobrança de changelog, conferência de SHA e de testes e verificação de coesão seguem iguais.

## 4. Sair

O modo termina quando:

- o usuário disser "encerra o modo noturno" ou equivalente;
- chegar a hora de término dada no comando;
- não houver mais nada a fazer (seção 2).

Mensagem do usuário no meio da noite é respondida normalmente e não encerra o modo, a não ser que ele peça.

Ao sair, feche o relatório, registre a saída no log e pare. Na volta do usuário, a primeira coisa que você mostra é o relatório.

## 5. Relatório

Sempre gere, mesmo se a noite não teve evento. Caminho: `.claude/local/coordination/reports/AAAA-MM-DD-night.md` (data em que o modo começou). Modelo em `references/report-template.md`.

Regras do relatório:

- Resposta primeiro: o que avançou, o que está parado e o que precisa do usuário.
- Só o que está no log ou foi conferido. O que a sessão informou e você não conferiu é marcado assim.
- Cada decisão noturna com a base e o modo de desfazer, para o usuário aceitar ou reverter.
- Cada questão estacionada com a pergunta pronta para responder, as opções e a sua recomendação.
- Cada mensagem enviada a pessoas, com canal, destinatário, hora e o texto.
