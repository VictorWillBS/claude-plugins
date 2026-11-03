# Escalas

Os valores entre crases são os que vão no JSON. O relatório usa os rótulos em português.

Estas escalas são ponto de partida. Calibre com rodadas reais antes de confiar nelas, e mude aqui e no `check_dossier.py` ao mesmo tempo.

## Veredito de veracidade

| Valor | Rótulo | Exige |
|---|---|---|
| `confirmed` | Confirmado | execução que rodou, artefato em disco, critério de confirmação registrado atingido |
| `partial` | Parcial | o mesmo que `confirmed`, mais `partial_condition` nomeando a condição mais estreita em que o achado vale |
| `withstood` | Resistiu | toda tentativa de refutação ancorada falhou, sem reprodução direta |
| `refuted` | Refutado | `counter_evidence` com `caminho:linha` e o que aquele código mostra |
| `inconclusive` | Inconclusivo | `inconclusive_reason`: o que impediu o teste |

`confirmed`, `partial` e `withstood` seguem como reais. `inconclusive` continua de pé, mas não é classificado: vai para uma seção própria com o que faltou.

## Origem

| Valor | Rótulo | Como se decide |
|---|---|---|
| `new` | Novo | o mecanismo não existe na base, ou o experimento só reproduz no head |
| `aggravated` | Agravado | existe na base, mas a PR amplia o alcance ou o efeito |
| `pre_existing` | Pré-existente | existe na base com o mesmo alcance e efeito |

`origin_method` diz como foi decidido: `control` (mesmo experimento rodado na base) ou `history` (`git blame` e leitura da base). `control` vale mais.

## Escopo da história

| Valor | Rótulo |
|---|---|
| `in` | Dentro |
| `partial` | Parcial (diga qual metade está fora) |
| `out` | Fora (diga para onde vai) |
| `unknown` | Não avaliado (rodada sem história resolvida) |

## Tipo

`logic`, `security`, `data`, `performance`, `contract`, `test`, `observability`, `interface`, `convention`.

Rótulos: Lógica, Segurança, Dados, Desempenho, Contrato, Teste, Observabilidade, Interface, Convenção.

## Gravidade (impacto quando acontece)

| Valor | Rótulo | Critério |
|---|---|---|
| `critical` | Crítica | perda ou corrupção de dados, vazamento entre clientes, falha de segurança explorável, valor financeiro errado |
| `high` | Alta | fluxo principal quebrado para um grupo de usuários, erro sem recuperação |
| `medium` | Média | comportamento incorreto com contorno, lentidão medida em fluxo real |
| `low` | Baixa | convenção, legibilidade, cosmético |

Gravidade mede o impacto de uma ocorrência. Frequência e porte entram na prioridade, não aqui.

## Prioridade (calculada pelo script)

| Valor | Significado |
|---|---|
| `P0` | corrigir antes do merge |
| `P1` | corrigir nesta PR, ou abrir história urgente quando não couber nela |
| `P2` | história ou PR própria, planejada |
| `P3` | registrar, sem ação agora |

O `check_dossier.py prioritize` calcula assim, nesta ordem:

1. Ponto de partida pela gravidade: `critical` P0, `high` P1, `medium` P2, `low` P3.
2. `pre_existing`: desce um nível. A PR não causou, então não segura o merge.
3. Escopo `out`: no mínimo P2.
4. `anticipated`: no mínimo P2. `oversized`: P3. Os dois não se aplicam a gravidade `critical`, porque escala reduz probabilidade, nunca impacto.
5. O resultado fica entre P0 e P3.

## Custo x benefício

| Campo | Valores | O que considerar |
|---|---|---|
| `cost` | `low`, `medium`, `high` | tamanho da mudança, área de risco (migração, contrato público, fluxo financeiro), teste novo necessário, chance de regressão |
| `benefit` | `low`, `medium`, `high` | risco removido: gravidade vezes alcance real |
| `recommendation` | `apply_now`, `apply_later`, `not_worth` | Aplicar nesta PR, Aplicar depois, Não compensa |

Use a solução proporcional (`solution_proportionality`) para estimar o custo, não a sugestão original quando ela for desproporcional. Um P0 sempre é `apply_now`: o script recusa outra combinação.
