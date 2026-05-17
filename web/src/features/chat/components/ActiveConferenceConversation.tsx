import { useEffect, useMemo, useState, type RefObject } from "react";

import type { VideoConference } from "../../../lib/types";
import {
  ManagedConferenceStage,
  type ConferenceJoinSettings,
  type ConferenceRecordingState,
} from "../ManagedConferenceStage";
import { AvatarCircle } from "./AvatarCircle";

type ConferenceMediaDevice = {
  deviceId: string;
  label: string;
};

type MediaAccessState = {
  audioInputDevices: ConferenceMediaDevice[];
  videoInputDevices: ConferenceMediaDevice[];
  isLoading: boolean;
  error: string | null;
};

const DEFAULT_CONFERENCE_JOIN_SETTINGS: ConferenceJoinSettings = {
  audioEnabled: true,
  videoEnabled: true,
  audioInputDeviceId: null,
  audioInputDeviceLabel: null,
  videoInputDeviceId: null,
  videoInputDeviceLabel: null,
};

type Props = {
  conference: VideoConference;
  jitsiBaseUrl: string;
  profileDisplayName: string;
  organizerLabel: string | null;
  roleLabel: string | null;
  statusLabel: string | null;
  stageHint: string | null;
  canJoin: boolean;
  canEditSchedule: boolean;
  canCancelSchedule: boolean;
  canManageParticipants: boolean;
  canShareInviteLink: boolean;
  conferenceActionPending: boolean;
  localRecordingActive: boolean;
  shareUrl: string | null;
  shareUrlPending: boolean;
  isInfoOpen: boolean;
  infoButtonRef: RefObject<HTMLButtonElement | null>;
  infoPanelRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onEditConference: () => void;
  onCancelConference: () => void;
  onConferencePresenceTouch: (conferenceId: string) => void;
  onConferencePresenceLeave: (conferenceId: string, options?: { keepalive?: boolean }) => void;
  onConferenceEndForAll: () => void;
  onGenerateShareUrl: () => void;
  onToggleInfo: () => void;
  onOpenMembers: () => void;
  onCopyShareUrl: (value: string) => void;
  onRecordingStateChange: (state: ConferenceRecordingState) => void;
  exitRequestToken?: number;
  onConferenceExit: () => void;
  formatConferenceSchedule: (scheduledAt: string) => string;
  formatMemberCount: (count: number) => string;
};

type ConferenceInviteLinkControlsProps = {
  shareUrl: string | null;
  shareUrlPending: boolean;
  shareInviteLinkActionLabel: string;
  onCopyShareUrl: (value: string) => void;
  onGenerateShareUrl: () => void;
};

function ConferenceInviteLinkControls({
  shareUrl,
  shareUrlPending,
  shareInviteLinkActionLabel,
  onCopyShareUrl,
  onGenerateShareUrl,
}: ConferenceInviteLinkControlsProps) {
  return (
    <div className="conference-share-panel invite-link-panel">
      <div className="invite-link-copy">
        <strong>Приглашение по ссылке</strong>
        <span>
          Короткая ссылка откроет эту конференцию в приложении и добавит пользователя в
          участники.
        </span>
      </div>
      <div className="invite-link-row">
        <input
          className="invite-link-input"
          readOnly
          value={shareUrl ?? ""}
          placeholder="Ссылка ещё не создана"
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="ghost-button compact"
          disabled={!shareUrl}
          onClick={() => {
            if (shareUrl) {
              onCopyShareUrl(shareUrl);
            }
          }}
        >
          Копировать
        </button>
      </div>
      <button
        type="button"
        className="ghost-button"
        disabled={shareUrlPending}
        onClick={onGenerateShareUrl}
      >
        {shareInviteLinkActionLabel}
      </button>
    </div>
  );
}

async function readConferenceMediaDevices(options: { requestAccess?: boolean } = {}) {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return {
      audioInputDevices: [],
      videoInputDevices: [],
    };
  }

  let permissionStreams: MediaStream[] = [];
  if (options.requestAccess && typeof navigator.mediaDevices.getUserMedia === "function") {
    permissionStreams = await requestConferenceMediaAccess();
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputDevices: normalizeConferenceDevices(
        devices.filter((device) => device.kind === "audioinput"),
        "Микрофон"
      ),
      videoInputDevices: normalizeConferenceDevices(
        devices.filter((device) => device.kind === "videoinput"),
        "Камера"
      ),
    };
  } finally {
    permissionStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
  }
}

async function requestConferenceMediaAccess() {
  const streams: MediaStream[] = [];
  for (const constraints of [{ audio: true }, { video: true }] as MediaStreamConstraints[]) {
    try {
      streams.push(await navigator.mediaDevices.getUserMedia(constraints));
    } catch {
      // Device access is optional here. Jitsi will ask again if the participant joins unmuted.
    }
  }
  return streams;
}

function normalizeConferenceDevices(devices: MediaDeviceInfo[], fallbackLabel: string) {
  return devices
    .filter((device) => device.deviceId.trim().length > 0)
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `${fallbackLabel} ${index + 1}`,
    }));
}

type ConferencePreJoinPanelProps = {
  title: string;
  mediaAccessState: MediaAccessState;
  joinSettings: ConferenceJoinSettings;
  onAudioEnabledChange: (value: boolean) => void;
  onVideoEnabledChange: (value: boolean) => void;
  onAudioInputChange: (value: string | null) => void;
  onVideoInputChange: (value: string | null) => void;
  onRefreshDevices: () => Promise<void>;
  onJoin: () => void;
};

function ConferencePreJoinPanel({
  title,
  mediaAccessState,
  joinSettings,
  onAudioEnabledChange,
  onVideoEnabledChange,
  onAudioInputChange,
  onVideoInputChange,
  onRefreshDevices,
  onJoin,
}: ConferencePreJoinPanelProps) {
  return (
    <div className="conference-prejoin">
      <div className="conference-prejoin-copy">
        <span className="section-title">Перед входом</span>
        <strong>{title}</strong>
        <p>Выберите, с каким состоянием камеры и микрофона войти в конференцию.</p>
      </div>

      <div className="conference-device-grid">
        <ConferenceDeviceControl
          title="Микрофон"
          enabled={joinSettings.audioEnabled}
          enabledLabel="Микрофон включен"
          disabledLabel="Микрофон выключен"
          devices={mediaAccessState.audioInputDevices}
          selectedDeviceId={joinSettings.audioInputDeviceId ?? ""}
          selectLabel="Микрофон"
          emptyLabel="Микрофоны не найдены"
          onEnabledChange={onAudioEnabledChange}
          onDeviceChange={onAudioInputChange}
        />
        <ConferenceDeviceControl
          title="Камера"
          enabled={joinSettings.videoEnabled}
          enabledLabel="Камера включена"
          disabledLabel="Камера выключена"
          devices={mediaAccessState.videoInputDevices}
          selectedDeviceId={joinSettings.videoInputDeviceId ?? ""}
          selectLabel="Камера"
          emptyLabel="Камеры не найдены"
          onEnabledChange={onVideoEnabledChange}
          onDeviceChange={onVideoInputChange}
        />
      </div>

      {mediaAccessState.error ? <div className="form-error">{mediaAccessState.error}</div> : null}

      <div className="conference-prejoin-actions">
        <button
          type="button"
          className="ghost-button"
          disabled={mediaAccessState.isLoading}
          onClick={() => void onRefreshDevices()}
        >
          {mediaAccessState.isLoading ? "Проверяем устройства..." : "Проверить устройства"}
        </button>
        <button type="button" className="primary-button" onClick={onJoin}>
          Войти в конференцию
        </button>
      </div>
    </div>
  );
}

type ConferenceDeviceControlProps = {
  title: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
  devices: ConferenceMediaDevice[];
  selectedDeviceId: string;
  selectLabel: string;
  emptyLabel: string;
  onEnabledChange: (value: boolean) => void;
  onDeviceChange: (value: string | null) => void;
};

function ConferenceDeviceControl({
  title,
  enabled,
  enabledLabel,
  disabledLabel,
  devices,
  selectedDeviceId,
  selectLabel,
  emptyLabel,
  onEnabledChange,
  onDeviceChange,
}: ConferenceDeviceControlProps) {
  const hasDevices = devices.length > 0;

  return (
    <section className={enabled ? "conference-device-control is-enabled" : "conference-device-control"}>
      <div className="conference-device-head">
        <div>
          <strong>{title}</strong>
          <span>{enabled ? enabledLabel : disabledLabel}</span>
        </div>
        <button
          type="button"
          className={enabled ? "conference-device-toggle is-on" : "conference-device-toggle"}
          onClick={() => onEnabledChange(!enabled)}
          aria-pressed={enabled}
        >
          {enabled ? "Вкл" : "Выкл"}
        </button>
      </div>

      <label className="field conference-device-field">
        <span>{selectLabel}</span>
        <select
          className="conference-device-select"
          value={selectedDeviceId}
          disabled={!enabled || !hasDevices}
          onChange={(event) => onDeviceChange(event.target.value || null)}
        >
          <option value="">{hasDevices ? "Системное устройство" : emptyLabel}</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

export function ActiveConferenceConversation({
  conference,
  jitsiBaseUrl,
  profileDisplayName,
  organizerLabel,
  roleLabel,
  statusLabel,
  stageHint,
  canJoin,
  canEditSchedule,
  canCancelSchedule,
  canManageParticipants,
  canShareInviteLink,
  conferenceActionPending,
  localRecordingActive,
  shareUrl,
  shareUrlPending,
  isInfoOpen,
  infoButtonRef,
  infoPanelRef,
  onBack,
  onEditConference,
  onCancelConference,
  onConferencePresenceTouch,
  onConferencePresenceLeave,
  onConferenceEndForAll,
  onGenerateShareUrl,
  onToggleInfo,
  onOpenMembers,
  onCopyShareUrl,
  onRecordingStateChange,
  exitRequestToken = 0,
  onConferenceExit,
  formatConferenceSchedule,
  formatMemberCount,
}: Props) {
  const shareInviteLinkActionLabel = shareUrlPending
    ? "\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u043c \u0441\u0441\u044b\u043b\u043a\u0443..."
    : shareUrl
      ? "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443"
      : "\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443";
  const [hasJoinedConference, setHasJoinedConference] = useState(false);
  const [joinSettings, setJoinSettings] = useState<ConferenceJoinSettings>(
    DEFAULT_CONFERENCE_JOIN_SETTINGS
  );
  const [mediaAccessState, setMediaAccessState] = useState<MediaAccessState>({
    audioInputDevices: [],
    videoInputDevices: [],
    isLoading: false,
    error: null,
  });

  const selectedAudioInputDevice = useMemo(
    () =>
      mediaAccessState.audioInputDevices.find(
        (device) => device.deviceId === joinSettings.audioInputDeviceId
      ) ?? null,
    [joinSettings.audioInputDeviceId, mediaAccessState.audioInputDevices]
  );
  const selectedVideoInputDevice = useMemo(
    () =>
      mediaAccessState.videoInputDevices.find(
        (device) => device.deviceId === joinSettings.videoInputDeviceId
      ) ?? null,
    [joinSettings.videoInputDeviceId, mediaAccessState.videoInputDevices]
  );

  useEffect(() => {
    setHasJoinedConference(false);
    setJoinSettings(DEFAULT_CONFERENCE_JOIN_SETTINGS);
  }, [conference.id, conference.roomName]);

  useEffect(() => {
    setJoinSettings((current) => ({
      ...current,
      audioInputDeviceId:
        current.audioInputDeviceId &&
        mediaAccessState.audioInputDevices.some((device) => device.deviceId === current.audioInputDeviceId)
          ? current.audioInputDeviceId
          : null,
      videoInputDeviceId:
        current.videoInputDeviceId &&
        mediaAccessState.videoInputDevices.some((device) => device.deviceId === current.videoInputDeviceId)
          ? current.videoInputDeviceId
          : null,
    }));
  }, [mediaAccessState.audioInputDevices, mediaAccessState.videoInputDevices]);

  useEffect(() => {
    if (!canJoin || !conference.roomName || hasJoinedConference) {
      return;
    }

    let cancelled = false;
    const loadDevices = async () => {
      setMediaAccessState((current) => ({ ...current, isLoading: true, error: null }));
      try {
        const nextState = await readConferenceMediaDevices();
        if (cancelled) {
          return;
        }

        setMediaAccessState({
          ...nextState,
          isLoading: false,
          error: null,
        });
      } catch {
        if (cancelled) {
          return;
        }

        setMediaAccessState({
          audioInputDevices: [],
          videoInputDevices: [],
          isLoading: false,
          error: "Не удалось получить список подключенных устройств.",
        });
      }
    };

    void loadDevices();

    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener?.("devicechange", loadDevices);
    }

    return () => {
      cancelled = true;
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener?.("devicechange", loadDevices);
      }
    };
  }, [canJoin, conference.roomName, hasJoinedConference]);

  const updateJoinSettings = (nextSettings: Partial<ConferenceJoinSettings>) => {
    setJoinSettings((current) => ({
      ...current,
      ...nextSettings,
    }));
  };

  return (
    <>
      <header className="conversation-header north-conversation-header conference-header">
        <div className="conversation-heading">
          <button type="button" className="ghost-button compact mobile-back" onClick={onBack}>
            Назад
          </button>

          <div className="conversation-identity">
            <AvatarCircle
              className="avatar conversation-avatar north-avatar"
              name={conference.title}
              badge="VC"
            />
            <div className="conference-title-stack">
              <div className="conference-title-row">
                <h3>{conference.title}</h3>
                <button
                  ref={infoButtonRef}
                  type="button"
                  className={
                    isInfoOpen
                      ? "ghost-button compact conference-info-button is-active"
                      : "ghost-button compact conference-info-button"
                  }
                  onClick={onToggleInfo}
                  aria-expanded={isInfoOpen}
                  aria-haspopup="dialog"
                >
                  Инфо
                </button>
              </div>
              <p className="conversation-subtitle">
                {formatConferenceSchedule(conference.scheduledAt)}
              </p>
              {isInfoOpen ? (
                <div
                  ref={infoPanelRef}
                  className="conference-summary"
                  role="dialog"
                  aria-label="Информация о конференции"
                >
                  <div className="conference-summary-grid">
                    <div className="conference-summary-item">
                      <span>Организатор</span>
                      <strong>{organizerLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Ваша роль</span>
                      <strong>{roleLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Время</span>
                      <strong>{formatConferenceSchedule(conference.scheduledAt)}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Участники</span>
                      <strong>{formatMemberCount(conference.participants.length)}</strong>
                    </div>
                  </div>

                  <div className="conference-summary-rows">
                    <div className="conference-summary-row">
                      <span className="conference-summary-label">Доступ</span>
                      <span className="conference-summary-code">
                        Комната доступна только приглашённым участникам внутри приложения.
                      </span>
                    </div>

                    {canShareInviteLink ? (
                      <div className="conference-summary-row with-panel">
                        <span className="conference-summary-label">Ссылка</span>
                        <ConferenceInviteLinkControls
                          shareUrl={shareUrl}
                          shareUrlPending={shareUrlPending}
                          shareInviteLinkActionLabel={shareInviteLinkActionLabel}
                          onCopyShareUrl={onCopyShareUrl}
                          onGenerateShareUrl={onGenerateShareUrl}
                        />
                      </div>
                    ) : null}

                    <div className="conference-summary-row participants">
                      <span className="conference-summary-label">Участники</span>
                      <div className="conference-participants">
                        {conference.participants.map((participant) => (
                          <span key={participant.id} className="member-pill">
                            {participant.displayName}
                            {participant.id === conference.createdBy.id ? " · орг." : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    {canEditSchedule || canManageParticipants || canCancelSchedule ? (
                      <div className="conference-summary-row">
                        <span className="conference-summary-label">Управление</span>
                        <div className="conference-browser-actions">
                          {canEditSchedule ? (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={conferenceActionPending}
                              onClick={onEditConference}
                            >
                              Изменить
                            </button>
                          ) : null}
                          {canManageParticipants ? (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={conferenceActionPending}
                              onClick={onOpenMembers}
                            >
                              Добавить участников
                            </button>
                          ) : null}
                          {canCancelSchedule ? (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={conferenceActionPending}
                              onClick={onCancelConference}
                            >
                              Отменить
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {canEditSchedule || canCancelSchedule || localRecordingActive ? (
          <div className="conversation-actions conference-actions">
            {canEditSchedule ? (
              <button
                type="button"
                className="ghost-button compact"
                disabled={conferenceActionPending}
                onClick={onEditConference}
              >
                Изменить
              </button>
            ) : null}
            {canCancelSchedule ? (
              <button
                type="button"
                className="ghost-button compact"
                disabled={conferenceActionPending}
                onClick={onCancelConference}
              >
                Отменить
              </button>
            ) : null}
            {localRecordingActive ? (
              <span className="conference-recording-badge">Идет локальная запись</span>
            ) : null}
          </div>
        ) : null}

        <div className="conference-summary">
          <div className="conference-summary-grid">
            <div className="conference-summary-item">
              <span>Организатор</span>
              <strong>{organizerLabel}</strong>
            </div>
            <div className="conference-summary-item">
              <span>Ваша роль</span>
              <strong>{roleLabel}</strong>
            </div>
            <div className="conference-summary-item">
              <span>Время</span>
              <strong>{formatConferenceSchedule(conference.scheduledAt)}</strong>
            </div>
            <div className="conference-summary-item">
              <span>Участники</span>
              <strong>{formatMemberCount(conference.participants.length)}</strong>
            </div>
          </div>

          <div className="conference-summary-rows">
            <div className="conference-summary-row">
              <span className="conference-summary-label">Доступ</span>
              <span className="conference-summary-code">
                Прямые ссылки и коды скрыты. Войти могут только приглашённые участники.
              </span>
            </div>

            <div className="conference-summary-row participants">
              <span className="conference-summary-label">Участники</span>
              <div className="conference-participants">
                {conference.participants.map((participant) => (
                  <span key={participant.id} className="member-pill">
                    {participant.displayName}
                    {participant.id === conference.createdBy.id ? " · орг." : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="conference-shell">
        <div className="conference-meta-card">
          <div className="conference-meta-grid">
            <div className="conference-meta-line">
              <strong>Организатор</strong>
              <span>{organizerLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Ваша роль</strong>
              <span>{roleLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Время</strong>
              <span>{formatConferenceSchedule(conference.scheduledAt)}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Статус</strong>
              <span>{statusLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Участники</strong>
              <div className="conference-participants">
                {conference.participants.map((participant) => (
                  <span key={participant.id} className="member-pill">
                    {participant.displayName}
                    {participant.id === conference.createdBy.id ? " · орг." : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="conference-meta-line">
              <strong>Код комнаты</strong>
              <div className="invite-link-row">
                <input
                  className="invite-link-input"
                  readOnly
                  value="Вход доступен только внутри приложения"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className="ghost-button compact" disabled>
                  Копировать
                </button>
              </div>
            </div>
            {canShareInviteLink ? (
              <div className="conference-meta-line">
                <strong>Ссылка</strong>
                <div className="invite-link-row">
                  <input
                    className="invite-link-input"
                    readOnly
                    value={shareUrl ?? ""}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={!shareUrl}
                    onClick={() => {
                      if (shareUrl) {
                        onCopyShareUrl(shareUrl);
                      }
                    }}
                  >
                    Копировать
                  </button>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={shareUrlPending}
                  onClick={onGenerateShareUrl}
                >
                  {shareInviteLinkActionLabel /*
                    ? "Генерируем ссылку..."
                    : shareUrl
                      ? "Получить ссылку снова"
                      : "Сгенерировать ссылку"}
                  */}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {canJoin && conference.roomName ? (
          hasJoinedConference ? (
            <div className="conference-stage">
              <ManagedConferenceStage
                conferenceId={conference.id}
                key={`${conference.id}:${conference.roomName}`}
                baseUrl={jitsiBaseUrl}
                roomName={conference.roomName}
                displayName={profileDisplayName}
                title={conference.title}
                joinSettings={{
                  ...joinSettings,
                  audioInputDeviceLabel: selectedAudioInputDevice?.label ?? null,
                  videoInputDeviceLabel: selectedVideoInputDevice?.label ?? null,
                }}
                onConferencePresenceTouch={onConferencePresenceTouch}
                onConferencePresenceLeave={onConferencePresenceLeave}
                onConferenceEndForAll={onConferenceEndForAll}
                exitRequestToken={exitRequestToken}
                onRecordingStateChange={onRecordingStateChange}
                onConferenceExit={onConferenceExit}
              />
            </div>
          ) : (
            <ConferencePreJoinPanel
              title={conference.title}
              mediaAccessState={mediaAccessState}
              joinSettings={joinSettings}
              onAudioEnabledChange={(audioEnabled) => updateJoinSettings({ audioEnabled })}
              onVideoEnabledChange={(videoEnabled) => updateJoinSettings({ videoEnabled })}
              onAudioInputChange={(audioInputDeviceId) =>
                updateJoinSettings({ audioInputDeviceId })
              }
              onVideoInputChange={(videoInputDeviceId) =>
                updateJoinSettings({ videoInputDeviceId })
              }
              onRefreshDevices={async () => {
                setMediaAccessState((current) => ({
                  ...current,
                  isLoading: true,
                  error: null,
                }));
                try {
                  const nextState = await readConferenceMediaDevices({ requestAccess: true });
                  setMediaAccessState({ ...nextState, isLoading: false, error: null });
                } catch {
                  setMediaAccessState({
                    audioInputDevices: [],
                    videoInputDevices: [],
                    isLoading: false,
                    error: "Не удалось проверить камеру и микрофон.",
                  });
                }
              }}
              onJoin={() => setHasJoinedConference(true)}
            />
          )
        ) : (
          <div className="conference-placeholder">
            <span>{stageHint}</span>
          </div>
        )}
      </div>
    </>
  );
}
