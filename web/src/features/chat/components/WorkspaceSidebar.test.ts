import { describe, expect, it, vi } from "vitest";

import { scrollSidebarListByPage } from "./WorkspaceSidebar";

describe("WorkspaceSidebar keyboard paging", () => {
  it("scrolls one page down using the visible list height", () => {
    const scrollBy = vi.fn();

    scrollSidebarListByPage(
      {
        clientHeight: 420,
        scrollBy,
      },
      "down"
    );

    expect(scrollBy).toHaveBeenCalledWith({
      top: 348,
      behavior: "smooth",
    });
  });

  it("uses a safe minimum distance when the sidebar is short", () => {
    const scrollBy = vi.fn();

    scrollSidebarListByPage(
      {
        clientHeight: 120,
        scrollBy,
      },
      "up"
    );

    expect(scrollBy).toHaveBeenCalledWith({
      top: -96,
      behavior: "smooth",
    });
  });
});
