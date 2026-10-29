# Gridium 2 Alpha 1.3.17

Hotfix para o loop de recarregamento observado principalmente nas contas 2, 3 e 4 após a Alpha 1.3.16.

- cancela o watchdog antigo quando uma nova navegação/load começa;
- preserva os request IDs dos WebSockets durante loads normais do PokeIdle;
- evita perder o vínculo com um socket que continua vivo quando Chromium não repete `Network.webSocketCreated`;
- mantém a recuperação limitada da Alpha 1.3.16 para sockets realmente perdidos;
- continua limpando o rastreamento em crash real do renderer;
- preserva Hunt, shiny, supply headless, mobile sync e as demais otimizações anteriores.
