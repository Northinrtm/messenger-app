import { useState } from "react";

type Props = {
  sendPending: boolean;
  sendError: string | null;
  initialTo?: string;
  initialSubject?: string;
  onSend: (to: string, subject: string, body: string) => void;
  onClose: () => void;
};

export function MailComposeView({
  sendPending,
  sendError,
  initialTo = "",
  initialSubject = "",
  onSend,
  onClose,
}: Props) {
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");

  const canSend = to.trim().length > 0 && body.trim().length > 0 && !sendPending;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSend(to.trim(), subject.trim(), body.trim());
  }

  return (
    <div className="mail-compose-view">
      <div className="mail-compose-header">
        <h2>{"Новое письмо"}</h2>
        <button type="button" className="ghost-button compact" onClick={onClose}>
          {"Отмена"}
        </button>
      </div>

      <form className="mail-compose-form" onSubmit={handleSubmit}>
        <label className="mail-compose-field">
          <span className="mail-meta-label">{"Кому"}</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={sendPending}
          />
        </label>

        <label className="mail-compose-field">
          <span className="mail-meta-label">{"Тема"}</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Тема письма"
            disabled={sendPending}
          />
        </label>

        <div className="mail-compose-body-wrap">
          <textarea
            className="mail-compose-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Текст письма..."
            disabled={sendPending}
            rows={16}
          />
        </div>

        {sendError ? <div className="form-error">{sendError}</div> : null}

        <div className="mail-compose-footer">
          <button type="submit" className="primary-button" disabled={!canSend}>
            {sendPending ? "Отправляем..." : "Отправить"}
          </button>
        </div>
      </form>
    </div>
  );
}
