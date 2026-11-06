# Wildhaven — Auralis, atlas geográfico independente

Gerador reproduzível de uma massa continental principal com pequenas ilhas costeiras. **Não há integração com o jogo, Alpha 0.1, servidores, economia, criaturas ou movimentação.** Todos os arquivos desta entrega vivem em `wildhaven-worldgen/`.

Seed-mãe: **20051028**. Configuração versionada em [`config.json`](config.json). Mundo de **6.400 × 8.000 km**, raster continental **1.280 colunas × 1.600 linhas**, resolução **5 km**, hexágonos pointy-top de raio **240 km**. A resolução continental descreve geografia regional; não equivale a terreno pronto para caminhar em escala humana. A ravina inclui um recorte local de 512 × 256 amostras e uma malha 3D complementar.

## Revisão geográfica 2

O litoral agora resulta de uma superfície deformada em várias escalas, com baías, penínsulas, enseadas e ilhas menores. Não há corte por uma linha de latitude para terminar as praias. O continente principal deve conter pelo menos **97% da área terrestre**; ilhas costeiras não constituem um segundo continente. A validação mede a maior linha costeira retilínea e a diferença de perímetro entre resoluções, em vez de confiar apenas na aparência da imagem.

O clima foi revisto para reduzir a extensão árida. A meta de aceitação limita o **Deserto Rochoso a 16% da terra sem água**, preservando sua formação por condições ambientais e os outros 14 biomas. Os percentuais efetivamente gerados constam do relatório e dos dados; o limite não é uma porcentagem pintada sobre o mapa.

As montanhas recebem evolução geomorfológica iterativa: incisão por potência fluvial, recálculo periódico da drenagem, transporte de encosta e relaxação de talude. Há um recorte de **64 × 64 km**, com **512 × 512 amostras a 125 m** e **522.242 triângulos**, exportado como glTF aberto em quatro partes. Os heightmaps antes e depois e os campos de erosão/deposição permitem comprovar as alterações no relevo. `model_years` controla a exposição no modelo; não representa uma idade geológica real calibrada.

O visualizador continental usa **614 × 768 amostras**, com **940.342 triângulos**, aproximadamente **5,78 vezes** a malha de inspeção da revisão 1. Essa malha continua sendo uma amostragem do raster regional; o botão **Montanhas · detalhe de erosão** abre a geometria local de 125 m. O exagero vertical inicial é indicado: **40× no continente e 2× no recorte montanhoso**. Não altera os arquivos de altura.

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

Abrir `http://127.0.0.1:8765/viewer/` para inspecionar relevo em 3D ou mapa 2D, clima, biomas, rios, limites e metadados de cada hexágono. Clique em **Montanhas · detalhe de erosão** para aproximar a câmera do recorte refinado; **Voltar ao continente** ou **H** retorna ao atlas. O visualizador não depende de CDN e não escreve no jogo. As imagens podem ser abertas diretamente, sem servidor.

Configurações alternativas:

```sh
python generate.py --config config.json --out outputs
python generate.py --config minha-config.json --out outputs-smoke --no-renders
python -m worldgen.validate outputs
```

Dimensões, resolução, latitude climática, seed, raio hexagonal, limiar hidrográfico, codificação do PNG, iterações de erosão, amostragem do visualizador e extensão/resolução do recorte montanhoso são configuráveis. Resolução continental mínima: 128 amostras por eixo. Raio mínimo de hexágono: 120 km para comportar a ravina. Configurações sem nichos suficientes para os 15 biomas ou sem planalto tropical adequado **falham explicitamente**; o gerador não pinta biomas para mascarar o problema. As metas de qualidade da revisão 2 destinam-se à configuração oficial de alta resolução, não a toda configuração reduzida de teste. A entrega oficial usa `config.json` sem alterações.

## Processo geográfico

1. Escudo continental contínuo com deformação de coordenadas e fraturas costeiras em várias escalas, margens, baías, cinturões de dobramentos, planalto e depressões tectônicas. As cristas não repetem uma onda senoidal de picos.
2. Elevação e declividade; evolução geomorfológica iterativa do continente antigo por potência fluvial, transporte de encosta e talude, com recálculo da drenagem. O vulcão jovem, com cratera e canais antigos de lava, é acrescentado após essa evolução. A ravina é uma incisão contínua anterior à drenagem final.
3. Temperatura anual por latitude fictícia e altitude, com influência oceânica.
4. Dois transportes de umidade alimentados pelo oceano, combinados por faixa de vento predominante.
5. Precipitação por zona climática e levantamento orográfico; a perda de umidade produz sombra de chuva. Transporte parametrizado em distâncias físicas para reduzir dependência da resolução.
6. Priority-Flood, escoamento D8, acumulação, descarga anual média e lagos com fundo preservado. A ravina tem uma saída física escavada por busca de menor trabalho de corte até drenagem naturalmente mais baixa conectada ao mar.
7. Nova incisão limitada por potência fluvial e sedimentação simplificada com balanço de volume, complementando a evolução geomorfológica anterior. A drenagem exportada é recalculada sobre o terreno final.
8. Umidade do solo por chuva, evaporação potencial simplificada, distância de água e declividade; fertilidade por solo, sedimento e depósitos vulcânicos.
9. Os 15 biomas são regras ambientais por pixel. Anomalias geológicas contínuas habilitam floresta luminescente, vale cristalino, pântano micelial e vale etéreo. Cinzas seguem distância, relevo e vento ao redor do vulcão.
10. Biomassa e cobertura vegetal dependem de produtividade climática, fertilidade, declividade e condições devastadas. O recorte montanhoso recebe relevo refinado, evolução local própria e materiais de inspeção por declividade, temperatura e vegetação.
11. Somente então os hexágonos são sobrepostos, com misturas de biomas e referências a rios/lagos.
12. Exportação numérica sem perdas, imagens, malhas, catálogo e manifesto.

Referências metodológicas: [Barnes, Lehman e Mulla, Priority-Flood (2014)](https://rbarnes.org/sci/2014_depressions.pdf), [Braun e Willett, solução implícita da potência fluvial (2013)](https://doi.org/10.1016/j.geomorph.2012.10.008), [Red Blob Games, hexágonos e coordenadas axiais](https://www.redblobgames.com/grids/hexagons/). As equações climáticas e a geologia são um modelo autoral simplificado e orientado visualmente; não representam uma simulação paleogeográfica ou hidrodinâmica calibrada.

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
| `special-locations.json` | Vulcão, ravina, reserva geográfica da futura vila inicial e recorte montanhoso |
| `world-preview.png` | Atlas continental de alta resolução, biomas, hexágonos, rios e locais especiais |
| `renders/climate-atlas.png` | Relevo, temperatura e precipitação |
| `renders/volcano-detail.png` | Vista 3D da caldeira e encostas |
| `renders/ravine-detail.png` | Vista 3D dos patamares e fissura |
| `renders/mountain-detail.png` | Vista 3D do relevo montanhoso refinado e seus materiais |
| `renders/erosion-comparison.png` | Comparação do relevo local antes/depois e dos campos de erosão |
| `meshes/ravine/ravine.gltf` + `ravine.bin` | Terreno local, túneis conectados a aberturas reais, raízes e água |
| `meshes/ravine/ravine-heightmap.npy` | Relevo local float32 para integração e inspeção |
| `meshes/ravine/ravine-incision.npy` | Profundidade de corte local sem perdas |
| `meshes/ravine/ravine-metadata.json` | Georreferenciamento, cavernas, bordas das aberturas e níveis de exploração |
| `meshes/mountains/mountain.gltf` | Relevo local de 125 m, com vértices, normais e cores |
| `meshes/mountains/mountain-0.bin` a `mountain-3.bin` | Quatro buffers do glTF; manter ao lado do arquivo glTF |
| `meshes/mountains/heightmap.npy`, `initial-heightmap.npy` | Alturas float32 depois e antes da evolução local |
| `meshes/mountains/geomorphic-erosion.npz`, `geomorphic-deposition.npz` | Alterações locais de altura em metros; chave `data` |
| `meshes/mountains/metadata.json` | Extensão, origem, resolução, balanço e parâmetros do modelo local |
| `meshes/mountains/mountain-viewer.json` e `viewer/*.bin` nessa pasta | Manifest e campos binários da inspeção montanhosa |
| `viewer-data.json` e `viewer/*.bin` | Manifest e amostras binárias continentais para inspeção WebGL |
| `manifest.json` | SHA-256 dos arquivos exportados, exceto o próprio manifesto e o relatório de validação |
| `validation-report.json` | Resultado das verificações efetivamente executadas |

`fields/` também exporta temperatura °C, precipitação mm/ano, elevação pré-erosão m, incisão principal e canal de saída da ravina m, declividade m/m, distância da costa m, latitude graus, ventos, cinzas, mineralização, anomalias, fluxo receptor, área de drenagem km², descarga m³/s, IDs e profundidade dos lagos m, superfície da água m, erosão m, sedimentação m, umidade, fertilidade, biomassa, cobertura vegetal e índice regional. A revisão 2 acrescenta os campos continentais de erosão e deposição geomorfológicas, em metros, além do relevo tectônico/vulcânico utilizado pelo modelo. Frações ambientais são adimensionais [0,1]. O índice topológico `flow_rank` tem unidades de ordenação; os metadados descrevem cada campo.

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

Os manifests de inspeção evitam listas JSON gigantes. Cada entrada `fields[nome]` contém `path`, `dtype`, `count` e `byte_length`; os caminhos são relativos a `outputs/`, inclusive no manifest local das montanhas. Os buffers são contínuos, **little-endian**, em ordem de linhas com o norte primeiro. `biome_rgb` possui três componentes uint8 por amostra; altura e clima usam float32 e `lake_id` usa int32. Exemplo de leitor sem dependência do gerador:

```python
view = json.loads((root / 'viewer-data.json').read_text(encoding='utf-8'))
entry = view['fields']['elevation_m']
inspection_height = np.fromfile(root / entry['path'], dtype='<f4')
assert inspection_height.size == entry['count']
inspection_height = inspection_height.reshape(view['ny'], view['nx'])
```

## Coordenadas, continuidade e integração futura

Origem mundial no canto **sudoeste**, em metros. **X cresce para leste, Y para norte, Z é altitude sobre o nível do mar (0 m)**. Raster NumPy `[linha, coluna]`: linha 0 está no norte. Centro do pixel: `x=(coluna+0,5)*dx`, `y=altura_m-(linha+0,5)*dy`. Dados climáticos usam latitude fictícia equiretangular, de −12° a 80°; não há EPSG terrestre associado.

Os hexágonos têm topo pontudo e coordenadas axiais `(q,r)`, cúbica `s=-q-r`. Centro: `x=raio*sqrt(3)*(q+r/2)`, `y=raio*1,5*r`. IDs `H_q_r` são estáveis para a mesma grade. Os polígonos exteriores são recortados ao retângulo mundial. Incluem-se hexágonos oceânicos, garantindo cobertura integral. Estatísticas são dos centros de pixels; polígonos residuais sem amostras têm estatísticas nulas. Vizinhos são recíprocos. **Nenhuma borda de hexágono modifica altura, clima ou rios**; para tiles futuros, use as mesmas amostras da superfície global nas bordas compartilhadas.

`flow_receiver` contém o índice plano `linha*largura+coluna` da próxima célula, ou −1 no oceano. `flow_rank` diminui estritamente para jusante sobre terra, inclusive nos lagos planos. `water_surface_m` é a superfície hidrológica; `elevation_m` continua sendo o fundo. Rios atravessam fronteiras livremente. Em lagos, o fundo pode subir localmente, mas a superfície da água não sobe para jusante.

glTF usa **X leste, Y vertical, Z sul**. Na ravina, os metros locais são relativos ao centro da fissura; o deslocamento mundial e os limites estão em `ravine-metadata.json`. A superfície local usa a mesma incisão analítica do continente, com interpolação da base e erosão regional. Deve **substituir** o recorte correspondente do terreno global na integração: sobrepor o heightfield continental inteiro tamparia as cavernas e produziria z-fighting. As aberturas são quads efetivamente removidos e suas bordas são compartilhadas geometricamente pelos túneis. O heightmap local isolado não expressa cavernas nem saliências.

No glTF montanhoso, a origem local fica no **sudoeste do recorte**, indicada por `metadata.json:mesh_origin_m=[x0,y0]`. Converter para o mundo por `x=X+x0`, `y=y0-Z`, `altitude=Y`. `bounds_m` e `local_resolution` descrevem o heightmap; seus vértices são centros de amostras. As quatro partes duplicam apenas vértices de borda compartilhados. O recorte refinado substitui a área correspondente do raster de 5 km; as amostras externas ficam fixas durante a erosão para preservar a ligação com a base regional. Evitar sobrepor as duas superfícies.

Para transformar para motores Y-up, use `(world_x, elevation, -world_y)` e aplique origem local para evitar perda de precisão em milhões de metros. Não converta cada hexágono em terreno independente. Rios e lagos carregam coordenadas absolutas e podem ser recortados por renderização sem alterar sua topologia.

## Validação e reprodutibilidade

`python -m worldgen.validate outputs --reproduce` mantém os dez grupos de aceitação: 15 biomas, vulcão/cinzas, ravina tropical, continuidade regional, hidrologia, geometria da ravina, reprodução, exportações, terreno válido e leitor independente. A revisão 2 também verifica o limite de deserto, a proporção da massa continental, praias retilíneas de no máximo 120 km e relação de pelo menos 1,08 entre o perímetro fino e o medido com resolução reduzida em 8×. Essa relação mede complexidade em duas escalas; não é uma dimensão fractal científica.

A validação abre os buffers efetivos do visualizador e a malha glTF montanhosa, confronta cada vértice com o heightmap local, confirma cobertura e quantidade de triângulos e verifica `altura_final = altura_inicial − erosão + deposição`. A reprodução compara os campos numéricos e os arquivos geográficos, incluindo os novos buffers, byte a byte. O relatório registra os testes executados e falha com código não zero quando houver problema. `--reproduce` usa uma pasta temporária; a comparação não se limita à seed escrita no JSON.

A identidade numérica oficial está em `world.json:numeric_fingerprint`; cada campo tem seu hash de bytes e de arquivo. Use as versões fixadas de Python/dependências para repetir os bytes numéricos. Paridade entre versões diferentes de NumPy/SciPy ou sistemas de ponto flutuante não é prometida. Mudanças de resolução produzem uma nova discretização e podem escolher um centro diferente para a ravina; não são o mesmo artefato raster.

## Limites e próximos trabalhos

Esta entrega prepara a **geografia e seus dados**, com inspeção independente. A geração é um modelo artístico coerente e simplificado: não simula movimento de placas ao longo do tempo, estações, cheias, erosão hidráulica completa, sedimentos granulométricos ou vegetação individual. A evolução de canais e encostas modifica de fato as alturas, mas seus parâmetros temporais e de material não foram calibrados para uma região real. O macro relevo e os nichos anômalos são orientados por campos geográficos contínuos e seed fixa. A disponibilidade dos 15 biomas é verificada, não garantida para qualquer configuração arbitrária.

A malha da ravina prepara cavernas, patamares, grandes raízes e cursos d'água; precisará de materiais finais, revisão de escala jogável, navegação, colisão e refinamento antes de exploração em primeira pessoa. O visualizador continental reduz a amostragem para manter desempenho; o novo botão montanhoso carrega um recorte local mais fino, mas não transforma todo o mundo em terreno de 125 m. Os detalhes da ravina devem ser inspecionados pela renderização local e pelo glTF em uma ferramenta 3D. Rocha, vegetação e neve recebem materiais de inspeção; não são texturas finais do jogo. A escala de relevo exagerada nas imagens/visualizador é indicada e não altera os dados.

Nenhum arquivo fora deste diretório faz parte da alteração. A integração posterior deve consumir o formato versionado sem executar o gerador no navegador e sem reconstruir o mundo por hexágono.
