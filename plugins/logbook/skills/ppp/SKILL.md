---
name: ppp
description: >
  Gera o resumo do diário de trabalho no formato PPP (Progresso, Problema, Plano), pronto para colar na
  daily. Lê os registros em ~/journal do último dia útil com registro, ou da data informada. Use quando o
  usuário disser "gera o PPP", "resumo PPP", "prepara a daily", "PPP de hoje" ou "/logbook:ppp". Somente
  leitura: não cria nem altera registros.
---

# Resumo PPP

Argumento opcional: uma data `YYYY-MM-DD`. Sem argumento, use a data mais recente que tenha registro em `~/journal`, contando hoje e olhando no máximo 5 dias para trás (cobre o fim de semana).

## 1. Ler os registros

Cada registro é um arquivo `~/journal/YYYY-MM-DD-session.md`, ou `YYYY-MM-DD-session-N.md` quando houve mais de uma sessão no dia. Leia **todos** os arquivos da data escolhida e trate-os como um só dia.

De cada arquivo, use:
- `## Registro`: fonte do Progresso e dos problemas encontrados
- `## Pendências`: fonte do Plano e dos problemas em aberto
- `**Categorias:**`: itens marcados como Desafio vão para Problema

Se não houver registro no período, diga "Não encontrei registro em ~/journal nos últimos 5 dias." e pare. Não gere o PPP de memória nem a partir de rascunhos em `~/journal/drafts`.

## 2. Montar o PPP

Responda só com o texto abaixo, sem título nem comentário antes ou depois:

```markdown
Progresso

* <Frente>: <o que foi feito>
* <Frente>:
   * <item>
   * <item>

Problema

* <problema>

Plano

* <próximo passo>
```

O PPP é bem mais curto que o registro. Fica o que vale ser dito na daily: o que mudou, o que travou e o que vem a seguir. Hashes de commit, nomes de branch, datas e listas de tarefas ou PRs de uma mesma frente viram uma frase só, sem enumerar.

**Progresso**
- Um bullet por frente de trabalho (projeto, feature ou repositório), começando pelo nome dela e dois-pontos. Ex.: `Crédito:`, `Biometria:`, `erural-mkp-app:`, `Revisões:`.
- Quando a frente tiver itens independentes, use sub-bullets em vez de uma frase longa.
- Revisões feitas em PRs de outras pessoas ficam juntas no bullet `Revisões`, citando o autor.
- Diga o efeito da mudança, não só o nome da PR: "O histórico de análises deixa de varrer as tabelas" em vez de "abri a PR de otimização".

**Problema**
- Bloqueios, falhas sem causa conhecida, dívida técnica encontrada e dependências de decisão de outra pessoa.
- Quando o registro disser se o problema bloqueia ou não uma entrega, mantenha essa informação.
- Sem problemas no registro: `* Nenhum.`

**Plano**
- Vem das pendências e dos problemas em aberto. Cada bullet começa com verbo no infinitivo: "Investigar", "Seguir com", "Acompanhar a revisão de", "Cobrar de".
- São ações, não inventário: não repita a lista de PRs abertas. Cite só as que pedem acompanhamento.
- Se o registro não tiver pendências nem problemas em aberto, pergunte uma vez: "O que entra no plano de hoje?" e use a resposta.

**Escrita**
- Primeira pessoa, pretérito: "abri", "concluí", "corrigi", "respondi". Frases curtas.
- PR como link com o número, sem o nome do repositório: `[#6060](https://github.com/<org>/<repo>/pull/6060)`. Tarefa do ClickUp como link com o código: `[DEV-833](https://app.clickup.com/t/<id>)`. Use as URLs que estão no registro. Na segunda menção do mesmo item, só o número, sem link.
- Linke só a PR ou tarefa que é o assunto do bullet. Quando o bullet resume várias PRs de uma frente, descreva o que elas fazem sem linkar.
- Pessoas pelo nome ou login que aparece no registro.
- Sem emoji, sem negrito, sem travessão.

## 3. Ajuste

Depois do texto, pergunte apenas: "Quer ajustar algo?" Se o usuário pedir mudança, devolva o PPP inteiro de novo, já ajustado.

## GUARDRAILS

**Nunca:**
- Incluir item que não está nos registros nem foi dito pelo usuário
- Transformar em feito algo que o registro lista como pendente
- Afirmar a causa de um problema que o registro dá como desconhecida
- Criar, editar ou mover arquivos em `~/journal`
