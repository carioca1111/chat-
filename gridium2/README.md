# Gridium 2 — Alpha 0.1 Core

Clean-room rewrite of Gridium focused on predictable performance and a small runtime surface.

## Alpha 0.1 scope

- Four persistent, isolated PokeIdle.io sessions (`persist:gridium2-account-1..4`)
- Native `WebContentsView` account rendering instead of embedding game DOM into the UI
- 1 / 2 / 4 account layouts
- Per-account navigation controls
- Google/auth popup kept in the same account session, with Chromium-only user agent
- Preact control shell with no UI polling
- One central telemetry sampler for total Electron CPU/RAM/process count and main event-loop delay
- Hidden account views are detached from the window but their web contents/sessions stay alive
- Context isolation, sandboxing, no Node integration in game/auth renderer processes
- Windows NSIS build through GitHub Actions

## Performance rules

Gridium 2 does not claim to be “2x faster” until a same-condition benchmark against Gridium 11.8.7 proves it. Alpha 0.1 establishes the clean baseline before Hunt, Shiny, Market, Sniper, mirroring or analytics are added.

## Development

```bash
npm install
npm test
npm run dev
```

## Windows build

```bash
npm run dist:win
```

Output: `release/Gridium-2-Alpha-0.1-Setup.exe`
