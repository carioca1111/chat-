# Wildhaven Hex Factory — Alpha 0.3

Criador de ambientes **3D mid-poly com identidade própria por hexágono**, baseado no atlas do Codex. Executa no navegador, separado da Alpha 0.1 do jogo.

## Novidades da 0.3

- Cenas visuais ampliadas (470 unidades cênicas de ponta a ponta, mantendo a representação geográfica **condensada de 2 km**).
- Onze arquétipos de relevo escolhidos conforme altitude, amplitude altimétrica, bioma e seed.
- Treze tipos de árvores com até três variações geométricas cada: carvalho, faia, bordo, bétula, pinheiro, abeto, fir, cedro, salgueiro, acácia, banyan, cipreste e árvore morta. Distribuição em manchas ecológicas, com clareiras e diferenciação por bioma.
- Rio e lagoa opcionais, considerando que a presença no hexágono **macrogeográfico** não implica presença em toda paisagem local de 2 km.
- **Sem pontes, acampamentos, ruínas ou cachoeiras forçados.** Esses são pontos de interesse a serem modelados/validados individualmente.
- Relevo não compartilha o mesmo modelo entre regiões; terrenos e pedras dependem de um perfil local e geologia.
- Superfícies corrigidas para orientação Y-up, evitando artefatos de faces viradas para baixo.
- InstancedMesh mantém desempenho ao usar espécies vegetais diversas; geometria de cada variante combinada.
- Câmera aberta para o terreno ampliado, sem alterar enquadramento do GLB original H_5_7.

## Limites importantes

A variação local é **artística e ilustrativa**, ainda não é uma reamostragem fiel do campo geográfico a resolução jogável nem assegura continuidade de rios e relevo nas bordas. `H_5_7` original GLB permanece separado, não é substituído. Aprovado no atlas significa aprovação **local neste navegador**; exporte o Projeto JSON.

O modelo do mundo, todas as regiões e os recursos do Wildhaven Alpha 0.1 não foram editados. Nenhum cenário é automaticamente considerado pronto para o jogo.

## Testes

`npm install && npm run build` executa `test-generator.mjs` antes do build. Valida consistência de cenário, geometria, árvores diferentes, ausência de construções automáticas, escolha de relevo e amostras com e sem rios.