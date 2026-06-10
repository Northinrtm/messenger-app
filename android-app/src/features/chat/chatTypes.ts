/**
 * Shared chat types. Kept in a standalone module so leaf components
 * (e.g. ChatMediaBrowserSheet) can reference them without importing from
 * ChatThreadScreen, which would create a circular module dependency.
 */
export type RunAuthorized = <T>(
  operation: (token: string) => Promise<T>,
) => Promise<T>;
