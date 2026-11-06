# Wildhaven — Ateliê independente de hexágonos mid-poly

Esta entrega é um **ateliê visual**, não uma alteração no jogo Alpha 0.1.

- Cena real de malhas 3D da Floresta Temperada: `hex-scenes/H_5_7/forest-temperate.glb`.
- Dados e inventário de geometria: `hex-scenes/H_5_7/metadata.json`.
- Fonte reproduzível da malha: `build_forest_hex.py` (Python 3.12 + numpy, scipy, trimesh).
- Visualizador 3D e atlas com hexágono concluído iluminado: `hex-workshop/` (Three.js + Vite).
- Registro do progresso: `hex-workshop/public/progress.json`.
- Detalhes físicos adicionais: `hex_fluvial_details.py` — terraços reais nas duas margens, rochas encaixadas, escarpas orientadas pelo gradiente, fissuras e tálus; ecologia procedural por umidade e fertilidade. Os grupos geométricos têm nomes próprios no GLB, preservando a edição por componente.
- Base geográfica: Auralis/Codex, região **H_5_7**: 90,82% Floresta Temperada, 27 segmentos de rios, clima ameno-quente, altitude média ~176 m.

## Escala e fidelidade

A malha é um **diorama local estilizado** inspirado na ilustração aprovada (rio em cascatas, ponte, acampamento, ruínas, caverna, cervos, árvores). Não é reconstrução exata em 3D feita a partir de uma única imagem, e nem substitui a totalidade do hex geográfico original, que tem 240 km de raio. O atlas ilumina a região quando existe uma cena de referência 3D, não quando todas as futuras superfícies jogáveis da região estão prontas.

## Visualizar

Na pasta `wildhaven-worldgen/hex-workshop`:

```bash
npm install
npm run dev
```

A rotina `copy-assets.mjs` copia os dados de Auralis e o glb para `public` antes do build. Para construir: `npm run build`. Hospedagem estática: publicar `hex-workshop/dist` após executar o build na pasta.

## Próximas regiões

1. Escolher próximo `H_q_r` com dados ambientais compatíveis.
2. Criar modelo GLB real no novo diretório `hex-scenes/<id>/`.
3. Incluir metadados, coordenadas locais e arte de referência.
4. Marcar o ID em `hex-workshop/public/progress.json` e associar o GLB.
5. Validar visualmente e nunca declarar a região geográfica totalmente jogável só porque o diorama local ficou pronto.

A Alpha 0.1 permanece intocada.

## Revisão de geologia e micro-habitats (H_5_7)

O canal agora utiliza uma seção mais estreita e encaixada na lâmina d'água, com terraços sedimentares mid-poly e agrupamentos assimétricos de blocos. Escarpas são geradas apenas onde o declive medido ultrapassa o limiar; fissuras e tálus são geometria, não texturas. Distribuição de pinheiros, árvores folhosas, flores e arbustos usa proxies locais de umidade do solo, altitude, declive, temperatura e fertilidade sem alterar os campos de Auralis. Detalhes menores são ocultados somente a longa distância pelo visualizador; na inspeção próxima permanecem inteiros.

O pipeline em `.github/workflows/wildhaven-hex-ci.yml` reconstrói o GLB, verifica os testes e exporta quatro imagens WebGL reais. H_5_7 permanece **em desenvolvimento e não aprovado** até a avaliação humana; bordas dos vizinhos e comparação estrita com a referência ainda dependem de validação.
