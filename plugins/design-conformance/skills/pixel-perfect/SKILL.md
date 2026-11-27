---
name: pixel-perfect
description: >
  Verificação pixel perfect das telas implementadas contra o erural-product-design, que é a lei. Lê o
  repositório comparado, infere a pasta do produto (products/<produto>) e as jornadas que ele implementa, e
  pergunta quando não consegue inferir. Renderiza cada quadro do canvas e a tela do app com Playwright no
  mesmo tamanho e tema, mede as diferenças de pixel, texto, tipografia, cor, posição e componentes, percorre
  os fluxos e confere os casos de uso e estados da especificação. Cada achado sai com fonte no design,
  evidência, gravidade, prioridade calculada e a correção mais viável, num relatório com prints comparativos.
  Use quando o usuário disser "verifica se a tela está igual ao design", "pixel perfect", "compara com o
  product design", "confere a implementação com o canvas", "a tela está fiel ao design?", "auditoria de
  design da tela" ou "/design-conformance:pixel-perfect". Não corrige o código (só relata), não revisa a PR
  inteira (use a pr-review) e não audita o próprio canvas (use a skill audit do product-design).
---

# Verificação pixel perfect

Argumentos, todos opcionais e combináveis:

- jornada: chave (`access`), número (`07`) ou nome da página do canvas;
- rota do app (`/sign-in`);
- `--ref <tag ou commit>`: compara com uma versão fixada do product-design, como a tag de uma versão aprovada em `pages.json`. Sem ele, vale a branch padrão de origin;
- `--platform mobile|desktop` e `--theme light|dark`: restringem. Sem eles, as duas plataformas e os temas que cada quadro aceita.

Sem jornada nem rota, o escopo vem do diff da branch atual.

Leia agora `references/rules.md` e `references/scales.md`. Elas valem acima de qualquer passo deste arquivo. O formato de cada arquivo da rodada está em `references/plan-format.md`.

`SCRIPTS="${CLAUDE_PLUGIN_ROOT}/scripts"`.

## 1. Preparar

### 1.1 Repositório comparado e pasta da rodada

```bash
REPO=$(git rev-parse --show-toplevel)
BRANCH=$(git branch --show-current)
RUN="$REPO/.claude/local/design-conformance/$(echo "$BRANCH" | tr / -)/$(date +%Y-%m-%d-%H%M)"
```

Confirme que a pasta é ignorada pelo git (`git -C "$REPO" check-ignore -q "$RUN"`). Se não for, pare e diga ao usuário: a rodada grava prints ali e não pode sujar a branch. Sendo, `mkdir -p "$RUN"`.

Leia o `CLAUDE.md` do repositório e o da área das telas: como subir a web, para qual API ela aponta, se existe API falsa, como entrar com uma conta de teste.

### 1.2 Playwright

```bash
[ -d "${CLAUDE_PLUGIN_ROOT}/node_modules/playwright" ] || npm ci --prefix "${CLAUDE_PLUGIN_ROOT}" --no-audit --no-fund
node -e "process.exit(require('fs').existsSync(require('${CLAUDE_PLUGIN_ROOT}/node_modules/playwright').chromium.executablePath())?0:1)" \
  || (cd "${CLAUDE_PLUGIN_ROOT}" && npx playwright install chromium)
```

A instalação do Chromium só acontece na primeira vez e baixa o navegador: avise em uma linha antes.

### 1.3 Product-design

```bash
python3 "$SCRIPTS/design_source.py" locate [--ref <tag ou commit>]
```

- `source: env`: é o clone do usuário em `PRODUCT_DESIGN_DIR` (ou `ERURAL_PRODUCT_DESIGN_DIR`, a convenção dos apps), usado como está. Com `behind_origin` acima de zero, `dirty` ou `ref` fora da branch padrão, avise em uma linha que o relatório vai refletir aquele estado.
- `source: cache`: é o clone da skill em `~/.cache/design-conformance`, já na branch padrão de origin ou na referência pedida.
- `found: false`: mostre o erro e pare.

`PD` é o `path` devolvido. Guarde `ref`, `commit` e `commit_date` para o relatório. Leia `$PD/CLAUDE.md` e `$PD/.claude/rules/*.md`: são parte da lei.

## 2. Produto e escopo

### 2.1 Produto

```bash
python3 "$SCRIPTS/design_source.py" infer --pd "$PD" --repo "$REPO"
```

- `decided` preenchido: use, e diga em uma linha o produto e os motivos.
- `decided` vazio (saída 3): pergunte com AskUserQuestion. As opções são os candidatos com `has_canvas: true`, na ordem da pontuação, com os motivos na descrição. Pare até a resposta.

`PRODUCT` é o produto escolhido e `ARTIFACT="$PD/canvas/$PRODUCT/artifact"`.

### 2.2 Jornadas e telas

`python3 "$SCRIPTS/design_source.py" routes --pd "$PD" --product "$PRODUCT"` liga rota do app, página do canvas e especificação. Resolva o escopo nesta ordem:

1. argumento de jornada ou rota: pela tabela de rotas ou pelo número, chave ou nome da página;
2. sem argumento: os arquivos alterados na branch (`git diff --name-only $(git merge-base origin/<branch padrão> HEAD)` mais os não commitados). Leve os arquivos de rota (`src/app/**`, `app/**`) e os componentes usados por elas até as rotas, e as rotas até as páginas do canvas;
3. nada mapeado (branch padrão, diff sem tela, rota sem linha na tabela): pergunte com AskUserQuestion qual jornada verificar, com as páginas de `products/$PRODUCT/pages.json` e o status de cada uma. Pare até a resposta.

Diga o escopo em uma linha (rotas, páginas) antes de capturar. Depois:

```bash
python3 "$SCRIPTS/design_source.py" boards --pd "$PD" --product "$PRODUCT" --page <página> [--page <página>] > "$RUN/boards.json"
```

Leia todos os documentos de `docs` de cada página, mais `handoff/routes.md`, `handoff/states.md`, `decisions/decided.md` e, quando a tela usa o casco ou um componente do produto, o README dele em `components/`.

## 3. Matriz de verificação

Antes de abrir o navegador, escreva `$RUN/checks.json` com tudo o que a rodada precisa provar:

1. **Telas**: cada quadro de tela do escopo, em cada plataforma e tema. Quadros de documentação (abertura, seção, nota para quem desenvolve) não entram. Estado que só existe num quadro-galeria (`*-states.dc.html`) ou num `*-flows.json` entra pelo componente de tela: `python3 "$SCRIPTS/design_source.py" props --pd "$PD" --product "$PRODUCT" --component <screen-...>` lista os estados.
2. **Fluxos**: a sequência de cada fluxo (`*-flows.json`, ou os quadros numerados `-1-<plataforma>-1`, `-2`, ...), a rota esperada de cada etapa (`routes.md`) e a ação que leva de uma à outra.
3. **Casos de uso e estados**: uma linha por regra escrita na especificação (`spec.md`, `*-copy.md`, `states.md`): a condição, o que a tela mostra, o texto exato, o que grava e quando. Com `caminho:linha`.

Só entra o que está escrito no product-design.

## 4. Subir o app

1. Procure como o próprio projeto testa no navegador (alvo `test-browser` ou parecido, `e2e/`): ele mostra o servidor, a API falsa, a conta de teste e como o tema é escolhido. Copie esse arranjo. No erural-mkp-app, por exemplo, é o export (`make build`) servido pelo `server/server.mjs` com `EXPO_PUBLIC_API_URL` apontando para `node e2e/fake-api.mjs <porta>`.
2. Veja se a web já responde (`curl -s -o /dev/null -w '%{http_code}' --max-time 3`). Se não, suba os servidores em segundo plano e espere responder. Pare todos no fim.
3. Descubra a API (`.env*`, `app.config.*`, `app.json`). Produção: pare e pergunte. Com a API falsa local do projeto, ponha a origem dela em `app.allowWritesTo`: escrever nela não grava nada real.
4. Tema: descubra como o app escolhe (esquema do sistema ou escolha guardada) e reproduza no plano (`theme` emula o esquema; `localStorage` grava a escolha antes de a página abrir).
5. Telas que exigem sessão: use a conta de teste da API falsa ou peça ao usuário para exportar as variáveis da conta de teste (por exemplo `TEST_CPF` e `TEST_PASSWORD`). Sem nenhuma das duas, essas telas ficam `not_verified`.

## 5. Capturar

Escreva `$RUN/plan.json`:

- `designShots`: um por quadro ou estado, por plataforma e tema;
- `flows`: um por fluxo e combinação de plataforma e tema, com os mocks de cada variação e um `shot` em cada etapa que tem quadro. Tela isolada é um fluxo de dois passos (`goto` e `shot`). O viewport é o do quadro (`w` e `h` em `boards.json`).

Capture o design primeiro: a sonda dele diz como montar os fluxos do app.

- **Área segura no celular.** Quadro de celular costuma desenhar a barra de status e o indicador de início, e o app soma a área segura do aparelho, que na web é zero. Leia `edges.top` na sonda do print de design (altura da barra de status) e confirme a altura do bloco do indicador de início no print. Ponha as duas em `safeArea` nos fluxos de celular: o app passa a se posicionar como no aparelho.
- **Estado reproduzido como no quadro.** Digite o mesmo que o quadro mostra (código parcial, CPF inválido do exemplo) para a comparação não acusar diferença de dado.
- **Tempo.** Estado que depende de espera (reenvio liberado, contagem) usa `fakeTimers: true` e o passo `advanceTime`.
- **Limites da API falsa.** API falsa que limita tentativas por tempo pode aceitar um relógio por cabeçalho (`requestHeaders`); sem isso, reinicie a API falsa entre rodadas.

```bash
node "$SCRIPTS/capture.mjs" "$RUN/plan.json"
```

Depois:

1. Abra os prints do app (Read mostra a imagem) e confira que cada um é a tela certa e pronta: sem carregando, sem página de erro, sem login no lugar. Print errado é problema do plano (espera, mock, sessão): corrija e rode de novo só aquele fluxo.
2. Passo que falhou: descubra se o roteiro errou (seletor, espera) ou se o app diverge. Corrija o roteiro e rode de novo uma vez. Só então a falha vira achado de fluxo, com o print `__fail` e o registro do passo como evidência.
3. `blockedWrites` no fluxo: a tela tentou gravar. Quando o estado esperado depende da resposta, crie o mock pelo contrato.

## 6. Comparar

Escreva `$RUN/pairs.json`, um par por print de design com o print equivalente do app. Em `ignore`, ponha o que o quadro desenha do aparelho e o app não tem na web (barra de status, indicador de início, teclado nativo; meça no print do design) e as áreas de dado dinâmico, e anote o motivo de cada caixa. Com a área segura emulada, fixe `offset: [0, 0]`: o que sobra de deslocamento é diferença real. Sem ela, o alinhamento automático compensa o cromo, mas esconde deslocamentos de verdade.

```bash
node "$SCRIPTS/compare.mjs" run "$RUN/pairs.json"
```

Para cada par, leia `compare/<par>.json` e abra o `side-by-side.png` e os recortes dos `issues`. Para cada diferença:

1. confirme no recorte que ela é real. Antes de afirmar comportamento, prove no navegador: alvo de toque é a área que responde ao toque (`tap` na sonda), não a caixa desenhada; cor diferente logo depois de um clique pode ser o hover; o código do app costuma explicar a intenção (leia o arquivo antes de acusar);
2. agrupe por causa (rules.md, 2.4 e 2.5);
3. descarte o que rules.md, seção 3, diz que não é achado, anotando o motivo;
4. região de pixel sem diferença de elemento: olhe o recorte da região e decida pelo que se vê.

`offsetSource` com poucos textos iguais significa alinhamento pouco confiável: meça o deslocamento nos prints, passe `offset` no par e rode de novo.

## 7. Fluxos e casos de uso

Preencha `status` e `evidence` de cada linha de `checks.json` com o que a rodada mostrou: passos do fluxo (`capture.json#<fluxo>`), requisições (método, caminho, corpo sem dado sensível) e prints. `fail` aponta o id do achado; `not_verified` diz o motivo e o que destravaria.

## 8. Classificar e recomendar

Escreva cada achado em `$RUN/findings.json`:

- `category`, `severity`, `reach` e `path` pelas tabelas de `scales.md`, a partir do que foi observado;
- `design_ref`: o quadro e, quando houver regra escrita, o `doc` com `caminho:linha` no product-design;
- `expected` e `observed` com os valores medidos, e `measure` com as linhas de `diffs`;
- `evidence`: recortes, lado a lado, `capture.json#<fluxo>`;
- `cause`: o arquivo e a linha do app que produzem a diferença. Procure (Grep) pelo texto, pelo componente ou pelo estilo. Sem localizar, deixe vazio;
- `recommendation`: a correção mais viável é a menor mudança que deixa o app igual ao design, com token e componente do Design System em vez de valor fixo. Diga onde e o custo pela tabela. Nunca recomende mudar o design para ficar igual ao app.

Contradição entre fontes do product-design, ou estado que o app precisa e o design não desenhou: `kind: design_gap`, com `question`.

```bash
python3 "$SCRIPTS/findings.py" check --in "$RUN/findings.json" --run "$RUN" --pd "$PD" --artifact "$ARTIFACT" --out "$RUN/final.json"
```

Saída 2 é formato inválido: corrija e rode de novo. Achado rejeitado (sem fonte ou sem evidência) não volta à mão: ou ganha fonte e evidência reais, ou fica fora. A prioridade é a do script.

## 9. Relatório

Escreva `$RUN/report.md` a partir de `final.json`, `checks.json`, `capture.json` e `compare/summary.json`, seguindo `references/report-template.md`. Imagens com caminho relativo ao relatório.

Regras de escrita do relatório:

- português do começo ao fim. Identificador, caminho, comando e nome de componente ficam como estão;
- sem travessão;
- nenhum número que não veio da medição, do registro do fluxo ou do product-design.

No chat, responda com o caminho do relatório, o veredito, a contagem por prioridade, uma linha para cada P0 e P1 e o que ficou sem verificar. Se você subiu o servidor do app, pare-o. Nada é corrigido nem publicado sem pedido.
