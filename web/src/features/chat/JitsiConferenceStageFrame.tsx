import { useEffect, useRef, useState } from "react";

export type ConferenceParticipantRole = "moderator" | "participant";

type Props = {
  baseUrl: string;
  roomName: string;
  displayName: string;
  title: string;
  onRoleChange?: (role: ConferenceParticipantRole | null) => void;
  onConferenceExit?: () => void;
};

type PlaceholderOptions = {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ScopedBridgeMessage = {
  postis: true;
  scope: string;
  method: string;
  params?: unknown;
};

type ScopedMessageBridge = {
  destroy: () => void;
  send: (payload: unknown) => void;
};

type JitsiEventPayload = {
  name?: string;
  role?: string;
};

type JitsiTransportMessage = {
  data?: JitsiEventPayload;
  type?: string;
};

type ScopedMessageBridgeOptions = {
  allowedOrigin: string;
  onMessage: (payload: unknown) => void;
  scope: string;
  targetWindow: Window;
};

const BRIDGE_MESSAGE_METHOD = "message";
const BRIDGE_READY_METHOD = "__ready__";
const MINIMAL_TOOLBAR_BUTTONS = [
  "microphone",
  "camera",
  "desktop",
  "tileview",
  "fullscreen",
  "settings",
  "hangup",
];

let jitsiExternalApiId = 0;

export function JitsiConferenceStage({
  baseUrl,
  roomName,
  displayName,
  title,
  onRoleChange,
  onConferenceExit,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const roleChangeRef = useRef(onRoleChange);
  const conferenceExitRef = useRef(onConferenceExit);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    roleChangeRef.current = onRoleChange;
  }, [onRoleChange]);

  useEffect(() => {
    conferenceExitRef.current = onConferenceExit;
  }, [onConferenceExit]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let isConferenceClosed = false;
    let bridge: ScopedMessageBridge | null = null;

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const baseUrlObject = new URL(normalizedBaseUrl);
    const { boshUrl, websocketUrl } = createConferenceTransportUrls(baseUrlObject);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedConferenceTitle = normalizeConferenceTitle(title);
    const externalApiId = jitsiExternalApiId++;

    renderConferencePlaceholder(host, {
      message: "Подключаем видеоконференцию...",
    });
    roleChangeRef.current?.(null);

    const retryConference = () => {
      setRetryToken((value) => value + 1);
    };

    const handleConferenceExit = () => {
      if (isConferenceClosed) {
        return;
      }

      isConferenceClosed = true;
      roleChangeRef.current?.(null);
      bridge?.destroy();
      bridge = null;

      if (!cancelled && conferenceExitRef.current) {
        conferenceExitRef.current();
        return;
      }

      if (!cancelled && hostRef.current) {
        renderConferencePlaceholder(hostRef.current, {
          title: "Видеоконференция завершена.",
          message: "Можно снова подключиться к этой комнате без перехода на страницу Jitsi.",
          actionLabel: "Подключиться снова",
          onAction: retryConference,
        });
      }
    };

    const syncConferenceIdentity = () => {
      if (!bridge) {
        return;
      }

      if (normalizedDisplayName) {
        sendConferenceCommand(bridge, "display-name", normalizedDisplayName);
      }

      if (normalizedConferenceTitle) {
        sendConferenceCommand(bridge, "subject", normalizedConferenceTitle);
      }
    };

    const handleTransportMessage = (payload: unknown) => {
      if (!isJitsiTransportMessage(payload)) {
        return;
      }

      const eventPayload = payload.data;
      if (!eventPayload || typeof eventPayload.name !== "string") {
        return;
      }

      switch (eventPayload.name) {
        case "ready":
          syncConferenceIdentity();
          return;
        case "video-conference-joined":
          roleChangeRef.current?.(null);
          syncConferenceIdentity();
          return;
        case "participant-role-changed":
          roleChangeRef.current?.(
            eventPayload.role === "moderator" ? "moderator" : "participant"
          );
          return;
        case "video-conference-left":
        case "video-ready-to-close":
          handleConferenceExit();
          return;
        default:
          return;
      }
    };

    try {
      host.replaceChildren();
      const iframe = createConferenceFrame(
        host,
        buildConferenceFrameUrl({
          baseUrl: normalizedBaseUrl,
          boshUrl,
          displayName: normalizedDisplayName,
          externalApiId,
          roomName,
          title: normalizedConferenceTitle,
          websocketUrl,
        }),
        title
      );

      if (!iframe.contentWindow) {
        throw new Error("Jitsi iframe is unavailable");
      }

      bridge = createScopedMessageBridge({
        allowedOrigin: baseUrlObject.origin,
        onMessage: handleTransportMessage,
        scope: `jitsi_meet_external_api_${externalApiId}`,
        targetWindow: iframe.contentWindow,
      });
    } catch {
      renderConferencePlaceholder(host, {
        title: "Не удалось открыть видеоконференцию.",
        message: "Проверьте доступность Jitsi и повторите попытку.",
        actionLabel: "Повторить",
        onAction: retryConference,
      });
      roleChangeRef.current?.(null);
    }

    return () => {
      cancelled = true;
      roleChangeRef.current?.(null);
      bridge?.destroy();
      host.replaceChildren();
    };
  }, [baseUrl, displayName, retryToken, roomName, title]);

  return <div ref={hostRef} className="conference-embed-host" />;
}

function buildConferenceFrameUrl(input: {
  baseUrl: string;
  boshUrl: string;
  displayName: string;
  externalApiId: number;
  roomName: string;
  title: string;
  websocketUrl: string;
}) {
  const url = new URL(`${encodeURIComponent(input.roomName)}`, `${input.baseUrl}/`);
  const hashParams = new URLSearchParams();

  hashParams.set("jitsi_meet_external_api_id", String(input.externalApiId));
  hashParams.set("config.prejoinPageEnabled", JSON.stringify(false));
  hashParams.set("config.prejoinConfig.enabled", JSON.stringify(false));
  hashParams.set("config.prejoinConfig.hideDisplayName", JSON.stringify(true));
  hashParams.set("config.requireDisplayName", JSON.stringify(false));
  hashParams.set("config.disableDeepLinking", JSON.stringify(true));
  hashParams.set("config.disableInviteFunctions", JSON.stringify(true));
  hashParams.set("config.disablePolls", JSON.stringify(true));
  hashParams.set("config.disableReactions", JSON.stringify(true));
  hashParams.set("config.enableClosePage", JSON.stringify(false));
  hashParams.set("config.welcomePage.disabled", JSON.stringify(true));
  hashParams.set("config.whiteboard.enabled", JSON.stringify(false));
  hashParams.set("config.bosh", JSON.stringify(input.boshUrl));
  hashParams.set("config.websocket", JSON.stringify(input.websocketUrl));
  hashParams.set("config.toolbarButtons", JSON.stringify(MINIMAL_TOOLBAR_BUTTONS));

  if (input.displayName) {
    hashParams.set("userInfo.displayName", JSON.stringify(input.displayName));
  }

  if (input.title) {
    hashParams.set("config.subject", JSON.stringify(input.title));
  }

  return `${url.toString()}#${hashParams.toString()}`;
}

function createConferenceFrame(host: HTMLDivElement, src: string, title: string) {
  const iframe = document.createElement("iframe");
  iframe.className = "conference-frame";
  iframe.allow = "camera; microphone; fullscreen; display-capture";
  iframe.title = title;
  iframe.name = `messengerConferenceFrame${Date.now()}`;
  iframe.setAttribute("allowFullScreen", "true");
  iframe.style.border = "0";
  iframe.src = src;
  host.replaceChildren(iframe);
  return iframe;
}

function createScopedMessageBridge(options: ScopedMessageBridgeOptions): ScopedMessageBridge {
  let destroyed = false;
  let isReady = false;
  let readyTimerId: number | null = null;
  const pendingQueue: unknown[] = [];
  const readyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const postMessage = (method: string, params?: unknown) => {
    const payload: ScopedBridgeMessage = {
      postis: true,
      scope: options.scope,
      method,
      params,
    };
    options.targetWindow.postMessage(JSON.stringify(payload), options.allowedOrigin);
  };

  const flushQueue = () => {
    if (!isReady || destroyed) {
      return;
    }

    while (pendingQueue.length > 0) {
      postMessage(BRIDGE_MESSAGE_METHOD, pendingQueue.shift());
    }
  };

  const completeReady = () => {
    if (isReady || destroyed) {
      return;
    }

    isReady = true;
    if (readyTimerId !== null) {
      window.clearInterval(readyTimerId);
      readyTimerId = null;
    }
    flushQueue();
  };

  const handleMessage = (event: MessageEvent) => {
    if (destroyed || event.origin !== options.allowedOrigin || typeof event.data !== "string") {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (!isScopedBridgeMessage(payload, options.scope)) {
      return;
    }

    if (payload.method === BRIDGE_READY_METHOD) {
      if (payload.params === readyToken) {
        completeReady();
        return;
      }

      postMessage(BRIDGE_READY_METHOD, payload.params);
      return;
    }

    if (payload.method === BRIDGE_MESSAGE_METHOD) {
      options.onMessage(payload.params);
    }
  };

  window.addEventListener("message", handleMessage);
  readyTimerId = window.setInterval(() => {
    postMessage(BRIDGE_READY_METHOD, readyToken);
  }, 50);
  postMessage(BRIDGE_READY_METHOD, readyToken);

  return {
    destroy: () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      pendingQueue.length = 0;
      if (readyTimerId !== null) {
        window.clearInterval(readyTimerId);
        readyTimerId = null;
      }
      window.removeEventListener("message", handleMessage);
    },
    send: (payload: unknown) => {
      if (destroyed) {
        return;
      }

      if (!isReady) {
        pendingQueue.push(payload);
        return;
      }

      postMessage(BRIDGE_MESSAGE_METHOD, payload);
    },
  };
}

function sendConferenceCommand(
  bridge: ScopedMessageBridge,
  commandName: string,
  ...args: unknown[]
) {
  bridge.send({
    data: {
      data: args,
      name: commandName,
    },
    type: "event",
  });
}

function isJitsiTransportMessage(payload: unknown): payload is JitsiTransportMessage {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as JitsiTransportMessage;
  return candidate.type === "event";
}

function isScopedBridgeMessage(payload: unknown, scope: string): payload is ScopedBridgeMessage {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as ScopedBridgeMessage;
  return (
    candidate.postis === true &&
    candidate.scope === scope &&
    typeof candidate.method === "string"
  );
}

function normalizeBaseUrl(value: string) {
  const fallbackOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const normalizedUrl = new URL(value, fallbackOrigin);

  const isLocalAddress =
    normalizedUrl.hostname === "localhost" ||
    normalizedUrl.hostname === "127.0.0.1" ||
    normalizedUrl.hostname === "::1";

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "http:" &&
    isLocalAddress &&
    normalizedUrl.protocol === "https:"
  ) {
    normalizedUrl.protocol = "http:";
  }

  return normalizedUrl.toString().replace(/\/+$/, "");
}

function createConferenceTransportUrls(baseUrl: URL) {
  const httpUrl = new URL(baseUrl.toString());
  httpUrl.protocol = baseUrl.protocol === "https:" ? "https:" : "http:";

  const websocketUrl = new URL(baseUrl.toString());
  websocketUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";

  return {
    boshUrl: `${httpUrl.toString().replace(/\/+$/, "")}/http-bind`,
    websocketUrl: `${websocketUrl.toString().replace(/\/+$/, "")}/xmpp-websocket`,
  };
}

function normalizeDisplayName(value: string) {
  return value.trim();
}

function normalizeConferenceTitle(value: string) {
  return value.trim();
}

function renderConferencePlaceholder(host: HTMLDivElement, options: PlaceholderOptions) {
  const placeholder = document.createElement("div");
  placeholder.className = options.actionLabel
    ? "conference-placeholder conference-placeholder-with-action"
    : "conference-placeholder";

  if (options.title) {
    const titleElement = document.createElement("strong");
    titleElement.textContent = options.title;
    placeholder.append(titleElement);
  }

  const messageElement = document.createElement("span");
  messageElement.textContent = options.message;
  placeholder.append(messageElement);

  if (options.actionLabel && options.onAction) {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "ghost-button compact";
    actionButton.textContent = options.actionLabel;
    actionButton.addEventListener("click", options.onAction);
    placeholder.append(actionButton);
  }

  host.replaceChildren(placeholder);
}
