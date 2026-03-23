alter table app_users
    add column avatar_url text;

create unique index uk_app_users_display_name_lower
    on app_users (lower(display_name));
