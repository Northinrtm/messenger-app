import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import {
  getRecoverableEncryptedEnvelopeErrorMode,
  shouldForceRefreshPreparedRecipientsForError,
} from "./e2eeRecoveryPolicy";

describe("e2eeRecoveryPolicy", () => {
  it("classifies stale group history access device mismatches as recoverable session errors", () => {
    expect(
      getRecoverableEncryptedEnvelopeErrorMode(
        new ApiError("Group history key access contains unknown recipient devices", 400)
      )
    ).toBe("session");
  });

  it("classifies sender identity mismatches as recoverable device errors", () => {
    expect(
      getRecoverableEncryptedEnvelopeErrorMode(
        new ApiError(
          "Encrypted device envelope sender identity does not match the registered device",
          400
        )
      )
    ).toBe("device");
  });

  it("ignores unrelated errors", () => {
    expect(getRecoverableEncryptedEnvelopeErrorMode(new ApiError("nope", 500))).toBeNull();
    expect(getRecoverableEncryptedEnvelopeErrorMode(new Error("nope"))).toBeNull();
  });

  it("forces recipient refresh for unknown recipient device mismatches", () => {
    expect(
      shouldForceRefreshPreparedRecipientsForError(
        new ApiError("Encrypted payload contains unknown recipient devices", 400)
      )
    ).toBe(true);
    expect(
      shouldForceRefreshPreparedRecipientsForError(
        new ApiError("Group history key access contains unknown recipient devices", 400)
      )
    ).toBe(true);
    expect(
      shouldForceRefreshPreparedRecipientsForError(
        new ApiError("Encrypted device envelope message counter is stale", 400)
      )
    ).toBe(false);
  });
});
