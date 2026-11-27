# Regras

Valem acima de qualquer passo do `SKILL.md`.

## 1. O product-design é a lei

1. A fonte da verdade é o `erural-product-design` na referência fixada no início da rodada: a branch padrão de origin ou a tag ou commit pedido em `--ref`. O que o app, a história, o `CLAUDE.md` do app ou o código dizem não muda o que é certo. Se o app diverge do design, o app está errado.
2. Fontes da lei, todas dentro do product-design:
   - os quadros do canvas (`canvas/<produto>/artifact/*.dc.html`) e os estados dos componentes de tela (`screen-*.dc.html`);
   - a especificação da jornada (`products/<produto>/journeys/<jornada>/`: README, `spec.md`, textos `*-copy.md`, fluxos `*-flows.json`);
   - a entrega (`products/<produto>/handoff/`: rotas, estados padrão, API, glossário, dados);
   - as decisões tomadas (`products/<produto>/decisions/decided.md`);
   - as regras universais (`.claude/rules/*.md` e `design-system/`).
3. Duas fontes do product-design que se contradizem não são resolvidas aqui. Viram **lacuna de design** (`kind: design_gap`), com as duas citações e a pergunta para o time de design. Nunca escolha uma delas.
4. Exceção só existe se estiver escrita no product-design. Uma decisão registrada só no app não desfaz o achado: o achado fica, e a recomendação cita a decisão para quem for levá-la ao design.
5. O relatório registra a referência, o commit e o status de cada página (`pages.json`: "Aprovada em ..." ou "Em andamento"). Página em andamento não rebaixa achado, mas o status aparece no resumo.

## 2. Achado exige fonte e evidência

1. Todo achado cita o design: o quadro (`design_ref.board`) ou o documento com linha (`design_ref.doc`, `caminho:linha`). Sem citação não há achado, há opinião, e opinião não entra no relatório. O `findings.py` rejeita.
2. Todo achado traz evidência gerada na rodada: recorte comparativo, print lado a lado ou o registro do fluxo (`capture.json#<fluxo>`). O `findings.py` rejeita evidência que não existe.
3. "Esperado" vem do design, com o valor medido no design. "Observado" vem do app, com o valor medido no app. Quando a sonda mediu, nunca use valor estimado no olho.
4. Medida não é achado sozinha. Cada diferença do `compare.mjs` é candidata: abra o recorte, confirme que é real e que não é efeito de outra diferença. Um título mais alto empurra tudo o que vem abaixo: o achado é o título, e os deslocamentos entram na descrição dele. Quando a medida descreve comportamento (alvo de toque, foco, estado depois de um clique), prove no navegador antes de afirmar, e leia o código do app: um comentário pode explicar uma escolha que a medida não vê. O que cair nessa prova vai para "Descartados na confirmação" no relatório.
5. Uma causa, um achado. A mesma peça errada em cinco telas é um achado com alcance `journey` ou `global`, não cinco achados.

## 3. O que não é achado

- Dado diferente entre o exemplo do design e o dado real do app (nome do lote, preço, foto, quantidade), desde que o formato siga a regra do product-design (moeda, data, prazo, plural, truncamento). Formato errado é achado de `copy`.
- Cromo de aparelho desenhado nos quadros de celular (barra de status, indicador de início, teclado nativo) quando o app roda na web. Entra em `ignore`, e o relatório diz o que foi ignorado e por quê. A área segura que esse cromo ocupa não se ignora: emule-a (`safeArea`), para o app se posicionar como no aparelho.
- Deslocamento da tela inteira causado por esse cromo quando a área segura não pôde ser emulada e o `offsetSource` mostra que os textos andaram juntos.
- Artefato da captura: hover do mouse depois do clique, animação no meio, dado de exemplo diferente do dado de teste. A captura tira o mouse antes de cada print; o resto se resolve no roteiro, não no relatório.
- Grafismo de marca marcado com `data-audit` no design não fica de fora: o atributo só o tira da auditoria do próprio product-design, e o app ainda tem de seguir o desenho.
- Região de pixel sem diferença de elemento que, no recorte, não mostra nada visível. Quando mostra (ícone, imagem, borda, sombra), é achado pelo que se vê.
- Gosto. "Ficaria melhor se" nunca é achado. Problema do próprio design (contraste baixo no quadro, por exemplo) é lacuna de design, não achado do app.

## 4. O que a web não verifica

Biometria, passkey do sistema, notificação push, vibração, câmera, compartilhamento nativo, teclado nativo e área segura do aparelho. Esses itens ficam `not_verified` com o motivo, e o relatório diz que precisam de verificação no aparelho. Nunca declare conforme o que não foi exercitado.

## 5. Segurança e limites

1. Escrita na API é bloqueada por padrão: o `capture.mjs` aborta POST, PUT, PATCH e DELETE de fetch e XHR sem mock. Para chegar a um estado de erro, use mock com a resposta do contrato (`handoff/api.md` e OpenAPI do backend). A API falsa local do projeto pode ir em `allowWritesTo` sem perguntar, porque nada do que ela grava é real; só origem `localhost` ou `127.0.0.1` entra ali. `allowWrites: true` só com autorização explícita do usuário naquele momento, e nunca contra produção.
2. Antes de usar o app, descubra para qual API ele aponta. Produção: pare e pergunte. Prefira a API falsa do projeto quando existir.
3. Credencial de teste só por variável de ambiente (`"$TEST_CPF"` no plano). Nunca escreva o valor em arquivo, plano, relatório ou mensagem. Os prints mostram o que foi digitado: use só conta de teste.
4. A skill verifica e relata. Não corrige o app, não edita o product-design, não commita e não publica o relatório em nenhum serviço sem pedido explícito.
5. Tudo da rodada fica em `.claude/local/design-conformance/` do repositório comparado, que precisa ser ignorado pelo git.

## 6. Cobertura honesta

1. Todo quadro, fluxo e regra do escopo aparece no relatório com um status: `ok`, `fail` (com o achado), `not_verified` (com o motivo), `not_implemented` ou `out_of_scope`.
2. Dentro de um fluxo implementado, etapa, estado ou variação desenhada que falta no app é achado. Um fluxo inteiro ainda não começado é `not_implemented` na cobertura, não achado.
3. Mock fora do contrato da API invalida o que ele provou. Na dúvida sobre o contrato, o item fica `not_verified`.
