# WILDHAVEN — ROCANTRAZ · DOSSIÊ 3D

**Escopo desta entrega:** assets de fauna apenas. Não modificar Alpha 0.1, geração de mundos, saves, IA de caça ou introdução da espécie no mapa jogável. A branch é um pacote independente para futura integração.

## Espécie
- Nome: Rocantraz
- Ecologia: carnívoro de topo da teia alimentar, raro, territorial e geralmente solitário.
- Variantes geográficas (mesma espécie):
  - **Florestal/montanhosa:** placas verde-musgo, líquens geométricos, chifres mais curtos e robustos; florestas tropicais e temperadas e regiões montanhosas.
  - **Desértica:** placas cor de ferrugem e areia, chifres mais projetados, adaptação à dissipação de calor; desertos rochosos, dunas e cânions.
- Inspiração de porte: grandes predadores blindados fictícios, anatomia independente para Wildhaven.

## Parâmetros iniciais de design (não implementados na simulação)
| Característica | Design |
|---|---|
| Comprimento | 8–12 m (incluindo cauda) |
| Altura | 4–6 m |
| Massa | 6–12 t |
| Vida | 60–100 anos |
| Ovos por ninhada | 1–3 |
| Território | 50–200 km² |
| Campo visual horizontal | aproximadamente 270° |
| Visão concentrada | 120° |
| Odor | rastreamento próximo, com sensor omnidirecional |
| Velocidade de caminhada | 4–8 km/h |
| Velocidade sustentada | 20–30 km/h |
| Pico de investida | 40–55 km/h por 4–7 s |
| Estratégia florestal | emboscada e perseguição de curta duração entre árvores, afloramentos e rochas |
| Estratégia desértica | vigilância em cristas rochosas, patrulha crepuscular, investida curta |
| Dieta | grandes herbívoros, carnívoros intermediários e carniça |
| Raridade | muito rara; grandes territórios e baixa densidade |

As medidas são referências do ecossistema fictício, sujeitas a balanceamento antes de entrar no jogo.

## Modelo 3D real
- Código de geometria: `src/rendering/rocantraz.ts`.
- Corpo 3D poligonal, placas blindadas, membros com garras, focinho dentado, crânio chifrudo, cauda de 6 segmentos articulados e pigmentação específica por bioma.
- Rigs criados com `THREE.Group` hierárquicos nomeados, sem esqueleto skinned; exportados ao glTF com trilhas de transformação por junta.
- Não é imagem/sprite, nem modelo IA gerado a partir do conceito.
- Originais com topologia por peças geométricas; não usar como escultura orgânica high-poly.

## Animações exportáveis
12 clipes por variante, amostrados para `AnimationClip`:
`idle`, `walk`, `stalk`, `run`, `charge`, `bite`, `swipe`, `roar`, `feed`, `defend`, `rest`, `die`.

Clipes incluem rotação e translação dos pivôs, incluindo pernas, braços, mandíbula, cabeça e cauda.

## Arquivos e acesso
- `src/creatures/rocantraz.ts`: ficha de biologia e parâmetros de percepção.
- `src/rendering/rocantraz.ts`: malhas 3D, os dois rigs, animações e keyframe clips.
- `src/rendering/export-rocantraz.ts`: GLTFExporter para gerar GLB.
- `tools/export-rocantraz.ts`: exportador Node para criar as versões binárias.
- `rocantraz.html` e `src/rocantraz-preview.ts`: inspetor independente de anatomia/animacões (Vite dev).
- `tests/rocantraz.test.ts`: valida superfícies, rigs, clipes, ângulo visual e duas variantes.
- Após execução do workflow, `assets/fauna/rocantraz/rocantraz-forest-animated.glb` e `rocantraz-desert-animated.glb` serão gerados e versionados na branch.

### Como executar separadamente
Na pasta `wildhaven`:
```sh
npm ci
npm run dev
```
Acessar `http://127.0.0.1:5173/rocantraz.html`. Nenhum spawn foi adicionado à Alpha 0.1.

Para exportar localmente:
```sh
node --import tsx tools/export-rocantraz.ts
```

## Revisão anatômica v2 — mais próxima da arte conceitual

- A silhueta foi reconstruída: tronco cônico com tórax largo e cintura mais estreita; abdômen não é mais uma esfera única.
- Músculos e focinho usam malhas próprias construídas por secções transversais (lofts) com normais 3D.
- Cabeça mais longa, supercílios salientes, mandíbula independente, presas e chifres direcionais.
- Armadura osteodérmica sobreposta, crista serrilhada contínua nas costas e cauda mais longa com oito segmentos.
- Patas traseiras articulam quadril, joelho e tornozelo separadamente; braços articulam ombro, cotovelo e punho.
- Esquema de movimento pesado inclui deslocamento do centro de massa, flexão do joelho no passo, compensação do tornozelo, movimentos secundários do pescoço e ondulação retardada na cauda.
- Florestal tem líquens como pequenos elementos geométricos reais. Desértico usa placas arenosas e chifres mais projetados.
- Permanecem **modelos mid-poly estilizados**; não são esculturas fotorrealistas nem copiam todos os microdetalhes da pintura conceitual.
- Nenhuma alteração no runtime do jogo foi feita; todos os arquivos novos ficam isolados nesta branch de fauna.
