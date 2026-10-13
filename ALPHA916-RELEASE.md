# Gridium 3.0.0 Alpha 9.16 — Ultra Performance

- DOM incremental e virtualização nativa em “Comprei. E agora?”; linhas são reutilizadas por `position.id`.
- Fast/Slow Render Lanes: estado crítico e posições reais primeiro; rankings, heatmap, journal, auditoria, gráfico e Market Desk em idle lane.
- Modelo profissional calculado no processo separado Alpha Core, não na thread visual do renderer.
- Ultra GPU reduz pintura/efeitos e usa CSS containment sem pausar WebSocket, timers, sessões ou proteções.
- Telemetria interna de FPS, render P50/P95 e Long Tasks.
- Analytics histórico remoto reutiliza o relay autenticado já existente e pode persistir/agregar em PostgreSQL.
- Compra, confirmação real, Kill Switch, Margin Guard e duplicate-order guard continuam locais e independentes da nuvem.
- O relay recebe apenas o payload de telemetria já autorizado; cookies, credenciais e sessão do jogo não entram no analytics.
