import { ApiError } from "./api";
import type { SendDiagnosticRecord, SendDiagnosticStep } from "./sendDiagnostics";

export type NormalizedSendFailureCategory =
  | "transport"
  | "timeout"
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
  | "auth_session_ended"
  | "duplicate_pending"
  | "request_conflict"
  | "request_invalid"
  | "server_error"
  | "unknown";

export type NormalizedSendFailureTransport =
  | "ws"
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
      return "Preparation timed out";
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
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.name === "transport:selected") {
      const transport = step.detail?.transport;
      if (transport === "ws") {
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
  return "unknown";
}

function inferSendFailureStage(steps: SendDiagnosticStep[]) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const stepName = steps[index]?.name;
    if (!stepName || stepName === "onError") {
      continue;
    }
    if (stepName.endsWith(":error") || stepName.endsWith("ackTimeout")) {
      return stepName;
    }
  }

  return steps.at(-1)?.name ?? null;
}

function classifySendFailure(status: number | null, message: string): Pick<
  NormalizedSendFailure,
  "category" | "code"
> {
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
