import { describe, expect, it } from "vitest";

import { parseGroupHistoryKeyGrantPayload } from "./e2eeGroupEngine";

describe("e2eeGroupEngine", () => {
  it("parses group history key grants with expected aad version", () => {
    expect(
      parseGroupHistoryKeyGrantPayload(
        JSON.stringify({
          aadVersion: 1,
          context: "north.group-history-key-grant.v1",
          chatId: "chat",
          historyKeyId: "history",
          historyKey: "key-material",
          membershipVersion: 3,
          historyPolicy: "FULL_HISTORY",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        1
      )
    ).toMatchObject({
      chatId: "chat",
      historyKeyId: "history",
      historyKey: "key-material",
      membershipVersion: 3,
      historyPolicy: "FULL_HISTORY",
    });
  });
});
