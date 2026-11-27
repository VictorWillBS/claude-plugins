# Verificação de design: {jornada ou tela} ({branch})

## Resumo

- **Veredito**: {Conforme / Conforme com ressalvas / Não conforme}
- **Repositório**: `{repo}`, branch `{branch}` (commit `{sha curto}`), rodando em `{origem}` com {a API falsa do projeto / a API de {ambiente} / mocks}
- **Product-design**: `products/{produto}`, referência `{ref}` (commit `{sha curto}` de {data}). Páginas: {número e nome} ({status em pages.json})
- **Escopo**: {o que foi verificado e como foi decidido: argumento, diff da branch ou resposta do usuário}
- **Cobertura**: {n} telas, {n} fluxos e {n} regras. ok {n} | com achado {n} | não verificado {n} | não implementado {n}
- **Achados**: {total}. P0 {n} | P1 {n} | P2 {n} | P3 {n}. Lacunas de design {n}. Rejeitados pelo verificador {n}

{Uma frase sobre o que limitou a rodada, por exemplo telas que exigem sessão sem conta de teste. Sem limitação, omita.}

## Telas comparadas

| Tela | Plataforma | Tema | Pixels diferentes | Achados | Comparação |
|---|---|---|---|---|---|
| {tela} | {celular / desktop} | {claro / escuro} | {razão em %} | {ids} | [lado a lado]({compare/<par>/side-by-side.png}) |

## Achados

{Na ordem de final.json: prioridade, depois gravidade.}

---

### {P0} {título}

| Prioridade | Gravidade | Categoria | Alcance | Caminho | Telas |
|---|---|---|---|---|---|
| {P0} | {Crítica} | {Fluxo} | {Tela} | {Caminho feliz} | {pares ou fluxos} |

**Design (a lei).** {O que o design define, com os valores do design.} Fonte: `{quadro}`, `{documento:linha}`.

**App.** {O que o app faz, com os valores medidos, e em que rota.}

| Propriedade | Design | App |
|---|---|---|
| {propriedade} | {valor} | {valor} |

![Design e app]({recorte})

{Para fluxo: os passos até a falha, o passo que falhou com o erro, e o print `__fail`.}

**Impacto.** {O que muda para quem usa a tela.}

**Causa provável.** `{arquivo:linha}`: {por que esse código produz a diferença}. {Sem localizar: "Não localizada no código."}

**Correção recomendada.** {A ação, em `{onde}`.} Custo {baixo / médio / alto}: {o que pesa}. {Por que é a mais viável: a menor mudança que deixa o app igual ao design, com token ou componente do Design System.}

---

## Fluxos

| Fluxo | Plataforma | Tema | Passos | Resultado | Registro |
|---|---|---|---|---|---|
| {nome} | {celular} | {claro} | {n de m} | {ok / parou em: passo} | `capture.json#{fluxo}` |

## Casos de uso e estados

| Regra | Fonte | Status | Evidência |
|---|---|---|---|
| {o que o design define} | `{documento:linha}` | {ok / achado {id} / não verificado} | {print ou registro} |

## Lacunas de design

{Uma entrada por lacuna. Sem nenhuma, omita a seção.}

- **{título}**: {o que diz cada fonte, com as citações}. O app hoje: {o que faz}. Pergunta para o design: {question}.

## Não verificado

{Sem nenhum, omita a seção.}

- **{item}**: {motivo}. Para verificar: {o que falta}.

## Apêndice

### Regiões ignoradas e alinhamento

{Por par: cada caixa ignorada com o motivo, e o deslocamento usado com a origem (`offsetSource`).}

### Mocks usados

{Por fluxo: método, caminho, status e o motivo da resposta, com a fonte do contrato.}

### Descartados na confirmação

{Diferenças medidas que caíram ao serem provadas no navegador ou explicadas pelo código (alvo de toque maior que a caixa, hover, dado de exemplo), cada uma com a prova. Sem nenhuma, omita.}

### Rejeitados pelo verificador

{Uma linha por achado rejeitado pelo `findings.py`, com o motivo. Sem nenhum: "Nenhum."}

### Como reproduzir

```bash
node "{SCRIPTS}/capture.mjs" "{RUN}/plan.json"
node "{SCRIPTS}/compare.mjs" run "{RUN}/pairs.json"
python3 "{SCRIPTS}/findings.py" check --in "{RUN}/findings.json" --run "{RUN}" --pd "{PD}" --artifact "{ARTIFACT}" --out "{RUN}/final.json"
```
