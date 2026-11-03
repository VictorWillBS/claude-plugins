# Proporcionalidade e dados reais

Alguns achados descrevem um problema que só existiria se a aplicação fosse muito maior, mais usada ou mais concorrida do que é, e pedem solução de escala industrial para um software que não tem essa maturidade. O mecanismo pode até existir no código. O que está em dúvida é o impacto.

Esta referência separa as duas coisas: o veredito diz se o mecanismo é real, a proporcionalidade diz se o impacto alegado condiz com o porte real ou planejado do sistema.

## 1. Extrair as premissas de escala

Na crítica lógica, liste cada premissa quantitativa de que o achado depende para causar dano. Exemplos de forma (não de valor):

- volume: "a tabela tem linhas suficientes para a varredura pesar"
- frequência: "o endpoint é chamado com frequência suficiente para o N+1 importar"
- concorrência: "duas requisições alteram o mesmo registro ao mesmo tempo"
- crescimento: "o volume vai crescer até o ponto em que isso pesa"

Cada premissa ganha um **limiar derivado do mecanismo**, nunca chutado. O caminho honesto é medir localmente o custo por unidade (tempo da consulta com N registros, número de queries por item, tamanho da carga) e deixar o número real de produção decidir. Quando o limiar não pode ser derivado, escreva a premissa sem número e diga o que seria preciso medir.

Achado sem premissa de escala recebe `proportionality: not_applicable` e esta referência termina aqui.

## 2. Fontes de porte, nesta ordem

1. **Fatos já coletados** em `.claude/local/review-critic/facts.json` do repo analisado. Cada fato tem data e origem: reutilize sem perguntar de novo e cite a data no relatório.
2. **Medida local** quando ela basta para decidir (por exemplo, o custo cresce linearmente e o dado local já mostra que um item custa pouco).
3. **Maturidade planejada documentada**: história ou spec da rodada, `CLAUDE.md` do projeto, documentação de arquitetura. Vale o que está escrito, não o que parece provável.
4. **Pedido ao usuário**, pelas regras da seção 4.

## 3. Classificar

| `proportionality` | Quando |
|---|---|
| `proportional` | o porte real já atinge o limiar, ou um único evento já causa o dano |
| `anticipated` | o porte real não atinge, mas a maturidade planejada documentada atinge |
| `oversized` | nem o porte real nem o planejado atingem o limiar |
| `not_verified` | faltou dado para decidir |
| `not_applicable` | o achado não depende de escala |

Regras:

- **Classificar como `anticipated` ou `oversized` exige evidência**: um fato com origem ou um trecho de documentação. Sem isso, o script rebaixa para `not_verified` (`no-scale-evidence`). Presumir que a aplicação é pequena é tão inventado quanto presumir que ela é enorme.
- **Escala reduz probabilidade, nunca impacto.** Quando um único evento basta para um dano de gravidade `critical` (vazamento entre clientes, valor financeiro errado, perda de dados), o achado é `proportional`, seja qual for o volume.
- **Solução também tem porte.** Quando o problema é real mas a sugestão é desproporcional (fila distribuída, cache em camadas, particionamento para um volume que cabe numa consulta indexada), registre em `solution_proportionality` qual é a correção do tamanho do problema e use essa no CxB.

## 4. Quando pedir dados ao usuário

O agente nunca pergunta direto: ele devolve `data_requests`, e a skill decide se pergunta. Um pedido só sobrevive se passar nos três filtros:

1. **Decide algo.** O pedido descreve o que acontece com a resposta baixa (`if_low`) e com a resposta alta (`if_high`). Se as duas levam ao mesmo veredito, à mesma proporcionalidade e à mesma prioridade, o pedido cai.
2. **Não tem resposta mais barata.** Fato já coletado, medida local ou documentação respondem antes.
3. **Não é repetido.** Pedidos iguais de achados diferentes viram um só.

Os que sobrevivem saem numa **única mensagem por execução**, numerados, com os comandos prontos. Uma segunda rodada só acontece quando uma resposta abre uma pergunta nova que também passa nos três filtros. O usuário pode responder só parte ou dizer que não tem o dado: pedido sem resposta deixa a premissa `not_verified` e o achado mantém a classificação que tinha sem desconto.

Toda resposta recebida vai para `facts.json` com pergunta, comando, ambiente, resposta, data e origem `usuario`.

## 5. Comandos Rails

Prioridade: `rails console --sandbox`. Antes de escrever o comando, confira no repo a versão do Rails (`Gemfile.lock`) e o adaptador do banco (`config/database.yml`), e escreva para o que o projeto usa.

| Ambiente | Leitura | Escrita |
|---|---|---|
| local | o crítico roda sozinho, com a trava | permitida, preferida para reproduzir cenário, dentro de transação desfeita ao final ou no banco de teste |
| staging | o usuário roda | permitida só em `--sandbox`, depois de checar callbacks, jobs, e-mails e chamadas externas que a escrita dispararia |
| produção | o usuário roda, só leitura | **proibida**, inclusive em `--sandbox` |

Produção é só leitura mesmo em sandbox porque a transação desfeita protege o banco, mas não protege o que sai dele: job enfileirado, e-mail, chamada a serviço externo, trava longa em tabela concorrida.

Todo comando para staging ou produção:

- começa por um cabeçalho em comentário com a pergunta, o ambiente, o modo (leitura ou escrita) e o achado que ele decide;
- em produção, roda dentro de `ActiveRecord::Base.while_preventing_writes { ... }` quando a versão do Rails do projeto oferecer esse método;
- no PostgreSQL, define um tempo limite curto na transação do sandbox (`SET LOCAL statement_timeout`) antes da consulta;
- é limitado: agregado, janela de tempo, `limit`, `pluck` de poucas colunas. Nunca carrega a tabela inteira para a memória;
- devolve só número agregado (contagem, mínimo, média, máximo, percentil). **Nunca** nome, documento, e-mail, telefone ou qualquer dado pessoal;
- prefere estimativa barata quando o banco oferecer e a pergunta tolerar aproximação (por exemplo, `reltuples` no PostgreSQL para tamanho de tabela grande);
- termina com uma linha que imprime o resultado num formato fácil de colar de volta.

Formato do bloco entregue ao usuário:

```ruby
# Pergunta 2: volume diário de <modelo> nos últimos 30 dias
# Ambiente: produção | Modo: leitura | Rodar em: rails console --sandbox
# Decide: <id do achado>. Abaixo de <limiar derivado>, o achado é oversized; acima, proportional.
ActiveRecord::Base.connection.execute("SET LOCAL statement_timeout = '5s'")
ActiveRecord::Base.while_preventing_writes do
  # consulta agregada e limitada
end
```
