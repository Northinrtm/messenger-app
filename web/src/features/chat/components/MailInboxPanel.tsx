import { useI18n } from "../../../i18n/I18nProvider";
import type { MailMessageSummary } from "../../../lib/types";

type MailFolder = "inbox" | "sent";

type Props = {
  inbox: MailMessageSummary[];
  sent: MailMessageSummary[];
  loading: boolean;
  folder: MailFolder;
  activeMessageId: string | null;
  composing: boolean;
  userEmail: string;
  onSwitchFolder: (folder: MailFolder) => void;
  onOpenMessage: (messageId: string) => void;
  onCompose: () => void;
  formatMailTimestamp: (value: string) => string;
};

export function MailInboxPanel({
  inbox,
  sent,
  loading,
  folder,
  activeMessageId,
  composing,
  userEmail,
  onSwitchFolder,
  onOpenMessage,
  onCompose,
  formatMailTimestamp,
}: Props) {
  const { t } = useI18n();
  const messages = folder === "inbox" ? inbox : sent;

  return (
    <section className="mailbox-panel">
      <div className="mail-panel-header">
        <div className="mail-panel-address">{userEmail}</div>
        <button type="button" className="secondary-button compact" onClick={onCompose}>
          {t("mail.compose")}
        </button>
      </div>

      <div className="mail-folder-tabs">
        <button
          type="button"
          className={folder === "inbox" ? "mail-folder-tab is-active" : "mail-folder-tab"}
          onClick={() => onSwitchFolder("inbox")}
        >
          {t("mail.inbox")}
        </button>
        <button
          type="button"
          className={folder === "sent" ? "mail-folder-tab is-active" : "mail-folder-tab"}
          onClick={() => onSwitchFolder("sent")}
        >
          {t("mail.sent")}
        </button>
      </div>

      {loading ? (
        <div className="empty-list">{t("mail.loadingList")}</div>
      ) : messages.length === 0 ? (
        <div className="empty-list">
          {folder === "inbox" ? t("mail.emptyInbox") : t("mail.emptySent")}
        </div>
      ) : (
        <div className="mail-message-list">
          {messages.map((msg) => (
            <button
              type="button"
              key={msg.id}
              className={[
                "mail-message-row",
                msg.id === activeMessageId || composing ? "is-active" : "",
                !msg.read ? "is-unread" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onOpenMessage(msg.id)}
            >
              <div className="mail-message-from">{msg.from}</div>
              <div className="mail-message-subject-row">
                <span className="mail-message-subject">{msg.subject || t("mail.noSubject")}</span>
                <span className="mail-message-time">{formatMailTimestamp(msg.sentAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
