import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import { ENCRYPTION_INITIALIZING_MESSAGE } from "./e2eeShared";
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

  it("preserves http fallback failures as a mixed transport path", () => {
    const failure = buildNormalizedSendFailure(
      new ApiError("HTTP fallback failed", 503, ["gateway timeout"]),
      {
        steps: [
          {
            name: "transport:selected",
            at: "2026-04-28T12:00:00.000Z",
            elapsedMs: 1,
            detail: { transport: "ws" },
          },
          {
            name: "transport:httpFallback:start",
            at: "2026-04-28T12:00:01.000Z",
            elapsedMs: 500,
            detail: { triggerStatus: 504 },
          },
          {
            name: "transport:httpFallback:error",
            at: "2026-04-28T12:00:02.000Z",
            elapsedMs: 1000,
            detail: { status: 503 },
          },
        ],
      },
      true
    );

    expect(failure).toMatchObject({
      code: "server_error",
      category: "server",
      transport: "ws+http-fallback",
      stage: "transport:httpFallback:error",
      details: ["gateway timeout"],
    });
  });

  it("marks initialization failures as encryption issues", () => {
    const failure = buildNormalizedSendFailure(
      new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409),
      null,
      true
    );

    expect(failure).toMatchObject({
      code: "encryption_initializing",
      category: "encryption",
      transport: "unknown",
      stage: null,
      retryable: true,
      status: 409,
    });
  });
});
