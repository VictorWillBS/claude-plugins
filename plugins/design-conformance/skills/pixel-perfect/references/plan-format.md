# Formatos dos arquivos da rodada

Todos ficam em `$RUN`. Os valores entre `<>` são preenchidos na rodada.

## plan.json (entrada do `capture.mjs`)

```json
{
  "out": "<RUN>",
  "scale": 1,
  "design": {"artifact": "<PD>/canvas/<produto>/artifact", "support": "<PD>/tools/qa/assets"},
  "designShots": [
    {"id": "<tela>.<plataforma>.<tema>.design", "board": "<quadro>.dc.html", "theme": "light"},
    {"id": "<tela>.<plataforma>.<tema>.design", "component": "<screen-...>", "props": {"screen": "<estado>", "layout": "mobile"}, "viewport": [390, 844], "theme": "dark"}
  ],
  "app": {"baseURL": "<origem do app>", "allowWrites": false, "allowWritesTo": ["<origem da API falsa local>"], "settleMs": 400,
          "locale": "pt-BR", "timezoneId": "America/Sao_Paulo", "mocks": [], "requestHeaders": [], "localStorage": {}, "safeArea": null},
  "flows": [
    {"id": "<fluxo>.<plataforma>.<tema>", "viewport": [390, 844], "theme": "light", "clock": "<data ISO, opcional>",
     "fakeTimers": false, "safeArea": {"top": 47, "bottom": 34}, "localStorage": {"<chave>": "<valor>"},
     "requestHeaders": [{"url": "<glob>", "headers": {"<nome>": "<valor>"}}],
     "storageState": "<arquivo de sessão, opcional>", "mocks": [], "steps": []}
  ]
}
```

Os valores de `safeArea` acima são os do quadro de celular do erural-mkp (barra de status de 47px, indicador de início de 34px); meça os do quadro que estiver comparando.

- `board`: um quadro do canvas, no tamanho registrado em `canvas.json`.
- `component` e `props`: um estado de um componente de tela, renderizado num quadro gerado no mesmo formato dos quadros do canvas. Exige `viewport`. Use quando o estado só existe dentro de um quadro-galeria (`*-states.dc.html`) ou num `*-flows.json`. `design_source.py props` lista os estados de cada componente.
- `theme: "dark"`: no design, usa a prop `theme` do quadro; no app, emula `prefers-color-scheme: dark`.
- `clock`: fixa a data do app, para prazo e contagem regressiva baterem com o quadro.
- `fakeTimers`: troca os temporizadores da página por um relógio controlado; com ele, o passo `advanceTime` avança o tempo disparando cada temporizador quantas vezes ele dispararia (uma contagem de 1 em 1 segundo anda de verdade).
- `safeArea`: emula a área segura do aparelho (`env(safe-area-inset-*)`) pelo DevTools do Chromium, antes de a página abrir. Use nos fluxos de celular quando o quadro desenha a barra de status e o indicador de início.
- `localStorage`: chaves gravadas antes de qualquer script da página, para escolhas guardadas como o tema.
- `requestHeaders`: cabeçalhos acrescentados às requisições que casam com o `url`, sem passar pelo CORS da página (por exemplo, o relógio de uma API falsa).
- `allowWritesTo`: origens que podem receber escrita mesmo sem mock. Só a API falsa local do projeto.
- `id`: letras, números, ponto, hífen e sublinhado. Convenção: `<tela>.<plataforma>.<tema>.design` e `.app`, e o par com o mesmo prefixo.
- `headless: false` no topo abre o navegador visível, para depurar um fluxo.

### Passos do fluxo

| Passo | Exemplo | O que faz |
|---|---|---|
| `goto` | `{"goto": "/sign-in"}` | abre a rota e espera a rede assentar |
| `click` | `{"click": {"role": "button", "name": "Entrar"}}` | clica |
| `fill` | `{"fill": {"label": "CPF", "value": "$TEST_CPF"}}` | preenche. `$NOME` lê a variável de ambiente, e o valor nunca vai para o registro |
| `type` | `{"type": {"label": "Código", "value": "$TEST_CODE"}}` | digita tecla a tecla (campos com máscara) |
| `press` | `{"press": "Enter"}` ou `{"press": {"label": "CPF", "key": "Tab"}}` | aperta uma tecla |
| `check`, `hover`, `focus` | alvo como no `click` | marca, passa o mouse, foca |
| `select` | `{"select": {"label": "Estado", "value": "SP"}}` | escolhe opção |
| `scroll` | `{"scroll": 600}` | rola a página até a altura dada |
| `wait` | `{"wait": 500}` | espera em milissegundos |
| `advanceTime` | `{"advanceTime": 61000}` | avança o relógio simulado (exige `fakeTimers: true`) |
| `back`, `reload` | `{"back": true}` | voltar do navegador, recarregar |
| `offline` | `{"offline": true}` | corta a rede (estado sem internet) |
| `waitForURL` | `{"waitForURL": "/sign-up/phone"}` | espera chegar na rota |
| `expectURL` | `{"expectURL": "/sign-up/*"}` | confere a rota atual (`*` um segmento, `**` vários; sem `/` no início, é expressão regular) |
| `expectVisible`, `expectHidden` | `{"expectVisible": {"text": "Código incorreto"}}` | confere presença ou ausência |
| `expectText` | `{"expectText": "Acesso pausado"}` | texto visível, contendo |
| `expectRequest` | `{"expectRequest": {"method": "PATCH", "url": "/v1/workspace/profile$"}}` | houve a requisição (expressão regular na URL) |
| `saveStorageState` | `{"saveStorageState": "<RUN>/state/session.json"}` | guarda a sessão para outro fluxo usar em `storageState` |
| `shot` | `{"shot": "<id>"}` ou `{"shot": {"id": "<id>", "fullPage": true}}` | grava o print e a sonda |

Alvo: `{"role", "name"}`, `{"label"}`, `{"placeholder"}`, `{"text"}`, `{"testId"}` ou `{"css"}`. `"exact": false` aceita conter; `"nth": 1` escolhe entre vários. Prefira papel e nome: é o que a pessoa vê e o que o leitor de tela anuncia.

Todo passo aceita `"optional": true` (a falha não para o fluxo) e `"timeout"` em milissegundos. Falha num passo obrigatório para o fluxo e grava o print `<fluxo>__fail`.

### Mocks

```json
{"method": "POST", "url": "**/v1/auth/session", "status": 423, "json": {"reason": "locked", "retry_after": 900}}
{"method": "POST", "url": "**/<caminho>", "responses": [{"status": 422, "json": {}}, {"status": 200, "json": {}}], "delay": 1500}
```

`responses` responde em sequência e repete a última. `delay` segura a resposta, para mostrar o estado carregando. Em `app.mocks` vale para todos os fluxos; em `flow.mocks`, só para aquele. O corpo segue o contrato do `handoff/api.md` e do OpenAPI do backend: o exemplo acima usa o motivo `locked` e o campo `retry_after` porque é o que o `login-copy.md` documenta.

### Saída

- `shots/<id>.png` e `shots/<id>.json`: o print e a sonda. A sonda traz os textos, controles e ícones visíveis, cada um com caixa e estilo calculado; em cada controle, `tap` é a área que de fato responde ao toque (medida ponto a ponto); e `edges` lista as alturas dos blocos de largura total colados no topo e na base (no quadro de celular, a barra de status e o indicador de início).
- `capture.json`: os prints e, por fluxo, cada passo com `ok` e `error`, as requisições com status e marca `mocked` ou `blocked`, as escritas bloqueadas e os erros de console. Rodar de novo acrescenta; o mesmo id substitui.

Saída 1: algum print de design falhou (`exception` no `capture.json`). Saída 2: plano inválido.

## pairs.json (entrada do `compare.mjs`)

```json
{"dir": "<RUN>", "pairs": [
  {"id": "<tela>.<plataforma>.<tema>", "design": "<id do print de design>", "app": "<id do print do app>",
   "ignore": [[0, 0, 390, 48]], "offset": null, "threshold": 0.1}
]}
```

- `ignore`: caixas `[x, y, largura, altura]` em coordenadas do design que ficam fora da comparação. Meça no print do design, nunca use uma altura de memória. Cada caixa vai para o relatório com o motivo.
- `offset`: `[dx, dy]` do app em relação ao design. Sem ele, vale a mediana do deslocamento dos textos iguais, e `offsetSource` diz quantos textos sustentaram o cálculo.
- `threshold`: sensibilidade da diferença de pixel (padrão 0.1).

Saída em `compare/<par>.json`:

- `offset`, `offsetSource`, `heightDelta` (altura do print do app menos a do design);
- `pixels`: pixels diferentes, comparados e a razão;
- `regions`: caixas onde os pixels diferem, com recorte;
- `elements.issues`: cada diferença de elemento, com `kind` (`text_style`, `text_changed`, `text_missing`, `text_extra`, `control_style`, `control_missing`, `control_extra`, `icon_missing`, `icon_extra`), as caixas no design e no app, `diffs` com o valor de cada lado e o recorte em `crop`. `icon_*` tem confiança baixa: confirme no recorte.

Imagens em `compare/<par>/`: `side-by-side.png` (Design, App, Diferença), `diff.png` e `crops/`. `compare/summary.json` resume todos os pares.

Recorte sob medida para um achado:

```bash
node "$SCRIPTS/compare.mjs" crop "$RUN" <par> <nome> x,y,w,h [x,y,w,h no app]
```

## checks.json (cobertura)

```json
{"checks": [
  {"id": "<id>", "kind": "screen|flow|use_case|state", "source": "<caminho:linha ou quadro no product-design>",
   "what": "<o que o design define>", "how": "<fluxo, par ou requisição que verifica>",
   "status": "ok|fail|not_verified|not_implemented|out_of_scope",
   "evidence": ["capture.json#<fluxo>", "compare/<par>/side-by-side.png"], "finding": "<id do achado quando fail>", "reason": "<quando não verificado>"}
]}
```

## findings.json (entrada do `findings.py`)

```json
{"findings": [
  {"id": "<slug>", "kind": "deviation", "title": "<o que diverge, em uma frase>",
   "category": "<categoria>", "severity": "<gravidade>", "reach": "screen|journey|global", "path": "happy|variation",
   "screens": ["<id do par ou do fluxo>"],
   "design_ref": {"board": "<quadro>.dc.html", "doc": "<caminho no product-design>:<linha>"},
   "expected": "<o que o design define, com o valor medido no design>",
   "observed": "<o que o app faz, com o valor medido no app>",
   "measure": [{"prop": "<propriedade>", "design": "<valor>", "app": "<valor>"}],
   "evidence": ["compare/<par>/crops/<recorte>.png", "capture.json#<fluxo>"],
   "cause": "<arquivo do app>:<linha>",
   "recommendation": {"action": "<a correção>", "where": "<arquivo>:<linha>", "cost": "low|medium|high"}},
  {"id": "<slug>", "kind": "design_gap", "title": "<a contradição ou o que falta no design>", "screens": ["<id>"],
   "design_ref": {"board": "<quadro>", "doc": "<caminho>:<linha>"}, "expected": "<o que cada fonte diz>",
   "observed": "<o que o app faz>", "evidence": ["<arquivo>"], "question": "<a pergunta para o time de design>"}
]}
```

`design_ref` precisa de `board` ou `doc`; os dois quando houver. `evidence` aceita caminhos relativos a `$RUN` e `capture.json#<fluxo>`.

Saída do `findings.py check` em `final.json`: `findings` com `priority` e ordenados, `design_gaps`, `rejected` (com o motivo) e `counts` por prioridade. Saída 2: formato inválido.
