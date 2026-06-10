import { useEffect, useMemo, useState, type RefObject } from "react";

import type { VideoConference } from "../../../lib/types";
import { useI18n } from "../../../i18n/I18nProvider";
import { tActive } from "../../../i18n";
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
  jwtTokenFetcher?: () => Promise<string | null>;
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
  const { t } = useI18n();
  return (
    <div className="conference-share-panel invite-link-panel">
      <div className="invite-link-copy">
        <strong>{t("conf.inviteByLink")}</strong>
        <span>{t("conf.inviteByLinkDesc")}</span>
      </div>
      <div className="invite-link-row">
        <input
          className="invite-link-input"
          readOnly
          value={shareUrl ?? ""}
          placeholder={t("conf.linkNotCreated")}
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
          {t("conf.copy")}
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
        tActive("conf.micTitle")
      ),
      videoInputDevices: normalizeConferenceDevices(
        devices.filter((device) => device.kind === "videoinput"),
        tActive("conf.cameraTitle")
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
  const { t } = useI18n();
  return (
    <div className="conference-prejoin">
      <div className="conference-prejoin-copy">
        <span className="section-title">{t("conf.prejoinTitle")}</span>
        <strong>{title}</strong>
        <p>{t("conf.prejoinDesc")}</p>
      </div>

      <div className="conference-device-grid">
        <ConferenceDeviceControl
          title={t("conf.micTitle")}
          enabled={joinSettings.audioEnabled}
          enabledLabel={t("conf.micOn")}
          disabledLabel={t("conf.micOff")}
          devices={mediaAccessState.audioInputDevices}
          selectedDeviceId={joinSettings.audioInputDeviceId ?? ""}
          selectLabel={t("conf.micTitle")}
          emptyLabel={t("conf.micEmpty")}
          onEnabledChange={onAudioEnabledChange}
          onDeviceChange={onAudioInputChange}
        />
        <ConferenceDeviceControl
          title={t("conf.cameraTitle")}
          enabled={joinSettings.videoEnabled}
          enabledLabel={t("conf.cameraOn")}
          disabledLabel={t("conf.cameraOff")}
          devices={mediaAccessState.videoInputDevices}
          selectedDeviceId={joinSettings.videoInputDeviceId ?? ""}
          selectLabel={t("conf.cameraTitle")}
          emptyLabel={t("conf.cameraEmpty")}
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
          {mediaAccessState.isLoading ? t("conf.checkingDevices") : t("conf.checkDevices")}
        </button>
        <button type="button" className="primary-button" onClick={onJoin}>
          {t("conf.joinConference")}
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
  const { t } = useI18n();
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
          {enabled ? t("conf.on") : t("conf.off")}
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
          <option value="">{hasDevices ? t("conf.systemDevice") : emptyLabel}</option>
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
  jwtTokenFetcher,
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
  const { t } = useI18n();
  const shareInviteLinkActionLabel = shareUrlPending
    ? t("conf.generatingLink")
    : shareUrl
      ? t("conf.refreshLink")
      : t("conf.generateLink");
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
  }, [conference.id]); // intentionally excludes roomName — roomName can change mid-call (e.g., server presence update)

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
          error: tActive("conf.deviceListError"),
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
            {t("conf.back")}
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
                  {t("conf.info")}
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
                  aria-label={t("conf.infoAria")}
                >
                  <div className="conference-summary-grid">
                    <div className="conference-summary-item">
                      <span>{t("conf.organizer")}</span>
                      <strong>{organizerLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>{t("conf.yourRole")}</span>
                      <strong>{roleLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>{t("conf.time")}</span>
                      <strong>{formatConferenceSchedule(conference.scheduledAt)}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>{t("conf.participants")}</span>
                      <strong>{formatMemberCount(conference.participants.length)}</strong>
                    </div>
                  </div>

                  <div className="conference-summary-rows">
                    <div className="conference-summary-row">
                      <span className="conference-summary-label">{t("conf.access")}</span>
                      <span className="conference-summary-code">
                        {t("conf.accessInvitedOnly")}
                      </span>
                    </div>

                    {canShareInviteLink ? (
                      <div className="conference-summary-row with-panel">
                        <span className="conference-summary-label">{t("conf.link")}</span>
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
                      <span className="conference-summary-label">{t("conf.participants")}</span>
                      <div className="conference-participants">
                        {conference.participants.map((participant) => (
                          <span key={participant.id} className="member-pill">
                            {participant.displayName}
                            {participant.id === conference.createdBy.id ? t("conf.orgSuffix") : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    {canEditSchedule || canManageParticipants || canCancelSchedule ? (
                      <div className="conference-summary-row">
                        <span className="conference-summary-label">{t("conf.management")}</span>
                        <div className="conference-browser-actions">
                          {canEditSchedule ? (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={conferenceActionPending}
                              onClick={onEditConference}
                            >
                              {t("conf.edit")}
                            </button>
                          ) : null}
                          {canManageParticipants ? (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={conferenceActionPending}
                              onClick={onOpenMembers}
                            >
                              {t("conf.addParticipants")}
                            </button>
                          ) : null}
                          {canCancelSchedule ? (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={conferenceActionPending}
                              onClick={onCancelConference}
                            >
                              {t("conf.cancel")}
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
        <div className="conversation-actions conference-actions">
          {canEditSchedule ? (
            <button
              type="button"
              className="ghost-button compact"
              disabled={conferenceActionPending}
              onClick={onEditConference}
            >
              {t("conf.edit")}
            </button>
          ) : null}
          {canCancelSchedule ? (
            <button
              type="button"
              className="ghost-button compact"
              disabled={conferenceActionPending}
              onClick={onCancelConference}
            >
              {t("conf.cancel")}
            </button>
          ) : null}
          {localRecordingActive ? (
            <span className="conference-recording-badge">{t("conf.localRecording")}</span>
          ) : null}
          {!canJoin && !canEditSchedule && !canCancelSchedule ? (
            <button
              type="button"
              className="ghost-button compact"
              onClick={onConferenceExit}
            >
              {t("conf.close")}
            </button>
          ) : null}
        </div>

        <div className="conference-summary">
          <div className="conference-summary-grid">
            <div className="conference-summary-item">
              <span>{t("conf.organizer")}</span>
              <strong>{organizerLabel}</strong>
            </div>
            <div className="conference-summary-item">
              <span>{t("conf.yourRole")}</span>
              <strong>{roleLabel}</strong>
            </div>
            <div className="conference-summary-item">
              <span>{t("conf.time")}</span>
              <strong>{formatConferenceSchedule(conference.scheduledAt)}</strong>
            </div>
            <div className="conference-summary-item">
              <span>{t("conf.participants")}</span>
              <strong>{formatMemberCount(conference.participants.length)}</strong>
            </div>
          </div>

          <div className="conference-summary-rows">
            <div className="conference-summary-row">
              <span className="conference-summary-label">{t("conf.access")}</span>
              <span className="conference-summary-code">
                {t("conf.accessHidden")}
              </span>
            </div>

            <div className="conference-summary-row participants">
              <span className="conference-summary-label">{t("conf.participants")}</span>
              <div className="conference-participants">
                {conference.participants.map((participant) => (
                  <span key={participant.id} className="member-pill">
                    {participant.displayName}
                    {participant.id === conference.createdBy.id ? t("conf.orgSuffix") : ""}
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
              <strong>{t("conf.organizer")}</strong>
              <span>{organizerLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>{t("conf.yourRole")}</strong>
              <span>{roleLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>{t("conf.time")}</strong>
              <span>{formatConferenceSchedule(conference.scheduledAt)}</span>
            </div>
            <div className="conference-meta-line">
              <strong>{t("conf.status")}</strong>
              <span>{statusLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>{t("conf.participants")}</strong>
              <div className="conference-participants">
                {conference.participants.map((participant) => (
                  <span key={participant.id} className="member-pill">
                    {participant.displayName}
                    {participant.id === conference.createdBy.id ? t("conf.orgSuffix") : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="conference-meta-line">
              <strong>{t("conf.roomCode")}</strong>
              <div className="invite-link-row">
                <input
                  className="invite-link-input"
                  readOnly
                  value={t("conf.roomCodeInApp")}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className="ghost-button compact" disabled>
                  {t("conf.copy")}
                </button>
              </div>
            </div>
            {canShareInviteLink ? (
              <div className="conference-meta-line">
                <strong>{t("conf.link")}</strong>
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
                    {t("conf.copy")}
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
            ) : null}
          </div>
        </div>

        {canJoin && conference.roomName ? (
          hasJoinedConference ? (
            <div className="conference-stage">
              <ManagedConferenceStage
                conferenceId={conference.id}
                key={conference.id}
                baseUrl={jitsiBaseUrl}
                jwtTokenFetcher={jwtTokenFetcher}
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
                    error: tActive("conf.mediaCheckError"),
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
