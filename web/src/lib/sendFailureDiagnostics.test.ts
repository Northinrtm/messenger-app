import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import { buildNormalizedSendFailure } from "./sendFailureDiagnostics";

describe("buildNormalizedSendFailure", () => {
  it("classifies realtime ack timeouts as websocket timeout failures", () => {
    const failure = buildNormalizedSendFailure(
      new ApiError("Message send confirmation timed out. Retry the same message.", 504),
      {
        steps: [
          {
            name: "transport:selected",
            at: "2026-04-28T12:00:00.000Z",
            elapsedMs: 1,
            detail: { transport: "ws" },
          },
          {
            name: "realtime:ackTimeout",
            at: "2026-04-28T12:00:01.000Z",
            elapsedMs: 1000,
            detail: null,
          },
        ],
      },
      true
    );

    expect(failure).toMatchObject({
      code: "realtime_ack_timeout",
      category: "timeout",
      transport: "ws",
      stage: "realtime:ackTimeout",
      retryable: true,
      status: 504,
    });
  });

  it("classifies realtime unavailability as websocket transport failure", () => {
    const failure = buildNormalizedSendFailure(
      new ApiError("Realtime connection is unavailable. Retry after reconnect.", 503),
      {
        steps: [
          {
            name: "transport:selected",
            at: "2026-04-28T12:00:00.000Z",
            elapsedMs: 1,
            detail: { transport: "ws", realtimeReady: false },
          },
        ],
      },
      true
    );

    expect(failure).toMatchObject({
      code: "realtime_unavailable",
      category: "transport",
      transport: "ws",
      stage: "transport:selected",
      details: [],
    });
  });
});
