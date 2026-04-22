type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function isDesktopRuntime() {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as TauriWindow)
  );
}
