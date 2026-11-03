---
name: falsify-findings
description: >
  Crítica adversarial dos achados de uma rodada de revisão de PR, pelo método científico: duvida de todo
  achado e tenta provar que ele não é real (crítica lógica, origem, plano registrado antes de executar,
  execução com script, teste, fluxo ou Playwright, controle na base). O que resiste é classificado por
  origem, escopo da história, proporcionalidade ao porte real do sistema, gravidade, prioridade e custo x
  benefício. Detecta achados superdimensionados e, quando o dado decide, pede ao usuário números reais com
  comandos Rails prontos para console --sandbox. Lê a rodada salva em .claude/local/pr-reviews/. Use quando
  o usuário disser "critica os achados", "valida se os achados são reais", "tenta derrubar a revisão",
  "falseia os achados" ou "/review-critic:falsify-findings". Não revisa a PR (use a pr-review) e não aplica
  correção (use a apply-pr-review-feedback).
---

# Crítica dos achados

Argumento opcional: número da PR. Sem argumento, a rodada é a da branch atual (`local-<branch>`, com cada `/` trocada por `-`).

Leia agora `references/rules.md` e `references/proportionality.md`. Elas valem acima de qualquer passo deste arquivo.

## 1. Preparar

### 1.1 Resolver a rodada

```bash
REPO=$(git rev-parse --show-toplevel)
KEY=1234   # o número da PR passado; sem argumento: KEY=local-$(git branch --show-current | tr / -)
ROUND=$(ls "$REPO/.claude/local/pr-reviews/$KEY"/v*.md 2>/dev/null | grep -E '/v[0-9]+\.md$' | sort -V | tail -1)
N=$(basename "$ROUND" .md | tr -d v)
WORK="$REPO/.claude/local/pr-reviews/$KEY/v$N-critique"
REPORT="$REPO/.claude/local/pr-reviews/$KEY/v$N.critique.md"
FACTS="$REPO/.claude/local/review-critic/facts.json"
LOCK="$WORK/exec.lock"
```

Sem rodada: diga que é preciso rodar a `pr-review` antes e pare.

Confirme que `.claude/local/` é ignorado pelo git (`git -C "$REPO" check-ignore -q "$WORK"`). Se não for, pare e diga ao usuário: a crítica grava experimentos ali e não pode sujar a branch. Sendo, crie as pastas: `mkdir -p "$WORK/dossiers" "$WORK/experiments" "$(dirname "$FACTS")"`.

### 1.2 Fixar os commits

Do frontmatter da rodada, leia `reviewed_commit`, `pr_number`, `scope_source` e `scope_ref`.

- **Base**: na PR remota, `gh pr view "$KEY" --json baseRefName -q .baseRefName`. No modo local, `main` ou `master`, a que existir em `origin`. Depois `BASE=$(git merge-base "origin/$BASE_REF" "$REVIEWED")`.
- **Commit revisado ausente**: `git fetch origin "pull/$KEY/head"`.
- **Checkout diferente do revisado** (`git rev-parse HEAD` diferente de `reviewed_commit`): pergunte uma vez se a crítica roda contra o checkout atual (achados podem já ter sido corrigidos, e o relatório diz isso) ou se para, para ele fazer o checkout do commit revisado.

Grave o diff: `git diff "$BASE" "$REVIEWED" > "$WORK/diff.patch"`.

### 1.3 Ler os achados

Todo achado entra, porque a crítica duvida de todos:

- cada bloco `### [{DIMENSÃO}] {TÍTULO}` de `## Achados`, com `Location`, `Achado`, `Sugestão` e `Priority`;
- cada linha de `### Opcional` no apêndice. Ela só traz título e local, então o crítico reconstrói a alegação a partir do título e do código, e devolve `inconclusive` quando não der.

Ficam de fora `### Fora de escopo` e `### Descartados na validação`: já foram classificados ou removidos pela própria revisão.

`id` de cada achado: dimensão e título em minúsculas, tudo que não for letra ou número vira `-`.

### 1.4 Descobrir o ambiente, uma vez

Grave em `$WORK/env.json` o que todos os críticos vão usar, para nenhum deles redescobrir:

- **comando de teste**: do `CLAUDE.md` e do `Makefile` do repo. Nunca chute o executor;
- **aplicação local**: origens de `.claude/probe.json` ou `.claude/local/probe-resolved.json`, quando existirem, conferidas com `curl -s -o /dev/null -w '%{http_code}' --max-time 3`;
- **Playwright**: `npx --no-install playwright --version` no diretório do front. Ausente é ausente: não instale;
- **Rails**: versão no `Gemfile.lock`, adaptador em `config/database.yml`, e como o projeto roda `rails runner` e `rails console` (alvo do `Makefile` ou `docker compose exec`);
- **maturidade planejada**: trechos da história, do `CLAUDE.md` ou da documentação que falem de volume, usuários, crescimento ou meta de escala. Cite o caminho. Nada escrito, nada presumido.

**História**: resolva `scope_ref` conforme `scope_source` (`argument` e `disk`: leia o arquivo; `pr-body`: `gh pr view --json body`; `notion`: skill `erural-core:notion-reader`, quando disponível). Com `scope_source: none`, o escopo fica `unknown`, a não ser que o usuário diga a história na etapa 3.

## 2. Criticar, um agente por achado

Anuncie em uma linha quantos críticos vão rodar. Despache **todos numa única mensagem**, `subagent_type: review-critic:finding-critic`, cada um com:

- o bloco do achado e o `id`;
- `RULES`, `SCALES` e `PROPORTIONALITY`: caminhos absolutos de `references/rules.md`, `references/scales.md` e `references/proportionality.md` desta skill;
- `REPO`, `DIFF` (`$WORK/diff.patch`), `BASE`, `HEAD` (`reviewed_commit`), `EXP_DIR` (`$WORK/experiments`), `LOCK`, `FACTS` e `ENV` (`$WORK/env.json`).

Não mande ao crítico o resultado de outro crítico. A independência entre eles é parte do método.

Grave a resposta de cada um, sem editar, em `$WORK/dossiers/{id}.json`. Depois:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/check_dossier.py" check \
  --in "$WORK/dossiers" --root "$REPO" --out "$WORK/checked.json" --adjustments "$WORK/adjustments.json"
```

O script rebaixa veredito sem prova, remove tentativa de refutação com âncora inexistente, recusa proporcionalidade sem evidência e descarta pedido de dado que escreveria em produção ou não decide nada. Não reverta o que ele ajustou.

Ao final, remova worktrees que algum crítico tenha deixado: `git worktree list --porcelain`, e `git worktree remove --force` em toda entrada sob `$WORK`.

## 3. Pedir dados reais, só se decidir

Junte os `data_requests` de `checked.json` e aplique os três filtros de `proportionality.md`, seção 4: decide algo, não tem resposta mais barata, não é repetido. Inclua a pergunta da história quando o escopo estiver `unknown` e houver achado real a classificar.

- **Nada sobrou**: siga para a etapa 4 sem perguntar nada.
- **Sobrou algo**: mande **uma** mensagem com os pedidos numerados. Cada um traz o achado que decide, o que muda com a resposta baixa e com a alta, e o bloco de comando pronto no formato da seção 5. Pare e espere.

Com as respostas:

1. grave cada uma em `$FACTS` (pergunta, comando, ambiente, resposta, data de hoje, origem `usuario`);
2. atualize `scale.premises` e `scale.proportionality` dos dossiês afetados em `$WORK/dossiers/`, com `source: "fact"` e a resposta como evidência;
3. rode o `check` de novo.

Pedido sem resposta deixa a premissa `not_verified`. Uma segunda rodada de perguntas só acontece se uma resposta abrir uma pergunta nova que também passe nos três filtros.

## 4. Classificar os que resistiram

Para cada dossiê `confirmed`, `partial` ou `withstood` de `checked.json`, acrescente `classification` pelas tabelas de `references/scales.md`:

```json
{"severity": "critical|high|medium|low", "scope": "in|partial|out|unknown", "scope_note": "",
 "cost": "low|medium|high", "benefit": "low|medium|high",
 "recommendation": "apply_now|apply_later|not_worth", "cxb_note": ""}
```

- **Gravidade** é o impacto de uma ocorrência, decidido pelo mecanismo comprovado, não pelo rótulo que a revisão deu.
- **Escopo** sai da história: o que ela promete, o que ela adia. Fora de escopo não diminui a veracidade.
- **CxB** usa a correção proporcional quando `solution_proportionality` existir.

Grave o conjunto em `$WORK/classified.json` e calcule a prioridade:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/check_dossier.py" prioritize \
  --in "$WORK/classified.json" --out "$WORK/final.json" --adjustments "$WORK/adjustments.json"
```

Saída 2 significa classificação faltando ou inválida: corrija e rode de novo. Não atribua prioridade à mão.

## 5. Relatório

Escreva `$REPORT` a partir de `$WORK/final.json` e `$WORK/adjustments.json`, seguindo `references/report-template.md`. Todo ajuste do script aparece no apêndice: nenhuma mudança de veredito é silenciosa.

Regras de escrita do relatório:

- português do começo ao fim. Identificador, caminho e comando ficam como estão;
- sem travessão;
- a descrição conta o processo (quem dispara, o que o sistema faz, onde a lógica falha, o que sai errado), não a linha;
- nenhum número que não veio de execução, de fato coletado ou de documentação citada.

No chat, responda com o caminho do relatório e o resumo (contagem por veredito, quantos superdimensionados, quantos para aplicar nesta PR). O relatório não sai do repositório: nada é publicado no GitHub nem em outro serviço.
