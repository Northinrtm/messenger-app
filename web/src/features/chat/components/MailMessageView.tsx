import type { MailMessageDetail } from "../../../lib/types";

type Props = {
  message: MailMessageDetail | null;
  loading: boolean;
  deletePending: boolean;
  folder: "inbox" | "sent";
  onDelete: () => void;
  onReply: () => void;
  formatMailTimestamp: (value: string) => string;
};

export function MailMessageView({
  message,
  loading,
  deletePending,
  folder,
  onDelete,
  onReply,
  formatMailTimestamp,
}: Props) {
  if (loading) {
    return (
      <div className="mail-message-view">
        <div className="empty-state large north-empty-state">{"Загружаем письмо..."}</div>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="mail-message-view">
        <div className="empty-state large north-empty-state">{"Письмо не найдено."}</div>
      </div>
    );
  }

  return (
    <div className="mail-message-view">
      <div className="mail-message-view-header">
        <div className="mail-message-view-subject">
          <h2>{message.subject || "(без темы)"}</h2>
        </div>
        <div className="mail-message-view-meta">
          <span className="mail-meta-label">{"От:"}</span>
          <span>{message.from}</span>
        </div>
        <div className="mail-message-view-meta">
          <span className="mail-meta-label">{"Кому:"}</span>
          <span>{message.to.join(", ")}</span>
        </div>
        <div className="mail-message-view-meta">
          <span className="mail-meta-label">{"Дата:"}</span>
          <span>{formatMailTimestamp(message.sentAt)}</span>
        </div>
        <div className="mail-message-view-actions">
          {folder === "inbox" ? (
            <button type="button" className="secondary-button compact" onClick={onReply}>
              {"Ответить"}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button compact"
            disabled={deletePending}
            onClick={onDelete}
          >
            {deletePending ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      </div>

      <div className="mail-message-view-body">
        <pre className="mail-message-body-text">{message.body}</pre>
      </div>
    </div>
  );
}
