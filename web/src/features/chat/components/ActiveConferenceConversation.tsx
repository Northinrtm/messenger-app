import type { RefObject } from "react";

import type { VideoConference } from "../../../lib/types";
import {
  ManagedConferenceStage,
  type ConferenceRecordingState,
} from "../ManagedConferenceStage";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  conference: VideoConference;
  jitsiBaseUrl: string;
  profileDisplayName: string;
  organizerLabel: string | null;
  roleLabel: string | null;
  statusLabel: string | null;
  stageHint: string | null;
  canJoin: boolean;
  canManageParticipants: boolean;
  localRecordingActive: boolean;
  shareUrl: string | null;
  isInfoOpen: boolean;
  infoButtonRef: RefObject<HTMLButtonElement | null>;
  infoPanelRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onToggleInfo: () => void;
  onOpenMembers: () => void;
  onCopyShareUrl: (value: string) => void;
  onRecordingStateChange: (state: ConferenceRecordingState) => void;
  onConferenceExit: () => void;
  formatConferenceSchedule: (scheduledAt: string) => string;
  formatMemberCount: (count: number) => string;
};

export function ActiveConferenceConversation({
  conference,
  jitsiBaseUrl,
  profileDisplayName,
  organizerLabel,
  roleLabel,
  statusLabel,
  stageHint,
  canJoin,
  canManageParticipants,
  localRecordingActive,
  shareUrl,
  isInfoOpen,
  infoButtonRef,
  infoPanelRef,
  onBack,
  onToggleInfo,
  onOpenMembers,
  onCopyShareUrl,
  onRecordingStateChange,
  onConferenceExit,
  formatConferenceSchedule,
  formatMemberCount,
}: Props) {
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
                    {canManageParticipants ? (
                      <div className="conference-summary-row">
                        <span className="conference-summary-label">Управление</span>
                        <button type="button" className="ghost-button compact" onClick={onOpenMembers}>
                          Добавить участников
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {canJoin || canManageParticipants || localRecordingActive ? (
          <div className="conversation-actions conference-actions">
            {canManageParticipants ? (
              <button type="button" className="ghost-button compact" onClick={onOpenMembers}>
                Добавить участников
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
              <div className="conference-link-row">
                <input
                  className="conference-link-input"
                  readOnly
                  value="Вход доступен только внутри приложения"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className="ghost-button compact" disabled>
                  Копировать
                </button>
              </div>
            </div>
            {shareUrl ? (
              <div className="conference-meta-line">
                <strong>Ссылка</strong>
                <div className="conference-link-row">
                  <input
                    className="conference-link-input"
                    readOnly
                    value={shareUrl}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => onCopyShareUrl(shareUrl)}
                  >
                    Копировать
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {canJoin && conference.roomName ? (
          <div className="conference-stage">
            <ManagedConferenceStage
              key={`${conference.id}:${conference.roomName}:${conference.roomAccessCode}`}
              baseUrl={jitsiBaseUrl}
              roomName={conference.roomName}
              accessCode={conference.roomAccessCode ?? ""}
              displayName={profileDisplayName}
              title={conference.title}
              onRecordingStateChange={onRecordingStateChange}
              onConferenceExit={onConferenceExit}
            />
          </div>
        ) : (
          <div className="conference-placeholder">
            <span>{stageHint}</span>
          </div>
        )}
      </div>
    </>
  );
}
