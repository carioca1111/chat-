# Gridium Alpha 10 — Shiny Assistente

Integrado por `apply-alpha10.js` sobre o runtime oficial Alpha 9.17. Preserva Contas, Painel, Hunt Intelligence, Oportunidades, Alpha Terminal e os motores Sniper. A navegação existente é superior, não lateral: o novo botão fica imediatamente depois de Hunt Intelligence.

## Fontes e limites de validação

Inspeção estática do cliente público PokeIdle v1.279.2 em 13/10/2026:

- https://pokeidle.io/app.js?v=1.279.2 — `aoEntrar`, `aoEvento`, `pintarCaidos`, `pintarAtivosDoTreinador`.
- https://pokeidle.io/sessao-hunt.mjs — `contarNaSessao` confirma uma tentativa por `bola`; shiny visto = `bola.shiny`.
- https://pokeidle.io/campo.mjs — `aplicar`, `mesclar`, `corpos`: entidades por `s`, nome `n`, morte `x`, tempo restante `xr`, treinador `tr`.
- https://pokeidle.io/shared/estado-delta.mjs — campos ausentes não mudaram; objetos presentes substituem o anterior; `cheio` reinicia a conexão.

Nenhum endpoint novo, comando do jogo, OCR ou sondagem foi criado. Não há conta de jogo autenticada neste ambiente: os testes usam fixtures estruturadas conforme o cliente; não são evidência de captura real em produção. Dados demonstrativos existem somente nos testes, nunca na build.

## Telemetria central

`NetworkInspector` entrega **uma vez** cada frame recebido dos WebSockets `wss://pokeidle.io/` ou `wss://www.pokeidle.io/` à `ShinyTelemetry`, antes do filtro de foco do Market e de sua truncagem/redação. O Market continua com o mesmo foco e processamento. Nenhum listener/timer por componente ou conta é instalado. A projeção só aceita os tipos `welcome`, `estado`, `batalha`, `campo`, `campo.init` e não armazena tokens, cookies ou o pacote bruto.

Campos reais: identidade/nick, hunt, catálogo de bolas, estoque `estado.balls`, boost `loja.boosts.{shiny,captura}`, Kick `kick.bonus.{shiny,captura}`, relógio `servidorAgora`, Pokémon ativo, abates `morte/selvagem`, corpos com prazo `campo.mobs`, tentativa `bola`, shiny `bola.shiny`, resultado booleano `bola.sucesso`, bola `ballId`.

Espécie: nome da entidade no slot do arremesso; se ausente, resultado imediatamente adjacente e compatível na mesma mensagem. Caso não seja possível correlacionar: **Espécie não informada**, nunca uma suposição. O ID da espécie só é preenchido com um resultado compatível. `shiny.captura` global, Market, Pokémon no chão com flag visual e capturas de outros jogadores NÃO contam rolls. Resultado ausente permanece `null`.

O módulo tem proteção de exceções, logs com limite por minuto e contadores de diagnóstico para espécie/resultado ausentes. Desconectado há mais de 20 s: taxa indisponível, não zero. Um novo welcome reinicia a janela e usa ID de conta para recuperar o histórico correto. Listener de `detach` também é removido ao reconstruir a inspeção.

## Cálculos

- Buckets de 10 s, limitados a 361 por conta. Janelas móveis de 5/15/60 min. Taxas após 60 s observados. Intervalos de frames acima de 15 s não viram farm; tempo conectado na hunt sem capturas conta como ociosidade no denominador. Duração da sessão é a soma de intervalos observados. Fechado/desconectado não é inferido.
- Hoje: America/Sao_Paulo. Tentativas persistentes desde a primeira observação; desde último shiny é desconhecido até o primeiro roll observado. Lacunas não são recuperadas nem adivinhadas.
- Probabilidade teórica base: `-expm1(nNormal*log1p(-1/24000) + nLure*log1p(-1/12000))`. Lure é registrado por tentativa usando horário do servidor. Supõe tentativas elegíveis; NÃO incorpora Kick, nem Arena Mística/boss/Outland ou estado desconhecido. Quantidade efetivamente incluída aparece no radar. O resultado é probabilidade de ao menos um roll no conjunto observado, não previsão do próximo. Tentativas independentes. Não é probabilidade de capturar o shiny.
- Ranking por conta, mesmo Pokémon/nível/IV/potência/refino e boosts; mínimo 5 min e 20 tentativas por hunt; dados de até 7 dias. Outland excluída. Para alvo, usa contagem real de tentativas daquela espécie. Não presume frequência de espécies não observadas.
- Eficiência: `round(100*(0.8*min(1,ritmoHunt/ritmoMelhor) + 0.2*min(1,estoque/(ritmoAtual*0.5))))`. Exige duas hunts comparáveis, taxa e estoque conhecidos. Ritmo zero tem parcela de estoque zero. Caso contrário: CALIBRANDO. Boost não recebe pontos arbitrários; delimita contexto comparável. Captura efetiva/bola ótima não faz parte do score sem modelo validado.

## Persistência e desempenho

`userData/gridium-shiny.json`: escrita assíncrona em temporário + rename; salvamento agrupado no timer existente e imediato ao roll. Encerramento espera a escrita pendente. JSON inválido não é sobrescrito. Histórico: até 20.000 rolls, 50 linhas por página com filtros por período/conta/espécie/resultado. Metadados dos boosts são congelados no roll. Até 250 contextos de hunt por conta e 31 dias de totais diários. View cache de 1 s; UI só renderiza ativa e reutiliza o publisher existente. Core aceita até 128 slots para teste; aplicativo continua com suas quatro sessões originais.

## Ainda não validado/disponível

Chance de captura efetiva por espécie com todos os modificadores, preço real/custo de oportunidade das bolas, tabela completa de elegibilidade shiny, frequência de aparição (distinta de tentativa), tempo exato de limpeza de onda, tempo ocioso separado, screenshot automático e captura real em conta autenticada. São omitidos ou sinalizados, sem zeros falsos. `optimizeBall` é uma função pura preparada para probabilidades/custos/estoque validados; não é ativada na UI. Aplicar estratégia salva alvo e modo; não troca hunt nem envia bolas. Som depende de permissão de áudio do Chromium/OS.

## Build

Windows: `./build-alpha10.ps1`, instalar dependências em `gridium-build`, `./build-sniper-alpha913.ps1`, testes, `electron-builder --win nsis`. Pipeline `.github/workflows/build-gridium-windows-alpha10.yml` roda em PR para `gridium-next`, push na branch principal e manualmente.

Arquivos novos: `shiny-telemetry.js`, `shiny-ui.js`, `shiny.css`, `shiny.html`, testes. Arquivos do runtime integrados por anchors validados antes da escrita: `main.js`, `preload.js`, `network-inspector.js`, `renderer.js`, `index.html`, `package.json`.
