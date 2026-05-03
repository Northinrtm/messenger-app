import { describe, expect, it } from "vitest";

import { ApiError } from "../../lib/api";
import {
  ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE,
} from "../../lib/e2eeShared";
import { buildUnlockErrorPresentation } from "./unlockErrorPresentation";

describe("buildUnlockErrorPresentation", () => {
  it("marks previous-password recovery errors as resettable", () => {
    const presentation = buildUnlockErrorPresentation(
      new ApiError(ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE, 409)
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.canReset).toBe(true);
    expect(presentation?.title).toContain("previous password");
  });

  it("includes browser-session guidance for restore failures", () => {
    const presentation = buildUnlockErrorPresentation(
      new ApiError(ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE, 409)
    );

    expect(presentation).not.toBeNull();
    expect(
      presentation?.detailLines.some((line) => line.includes("another browser session still opens encrypted chats"))
    ).toBe(true);
  });

  it("classifies trusted-browser re-enrollment failures without enabling reset", () => {
    const presentation = buildUnlockErrorPresentation(
      new ApiError("Browser unlock failed. Re-enter your password and trust this browser again", 400)
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.canReset).toBe(false);
    expect(presentation?.title).toContain("set up again");
  });
});
