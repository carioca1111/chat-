# Gridium 2 Alpha 1.3.1 — Long-running Performance

Esta atualização conclui o hardening para manter o Gridium aberto por longos períodos sem degradação progressiva.

## Correções principais

- remove materializações duplicadas no hot path de analytics;
- coalesce gravações persistentes e limita estruturas de runtime;
- limita caches de Hunt Learning, Sentinel e Pokémon;
- mantém a janela de UI separada do histórico persistido;
- substitui a compressão por intervalos do ledger de IDs por registro exato em SQLite;
- mantém somente um cache LRU pequeno de IDs em JavaScript, evitando crescimento de heap com IDs muito espaçados;
- preserva a deduplicação exata mesmo quando Pokémon inativos saem dos caches de runtime.

## Validação

O workflow Windows executa, antes de publicar a release: typecheck, testes unitários, soak acelerado com GC, regressão de ciclo de vida do Electron, build de produção, build NSIS x64 e verificação do instalador/manifesto SHA-256.
