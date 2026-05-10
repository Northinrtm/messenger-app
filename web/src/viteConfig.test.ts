// @vitest-environment node

import { describe, expect, it } from "vitest";
import viteConfig, { rewriteStorageProxyPath } from "../vite.config";

describe("vite storage proxy", () => {
  it("strips the /storage prefix before forwarding requests to MinIO", () => {
    expect(rewriteStorageProxyPath("/storage/chat-attachments/file.png")).toBe(
      "/chat-attachments/file.png"
    );

    const storageProxy = (
      viteConfig.server?.proxy as Record<
        string,
        { changeOrigin?: boolean; rewrite?: (path: string) => string }
      >
    )["/storage"];

    expect(storageProxy.rewrite?.("/storage/chat-attachments/file.png")).toBe(
      "/chat-attachments/file.png"
    );
    expect(storageProxy.changeOrigin).toBe(false);
  });
});
