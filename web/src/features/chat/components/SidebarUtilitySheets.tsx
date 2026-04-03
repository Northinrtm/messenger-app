import type { MouseEvent as ReactMouseEvent } from "react";
import type { ChatMessage, ChatSummary, Participant, UserProfile } from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";

type UtilitySheet = "conference" | "archive" | "forward" | null;

type Props = {
  sheet: UtilitySheet;
  sessionUser: UserProfile;
  conferenceComposerMode: "instant" | "scheduled" | null;
  conferenceTitle: string;
  conferenceScheduledAt: string;
  conferenceCandidates: Array<Participant | UserProfile>;
  conferenceParticipantUsernames: string[];
  contactsLoading: boolean;
  createConferencePending: boolean;
  archivedChatsLoading: boolean;
  archivedChats: ChatSummary[];
  forwardingMessage: ChatMessage | null;
  forwardableChats: ChatSummary[];
  forwardContactOptions: UserProfile[];
  forwardPending: boolean;
  onClose: () => void;
  onCloseConferenceComposer: () => void;
  onOpenConferenceComposer: (mode: "instant" | "scheduled") => void;
  onConferenceTitleChange: (value: string) => void;
  onConferenceScheduledAtChange: (value: string) => void;
  onToggleConferenceParticipant: (username: string) => void;
  onSubmitCreateConferenceNow: () => void;
  onSubmitCreateConference: () => void;
  onOpenChatContextMenu: (event: ReactMouseEvent<HTMLDivElement>, chatId: string) => void;
  onOpenChat: (chatId: string) => void;
  onToggleArchiveChat: (chatId: string) => void;
  onCloseForward: () => void;
  onJumpToReplyTarget: (chatId: string, messageId: string) => void;
  onForwardToChat: (chatId: string) => void;
  onForwardToContact: (username: string) => void;
  createMinimumConferenceDateTime: () => string;
  buildMessagePreview: (content: string, maxLength?: number) => string;
  describeChat: (chat: ChatSummary, currentUser: UserProfile) => string;
  formatMemberCount: (count: number) => string;
  getDirectParticipant: (chat: ChatSummary, currentUser: UserProfile) => Participant | null;
};

export function SidebarUtilitySheets({
  sheet,
  sessionUser,
  conferenceComposerMode,
  conferenceTitle,
  conferenceScheduledAt,
  conferenceCandidates,
  conferenceParticipantUsernames,
  contactsLoading,
  createConferencePending,
  archivedChatsLoading,
  archivedChats,
  forwardingMessage,
  forwardableChats,
  forwardContactOptions,
  forwardPending,
  onClose,
  onCloseConferenceComposer,
  onOpenConferenceComposer,
  onConferenceTitleChange,
  onConferenceScheduledAtChange,
  onToggleConferenceParticipant,
  onSubmitCreateConferenceNow,
  onSubmitCreateConference,
  onOpenChatContextMenu,
  onOpenChat,
  onToggleArchiveChat,
  onCloseForward,
  onJumpToReplyTarget,
  onForwardToChat,
  onForwardToContact,
  createMinimumConferenceDateTime,
  buildMessagePreview,
  describeChat,
  formatMemberCount,
  getDirectParticipant,
}: Props) {
  if (sheet === "conference") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Р’РёРґРµРѕРєРѕРЅС„РµСЂРµРЅС†РёРё</div>
            <p className="sheet-copy">
              Р—Р°РїСѓСЃС‚Рё РІСЃС‚СЂРµС‡Сѓ СЃСЂР°Р·Сѓ РёР»Рё Р·Р°РїР»Р°РЅРёСЂСѓР№ РµРµ РЅР° СѓРґРѕР±РЅРѕРµ РІСЂРµРјСЏ.
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
          </button>
        </div>

        <div className="conference-browser-actions">
          <button
            type="button"
            className={
              conferenceComposerMode === "instant"
                ? "ghost-button compact is-active"
                : "ghost-button compact"
            }
            onClick={() => onOpenConferenceComposer("instant")}
          >
            РќР°С‡Р°С‚СЊ СЃРµР№С‡Р°СЃ
          </button>
          <button
            type="button"
            className={
              conferenceComposerMode === "scheduled"
                ? "ghost-button compact is-active"
                : "ghost-button compact"
            }
            onClick={() => onOpenConferenceComposer("scheduled")}
          >
            Р—Р°РїР»Р°РЅРёСЂРѕРІР°С‚СЊ
          </button>
        </div>

        {conferenceComposerMode ? (
          <form
            className="conference-browser-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (conferenceComposerMode === "instant") {
                onSubmitCreateConferenceNow();
                return;
              }
              onSubmitCreateConference();
            }}
          >
            <input
              value={conferenceTitle}
              onChange={(event) => onConferenceTitleChange(event.target.value)}
              placeholder="РќР°Р·РІР°РЅРёРµ РІСЃС‚СЂРµС‡Рё РёР»Рё РѕСЃС‚Р°РІСЊ РїСѓСЃС‚С‹Рј"
              maxLength={120}
            />

            {conferenceComposerMode === "scheduled" ? (
              <input
                type="datetime-local"
                value={conferenceScheduledAt}
                min={createMinimumConferenceDateTime()}
                onChange={(event) => onConferenceScheduledAtChange(event.target.value)}
              />
            ) : null}

            <div className="group-picker-list conference-picker-list">
              {contactsLoading && conferenceCandidates.length === 0 ? (
                <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРЅС‚Р°РєС‚С‹...</div>
              ) : conferenceCandidates.length === 0 ? (
                <div className="empty-list">
                  РџРѕРєР° РЅРµРєРѕРіРѕ РґРѕР±Р°РІР»СЏС‚СЊ. РЎРѕР·РґР°Р№С‚Рµ РіСЂСѓРїРїСѓ РёР»Рё РґРѕР±Р°РІСЊС‚Рµ РєРѕРЅС‚Р°РєС‚С‹.
                </div>
              ) : (
                conferenceCandidates.map((contact) => {
                  const selected = conferenceParticipantUsernames.includes(contact.username);
                  return (
                    <button
                      type="button"
                      key={contact.username}
                      className={
                        selected
                          ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                          : "sheet-row sheet-row-with-avatar group-picker-row"
                      }
                      onClick={() => onToggleConferenceParticipant(contact.username)}
                    >
                      <AvatarCircle
                        className="menu-row-avatar sheet-contact-avatar"
                        name={contact.displayName}
                        avatarUrl={contact.avatarUrl}
                        online={contact.online}
                      />
                      <div className="sheet-row-copy">
                        <strong>{contact.displayName}</strong>
                        <span>@{contact.username}</span>
                      </div>
                      <span className="member-pill">{selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="conference-browser-actions">
              <button type="button" className="ghost-button compact" onClick={onCloseConferenceComposer}>
                Р—Р°РєСЂС‹С‚СЊ
              </button>
              <button type="submit" className="secondary-button" disabled={createConferencePending}>
                {createConferencePending
                  ? "РЎРѕР·РґР°РµРј..."
                  : conferenceComposerMode === "instant"
                    ? "РЎРѕР·РґР°С‚СЊ СЃРµР№С‡Р°СЃ"
                    : "Р—Р°РїР»Р°РЅРёСЂРѕРІР°С‚СЊ"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  if (sheet === "archive") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">РђСЂС…РёРІ</div>
            <p className="sheet-copy">Р—РґРµСЃСЊ Р»РµР¶Р°С‚ Р°СЂС…РёРІРёСЂРѕРІР°РЅРЅС‹Рµ С‡Р°С‚С‹ Рё РіСЂСѓРїРїС‹.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onCloseConferenceComposer}>
            Р—Р°РєСЂС‹С‚СЊ
          </button>
        </div>

        <div className="sheet-list">
          {archivedChatsLoading ? (
            <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј Р°СЂС…РёРІ...</div>
          ) : archivedChats.length === 0 ? (
            <div className="empty-list">РђСЂС…РёРІ РїРѕРєР° РїСѓСЃС‚.</div>
          ) : (
            <>
              {archivedChats.length > 0 ? <div className="section-title">Р§Р°С‚С‹</div> : null}
              {archivedChats.map((chat) => (
                <div
                  key={chat.id}
                  className="sheet-row"
                  onContextMenu={(event) => onOpenChatContextMenu(event, chat.id)}
                >
                  <div className="sheet-row-copy">
                    <strong>{chat.title}</strong>
                    <span>
                      {chat.direct
                        ? describeChat(chat, sessionUser)
                        : formatMemberCount(chat.members.length)}
                    </span>
                  </div>
                  <div className="sheet-row-actions">
                    <button
                      type="button"
                      className="ghost-button compact"
                      onClick={() => onOpenChat(chat.id)}
                    >
                      РћС‚РєСЂС‹С‚СЊ
                    </button>
                    <button
                      type="button"
                      className="ghost-button compact"
                      onClick={() => onToggleArchiveChat(chat.id)}
                    >
                      Р’РµСЂРЅСѓС‚СЊ
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  if (sheet === "forward") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">РџРµСЂРµСЃР»Р°С‚СЊ</div>
            <p className="sheet-copy">
              Р’С‹Р±РµСЂРёС‚Рµ С‡Р°С‚, РіСЂСѓРїРїСѓ РёР»Рё РєРѕРЅС‚Р°РєС‚ РґР»СЏ РїРµСЂРµСЃС‹Р»РєРё СЃРѕРѕР±С‰РµРЅРёСЏ.
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onCloseForward}>
            Р—Р°РєСЂС‹С‚СЊ
          </button>
        </div>

        {!forwardingMessage ? (
          <div className="empty-list">РЎРѕРѕР±С‰РµРЅРёРµ РґР»СЏ РїРµСЂРµСЃС‹Р»РєРё РЅРµ РЅР°Р№РґРµРЅРѕ.</div>
        ) : (
          <div className="sheet-list">
            <div className="forward-preview-card">
              <span className="forward-preview-label">РЎРѕРѕР±С‰РµРЅРёРµ</span>
              {forwardingMessage.replyTo ? (
                <button
                  type="button"
                  className="message-reply-card is-compact"
                  onClick={() => onJumpToReplyTarget(forwardingMessage.chatId, forwardingMessage.replyTo!.id)}
                >
                  <span className="message-reply-accent" aria-hidden="true" />
                  <span className="message-reply-copy">
                    <strong>{forwardingMessage.replyTo.sender.displayName}</strong>
                    <span>{forwardingMessage.replyTo.preview}</span>
                  </span>
                </button>
              ) : null}
              <div className="forward-preview-body">
                <strong>{forwardingMessage.sender.displayName}</strong>
                <p>{buildMessagePreview(forwardingMessage.content, 180)}</p>
              </div>
            </div>

            <div className="forward-target-section">
              <div className="section-title">Р§Р°С‚С‹ Рё РіСЂСѓРїРїС‹</div>
              {forwardableChats.length === 0 ? (
                <div className="empty-list">РќРµС‚ РґСЂСѓРіРёС… РѕС‚РєСЂС‹С‚С‹С… С‡Р°С‚РѕРІ РґР»СЏ РїРµСЂРµСЃС‹Р»РєРё.</div>
              ) : (
                forwardableChats.map((chat) => {
                  const directParticipant = getDirectParticipant(chat, sessionUser);
                  return (
                    <button
                      type="button"
                      key={chat.id}
                      className="sheet-row sheet-row-with-avatar forward-target-row"
                      onClick={() => onForwardToChat(chat.id)}
                      disabled={forwardPending}
                    >
                      <AvatarCircle
                        className="menu-row-avatar sheet-contact-avatar"
                        name={directParticipant?.displayName ?? chat.title}
                        avatarUrl={directParticipant?.avatarUrl ?? null}
                        badge={chat.direct ? undefined : "GR"}
                        online={chat.direct ? directParticipant?.online : false}
                      />
                      <div className="sheet-row-copy">
                        <strong>{chat.title}</strong>
                        <span>
                          {chat.direct
                            ? describeChat(chat, sessionUser)
                            : formatMemberCount(chat.members.length)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="forward-target-section">
              <div className="section-title">РљРѕРЅС‚Р°РєС‚С‹</div>
              {forwardContactOptions.length === 0 ? (
                <div className="empty-list">РќРµС‚ РєРѕРЅС‚Р°РєС‚РѕРІ Р±РµР· Р»РёС‡РЅРѕРіРѕ С‡Р°С‚Р°.</div>
              ) : (
                forwardContactOptions.map((contact) => (
                  <button
                    type="button"
                    key={contact.username}
                    className="sheet-row sheet-row-with-avatar forward-target-row"
                    onClick={() => onForwardToContact(contact.username)}
                    disabled={forwardPending}
                  >
                    <AvatarCircle
                      className="menu-row-avatar sheet-contact-avatar"
                      name={contact.displayName}
                      avatarUrl={contact.avatarUrl}
                      online={contact.online}
                    />
                    <div className="sheet-row-copy">
                      <strong>{contact.displayName}</strong>
                      <span>@{contact.username}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
