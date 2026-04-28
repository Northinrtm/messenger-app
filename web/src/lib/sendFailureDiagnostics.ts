import { ApiError } from "./api";
import {
  ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
  ENCRYPTION_INITIALIZING_MESSAGE,
} from "./e2eeShared";
import type { SendDiagnosticRecord, SendDiagnosticStep } from "./sendDiagnostics";

export type NormalizedSendFailureCategory =
  | "transport"
  | "timeout"
  | "encryption"
  | "auth"
  | "request"
  | "server"
  | "unknown";

export type NormalizedSendFailureCode =
  | "realtime_unavailable"
  | "realtime_publish_failed"
  | "realtime_connection_interrupted"
  | "realtime_ack_timeout"
  | "message_preparation_timeout"
  | "encryption_initializing"
  | "encryption_identity_changed"
  | "encryption_error"
  | "auth_session_ended"
  | "duplicate_pending"
  | "request_conflict"
  | "request_invalid"
  | "server_error"
  | "unknown";

export type NormalizedSendFailureTransport =
  | "ws"
  | "http"
  | "ws+http-fallback"
  | "unknown";

export type NormalizedSendFailure = {
  code: NormalizedSendFailureCode;
  category: NormalizedSendFailureCategory;
  transport: NormalizedSendFailureTransport;
  stage: string | null;
  lastStep: string | null;
  retryable: boolean;
  status: number | null;
  message: string;
  details: string[];
};

export type StoredSendFailureSummary = Pick<
  NormalizedSendFailure,
  "code" | "category" | "message" | "retryable"
> & {
  describedMessage: string | null;
};

export function buildNormalizedSendFailure(
  error: unknown,
  diagnosticRecord: Pick<SendDiagnosticRecord, "steps"> | null,
  retryable: boolean
): NormalizedSendFailure {
  const apiError = error instanceof ApiError ? error : null;
  const message =
    apiError?.message ??
    (error instanceof Error && error.message.trim() ? error.message : "Unexpected error");
  const status = apiError?.status ?? null;

  return {
    ...classifySendFailure(status, message),
    transport: inferSendFailureTransport(diagnosticRecord?.steps ?? []),
    stage: inferSendFailureStage(diagnosticRecord?.steps ?? []),
    lastStep: diagnosticRecord?.steps.at(-1)?.name ?? null,
    retryable,
    status,
    message,
    details: apiError?.details ?? [],
  };
}

export function parseStoredSendFailure(
  result: Record<string, unknown> | null | undefined
): StoredSendFailureSummary | null {
  if (!result) {
    return null;
  }

  const code = result.code;
  const category = result.category;
  const message = result.message;
  const retryable = result.retryable;
  if (
    typeof code !== "string" ||
    typeof category !== "string" ||
    typeof message !== "string" ||
    typeof retryable !== "boolean"
  ) {
    return null;
  }

  return {
    code: code as NormalizedSendFailureCode,
    category: category as NormalizedSendFailureCategory,
    message,
    retryable,
    describedMessage:
      typeof result.describedMessage === "string" && result.describedMessage.trim()
        ? result.describedMessage
        : null,
  };
}

export function getSendFailureDisplayLabel(
  failure: StoredSendFailureSummary | null
) {
  switch (failure?.code) {
    case "realtime_unavailable":
    case "realtime_connection_interrupted":
      return "Waiting for reconnect";
    case "realtime_publish_failed":
      return "Realtime handoff failed";
    case "realtime_ack_timeout":
      return "Confirmation timed out";
    case "message_preparation_timeout":
      return "Encryption timed out";
    case "encryption_initializing":
      return "Encryption device is not ready";
    case "encryption_identity_changed":
      return "Device trust changed";
    case "auth_session_ended":
      return "Session ended";
    case "duplicate_pending":
      return "Already retrying";
    case "request_conflict":
      return "Request conflict";
    case "request_invalid":
      return "Request rejected";
    case "server_error":
      return "Server error";
    case "encryption_error":
      return "Encryption failed";
    default:
      return fallbackSendFailureDisplayLabel(failure);
  }
}

export function getSendFailureDisplayTitle(
  failure: StoredSendFailureSummary | null
) {
  return failure?.describedMessage ?? failure?.message ?? getSendFailureDisplayLabel(failure);
}

function inferSendFailureTransport(
  steps: SendDiagnosticStep[]
): NormalizedSendFailureTransport {
  if (steps.some((step) => step.name.startsWith("transport:httpFallback"))) {
    return "ws+http-fallback";
  }

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.name === "transport:selected") {
      const transport = step.detail?.transport;
      if (transport === "ws" || transport === "http") {
        return transport;
      }
    }
  }

  const stage = inferSendFailureStage(steps);
  if (!stage) {
    return "unknown";
  }
  if (stage.startsWith("realtime:")) {
    return "ws";
  }
  if (stage.startsWith("http:")) {
    return "http";
  }
  return "unknown";
}

function inferSendFailureStage(steps: SendDiagnosticStep[]) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const stepName = steps[index]?.name;
    if (!stepName || stepName === "onError") {
      continue;
    }
    if (
      stepName.endsWith(":error") ||
      stepName.endsWith("ackTimeout") ||
      stepName === "e2ee:recoverableRetry" ||
      stepName === "e2ee:recoverableRetryRecovered"
    ) {
      return stepName;
    }
  }

  return steps.at(-1)?.name ?? null;
}

function classifySendFailure(status: number | null, message: string): Pick<
  NormalizedSendFailure,
  "category" | "code"
> {
  if (message === ENCRYPTION_INITIALIZING_MESSAGE) {
    return {
      category: "encryption",
      code: "encryption_initializing",
    };
  }

  if (message === ENCRYPTION_IDENTITY_CHANGED_MESSAGE) {
    return {
      category: "encryption",
      code: "encryption_identity_changed",
    };
  }

  if (status === 409 && message === "Message send is already pending") {
    return {
      category: "request",
      code: "duplicate_pending",
    };
  }

  if (status === 504 && message === "Message send confirmation timed out. Retry the same message.") {
    return {
      category: "timeout",
      code: "realtime_ack_timeout",
    };
  }

  if (status === 504 && message === "Message send preparation timed out. Retry the same message.") {
    return {
      category: "timeout",
      code: "message_preparation_timeout",
    };
  }

  if (status === 503 && message === "Realtime connection is unavailable. Retry after reconnect.") {
    return {
      category: "transport",
      code: "realtime_unavailable",
    };
  }

  if (status === 503 && message === "Realtime message send failed before it left the client.") {
    return {
      category: "transport",
      code: "realtime_publish_failed",
    };
  }

  if (
    status === 503 &&
    message.startsWith("Realtime connection") &&
    message.includes("before the message was confirmed")
  ) {
    return {
      category: "transport",
      code: "realtime_connection_interrupted",
    };
  }

  if (status === 401) {
    return {
      category: "auth",
      code: "auth_session_ended",
    };
  }

  const normalizedMessage = message.toLowerCase();
  if (
    normalizedMessage.includes("encrypted") ||
    normalizedMessage.includes("encryption") ||
    normalizedMessage.includes("device envelope") ||
    normalizedMessage.includes("device session")
  ) {
    return {
      category: "encryption",
      code: "encryption_error",
    };
  }

  if (status !== null && status >= 500) {
    return {
      category: "server",
      code: "server_error",
    };
  }

  if (status === 409) {
    return {
      category: "request",
      code: "request_conflict",
    };
  }

  if (status !== null && status >= 400) {
    return {
      category: "request",
      code: "request_invalid",
    };
  }

  return {
    category: "unknown",
    code: "unknown",
  };
}

function fallbackSendFailureDisplayLabel(
  failure: StoredSendFailureSummary | null
) {
  switch (failure?.category) {
    case "transport":
      return "Connection problem";
    case "timeout":
      return "Timed out";
    case "encryption":
      return "Encryption failed";
    case "auth":
      return "Session ended";
    case "request":
      return "Request rejected";
    case "server":
      return "Server error";
    default:
      return "Send failed";
  }
}
