# Desktop Client

Legacy / unsupported target as of `2026-05-13`.

This wrapper still exists in the repository, but new product work should not target desktop. The supported directions are the browser client and the planned Android app.

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

## Historical Note

The section that used to track future desktop milestones is intentionally retired.
Desktop is no longer a supported roadmap direction for this project.
