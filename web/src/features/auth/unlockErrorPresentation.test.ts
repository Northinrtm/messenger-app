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
      new ApiError(ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE, 409),
      { encryptionDeviceCount: 1 }
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.canReset).toBe(true);
    expect(presentation?.title).toContain("previous password");
  });

  it("includes registered device guidance for restore failures", () => {
    const presentation = buildUnlockErrorPresentation(
      new ApiError(ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE, 409),
      { encryptionDeviceCount: 3 }
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.detailLines.some((line) => line.includes("3 registered encryption devices"))).toBe(
      true
    );
    expect(presentation?.detailLines.some((line) => line.includes("keep it signed in"))).toBe(true);
  });

  it("classifies trusted-device re-enrollment failures without enabling reset", () => {
    const presentation = buildUnlockErrorPresentation(
      new ApiError("Device unlock failed. Re-enter your password and trust this device again", 400),
      { encryptionDeviceCount: 2 }
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.canReset).toBe(false);
    expect(presentation?.title).toContain("set up again");
  });
});
