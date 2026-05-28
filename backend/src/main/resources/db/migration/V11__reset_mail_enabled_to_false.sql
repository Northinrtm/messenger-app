-- Reset all existing users to mail_enabled = false so they opt-in explicitly.
-- V4 set default = true, but Stalwart accounts were only provisioned for users
-- who registered after APP_MAIL_ENABLED=true was deployed. Existing users would
-- get IMAP auth failures with mail_enabled = true and no Stalwart account.
-- When a user enables mail in their profile settings, the backend provisions
-- their Stalwart account before the first IMAP connection.
update app_users
set mail_enabled = false
where not username like 'deleted:%';
