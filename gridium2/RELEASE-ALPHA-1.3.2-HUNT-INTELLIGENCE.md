# Gridium 2 Alpha 1.3.2 — Hunt Intelligence

A Hunt recebeu um painel compacto de acompanhamento em tempo real sem remover o motor de rota perfeita existente.

## Hunt Control

- capturas e capturas/h por Hunt;
- abates estimados a partir de ganhos confirmados de XP e abates/h;
- meta de captura editável, faltantes e ETA;
- P1, P2, P3, P4 e P5;
- shiny visto e shiny capturado;
- estoque de poções, poções usadas, consumo/h e estimativa de retorno ao Centro Pokémon;
- próximos marcos da sessão;
- visão individual, visão das quatro contas e visão agrupada;
- agrupamento de duas ou mais contas detectadas na mesma Hunt, com estatísticas somadas e contribuição por conta;
- sprites dos Pokémon e imagens dos itens.

As métricas da sessão reiniciam automaticamente quando o servidor confirma a troca de Hunt. O contador de abates é explicitamente tratado como estimativa, usando incrementos positivos de XP do Pokémon recebidos do servidor.

## Remoção de compra automática

O antigo recurso de compra automática de itens foi retirado do produto, incluindo runtime, bridges injetadas, contratos, IPC, preload, interface, estilos, payload mobile e testes dedicados.

## Validação

O workflow Windows executa typecheck, testes unitários, soak acelerado com GC, regressão real do ciclo de vida Electron, build de produção e NSIS x64 antes da publicação.
