# Wildhaven — detritívoros 3D para Auralis

Branch: wildhaven-fauna-detritivores-3d (base: wildhaven-alpha01-deploy).

Os três modelos são malhas 3D construídas em Three.js, com geometrias poligonais,
carapaças segmentadas e juntas reais (Object3D pivots). Não são sprites nem PNGs.

| Espécie | Habitat | Anatomia | Animação especial |
|---|---|---|---|
| Cascarrumo | Florestas | 12 pares de patas, 8 placas dorsais, antenas e mandíbulas | defesa da carapaça |
| Dunébrio | Deserto | 3 pares de patas, élitros rígidos, antenas e mandíbulas | repouso/escavação simulada |
| Nivélio | Neve | 3 pares de patas, cerdas, antenas e fúrcula | salto de fuga |

Implementação:
- src/rendering/detritivores.ts: três modelos, hierarquia de juntas, malhas, sete animações.
- src/rendering/models.ts: fábrica original passa a despachar essas espécies.
- src/rendering/scene.ts: atualiza cada pose de acordo com ação/movimento.
- src/creatures/species.ts: catálogo, dieta e bioma.
- src/world/create.ts: oito Cascarrumos são introduzidos no mapa temperado existente.
- creatures.html: inspetor interativo dos três modelos e animações.

Execução local: npm ci && npm run dev (abrir /creatures.html para inspecionar).
Build: npm run build. Testes: npm test.

**Escopo**: os modelos são procedurais e animados em tempo real pelo Three.js.
Não há esqueleto exportado como GLB nem AnimationClips glTF neste incremento.
O deserto e a neve ainda não existem na Alpha 0.1; por isso os dois modelos
não são introduzidos artificialmente na floresta. A simulação usa um estado
básico de alimentação, ainda não um balanço detalhado de nutrientes/cadáveres.
Nenhum dos hexágonos do workshop foi alterado.
