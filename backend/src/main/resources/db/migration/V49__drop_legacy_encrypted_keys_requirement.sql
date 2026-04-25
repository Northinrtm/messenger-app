alter table chat_messages
    drop constraint if exists chat_messages_encrypted_payload_required;

alter table chat_messages
    add constraint chat_messages_encrypted_payload_required
    check (
        nullif(btrim(content), '') is not null
        and nullif(btrim(encryption_scheme), '') is not null
        and nullif(btrim(encryption_iv), '') is not null
    ) not valid;
