import { useEffect, useRef, useState } from "react";

export type ConferenceParticipantRole = "moderator" | "participant";
export type ConferenceRecordingState = "idle" | "starting" | "recording" | "stopping" | "failed";
export type ConferenceJoinSettings = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioInputDeviceId?: string | null;
  audioInputDeviceLabel?: string | null;
  videoInputDeviceId?: string | null;
  videoInputDeviceLabel?: string | null;
};

type Props = {
  conferenceId: string;
  baseUrl: string;
  roomName: string;
  displayName: string;
  title: string;
  joinSettings?: ConferenceJoinSettings;
  exitRequestToken?: number;
  jwtTokenFetcher?: () => Promise<string | null>;
  onConferenceEndForAll?: () => void;
  onConferencePresenceTouch?: (conferenceId: string) => void;
  onConferencePresenceLeave?: (conferenceId: string, options?: { keepalive?: boolean }) => void;
  onRecordingStateChange?: (state: ConferenceRecordingState) => void;
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
  key?: string;
  mode?: string;
  name?: string;
  on?: boolean;
  preventExecution?: boolean;
  role?: string;
  status?: string;
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
const JITSI_HIDDEN_DOMAIN = "recorder.meet.jitsi";
const CONFERENCE_PRESENCE_HEARTBEAT_MS = 30_000;
const END_FOR_ALL_EVENT_KEYS = new Set(["end-meeting", "endConference"]);
const MINIMAL_TOOLBAR_BUTTONS = [
  "microphone",
  "camera",
  "desktop",
  "tileview",
  "fullscreen",
  "recording",
  "settings",
  "hangup",
];

let jitsiExternalApiId = 0;

export function ManagedConferenceStage({
  conferenceId,
  baseUrl,
  roomName,
  displayName,
  title,
  joinSettings,
  exitRequestToken = 0,
  jwtTokenFetcher,
  onConferenceEndForAll,
  onConferencePresenceTouch,
  onConferencePresenceLeave,
  onRecordingStateChange,
  onRoleChange,
  onConferenceExit,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const jwtTokenFetcherRef = useRef(jwtTokenFetcher);
  const conferencePresenceTouchRef = useRef(onConferencePresenceTouch);
  const conferencePresenceLeaveRef = useRef(onConferencePresenceLeave);
  const conferenceEndForAllRef = useRef(onConferenceEndForAll);
  const roleChangeRef = useRef(onRoleChange);
  const recordingStateChangeRef = useRef(onRecordingStateChange);
  const conferenceExitRef = useRef(onConferenceExit);
  const requestConferenceExitRef = useRef<(() => void) | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    jwtTokenFetcherRef.current = jwtTokenFetcher;
  }, [jwtTokenFetcher]);

  useEffect(() => {
    conferencePresenceTouchRef.current = onConferencePresenceTouch;
  }, [onConferencePresenceTouch]);

  useEffect(() => {
    conferencePresenceLeaveRef.current = onConferencePresenceLeave;
  }, [onConferencePresenceLeave]);

  useEffect(() => {
    conferenceEndForAllRef.current = onConferenceEndForAll;
  }, [onConferenceEndForAll]);

  useEffect(() => {
    roleChangeRef.current = onRoleChange;
  }, [onRoleChange]);

  useEffect(() => {
    recordingStateChangeRef.current = onRecordingStateChange;
  }, [onRecordingStateChange]);

  useEffect(() => {
    conferenceExitRef.current = onConferenceExit;
  }, [onConferenceExit]);

  useEffect(() => {
    if (exitRequestToken > 0) {
      requestConferenceExitRef.current?.();
    }
  }, [exitRequestToken]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let isConferenceClosed = false;
    let bridge: ScopedMessageBridge | null = null;
    let exitRequested = false;
    let hangupTimerId: number | null = null;
    let presenceHeartbeatId: number | null = null;
    let conferenceLeftDebounceId: number | null = null;
    let localRecordingActive = false;
    let localParticipantJoined = false;
    let endForAllRequested = false;

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const baseUrlObject = new URL(normalizedBaseUrl);
    const { boshUrl, websocketUrl } = createConferenceTransportUrls(baseUrlObject);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedConferenceTitle = normalizeConferenceTitle(title);
    const normalizedJoinSettings = normalizeJoinSettings(joinSettings);
    const externalApiId = jitsiExternalApiId++;

    const updateRecordingState = (nextState: ConferenceRecordingState) => {
      recordingStateChangeRef.current?.(nextState);
    };

    renderConferencePlaceholder(host, {
      message: "Подключаем видеоконференцию...",
    });
    roleChangeRef.current?.(null);
    updateRecordingState("idle");

    const retryConference = () => {
      setRetryToken((value) => value + 1);
    };

    const clearHangupTimer = () => {
      if (hangupTimerId !== null) {
        window.clearTimeout(hangupTimerId);
        hangupTimerId = null;
      }
    };

    const clearPresenceHeartbeat = () => {
      if (presenceHeartbeatId !== null) {
        window.clearInterval(presenceHeartbeatId);
        presenceHeartbeatId = null;
      }
    };

    const touchConferencePresence = () => {
      conferencePresenceTouchRef.current?.(conferenceId);
    };

    const leaveConferencePresence = (keepalive = false) => {
      if (!localParticipantJoined) {
        return;
      }

      localParticipantJoined = false;
      clearPresenceHeartbeat();
      conferencePresenceLeaveRef.current?.(conferenceId, { keepalive });
    };

    const startPresenceHeartbeat = () => {
      localParticipantJoined = true;
      clearPresenceHeartbeat();
      touchConferencePresence();
      presenceHeartbeatId = window.setInterval(() => {
        if (!localParticipantJoined || isConferenceClosed) {
          return;
        }
        touchConferencePresence();
      }, CONFERENCE_PRESENCE_HEARTBEAT_MS);
    };

    const requestConferenceExit = () => {
      if (!bridge || isConferenceClosed || exitRequested) {
        return;
      }

      exitRequested = true;
      clearHangupTimer();
      hangupTimerId = window.setTimeout(() => {
        if (!bridge || isConferenceClosed) {
          return;
        }
        sendConferenceCommand(bridge, "video-hangup");
      }, 0);
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

      if (normalizedJoinSettings.audioInputDeviceId) {
        sendConferenceCommand(
          bridge,
          "setAudioInputDevice",
          normalizedJoinSettings.audioInputDeviceLabel,
          normalizedJoinSettings.audioInputDeviceId
        );
      }

      if (normalizedJoinSettings.videoInputDeviceId) {
        sendConferenceCommand(
          bridge,
          "setVideoInputDevice",
          normalizedJoinSettings.videoInputDeviceLabel,
          normalizedJoinSettings.videoInputDeviceId
        );
      }
    };

    const handleConferenceExit = () => {
      if (isConferenceClosed) {
        return;
      }

      isConferenceClosed = true;
      clearHangupTimer();
      leaveConferencePresence();
      roleChangeRef.current?.(null);
      updateRecordingState("idle");
      bridge?.destroy();
      bridge = null;
      requestConferenceExitRef.current = null;

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

    const handleRecordingStatusChange = (eventPayload: JitsiEventPayload) => {
      if (eventPayload.mode && eventPayload.mode !== "local") {
        return;
      }

      const normalizedStatus =
        typeof eventPayload.status === "string"
          ? eventPayload.status.toLowerCase()
          : eventPayload.on === true
            ? "on"
            : eventPayload.on === false
              ? "off"
              : "";

      switch (normalizedStatus) {
        case "on":
        case "started":
        case "running":
          localRecordingActive = true;
          updateRecordingState("recording");
          return;
        case "off":
        case "stopped":
          if (!exitRequested) {
            localRecordingActive = false;
            updateRecordingState("idle");
          }
          return;
        case "pending":
        case "starting":
        case "retrying":
          localRecordingActive = true;
          updateRecordingState("starting");
          return;
        case "error":
        case "failed":
          localRecordingActive = false;
          updateRecordingState("failed");
          return;
        default:
          return;
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
          // Cancel any pending exit debounce — the participant rejoined.
          if (conferenceLeftDebounceId !== null) {
            window.clearTimeout(conferenceLeftDebounceId);
            conferenceLeftDebounceId = null;
          }
          roleChangeRef.current?.(null);
          syncConferenceIdentity();
          startPresenceHeartbeat();
          return;
        case "participant-role-changed":
          if (eventPayload.role === "moderator") {
            roleChangeRef.current?.("moderator");
            return;
          }
          roleChangeRef.current?.("participant");
          return;
        case "recording-status-changed":
          handleRecordingStatusChange(eventPayload);
          return;
        case "toolbar-button-clicked":
        case "toolbarButtonClicked":
          if (
            typeof eventPayload.key === "string" &&
            END_FOR_ALL_EVENT_KEYS.has(eventPayload.key)
          ) {
            if (endForAllRequested) {
              return;
            }
            endForAllRequested = true;
            conferenceEndForAllRef.current?.();
            return;
          }
          return;
        case "video-conference-left":
          // Jitsi fires this during BOSH reconnects and role promotions — debounce
          // for 4 s so a quick rejoin (video-conference-joined) can cancel the exit.
          if (conferenceLeftDebounceId !== null) {
            window.clearTimeout(conferenceLeftDebounceId);
          }
          conferenceLeftDebounceId = window.setTimeout(() => {
            conferenceLeftDebounceId = null;
            if (!isConferenceClosed && !cancelled) {
              leaveConferencePresence();
              handleConferenceExit();
            }
          }, 4_000);
          return;
        case "video-ready-to-close":
          if (conferenceLeftDebounceId !== null) {
            window.clearTimeout(conferenceLeftDebounceId);
            conferenceLeftDebounceId = null;
          }
          leaveConferencePresence();
          handleConferenceExit();
          return;
        default:
          return;
      }
    };

    const handleBeforeUnload = () => {
      leaveConferencePresence(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    void (async () => {
      let jwtToken: string | null = null;
      if (jwtTokenFetcherRef.current) {
        try {
          jwtToken = await jwtTokenFetcherRef.current();
        } catch {
          // JWT fetch failed — proceed without token
        }
      }

      if (cancelled) {
        return;
      }

      try {
        host.replaceChildren();
        const iframe = createConferenceFrame(
          host,
          buildConferenceFrameUrl({
            baseUrl: normalizedBaseUrl,
            boshUrl,
            displayName: normalizedDisplayName,
            externalApiId,
            joinSettings: normalizedJoinSettings,
            jwtToken,
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
        requestConferenceExitRef.current = requestConferenceExit;
      } catch {
        renderConferencePlaceholder(host, {
          title: "Не удалось открыть видеоконференцию.",
          message: "Проверьте доступность Jitsi и повторите попытку.",
          actionLabel: "Повторить",
          onAction: retryConference,
        });
        roleChangeRef.current?.(null);
        updateRecordingState("failed");
      }
    })();

    return () => {
      cancelled = true;
      clearHangupTimer();
      if (conferenceLeftDebounceId !== null) {
        window.clearTimeout(conferenceLeftDebounceId);
      }
      leaveConferencePresence();
      clearPresenceHeartbeat();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      requestConferenceExitRef.current = null;
      roleChangeRef.current?.(null);
      updateRecordingState("idle");
      bridge?.destroy();
      host.replaceChildren();
    };
  }, [
    baseUrl,
    conferenceId,
    displayName,
    joinSettings?.audioEnabled,
    joinSettings?.audioInputDeviceId,
    joinSettings?.audioInputDeviceLabel,
    joinSettings?.videoEnabled,
    joinSettings?.videoInputDeviceId,
    joinSettings?.videoInputDeviceLabel,
    retryToken,
    roomName,
    title,
  ]);

  return <div ref={hostRef} className="conference-embed-host" />;
}

function buildConferenceFrameUrl(input: {
  baseUrl: string;
  boshUrl: string;
  displayName: string;
  externalApiId: number;
  joinSettings: ConferenceJoinSettings;
  jwtToken: string | null;
  roomName: string;
  title: string;
  websocketUrl: string;
}) {
  const url = new URL(`${encodeURIComponent(input.roomName)}`, `${input.baseUrl}/`);
  if (input.jwtToken) {
    url.searchParams.set("jwt", input.jwtToken);
  }
  const hashParams = new URLSearchParams();

  hashParams.set("jitsi_meet_external_api_id", String(input.externalApiId));
  hashParams.set("config.prejoinPageEnabled", JSON.stringify(false));
  hashParams.set("config.prejoinConfig.enabled", JSON.stringify(false));
  hashParams.set("config.startWithAudioMuted", JSON.stringify(!input.joinSettings.audioEnabled));
  hashParams.set("config.startWithVideoMuted", JSON.stringify(!input.joinSettings.videoEnabled));
  hashParams.set("config.prejoinConfig.hideDisplayName", JSON.stringify(true));
  hashParams.set("config.requireDisplayName", JSON.stringify(false));
  hashParams.set("config.disableDeepLinking", JSON.stringify(true));
  hashParams.set("config.disableInviteFunctions", JSON.stringify(true));
  hashParams.set("config.disablePolls", JSON.stringify(true));
  hashParams.set("config.disableReactions", JSON.stringify(true));
  hashParams.set("config.enableClosePage", JSON.stringify(false));
  hashParams.set("config.welcomePage.disabled", JSON.stringify(true));
  hashParams.set("config.whiteboard.enabled", JSON.stringify(false));
  hashParams.set("config.hiddenDomain", JSON.stringify(JITSI_HIDDEN_DOMAIN));
  hashParams.set("config.fileRecordingsEnabled", JSON.stringify(false));
  hashParams.set("config.fileRecordingsServiceEnabled", JSON.stringify(false));
  hashParams.set("config.localRecording.enabled", JSON.stringify(true));
  hashParams.set("config.recordingService.enabled", JSON.stringify(false));
  hashParams.set("config.recordingService.sharingEnabled", JSON.stringify(false));
  hashParams.set("config.localRecording.disable", JSON.stringify(false));
  hashParams.set("config.localRecording.disableSelfRecording", JSON.stringify(false));
  hashParams.set("config.localRecording.notifyAllParticipants", JSON.stringify(true));
  hashParams.set("config.recordings.suggestRecording", JSON.stringify(false));
  hashParams.set(
    "config.buttonsWithNotifyClick",
    JSON.stringify([
      { key: "end-meeting", preventExecution: false },
    ])
  );
  hashParams.set("config.bosh", JSON.stringify(input.boshUrl));
  // Disable WebSocket: many Jitsi instances advertise xmpp-websocket but do not proxy
  // the WS upgrade through nginx, returning 501. Force BOSH which is universally supported.
  hashParams.set("config.websocket", "null");
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

function normalizeJoinSettings(value?: ConferenceJoinSettings): ConferenceJoinSettings {
  return {
    audioEnabled: value?.audioEnabled !== false,
    videoEnabled: value?.videoEnabled !== false,
    audioInputDeviceId: normalizeDeviceId(value?.audioInputDeviceId),
    audioInputDeviceLabel: normalizeDeviceLabel(value?.audioInputDeviceLabel),
    videoInputDeviceId: normalizeDeviceId(value?.videoInputDeviceId),
    videoInputDeviceLabel: normalizeDeviceLabel(value?.videoInputDeviceLabel),
  };
}

function normalizeDeviceId(value?: string | null) {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue || null;
}

function normalizeDeviceLabel(value?: string | null) {
  return value?.trim() ?? "";
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
