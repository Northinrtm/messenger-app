import type { UserMailbox } from "../../../lib/types";

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
  return (
    <section className="mailbox-panel">
      <form
        className="mailbox-form"
        onSubmit={(event) => {
          event.preventDefault();
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
            disabled={addMailboxPending || mailboxInput.trim().length === 0}
          >
            {addMailboxPending ? "Добавляем..." : "Добавить"}
          </button>
        </div>
      </form>

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
