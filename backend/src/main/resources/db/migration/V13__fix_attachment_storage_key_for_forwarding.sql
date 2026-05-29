-- storage_key was unique, which prevented copyAttachmentsForForward from creating
-- a second ChatAttachment record pointing to the same MinIO object for forwarded messages.
-- We drop the unique constraint and replace it with a non-unique index so lookups remain fast.
-- Deletion logic in ChatAttachmentService now checks reference count before removing the
-- physical object from storage.
alter table chat_attachments drop constraint if exists chat_attachments_storage_key_key;
drop index if exists chat_attachments_storage_key_key;
create index if not exists idx_chat_attachments_storage_key on chat_attachments (storage_key);
