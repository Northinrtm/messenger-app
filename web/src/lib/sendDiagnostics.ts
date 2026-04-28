export type SendDiagnosticStatus = "STARTED" | "SUCCESS" | "ERROR";

export type SendDiagnosticStep = {
  name: string;
  at: string;
  elapsedMs: number;
  detail: Record<string, unknown> | null;
};

export type SendDiagnosticRecord = {
  clientMessageId: string;
  chatId: string;
  contentLength: number;
  attachmentCount: number;
  participantCount: number;
  startedAt: string;
  startedAtPerfMs: number;
  completedAt: string | null;
  status: SendDiagnosticStatus;
  result: Record<string, unknown> | null;
  steps: SendDiagnosticStep[];
};

const SEND_DIAGNOSTICS_STORAGE_KEY = "north-messenger:send-diagnostics";
const MAX_SEND_DIAGNOSTIC_RECORDS = 25;

export function startSendDiagnostic(input: {
  clientMessageId: string;
  chatId: string;
  contentLength: number;
  attachmentCount: number;
  participantCount: number;
}) {
  if (!input.clientMessageId.trim()) {
    return;
  }

  const startedAt = new Date().toISOString();
  const startedAtPerfMs = getCurrentPerfTime();
  mutateSendDiagnostics((current) => {
    const nextRecord: SendDiagnosticRecord = {
      clientMessageId: input.clientMessageId,
      chatId: input.chatId,
      contentLength: input.contentLength,
      attachmentCount: input.attachmentCount,
      participantCount: input.participantCount,
      startedAt,
      startedAtPerfMs,
      completedAt: null,
      status: "STARTED",
      result: null,
      steps: [],
    };
    const withoutExisting = current.filter(
      (record) => record.clientMessageId !== input.clientMessageId
    );
    return [nextRecord, ...withoutExisting].slice(0, MAX_SEND_DIAGNOSTIC_RECORDS);
  });
}

export function recordSendDiagnosticStep(
  clientMessageId: string,
  name: string,
  detail: Record<string, unknown> | null = null
) {
  if (!clientMessageId.trim()) {
    return;
  }

  mutateSendDiagnostics((current) =>
    current.map((record) => {
      if (record.clientMessageId !== clientMessageId) {
        return record;
      }

      return {
        ...record,
        steps: [
          ...record.steps,
          {
            name,
            at: new Date().toISOString(),
            elapsedMs: roundElapsedMs(getCurrentPerfTime() - record.startedAtPerfMs),
            detail,
          },
        ],
      };
    })
  );
}

export function finishSendDiagnostic(
  clientMessageId: string,
  status: Exclude<SendDiagnosticStatus, "STARTED">,
  result: Record<string, unknown> | null = null
) {
  if (!clientMessageId.trim()) {
    return;
  }

  mutateSendDiagnostics((current) =>
    current.map((record) => {
      if (record.clientMessageId !== clientMessageId) {
        return record;
      }

      return {
        ...record,
        completedAt: new Date().toISOString(),
        status,
        result,
      };
    })
  );
}

export function readSendDiagnosticRecord(clientMessageId: string) {
  if (!clientMessageId.trim()) {
    return null;
  }

  return (
    readSendDiagnostics().find((record) => record.clientMessageId === clientMessageId) ?? null
  );
}

function mutateSendDiagnostics(
  updater: (current: SendDiagnosticRecord[]) => SendDiagnosticRecord[]
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const next = updater(readSendDiagnostics());
    window.sessionStorage.setItem(
      SEND_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify(next.slice(0, MAX_SEND_DIAGNOSTIC_RECORDS))
    );
  } catch {
    return;
  }
}

function readSendDiagnostics() {
  if (typeof window === "undefined") {
    return [] as SendDiagnosticRecord[];
  }

  try {
    const rawValue = window.sessionStorage.getItem(SEND_DIAGNOSTICS_STORAGE_KEY);
    if (!rawValue) {
      return [] as SendDiagnosticRecord[];
    }

    const parsed = JSON.parse(rawValue) as SendDiagnosticRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as SendDiagnosticRecord[];
  }
}

function getCurrentPerfTime() {
  return typeof window !== "undefined" && typeof window.performance?.now === "function"
    ? window.performance.now()
    : Date.now();
}

function roundElapsedMs(value: number) {
  return Math.round(value * 100) / 100;
}
