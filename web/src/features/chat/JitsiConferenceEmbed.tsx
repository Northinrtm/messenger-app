import { useEffect, useRef } from "react";

export type ConferenceParticipantRole = "moderator" | "participant";

type Props = {
  baseUrl: string;
  roomName: string;
  displayName: string;
  title: string;
  onRoleChange?: (role: ConferenceParticipantRole | null) => void;
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

const MINIMAL_TOOLBAR_BUTTONS = [
  "microphone",
  "camera",
  "desktop",
  "tileview",
  "fullscreen",
  "settings",
];

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiExternalApiConstructor;
  }
}

let jitsiExternalApiLoader: Promise<JitsiExternalApiConstructor> | null = null;
let jitsiExternalApiLoaderUrl: string | null = null;

export function JitsiConferenceEmbed({
  baseUrl,
  roomName,
  displayName,
  title,
  onRoleChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);
  const roleChangeRef = useRef(onRoleChange);

  useEffect(() => {
    roleChangeRef.current = onRoleChange;
  }, [onRoleChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const baseUrlObject = new URL(normalizedBaseUrl);
    const { boshUrl, websocketUrl } = createConferenceTransportUrls(baseUrlObject);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    renderConferencePlaceholder(host, "Подключаем конференцию...");
    roleChangeRef.current?.(null);

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
            enableWelcomePage: false,
            prejoinPageEnabled: false,
            requireDisplayName: false,
            prejoinConfig: {
              enabled: false,
              hideDisplayName: true,
            },
            whiteboard: {
              enabled: false,
            },
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
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
        });
        api.addListener("participantRoleChanged", (event) => {
          const payload = event as JitsiExternalApiRoleEvent | undefined;
          roleChangeRef.current?.(payload?.role === "moderator" ? "moderator" : "participant");
        });
        api.addListener("readyToClose", () => {
          roleChangeRef.current?.(null);
        });

        if (normalizedDisplayName) {
          api.executeCommand?.("displayName", normalizedDisplayName);
        }
      })
      .catch(() => {
        if (cancelled || !hostRef.current) {
          return;
        }

        renderConferencePlaceholder(
          hostRef.current,
          "Не удалось открыть комнату. Проверьте Jitsi и повторите попытку."
        );
        roleChangeRef.current?.(null);
      });

    return () => {
      cancelled = true;
      roleChangeRef.current?.(null);
      apiRef.current?.dispose();
      apiRef.current = null;
      host.replaceChildren();
    };
  }, [baseUrl, displayName, roomName, title]);

  return <div ref={hostRef} className="conference-stage" />;
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

function renderConferencePlaceholder(host: HTMLDivElement, message: string) {
  const placeholder = document.createElement("div");
  placeholder.className = "conference-placeholder";
  placeholder.textContent = message;
  host.replaceChildren(placeholder);
}
