# Crítica dos achados: {TÍTULO DA PR ou branch}

## Resumo

- **Rodada criticada**: `{caminho da rodada}` (commit `{reviewed_commit curto}`, base `{base curta}`)
- **História**: {referência resolvida} / não avaliada
- **Achados**: {total} | Confirmados {n} | Parciais {n} | Resistiram {n} | Refutados {n} | Inconclusivos {n}
- **Superdimensionados**: {n} | **Antecipados**: {n}
- **Dados reais usados**: {n fatos, com a data mais antiga} / nenhum
- **Recomendação**: {quantos aplicar nesta PR, depois, não compensa}

{Uma frase quando o ambiente limitou a crítica, por exemplo: aplicação local fora do ar, Playwright ausente. Sem limitação, omita.}

## Achados reais

{Confirmados, Parciais e Resistiram, ordenados por prioridade (P0 primeiro) e, dentro dela, por gravidade.}

---

### {TÍTULO}

| Gravidade | Prioridade | Tipo | Origem | Escopo | Proporcionalidade |
|---|---|---|---|---|---|
| {Alta} | {P1} | {Dados} | {Novo} | {Dentro} | {Proporcional} |

**Descrição.** {O processo: quem dispara, o que o sistema faz, em que ponto a lógica falha e o que sai errado para quem usa. Fale do comportamento, não da linha. Cite arquivo só quando ajudar a localizar.}

**Hipótese.** {h1} **Nula:** {h0}

**Método e prova.** {Método escolhido e por quê, em uma ou duas frases.} Observado: {observed}. Esperado se não fosse real: {expected}. Na base: {control_observed, ou "controle não rodou: motivo"}. Evidência em `{artefatos}`.

**Tentativas de refutação.**
- {âncora}: {o que foi tentado} -> {por que não derrubou}

**Escala.** {Só quando houver premissa de escala: a premissa, o limiar, o fato real com origem e data, e a conclusão.}

**Veredito.** {Confirmado / Parcial: condição / Resistiu} (confiança {alta/média/baixa}). {Desvios do plano, quando houver.}

**Custo x benefício.** Custo {baixo/médio/alto}: {o que pesa}. Benefício {baixo/médio/alto}: {o risco removido}. **{Aplicar nesta PR / Aplicar depois / Não compensa}.** {Quando a sugestão original for desproporcional: "Correção proporcional: {solução}".}

---

## Inconclusivos

{Uma entrada por achado, com o que impediu o teste e o que destravaria. O achado continua de pé.}

- **{TÍTULO}**: {inconclusive_reason}. Para decidir: {o que falta}.

{Sem nenhum: omita a seção.}

## Refutados

- **{TÍTULO}**: {counter_evidence.shows} (`{counter_evidence.anchor}`). Método: {resumo}.

{Sem nenhum: omita a seção.}

## Apêndice

### Planos registrados

{Uma linha por achado: `{id}`: confirma se {confirm_if}; refuta se {refute_if}. Plano em `{registered_at}`.}

### Ajustes do verificador

{Uma linha por ajuste feito pelo `check_dossier.py` (`{id}` ({motivo}): {de} -> {para}). Sem ajustes: "Nenhum ajuste."}

### Fatos de produção e staging

{Uma linha por fato usado: pergunta, resposta, ambiente, data. Sem nenhum: omita a seção.}
