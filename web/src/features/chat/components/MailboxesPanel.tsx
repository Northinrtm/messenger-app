import type { UserMailbox } from "../../../lib/types";

const MAILBOX_EMAIL_PATTERN =
  /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

type Props = {
  addMailboxPending: boolean;
  mailboxError: string | null;
  mailboxInput: string;
  mailboxes: UserMailbox[];
  mailboxesLoading: boolean;
  removeMailboxPending: boolean;
  onAddMailbox: () => void;
  onMailboxInputChange: (value: string) => void;
  onRemoveMailbox: (mailboxId: string) => void;
};

export function MailboxesPanel({
  addMailboxPending,
  mailboxError,
  mailboxInput,
  mailboxes,
  mailboxesLoading,
  removeMailboxPending,
  onAddMailbox,
  onMailboxInputChange,
  onRemoveMailbox,
}: Props) {
  const normalizedMailboxInput = mailboxInput.trim();
  const mailboxFormatError =
    normalizedMailboxInput.length > 0 && !MAILBOX_EMAIL_PATTERN.test(normalizedMailboxInput)
      ? "Email должен быть в корректном формате."
      : null;

  return (
    <section className="mailbox-panel">
      <form
        className="mailbox-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mailboxFormatError) {
            return;
          }
          onAddMailbox();
        }}
      >
        <div className="mailbox-panel-copy">
          <strong>Почтовые ящики</strong>
          <span>Добавляйте адреса, которые хотите видеть во вкладке почты.</span>
        </div>
        <div className="mailbox-form-row">
          <input
            value={mailboxInput}
            onChange={(event) => onMailboxInputChange(event.target.value)}
            placeholder="name@example.com"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="secondary-button"
            disabled={
              addMailboxPending ||
              normalizedMailboxInput.length === 0 ||
              mailboxFormatError !== null
            }
          >
            {addMailboxPending ? "Добавляем..." : "Добавить"}
          </button>
        </div>
      </form>

      {mailboxFormatError ? <div className="form-error">{mailboxFormatError}</div> : null}
      {mailboxError ? <div className="form-error">{mailboxError}</div> : null}

      <div className="mailbox-summary">
        <span className="profile-label">Подключено</span>
        <strong>{mailboxes.length}</strong>
      </div>

      {mailboxesLoading ? (
        <div className="empty-list">Загружаем почтовые ящики...</div>
      ) : mailboxes.length === 0 ? (
        <div className="empty-list">Почтовые ящики пока не добавлены.</div>
      ) : (
        <div className="mailbox-list">
          {mailboxes.map((mailbox) => (
            <div key={mailbox.id} className="mailbox-row">
              <div className="mailbox-row-copy">
                <strong>{mailbox.email}</strong>
                <span>Добавлен в ваш список почты.</span>
              </div>
              <button
                type="button"
                className="ghost-button compact"
                disabled={removeMailboxPending}
                onClick={() => onRemoveMailbox(mailbox.id)}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
