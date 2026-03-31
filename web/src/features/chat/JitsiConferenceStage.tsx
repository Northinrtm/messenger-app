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

type JitsiExternalApiOptions = {
  roomName: string;
  parentNode: HTMLElement;
  noSSL?: boolean;
  userInfo?: {
    displayName?: string;
  };
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
};

type JitsiExternalApiRoleEvent = {
  role?: string;
};

type JitsiExternalApi = {
  addListener: (eventName: string, listener: (event?: unknown) => void) => void;
  dispose: () => void;
  executeCommand?: (command: string, ...args: unknown[]) => void;
  getIFrame: () => HTMLIFrameElement;
};

type JitsiExternalApiConstructor = new (
  domain: string,
  options: JitsiExternalApiOptions
) => JitsiExternalApi;

type PlaceholderOptions = {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const MINIMAL_TOOLBAR_BUTTONS = [
  "microphone",
  "camera",
  "desktop",
  "tileview",
  "fullscreen",
  "settings",
  "hangup",
];

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiExternalApiConstructor;
  }
}

let jitsiExternalApiLoader: Promise<JitsiExternalApiConstructor> | null = null;
let jitsiExternalApiLoaderUrl: string | null = null;

export function JitsiConferenceStage({
  baseUrl,
  roomName,
  displayName,
  title,
  onRoleChange,
  onConferenceExit,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);
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
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const baseUrlObject = new URL(normalizedBaseUrl);
    const { boshUrl, websocketUrl } = createConferenceTransportUrls(baseUrlObject);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedConferenceTitle = normalizeConferenceTitle(title);

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
      apiRef.current?.dispose();
      apiRef.current = null;

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

    void loadJitsiExternalApi(normalizedBaseUrl)
      .then((JitsiMeetExternalAPI) => {
        if (cancelled || !hostRef.current) {
          return;
        }

        hostRef.current.replaceChildren();
        const api = new JitsiMeetExternalAPI(baseUrlObject.host, {
          roomName,
          parentNode: hostRef.current,
          noSSL: baseUrlObject.protocol === "http:",
          userInfo: {
            displayName: normalizedDisplayName,
          },
          configOverwrite: {
            bosh: boshUrl,
            websocket: websocketUrl,
            toolbarButtons: MINIMAL_TOOLBAR_BUTTONS,
            disableDeepLinking: true,
            disableInviteFunctions: true,
            disablePolls: true,
            disableReactions: true,
            enableClosePage: false,
            enableWelcomePage: false,
            prejoinPageEnabled: false,
            requireDisplayName: false,
            subject: normalizedConferenceTitle,
            prejoinConfig: {
              enabled: false,
              hideDisplayName: true,
            },
            whiteboard: {
              enabled: false,
            },
          },
          interfaceConfigOverwrite: {
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            MOBILE_APP_PROMO: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_BUTTONS: MINIMAL_TOOLBAR_BUTTONS,
          },
        });

        apiRef.current = api;

        const iframe = api.getIFrame();
        iframe.className = "conference-frame";
        iframe.allow = "camera; microphone; fullscreen; display-capture";
        iframe.title = title;

        api.addListener("videoConferenceJoined", () => {
          roleChangeRef.current?.(null);
          if (normalizedDisplayName) {
            api.executeCommand?.("displayName", normalizedDisplayName);
          }
          if (normalizedConferenceTitle) {
            api.executeCommand?.("subject", normalizedConferenceTitle);
          }
        });
        api.addListener("participantRoleChanged", (event) => {
          const payload = event as JitsiExternalApiRoleEvent | undefined;
          roleChangeRef.current?.(payload?.role === "moderator" ? "moderator" : "participant");
        });
        api.addListener("videoConferenceLeft", () => {
          handleConferenceExit();
        });
        api.addListener("readyToClose", () => {
          handleConferenceExit();
        });

        if (normalizedDisplayName) {
          api.executeCommand?.("displayName", normalizedDisplayName);
        }
        if (normalizedConferenceTitle) {
          api.executeCommand?.("subject", normalizedConferenceTitle);
        }
      })
      .catch(() => {
        if (cancelled || !hostRef.current) {
          return;
        }

        renderConferencePlaceholder(hostRef.current, {
          title: "Не удалось открыть видеоконференцию.",
          message: "Проверьте доступность Jitsi и повторите попытку.",
          actionLabel: "Повторить",
          onAction: retryConference,
        });
        roleChangeRef.current?.(null);
      });

    return () => {
      cancelled = true;
      roleChangeRef.current?.(null);
      apiRef.current?.dispose();
      apiRef.current = null;
      host.replaceChildren();
    };
  }, [baseUrl, displayName, retryToken, roomName, title]);

  return <div ref={hostRef} className="conference-embed-host" />;
}

function loadJitsiExternalApi(baseUrl: string) {
  const scriptUrl = `${baseUrl}/external_api.js`;
  if (window.JitsiMeetExternalAPI && jitsiExternalApiLoaderUrl === scriptUrl) {
    return Promise.resolve(window.JitsiMeetExternalAPI);
  }

  if (jitsiExternalApiLoader && jitsiExternalApiLoaderUrl === scriptUrl) {
    return jitsiExternalApiLoader;
  }

  jitsiExternalApiLoaderUrl = scriptUrl;
  jitsiExternalApiLoader = new Promise<JitsiExternalApiConstructor>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[data-jitsi-external-api="${scriptUrl}"]`
    );

    const complete = () => {
      if (window.JitsiMeetExternalAPI) {
        resolve(window.JitsiMeetExternalAPI);
        return;
      }

      jitsiExternalApiLoader = null;
      reject(new Error("Jitsi external API is unavailable"));
    };

    if (existingScript) {
      if (window.JitsiMeetExternalAPI) {
        complete();
        return;
      }

      existingScript.addEventListener("load", complete, { once: true });
      existingScript.addEventListener(
        "error",
        () => {
          jitsiExternalApiLoader = null;
          reject(new Error("Failed to load Jitsi external API"));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.jitsiExternalApi = scriptUrl;
    script.addEventListener("load", complete, { once: true });
    script.addEventListener(
      "error",
      () => {
        jitsiExternalApiLoader = null;
        reject(new Error("Failed to load Jitsi external API"));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });

  return jitsiExternalApiLoader;
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
    const title = document.createElement("strong");
    title.textContent = options.title;
    placeholder.append(title);
  }

  const message = document.createElement("span");
  message.textContent = options.message;
  placeholder.append(message);

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
