# Desktop Client

The desktop client is a Tauri v2 wrapper around the existing React/Vite web
application. The frontend remains shared with the browser build; platform
differences should live behind small adapters in `web/src/lib`.

## Layout

- `web/src` - shared React application
- `web/src-tauri` - Tauri/Rust desktop shell
- `web/.env.desktop.example` - example production endpoints for packaged builds

## Requirements

- Node.js and npm
- Rust toolchain with `cargo` and `rustc`
- Windows: Microsoft WebView2 runtime and Visual Studio Build Tools with C++

## Commands

From `web`:

```bash
npm run desktop:dev
npm run desktop:build
npm run desktop:info
```

`desktop:dev` starts Vite through Tauri's `beforeDevCommand`.
`desktop:build` runs the normal Vite production build first, then packages the
desktop app.

For a production desktop build, create an environment file from
`web/.env.desktop.example` and provide the real API, websocket, and Jitsi URLs
before running `npm run desktop:build`.

## Next Desktop Milestones

1. Add native notifications and route notification clicks to the active chat.
2. Add tray behavior: open, hide, and quit.
3. Add single-instance handling and deep links for invite URLs.
4. Add signed auto-updates through Tauri updater.
5. Move sensitive desktop-only secrets to a protected store.
