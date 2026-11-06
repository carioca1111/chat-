# Atlas geográfico independente

O visualizador funciona inteiramente com HTML, JavaScript, WebGL e Canvas do navegador. Não usa CDN, telemetria, bibliotecas externas, serviços ou código do jogo. Não altera os dados exportados.

Na pasta `wildhaven-worldgen/`, após gerar os arquivos:

```sh
python -m http.server 8000
```

Abra <http://localhost:8000/viewer/>. Abrir `index.html` diretamente por `file://` não funciona porque o navegador bloqueia a leitura dos JSON por `fetch`.

- **Arrastar:** orbitar em 3D; deslocar em 2D.
- **Shift + arrastar / botão direito:** deslocar a câmera.
- **Roda:** aproximar ou afastar.
- **Clique em um hexágono:** consultar estatísticas, biomas, rios, lagos e vizinhos.
- **H:** enquadrar o continente; **1 / 2:** alternar 3D / 2D; **Esc:** limpar a seleção.
- **Camadas:** relevo e cobertura, biomas, altitude, temperatura, precipitação, umidade do solo e área contribuinte de drenagem.
- **Ir para:** enquadra o vulcão, a ravina e a reserva da vila.

O exagero vertical inicial de 40× torna o relevo continental legível e está indicado na interface. Pode ser reduzido a 1×. Não modifica as altitudes reais. O atlas usa `outputs/viewer-data.json`, uma amostragem reduzida do terreno; os arquivos numéricos de resolução integral e as malhas locais da ravina continuam sendo as fontes para integração. O visualizador não carrega as malhas locais detalhadas da ravina. O modo 2D serve também como alternativa quando WebGL não está disponível. Os caminhos de drenagem internos aos lagos continuam no JSON, mas ficam ocultos como canais na visualização. IDs hexagonais e rios são projetados sobre a superfície; em ângulos muito rasantes podem aparecer trechos de linhas por cima de encostas.

## Contrato de leitura

`viewer-data.json`: `nx`, `ny`, `width_m`, `height_m`, e arrays planos em ordem de linhas, começando pelo norte: `elevation_m`, `biome_rgb` (três componentes 0–255 por amostra), `temperature_c`, `precipitation_mm`, `soil_moisture`, `flow_accumulation_km2` e `land` (ou `land_mask`). Os campos opcionais `lake_id` e `water_surface_m` permitem desenhar as superfícies dos lagos sobre o leito. Os centros de amostra ficam em `(col + 0.5) × width_m / nx`, `height_m − (row + 0.5) × height_m / ny`.

Também são lidos `world.json`, `regions.json`, `rivers.json` e `special-locations.json`. Coordenadas geográficas são metros: X cresce para leste, Y cresce para norte, com origem no canto sudoeste. Altitude Z é em metros acima do nível do mar. A conversão para WebGL é apenas de visualização: X leste, Y vertical, Z sul, com centro na caixa continental. Os dados completos continuam sendo autoritativos.
