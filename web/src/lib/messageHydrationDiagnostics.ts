const CURRENT_BUILD_REVISION_STORAGE_KEY = "north-messenger:current-build-revision";

export function rememberCurrentBuildRevision(revision: string) {
  if (typeof window === "undefined" || !revision.trim()) {
    return;
  }

  try {
    window.sessionStorage.setItem(CURRENT_BUILD_REVISION_STORAGE_KEY, revision);
  } catch {
    return;
  }
}
