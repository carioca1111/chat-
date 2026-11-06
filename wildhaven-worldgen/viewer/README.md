# Atlas geográfico independente

Visualizador offline com WebGL e Canvas, sem CDN, serviços externos ou dependências do jogo. Os arquivos exportados são somente lidos.

Na pasta `wildhaven-worldgen/`, após gerar os arquivos:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Abra <http://127.0.0.1:8765/viewer/>. A leitura por `fetch` exige HTTP local; abrir `index.html` diretamente por `file://` não funciona.

## Inspeção

- **Arrastar:** orbitar em 3D ou deslocar o mapa 2D.
- **Shift + arrastar / botão direito:** deslocar a câmera.
- **Roda:** aproximar ou afastar.
- **Clique em um hexágono:** consultar relevo, clima, biomas, água e vizinhos.
- **H / Voltar ao continente:** retornar ao enquadramento continental.
- **1 / 2:** alternar relevo 3D e mapa 2D.
- **Esc:** limpar a seleção.
- **Montanhas · detalhe de erosão:** abrir o recorte local de maior resolução. O botão fica desabilitado quando o recorte ainda não foi exportado.

O painel exibe a quantidade real de triângulos desenhados e a distância física entre amostras. Uma grade continental de **614 × 768** tem **940.342 triângulos**, cerca de 5,8 vezes o total da antiga grade de 256 × 320. O recorte de **512 × 512** tem **522.242 triângulos**; com extensão de 64 km, as amostras ficam espaçadas **125 m**. Os valores do painel vêm do arquivo aberto e se adaptam a outras configurações.

A malha é dividida em lotes de no máximo 60.000 vértices, com uma linha compartilhada entre lotes. Assim, grades acima de 65.535 vértices funcionam em WebGL 1 sem extensões de índices de 32 bits e sem estourar os índices de 16 bits. Os limites de lote consultam as mesmas alturas e normais, evitando costuras.

O detalhe local substitui temporariamente o continente na câmera e preserva suas coordenadas geográficas. Ele inicia com exagero vertical **2×**, indicado no painel e ajustável até 1×. O continente inicia com **40×** para leitura regional. O exagero modifica apenas a visualização. A câmera do detalhe inicia em uma janela central de maior relevo; a extensão indicada no painel é a área total do recorte, e a roda permite afastar para vê-la inteira. Ao retornar, o atlas restaura a camada e as opções de sobreposição que estavam selecionadas.

A camada **Relevo e cobertura** combina os biomas com exposição rochosa por declividade, solo, neve por altitude/temperatura e normais suaves. O relevo fino vem das alturas exportadas; a textura superficial não inventa sulcos na geometria. A camada **Biomas** mantém a paleta categórica para conferir a classificação original.

Os percursos numéricos de drenagem no interior dos lagos ficam ocultos como canais expostos. As superfícies dos lagos usam `lake_id` e `water_surface_m`. O modo 2D é também a alternativa quando WebGL não está disponível. O visualizador não carrega as cavernas detalhadas da ravina; esse glTF deve ser aberto separadamente em uma ferramenta 3D.

## Formato de leitura

`outputs/viewer-data.json` descreve a grade continental. O recorte opcional fica em `outputs/meshes/mountains/mountain-viewer.json` e usa o mesmo formato, acrescido de `origin_m: [leste, norte]`, a origem sudoeste do recorte em metros mundiais.

Campos globais: `nx`, `ny`, `width_m`, `height_m`, `origin_m` opcional (padrão `[0,0]`) e `name` opcional. Centro de amostra:

```text
x = origin_m[0] + (coluna + 0,5) × width_m / nx
y = origin_m[1] + height_m − (linha + 0,5) × height_m / ny
```

Linha zero é o norte. Alturas são metros acima do mar. WebGL converte somente a exibição para X leste / Y vertical / Z sul, em coordenadas locais centradas no recorte atual.

O formato v2 usa um manifesto pequeno e arquivos binários planos, sem base64:

```json
{
  "nx": 614,
  "ny": 768,
  "width_m": 6400000,
  "height_m": 8000000,
  "fields": {
    "elevation_m": {
      "path": "viewer/elevation_m.bin",
      "dtype": "float32",
      "count": 471552,
      "byte_length": 1886208
    }
  }
}
```

Todos os caminhos binários são relativos a `outputs/`. Os números são little-endian, planos e em ordem de linhas. O carregador verifica `count` e `byte_length`. Tipos suportados: `float32`, `int32`, `uint8` e `uint16` (também aceitos os nomes NumPy `<f4`, `<i4`, `|u1` e `<u2`). A versão anterior com arrays diretamente no JSON continua compatível.

Campos: `elevation_m` obrigatório; `biome_rgb` com três bytes por amostra; `land_mask` ou `land`; `biomes` com IDs; `slope` em m/m; `temperature_c`, `precipitation_mm`, `soil_moisture`, `flow_accumulation_km2`, `lake_id` e `water_surface_m`. As camadas numéricas ausentes usam zero apenas na visualização. Os dados completos de `world.json` e seus NPZ continuam sendo autoritativos.

Também são lidos `regions.json`, `rivers.json`, `special-locations.json` e o catálogo de biomas de `world.json`. Coordenadas desses JSON são sempre mundiais. Se o recorte exportar `rivers`, esses percursos locais são usados no lugar da rede continental enquanto ele estiver aberto.
