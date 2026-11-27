# Escalas

Os valores entre crases são os do JSON. O relatório usa os rótulos em português. Mudou uma escala aqui, mude também o `findings.py`.

## Categoria

| Valor | Rótulo | O que cobre |
|---|---|---|
| `flow` | Fluxo | ordem das etapas, destino de cada ação, voltar, sair, rota de cada etapa (`handoff/routes.md`) |
| `use_case` | Caso de uso | regra de comportamento da especificação: validação, condição, o que grava e quando, o que acontece em cada resposta da API |
| `state` | Estado | carregando, vazio, falha, sem internet, erro de campo, folha ou diálogo de erro, estados de página inteira |
| `copy` | Texto | texto, pontuação, maiúscula, formato de número, moeda, data e prazo |
| `layout` | Layout | posição, tamanho, espaçamento, alinhamento, ordem, quebra de linha, rolagem |
| `typography` | Tipografia | família, tamanho, peso, altura de linha, espaçamento entre letras |
| `color` | Cor | cor de texto, fundo, borda, tema claro e escuro |
| `component` | Componente | peça diferente da especificada (Design System ou componente do produto), variante, ícone, imagem |
| `interaction` | Interação | foco, teclado, hover, toque, desabilitado, carregando no botão |
| `accessibility` | Acessibilidade | contraste, alvo de toque, nome acessível, ordem de leitura (`.claude/rules/accessibility.md` do product-design) |

## Gravidade

Mede o impacto de uma ocorrência para quem usa, decidido pelo que foi observado.

| Valor | Rótulo | Critério |
|---|---|---|
| `critical` | Crítica | a pessoa não conclui o fluxo como desenhado, ou o app faz o que a especificação proíbe: etapa ausente ou fora de ordem, ação principal sem efeito ou com destino errado, regra de negócio violada, valor errado (preço, prazo, quantidade), erro sem saída, gravação diferente da especificada |
| `high` | Alta | tela, estado ou variação desenhada que falta num fluxo implementado; texto que muda o sentido ou a ação; componente diferente na ação principal; layout quebrado numa largura desenhada (sobreposição, corte, rolagem horizontal); violação das regras de acessibilidade do product-design; tema escuro desenhado que não funciona |
| `medium` | Média | diferença visível sem perda de função: família, tamanho, peso ou altura de linha da fonte; cor fora do valor do design; raio, borda ou sombra; ícone diferente; posição ou tamanho com 3px ou mais de diferença; ordem de elementos secundários; palavra diferente sem mudar o sentido |
| `low` | Baixa | posição ou tamanho com 1 a 2px de diferença; pontuação ou maiúscula; diferença só visível no recorte ampliado |

Limiares sobre o que o `compare.mjs` mede:

| Medida | Baixa | Média | Alta |
|---|---|---|---|
| posição (`x`, `y`) e tamanho (`width`, `height`) | 1 a 2px | 3px ou mais | sobreposição, corte ou saída da tela |
| `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing` | | qualquer diferença | |
| cor (acima da tolerância de 2 por canal) | | qualquer diferença | texto que passa a falhar o contraste AA |
| `lines` (quebra de linha) | | qualquer diferença | texto cortado |
| altura de controle | | | abaixo de 44px quando o design tem 44px ou mais |
| `text_changed` | pontuação ou maiúscula | palavra diferente, mesmo sentido | sentido ou ação diferente |
| `text_missing`, `control_missing` | | elemento secundário | ação, título ou mensagem de erro |

A tabela da gravidade vence o limiar quando os dois discordam: um deslocamento de 2px que sobrepõe dois textos é alta.

## Alcance (`reach`)

| Valor | Rótulo | Quando |
|---|---|---|
| `screen` | Tela | uma tela |
| `journey` | Jornada | várias telas da mesma jornada |
| `global` | Global | casco, componente compartilhado ou token: aparece em toda tela que usa a peça |

## Caminho (`path`)

| Valor | Rótulo | Quando |
|---|---|---|
| `happy` | Caminho feliz | a sequência principal do fluxo (grupo "Caminho feliz" do `*-flows.json`, ou os quadros `-1-` numerados) |
| `variation` | Variação | erros, estados e caminhos alternativos |

## Prioridade (calculada pelo `findings.py`)

| Valor | Significado |
|---|---|
| `P0` | corrigir antes do merge |
| `P1` | corrigir nesta entrega |
| `P2` | planejar em história ou PR própria |
| `P3` | registrar, sem ação agora |

Cálculo, nesta ordem:

1. ponto de partida pela gravidade: `critical` P0, `high` P1, `medium` P2, `low` P3;
2. `high` no caminho feliz vira P0;
3. alcance `global` sobe um nível;
4. o resultado fica entre P0 e P3.

Não atribua prioridade à mão.

## Custo da correção

| Valor | Rótulo | O que pesa |
|---|---|---|
| `low` | Baixo | troca de token, texto, prop ou estilo num lugar |
| `medium` | Médio | troca de componente, mudança na estrutura da tela ou em peça compartilhada, com teste novo |
| `high` | Alto | fluxo, navegação, contrato com a API ou estado que ainda não existe no app |

## Veredito da rodada

| Veredito | Quando |
|---|---|
| Conforme | nenhum achado |
| Conforme com ressalvas | só achados P2 e P3 |
| Não conforme | algum achado P0 ou P1 |
