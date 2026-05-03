import { ApiError } from "../../lib/api";
import {
  ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
  ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE,
} from "../../lib/e2eeShared";

const PASSWORD_UNLOCK_FAILED_MESSAGE = "Current password could not unlock encrypted chats";
const TRUSTED_BROWSER_NOT_CONFIGURED_MESSAGE =
  "Secure browser unlock is not configured in this browser yet";
const TRUSTED_BROWSER_REENROLL_MESSAGE =
  "Browser unlock failed. Re-enter your password and trust this browser again";
const TRUSTED_BROWSER_UNSUPPORTED_MESSAGE =
  "This browser does not support secure browser unlock for encrypted chats yet";
const TRUSTED_BROWSER_PRF_UNAVAILABLE_MESSAGE =
  "This authenticator does not expose the secure PRF output required for browser unlock";
const TRUSTED_BROWSER_CANCELLED_MESSAGES = new Set([
  "Browser unlock setup was cancelled",
  "Browser unlock was cancelled",
]);

export type UnlockErrorPresentation = {
  title: string;
  description: string;
  detailLines: string[];
  canReset: boolean;
};

function buildRecoveryDeviceDetailLines(options?: { includeResetWarning?: boolean }) {
  const lines: string[] = [];

  lines.push(
    "If another browser session still opens encrypted chats, keep it signed in until recovery is finished."
  );

  if (options?.includeResetWarning) {
    lines.push(
      "Use reset only after confirming that no other browser session can still unlock the previous encrypted-chat key."
    );
  }

  return lines;
}

function withApiDetails(detailLines: string[], error: ApiError | null) {
  if (!error) {
    return detailLines;
  }

  const normalizedExisting = new Set(detailLines.map((line) => line.trim()));
  for (const detail of error.details) {
    const normalizedDetail = detail.trim();
    if (!normalizedDetail || normalizedExisting.has(normalizedDetail)) {
      continue;
    }
    detailLines.push(normalizedDetail);
    normalizedExisting.add(normalizedDetail);
  }

  return detailLines;
}

export function buildUnlockErrorPresentation(error: unknown): UnlockErrorPresentation | null {
  if (!error) {
    return null;
  }

  const apiError = error instanceof ApiError ? error : null;
  const message =
    error instanceof Error && error.message.trim() ? error.message.trim() : "Unexpected error";

  if (message === ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE) {
    return {
      title: "This browser session still needs the previous password",
      description:
        "Encrypted chats in this browser session are still wrapped with the password that was active before the last account-password change.",
      detailLines: buildRecoveryDeviceDetailLines({
        includeResetWarning: true,
      }),
      canReset: true,
    };
  }

  if (
    message === ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE ||
    message === ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE
  ) {
    return {
      title: "Encrypted chats could not be restored in this browser session",
      description:
        "This account session is active, but this browser could not restore the private key for the existing encrypted chats yet.",
      detailLines: buildRecoveryDeviceDetailLines({
        includeResetWarning: true,
      }),
      canReset: true,
    };
  }

  if (
    message === ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE ||
    message === ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE
  ) {
    return {
      title: "Encrypted-chat recovery data is unreadable",
      description:
        "Recovery data exists for this account, but it could not be used in this browser session.",
      detailLines: buildRecoveryDeviceDetailLines({
        includeResetWarning: true,
      }),
      canReset: true,
    };
  }

  if (message === PASSWORD_UNLOCK_FAILED_MESSAGE) {
    return {
      title: "This password did not unlock this browser session",
      description:
        "The account session is active, but the encrypted-chat key stored for this browser did not reopen with the password you entered.",
      detailLines: withApiDetails(
        [
          "If you changed the account password recently, try the password that encrypted chats were using before the change.",
        ],
        apiError
      ),
      canReset: false,
    };
  }

  if (message === TRUSTED_BROWSER_NOT_CONFIGURED_MESSAGE) {
    return {
      title: "Trusted-browser unlock is not configured here",
      description:
        "Use the encrypted-chat password in this browser, then trust this browser again if you want passwordless unlock later.",
      detailLines: [],
      canReset: false,
    };
  }

  if (message === TRUSTED_BROWSER_REENROLL_MESSAGE) {
    return {
      title: "Trusted-browser unlock needs to be set up again",
      description:
        "The saved trusted factor no longer matches this browser session. Unlock with password, then trust this browser again.",
      detailLines: [],
      canReset: false,
    };
  }

  if (message === TRUSTED_BROWSER_UNSUPPORTED_MESSAGE) {
    return {
      title: "This browser cannot use trusted-browser unlock",
      description:
        "Continue with the encrypted-chat password in this browser instead of the trusted-browser flow.",
      detailLines: [],
      canReset: false,
    };
  }

  if (message === TRUSTED_BROWSER_PRF_UNAVAILABLE_MESSAGE) {
    return {
      title: "This authenticator cannot unlock encrypted chats here",
      description:
        "Use a different authenticator or unlock with password, then trust the device again if needed.",
      detailLines: [],
      canReset: false,
    };
  }

  if (TRUSTED_BROWSER_CANCELLED_MESSAGES.has(message)) {
    return {
      title: "Trusted-browser unlock was cancelled",
      description:
        "No changes were made. Retry the trusted-browser flow or use the encrypted-chat password instead.",
      detailLines: [],
      canReset: false,
    };
  }

  if (apiError?.status === 401) {
    return {
      title: "This session is no longer valid",
      description: "Sign out and log in again before trying to unlock encrypted chats.",
      detailLines: withApiDetails([], apiError),
      canReset: false,
    };
  }

  return {
    title: "Encrypted chats could not be unlocked",
    description: message,
    detailLines: withApiDetails([], apiError),
    canReset: false,
  };
}
