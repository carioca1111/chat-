# Wildhaven Hex Factory — Alpha 0.2 (navegador)

Editor experimental de paisagens 3D para o continente Auralis. Evolução do Workshop existente, hospedada no mesmo serviço Render. Não modifica a Alpha 0.1 do jogo, o gerador geográfico Python do Codex, nem as malhas originais.

## Uso

1. Acesse o ateliê no Render.
2. Clique no atlas para selecionar uma região. Os polígonos e biomas são os dados reais de `wildhaven-worldgen/outputs/regions.json`.
3. Ajuste seed, árvores, rochas, relevo, vegetação e detalhes dos rios.
4. Clique em **Gerar paisagem 3D**. A malha é criada no próprio navegador com Three.js, sem backend.
5. Inspecione, exporte a cena em `.glb` e, se desejar, marque-a como aprovada **localmente**.
6. Exporte **Projeto JSON** como backup de seeds, configurações e aprovações, ou importe o JSON de volta.

O Bosque das Cascatas (`H_5_7`) mantém o GLB original como referência. O botão **Bosque original** permite visualizá-lo a qualquer momento.

## Escopo real e limitações importantes

- **Prévia procedural artística**, gerada por heurísticas; NÃO representa uma reconstrução fiel de todas as altitudes, hidrovias ou fronteiras do mundo científico.
- Os dados geográficos do Codex são lidos para encontrar a região, o bioma dominante e a presença de rios. O trajeto e a conexão entre rios de hexágonos vizinhos ainda precisam de um algoritmo global de fronteiras.
- A escala cênica é uma representação condensada de um hexágono observável de 2 km; não representa 1:1 os 240 km de raio dos grandes hexágonos geográficos.
- Não possui edição de vértices com pincel, geração Python do lado do servidor, sincronização multiusuário ou aprovação global no GitHub. Aprovações são salvas **somente no navegador** via `localStorage`, e podem ser preservadas por exportação JSON.
- Uma aprovação local **não autoriza integração no jogo**: serão necessários QA de malha e geografia, bordas, jogabilidade e qualidade artística.
- A exportação GLB contém geometria mid-poly real. Desenhos e a imagem do mapa não são usados como terrenos falsos.
- Performance varia com o navegador, GPU e parâmetros de densidade.

## Arquitetura

- `src.js`: app, atlas, Three.js viewer, controles, projetos locais, export GLB e JSON.
- `procedural.js`: geração determinística de terreno hexagonal, relevo, escarpas, margens e rio, vegetação e pontos de interesse.
- `style.css`: interface responsiva.
- `test-generator.mjs`: testes unitários simples do gerador, incluindo ausência de hidrologia inventada e seed repetível.
- `copy-assets.mjs` continua preparando o raster, os JSONs do Codex e o GLB original do Bosque.

## Comandos

```bash
cd wildhaven-worldgen/hex-workshop
npm install
npm run dev
npm run build
npm test
```

A versão no Render compila automaticamente após push na branch `wildhaven-hex-workshop`.