# Gridium 3.0.0-alpha.9.12

Continuação da Alpha 9.11 na branch gridium-next. Não migra nem apaga partições das quatro contas.

## Alterações

- Quadros 2×2 quadrados e centralizados; duo/foco, seleção e zoom independente preservados. Cabeçalho em duas linhas e logo corrigido.
- Saldos de Coins, Gemas/Orbs e Diamantes separados, por conta e por timestamp de confirmação WebSocket. Dados ausentes/desatualizados aparecem como —. O cabeçalho não usa valores extraídos genericamente do texto da página.
- Painel com lucro realizado separado de estimativas, capital aplicado/livre, decisões por conta em linguagem simples, estados de anúncio e próximo passo. Métricas reais por moeda: hoje/7d/30d/acumulado, resultado médio, ganho/perda médios, fator de lucro, acerto, drawdown e tempo de venda. Simulação não entra na banca real.
- Diário persistente de ordens; uma operação por conta; resposta incerta não causa reenvio. Confirmações tardias recuperam posições uma vez. Custo usa o preço efetivamente confirmado pelo servidor.
- Associação conservadora de vendas, sem escolher posição arbitrária. Recibo líquido não sofre segunda dedução de taxa. Confirmações ambíguas ficam visíveis para conferência.
- Recuperação de anúncios exige snapshot completo recente; alocação considera quantidades. Falha temporária de anúncio mantém posição/custo, sem lançar perda definitiva.
- Reserva, concentração por ativo, exposição total, margem sob queda de preço, diversidade de vendedores, histórico mínimo e pausa por resultado recente negativo. Nenhuma garantia de lucro ou perfeição.
- Respeito ao teto de 20 anúncios, anúncio único por ativo e cooldown observado. Regras usadas vieram do texto da wiki fornecido pelo usuário; não representam descoberta de endpoints novos.

## Limites explícitos

- Compra/relistagem automática de Pokémon permanece bloqueada nesta versão até haver contabilização confirmada da tarifa de anúncio em Coins (inclusive ao operar em Gemas). O scanner continua analisando Pokémon. Isso evita tratar uma operação com custo adicional não registrado como lucrativa.
- Meus anúncios precisa de um comando de leitura efetivamente observado na sessão; sem ele o sistema aguarda, sem navegar nas telas. Ordens sem recibo e vendas parciais/ambíguas podem exigir conferência e não geram lucro presumido.
- Histórico observado de ofertas não é volume real negociado. Esta versão não contém backtest validado, previsão garantida, importação integral do Pokédex ou modelo treinado. Os arquivos fornecidos não foram publicados com dados pessoais.
- Live Eco preserva o comportamento da Alpha 9.11; não há medição nova de economia nem garantia de bônus Twitch.
- Testes de protocolo usam fixtures; o teste visual usa Edge com dados sintéticos e sem ordens no jogo. Não substituem validação de campo com sessões reais. O instalador só é entregue após a suíte, teste visual e empacotamento Windows passarem.

## Reprodução

O workflow build-gridium-windows-alpha912.yml monta a cadeia original até 9.11, verifica SHA-256 de todos os fontes 9.12, aplica a atualização, valida sintaxe, executa testes, testa geometria/saldos/duo/foco/painel com Edge e gera NSIS. As configurações e sessões existentes são preservadas.
