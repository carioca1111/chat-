# Wildhaven — Auralis, atlas geográfico independente

Gerador reproduzível de um único continente. **Não há integração com o jogo, Alpha 0.1, servidores, economia, criaturas ou movimentação.** Todos os arquivos desta entrega vivem em `wildhaven-worldgen/`.

Seed-mãe: **20051028**. Configuração versionada em [`config.json`](config.json). Mundo de **6.400 × 8.000 km**, raster continental **1.280 colunas × 1.600 linhas**, resolução **5 km**, hexágonos pointy-top de raio **240 km**. A resolução continental descreve geografia regional; não equivale a terreno pronto para caminhar em escala humana. A ravina inclui um recorte local de 512 × 256 amostras e uma malha 3D complementar.

## Executar

Python 3.12 recomendado. A primeira execução requer instalar as dependências; depois geração e visualização funcionam offline.

```sh
cd wildhaven-worldgen
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
python generate.py
python -m unittest discover -s tests -v
python -m worldgen.validate outputs --reproduce
python inspect_world.py outputs
python -m http.server 8765 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8765/viewer/` para inspecionar relevo em 3D ou mapa 2D, clima, biomas, rios, limites e metadados de cada hexágono. O visualizador não depende de CDN e não escreve no jogo. As imagens podem ser abertas diretamente, sem servidor.

Configurações alternativas:

```sh
python generate.py --config config.json --out outputs
python generate.py --config minha-config.json --out outputs-smoke --no-renders
python -m worldgen.validate outputs
```

Dimensões, resolução, latitude climática, seed, raio hexagonal, limiar hidrográfico e codificação do PNG são configuráveis. Resolução mínima: 128 amostras por eixo. Raio mínimo de hexágono: 120 km para comportar a ravina. Configurações sem nichos suficientes para os 15 biomas ou sem planalto tropical adequado **falham explicitamente**; o gerador não pinta biomas para mascarar o problema. A entrega oficial usa `config.json` sem alterações.

## Processo geográfico

1. Escudo continental contínuo, margens costeiras, cinturões de dobramentos sinuosos, planalto, depressões tectônicas e vulcão composto.
2. Elevação e declividade; a ravina é uma incisão contínua na superfície, antes da drenagem.
3. Temperatura anual por latitude fictícia e altitude, com influência oceânica.
4. Dois transportes de umidade alimentados pelo oceano, combinados por faixa de vento predominante.
5. Precipitação por zona climática e levantamento orográfico; a perda de umidade produz sombra de chuva. Transporte parametrizado em distâncias físicas para reduzir dependência da resolução.
6. Priority-Flood, escoamento D8, acumulação, descarga anual média e lagos com fundo preservado. A ravina tem uma saída física escavada por busca de menor trabalho de corte até drenagem naturalmente mais baixa conectada ao mar.
7. Incisão limitada por potência fluvial e sedimentação simplificada com balanço de volume. A drenagem é recalculada sobre o terreno final.
8. Umidade do solo por chuva, evaporação potencial simplificada, distância de água e declividade; fertilidade por solo, sedimento e depósitos vulcânicos.
9. Os 15 biomas são regras ambientais por pixel. Anomalias geológicas contínuas habilitam floresta luminescente, vale cristalino, pântano micelial e vale etéreo. Cinzas seguem distância, relevo e vento ao redor do vulcão.
10. Biomassa e cobertura vegetal dependem de produtividade climática, fertilidade, declividade e condições devastadas.
11. Somente então os hexágonos são sobrepostos, com misturas de biomas e referências a rios/lagos.
12. Exportação numérica sem perdas, imagens, malhas, catálogo e manifesto.

Referências metodológicas: [Barnes, Lehman e Mulla, Priority-Flood (2014)](https://rbarnes.org/sci/2014_depressions.pdf), [Red Blob Games, hexágonos e coordenadas axiais](https://www.redblobgames.com/grids/hexagons/). As equações climáticas e a geologia são um modelo autoral simplificado e orientado visualmente; não representam uma simulação paleogeográfica ou hidrodinâmica calibrada.

## Arquivos principais

Todos os caminhos abaixo são relativos a `wildhaven-worldgen/outputs/` no repositório.

| Arquivo | Conteúdo |
|---|---|
| `world.json` | Versão do formato, seed, configuração, coordenadas, unidades, campos e hashes |
| `regions.json` | Todos os hexágonos, polígonos, vizinhos, relevo, clima, mistura de biomas e referências |
| `heightmap.png` | PNG **16 bits**, `altura_m = valor_uint16 × 0,25 − 6000`; erro máximo 0,125 m |
| `fields/elevation_m.npz` | Elevação float32 exata, sem quantização de PNG |
| `biomes-data.npy` | Matriz uint8 de IDs; classificação sem perdas |
| `fields/biomes.npz` | Mesma classificação, comprimida e indexada no catálogo |
| `temperature.png`, `precipitation.png` | Visualizações coloridas dos campos; escalas no atlas climático |
| `biomes.png` | Biomas com relevo sombreado; cores modificadas pelo sombreamento |
| `biomes-colors.png` | Paleta categórica exata, sem sombreamento |
| `rivers.json` | Nós e segmentos conectados, coordenadas, índices de células, descargas, lagos e balanço sedimentar |
| `special-locations.json` | Vulcão, ravina e reserva geográfica da futura vila inicial |
| `world-preview.png` | Atlas continental de alta resolução, biomas, hexágonos, rios e locais especiais |
| `renders/climate-atlas.png` | Relevo, temperatura e precipitação |
| `renders/volcano-detail.png` | Vista 3D da caldeira e encostas |
| `renders/ravine-detail.png` | Vista 3D dos patamares e fissura |
| `meshes/ravine/ravine.gltf` + `ravine.bin` | Terreno local, túneis conectados a aberturas reais, raízes e água |
| `meshes/ravine/ravine-heightmap.npy` | Relevo local float32 para integração e inspeção |
| `meshes/ravine/ravine-incision.npy` | Profundidade de corte local sem perdas |
| `meshes/ravine/ravine-metadata.json` | Georreferenciamento, cavernas, bordas das aberturas e níveis de exploração |
| `viewer-data.json` | Amostragem reduzida para inspeção WebGL; não é o dado autoritativo |
| `manifest.json` | SHA-256 dos arquivos exportados, exceto o próprio manifesto e o relatório de validação |
| `validation-report.json` | Resultado das verificações efetivamente executadas |

`fields/` também exporta temperatura °C, precipitação mm/ano, elevação pré-erosão m, incisão principal e canal de saída da ravina m, declividade m/m, distância da costa m, latitude graus, ventos, cinzas, mineralização, anomalias, fluxo receptor, área de drenagem km², descarga m³/s, IDs e profundidade dos lagos m, superfície da água m, erosão m, sedimentação m, umidade, fertilidade, biomassa, cobertura vegetal e índice regional. Frações ambientais são adimensionais [0,1]. O índice topológico `flow_rank` tem unidades de ordenação; os metadados descrevem cada campo.

Cada NPZ contém somente a chave **`data`**. Não há objetos Python serializados nem dependência do gerador para abrir os resultados:

```python
import json
import numpy as np
from pathlib import Path

root = Path('outputs')
world = json.loads((root / 'world.json').read_text(encoding='utf-8'))
info = world['fields']['elevation_m']
with np.load(root / info['path'], allow_pickle=False) as archive:
    height = archive[info['key']]
biomes = np.load(root / 'biomes-data.npy', allow_pickle=False)
assert height.shape == biomes.shape == tuple(world['raster']['shape'])
```

## Coordenadas, continuidade e integração futura

Origem mundial no canto **sudoeste**, em metros. **X cresce para leste, Y para norte, Z é altitude sobre o nível do mar (0 m)**. Raster NumPy `[linha, coluna]`: linha 0 está no norte. Centro do pixel: `x=(coluna+0,5)*dx`, `y=altura_m-(linha+0,5)*dy`. Dados climáticos usam latitude fictícia equiretangular, de −12° a 80°; não há EPSG terrestre associado.

Os hexágonos têm topo pontudo e coordenadas axiais `(q,r)`, cúbica `s=-q-r`. Centro: `x=raio*sqrt(3)*(q+r/2)`, `y=raio*1,5*r`. IDs `H_q_r` são estáveis para a mesma grade. Os polígonos exteriores são recortados ao retângulo mundial. Incluem-se hexágonos oceânicos, garantindo cobertura integral. Estatísticas são dos centros de pixels; polígonos residuais sem amostras têm estatísticas nulas. Vizinhos são recíprocos. **Nenhuma borda de hexágono modifica altura, clima ou rios**; para tiles futuros, use as mesmas amostras da superfície global nas bordas compartilhadas.

`flow_receiver` contém o índice plano `linha*largura+coluna` da próxima célula, ou −1 no oceano. `flow_rank` diminui estritamente para jusante sobre terra, inclusive nos lagos planos. `water_surface_m` é a superfície hidrológica; `elevation_m` continua sendo o fundo. Rios atravessam fronteiras livremente. Em lagos, o fundo pode subir localmente, mas a superfície da água não sobe para jusante.

glTF usa **X leste, Y vertical, Z sul**, em metros locais relativos ao centro da ravina; o deslocamento mundial e os limites estão em `ravine-metadata.json`. A superfície local usa a mesma incisão analítica do continente, com interpolação da base e erosão regional. Deve **substituir** o recorte correspondente do terreno global na integração: sobrepor o heightfield continental inteiro tamparia as cavernas e produziria z-fighting. As aberturas são quads efetivamente removidos e suas bordas são compartilhadas geometricamente pelos túneis. O heightmap local isolado não expressa cavernas nem saliências.

Para transformar para motores Y-up, use `(world_x, elevation, -world_y)` e aplique origem local para evitar perda de precisão em milhões de metros. Não converta cada hexágono em terreno independente. Rios e lagos carregam coordenadas absolutas e podem ser recortados por renderização sem alterar sua topologia.

## Validação e reprodutibilidade

`python -m worldgen.validate outputs --reproduce` executa verificações dos 15 biomas, anel de cinzas ao redor do vulcão, contexto tropical e propriedade hexagonal da ravina, cobertura/vizinhança/continuidade regional, grafo de rios, geometria/profundidade/cavernas, arquivos/dimensões/hashes, ausência de valores inválidos, leitor independente e regeneração completa com comparação dos campos. O relatório registra os testes executados e falha com código não zero quando houver problema. `--reproduce` usa uma pasta temporária; a comparação não se limita à seed escrita no JSON.

A identidade numérica oficial está em `world.json:numeric_fingerprint`; cada campo tem seu hash de bytes e de arquivo. Use as versões fixadas de Python/dependências para repetir os bytes numéricos. Paridade entre versões diferentes de NumPy/SciPy ou sistemas de ponto flutuante não é prometida. Mudanças de resolução produzem uma nova discretização e podem escolher um centro diferente para a ravina; não são o mesmo artefato raster.

## Limites e próximos trabalhos

Esta entrega prepara a **geografia e seus dados**, com inspeção independente. A geração é um modelo artístico coerente e simplificado: não simula movimento de placas ao longo do tempo, estações, cheias, erosão hidráulica completa, sedimentos granulométricos ou vegetação individual. O macro relevo e os nichos anômalos são orientados por campos geográficos contínuos e seed fixa. A disponibilidade dos 15 biomas é verificada, não garantida para qualquer configuração arbitrária.

A malha da ravina prepara cavernas, patamares, grandes raízes e cursos d'água; precisará de materiais finais, revisão de escala jogável, navegação, colisão e refinamento antes de exploração em primeira pessoa. O visualizador continental reduz a amostragem para manter desempenho; os detalhes da ravina devem ser inspecionados pela renderização local e pelo glTF em uma ferramenta 3D. A escala de relevo exagerada nas imagens/visualizador é indicada e não altera os dados.

Nenhum arquivo fora deste diretório faz parte da alteração. A integração posterior deve consumir o formato versionado sem executar o gerador no navegador e sem reconstruir o mundo por hexágono.
