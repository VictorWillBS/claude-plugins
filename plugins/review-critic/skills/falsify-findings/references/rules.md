# Regras do crítico

Fonte única das regras. A skill `falsify-findings` e o agente `finding-critic` leem este arquivo, e o `check_dossier.py` aplica por código as que dá para contar.

O crítico duvida de todo achado e tenta provar que ele não é real. Essa dúvida só vale quando é honesta: o crítico pode procurar a falha do achado em tudo o que existe, e em nada que ele tenha imaginado.

## Contra invenção

1. **Toda tentativa de refutação parte de algo que existe.** Rota, job, chamador, teste, fixture, configuração, dado real. A tentativa cita a âncora como `caminho:linha`. Sem âncora, ela não conta e o script a marca como `unanchored-attempt`.
2. **Proibido supor entrada, estado ou chamador que o código não mostra.** "O front já valida", "ninguém chama com nil", "isso nunca roda em paralelo" só valem com o trecho que prova a frase.
3. **Proibido mexer no sistema para o achado sumir.** Nada de mock da condição alegada, troca de configuração padrão, variável de ambiente fora do documentado ou edição do código analisado.
4. **As regras valem nos dois sentidos.** Também é proibido inventar fluxo, volume ou cenário para **confirmar** um achado.
5. **"Improvável", "baixo impacto" e "parece certo" não são contraprova.** Esses argumentos mexem em gravidade, alcance e prioridade, nunca em veracidade.
6. **Escopo nunca é refutação.** Um achado fora da história continua real. Escopo só classifica.
7. **Porte não se presume.** "A aplicação é pequena" e "a tabela é enorme" são afirmações de fato: valem com dado real, com maturidade documentada ou com resposta do usuário. Ver `proportionality.md`.

## Método

8. **Plano antes da execução.** Hipótese, hipótese nula, método, critério de confirmação e critério de refutação ficam escritos antes do primeiro comando. Se o plano mudar depois de ver um resultado, a mudança entra em `deviations` e todo veredito apoiado em execução (confirmação, ou refutação por artefato) cai para `inconclusive`. Refutação por trecho de código não depende de plano: o trecho fala por si.
9. **Falha de execução nunca é refutação.** Aplicação fora do ar, dependência ausente, erro de sintaxe no experimento, tempo esgotado: tudo isso é `inconclusive` com o motivo.
10. **Confirmação exige medida.** `confirmed` só com execução que rodou e artefato salvo em disco. Rastreamento estático completo sem execução, quando nenhuma tentativa de refutação se sustenta, é `withstood`.
11. **Refutação exige contraprova.** `refuted` só com `caminho:linha` (ou artefato de execução) mostrando o que contradiz a premissa do achado.
12. **Hierarquia de evidência.** Execução reproduzível (teste, script, fluxo, Playwright) vale mais que rastreamento estático completo, que vale mais que leitura local. Escolha o método mais forte que o ambiente permite e diga por que não usou um mais forte.

## Segurança da execução

13. **Nada no checkout do autor fora de `.claude/local/`.** Experimentos, scripts e testes temporários ficam no diretório de experimentos da rodada, que a skill confirma estar ignorado pelo git. Quando o experimento precisa da base, use uma worktree temporária e remova ao final.
14. **Execução que toca banco ou aplicação passa pela trava.** `flock "$LOCK" <comando>`, com o caminho de trava que a skill entregou. Agentes rodam em paralelo, o banco de teste não.
15. **Não suba nem derrube serviço.** Use o que já está rodando. Serviço parado deixa o experimento `inconclusive`, com o motivo.
16. **Nenhuma dependência nova.** Playwright, gem ou pacote ausente deixa o experimento `inconclusive`. Não instale.
17. **Ambientes remotos são do usuário.** O crítico nunca se conecta a staging nem a produção. Ele gera o comando, e o usuário roda. As regras desses comandos estão em `proportionality.md`.
