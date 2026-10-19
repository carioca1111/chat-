# Hunt Intelligence — validação do motor Alpha 0.6.1

## Regras tratadas como medidas/comprovadas nesta versão

- O Pokémon ativo vem exclusivamente de `activeId` do servidor e do registro exato desse ID. Não há fallback por DOM, texto, OCR ou nome visível.
- XP base por abate usado pelo motor: `nível² + 12`. Esta curva foi validada empiricamente no PokeIdle atual por medições de campo em múltiplas Hunts e níveis; ela é diferente da curva acumulada `xpNivel`.
- XP do treinador e XP do Pokémon permanecem separados. O número principal da Hunt é somente XP recebido pelo Pokémon.
- Os seis IVs individuais são usados quando chegam no estado do servidor.
- `stats`, `refino`, `bonusXp.pk`, `bonusXp.tr`, `tmElemental` e `tmAoe` são lidos do estado do servidor quando presentes.
- Potência segue a regra oficial atual: P1 +0%, P2 +5%, P3 +10%, P4 +25% e P5 +100% nos stats.
- Shiny segue a regra oficial atual: stats ×2. Uma documentação comunitária mais antiga ainda descreve ×3; o Gridium deliberadamente segue a regra oficial vigente.
- A tabela de Hunt mantém amplificações observadas como 2,5x e 5,5x, separadas da tabela Pokémon tradicional.
- IV de velocidade reduz cooldown no modelo de golpe em 0,01 s por ponto.
- TM Elemental, quando o tipo chega nominalmente pelo servidor, entra como golpe especial de poder 2800 / cooldown base 60 s. O motor NÃO inventa multiplicador de AOE sem informação de densidade/quantidade de alvos.

## Entradas ainda estimadas

`welcome/estado` não fornece hoje todos os dados necessários para transformar a rota em uma medição exata de combate. Enquanto faltar qualquer uma das entradas abaixo, a UI mostra `PRECISÃO: ESTIMADO`:

- lista completa de golpes equipados/disponíveis com tipo, categoria, poder e cooldown;
- rolagem exata de IV/qualidade/potência/stats do inimigo que acabou de nascer;
- timestamps confiáveis de spawn, início de combate, abate, respawn e deslocamento;
- mortes, curas e tempo parado associados à Hunt atual;
- XP do Pokémon ganho em cada abate/evento de combate;
- densidade/ondas do mapa para modelar AOE e sobreposição de spawns.

Quando `stats` completos do Pokémon chegam do servidor, o motor usa esses stats diretamente. Se eles não chegam, a reconstrução usa os multiplicadores oficiais de potência/shiny, mas qualidade/expoente, refino, stats esperados do inimigo e parte da cadência de combate continuam sendo modelo empírico — por isso a saída permanece `ESTIMADO`.

## Calibração real já suportada pelo motor

O motor aceita amostras de calibração por Hunt com:

- tempo de parede observado;
- abates;
- XP real do Pokémon;
- XP real do treinador (opcional);
- mortes/curas/tempo parado (opcionais).

Uma amostra só passa a ser marcada `CALIBRADO` com pelo menos 120 segundos e 10 abates. Quando há XP real do Pokémon na amostra, XP/h passa a ser calculado diretamente pela variação real de XP dividida pelo tempo observado; portanto downtime já fica embutido na taxa.

A coleta automática dessas amostras ainda depende de mapear os pacotes de batalha além de `welcome/estado`. A Alpha 0.6.1 não finge que esses pacotes já foram identificados.

## Troca de Hunt

A rota mantém a Hunt atual se a alternativa projetada não superar o score atual em pelo menos 3%. Isso evita recomendar troca por ganho insignificante/ruído do modelo. A chave da Hunt inclui região, área, espécie e nível, portanto duas Hunts diferentes do mesmo Pokémon não são mais confundidas como uma única etapa.

## Performance

- catálogo de Hunt/Pokédex é descompactado uma vez e mantido em cache;
- ranking idêntico é memoizado por dados + perfil + objetivo, com cache limitado;
- a tela usa `useMemo` e recalcula quando o perfil/estado relevante muda;
- nenhum polling agressivo, DOM scan ou OCR foi adicionado.
