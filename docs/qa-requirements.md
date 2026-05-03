# Требования к тестированию проекта

Связанный документ:
- [functional-requirements.md](./functional-requirements.md) описывает, что должен делать продукт для пользователя.
- Этот документ описывает, как продукт проверяется и какие QA-инварианты обязательны перед релизом.

## 1. Назначение документа

Этот документ задает обязательные требования к тестированию `Messenger App` перед релизом, после инфраструктурных изменений и после правок, затрагивающих:

- аутентификацию и сессии;
- E2EE и разблокировку зашифрованных чатов;
- direct и group messaging;
- realtime-доставку через `WebSocket/STOMP`;
- HTTP fallback для мутаций;
- read receipts, typing, retry, hydration;
- вложения, push, архив, delete/edit/forward/reply;
- управление группами и видеоконференции.

Цель тестирования:

- не допускать потери сообщений;
- не допускать ложных состояний `Retry` и `[Encrypted message unavailable]` для свежих сообщений в поддерживаемом сценарии;
- подтверждать, что серверный и клиентский пути согласованы;
- подтверждать, что продукт остается пригодным к дальнейшему масштабированию без скрытых регрессий.

## 2. Краткое описание продукта

Проект представляет собой production-oriented realtime messenger со следующими ключевыми свойствами:

- `Spring Boot` backend;
- `React + TypeScript + Vite` web client;
- `PostgreSQL` как source of truth;
- `WebSocket/STOMP` как основной realtime transport;
- HTTP как authoritative fallback/recovery path;
- E2EE:
  - direct chats: `CHAT-EPOCH-KEY-AES-GCM`
  - group chats: `CHAT-EPOCH-KEY-AES-GCM`
- browser-local encrypted state, trusted-browser unlock, decrypted message archive.

## 3. Обязательные тестовые среды

### 3.1 Минимальный набор сред

Тестировщик должен уметь прогонять сценарии как минимум в следующих средах:

- локальная среда (`docker compose`);
- pre-production / staging, если доступна;
- production smoke после релиза.

### 3.2 Минимальный набор клиентов

Минимально обязательны:

- один основной профиль браузера пользователя;
- второй отдельный профиль браузера или отдельный браузер;
- отдельный “чистый” профиль без локального E2EE state;
- два независимых пользовательских аккаунта;
- для групповых сценариев минимум три аккаунта.

### 3.3 Минимальный браузерный охват

Обязательный приоритет:

- `Chrome` latest stable;
- `Edge` latest stable, если используется в команде или на проде.

Дополнительные проверки:

- `Firefox` и другие браузеры как exploratory, если релиз затрагивает auth, WebAuthn или storage.

## 4. Базовые инварианты качества

Следующие инварианты считаются обязательными.

### 4.1 Инварианты доставки

- Отправленное сообщение не должно “пропадать” между UI, сервером и БД.
- Для успешной отправки должен существовать согласованный набор фактов:
  - сообщение видно в чате;
  - сообщение присутствует в истории после reload;
  - сообщение закоммичено на сервере;
  - у сообщения есть корректный `messageId`;
  - у сообщения есть корректный `serverOrder`.

### 4.2 Инварианты E2EE

- Backend не должен хранить plaintext сообщений.
- Managed E2EE trust model должен оставаться согласованным: сервер не хранит plaintext сообщений, но может regrant'ить history keys через escrow по правилам продукта.
- Свежие сообщения, отправленные из уже разблокированной и поддерживаемой клиентской сессии, не должны отображаться как `[Encrypted message unavailable]`.
- Разблокировка encrypted chats должна быть отделена от обычного login session.
- Смена пароля не должна ломать будущую разблокировку encrypted chats при штатном сценарии смены пароля через приложение.
- Штатная ротация account key не должна ломать последующий send/readback.
- Identity reset должен быть отдельным проверяемым security event, а не молчаливой самопочинкой клиента.

### 4.3 Инварианты realtime

- Direct и group send в штатном сценарии должны идти через `WebSocket/STOMP`.
- HTTP fallback допустим только при реальном transport/availability issue или recoverable server-side condition.
- `typing`, `delivered`, `read`, incoming messages и sender ack не должны зависать в ложном состоянии после reconnect/reload.

### 4.4 Инварианты UX-согласованности

- Preview слева, stream справа и серверная история после reload должны отражать одно и то же пользовательское состояние.
- Ложные `Retry`, ложные `Encrypted message`, ложные `read` и ложный `typing` считаются дефектами.

## 5. Обязательные функциональные области тестирования

### 5.1 Auth и account

Нужно тестировать:

- регистрация;
- логин;
- refresh session после reload;
- logout;
- active sessions;
- revoke session;
- email verification;
- password reset;
- смена пароля;
- изменение профиля и аватара;
- удаление аккаунта.

Обязательные acceptance checks:

- refresh token path работает после перезагрузки;
- инвалидированная сессия больше не должна работать ни по HTTP, ни по WebSocket;
- после смены пароля старые refresh/session артефакты должны быть корректно переоценены.

### 5.2 E2EE unlock

Нужно тестировать:

- unlock encrypted chats по паролю;
- trusted browser / passkey unlock;
- lock/unlock после reload;
- unlock на чистом профиле;
- unlock после смены пароля;
- сценарий “не могу разблокировать encrypted chats”;
- штатную ротацию account encryption key;
- identity reset с новым identity signing key.

Обязательные acceptance checks:

- пользовательский login может быть активен, но encrypted chats могут требовать отдельный unlock;
- сообщения не должны silently становиться unreadable в поддерживаемом сценарии;
- UX должен честно объяснять mismatch старого/нового password wrap, если он возникает.
- штатная account-key rotation должна проходить без ручного вмешательства второго участника;
- identity reset должен требовать явный security flow и не должен маскироваться под обычную ротацию.

### 5.3 Direct chats

Нужно тестировать:

- создание/открытие direct chat;
- отправка текста;
- reply;
- edit;
- delete for self;
- delete for everyone;
- forward;
- pin/unpin;
- reactions;
- read receipts;
- typing.

Обязательные acceptance checks:

- direct send по `ws` в штатном сценарии;
- после reload сообщение остается читаемым;
- `Retry` появляется только при реальной неуспешной отправке;
- read status меняется корректно после фактического открытия сообщения другим пользователем.

### 5.4 Group chats

Нужно тестировать:

- создание группы;
- добавление/удаление участников;
- модераторы и owner rules;
- invite links;
- переключение `JOIN_ONLY` / `FULL_HISTORY`;
- отправка текста;
- reply/edit/forward/pin/reactions;
- delete for self/everyone, где разрешено;
- read receipts;
- typing;
- бан/разбан/leave;
- history key fallback для новых участников, где доступ допустим.

Обязательные acceptance checks:

- group send идет через `ws` в штатном сценарии;
- свежие group messages не должны становиться `[Encrypted message unavailable]` в поддерживаемой разблокированной сессии;
- изменения состава группы не должны ломать subsequent send;
- при `JOIN_ONLY` новый участник не должен получать pre-join history;
- при `FULL_HISTORY` server-side backfill должен выдавать разрешённую историю без ручной раздачи ключей от другого клиента;
- readback после reload должен совпадать с тем, что было до reload.

### 5.5 Attachments

Нужно тестировать:

- upload attachment;
- image preview;
- retry-safe upload path;
- cancel upload;
- orphan cleanup;
- пересылка/удаление сообщений с вложениями;
- download/open flow.

Обязательные acceptance checks:

- вложение не должно “отвязаться” от сообщения;
- размерные лимиты и ошибки должны обрабатываться предсказуемо;
- encrypted attachment flow не должен утекать в plaintext на backend.

### 5.6 Push notifications

Нужно тестировать:

- подписку на push;
- generic push при offline получателе;
- browser-side preview при доступном unlocked client;
- отсутствие plaintext preview в backend push payload.

### 5.7 Archive, drafts, counters

Нужно тестировать:

- archive chat for self;
- restore from archive;
- delete chat for self;
- per-chat drafts;
- unread counters;
- first unread navigation после новых сообщений.

### 5.8 Video conferences

Нужно тестировать:

- instant conference;
- scheduled conference;
- join window;
- invite flow;
- embed;
- recording import/download.

## 6. Обязательные нефункциональные проверки

### 6.1 Realtime and transport

Тестировщик обязан проверять:

- WebSocket connect;
- reconnect после обрыва сети;
- fallback на HTTP только там, где это предусмотрено;
- отсутствие ложных sender acks;
- отсутствие silent commit mismatch между UI и сервером.

### 6.2 Performance baseline

Для ручной приемки под нормальной сетью целевой ориентир такой:

- direct send: визуально подтвержденная отправка обычно не хуже `<= 3s`;
- group send: визуально подтвержденная отправка обычно не хуже `<= 5s`;
- typing: не “залипает” дольше допустимого окна;
- read status: обновляется без ручного reload после фактического чтения.

Это не hard SLA для любого окружения, но это релизный ориентир. Существенные отклонения должны заводиться как perf defect.

### 6.3 Reload and multi-tab resilience

Обязательно проверять:

- reload активного чата;
- reopen browser tab;
- открытие второго таба тем же аккаунтом;
- работу после deploy / новой frontend revision;
- поведение stale tab после обновления сборки.

## 7. Обязательные негативные сценарии

Тестировщик обязан проверять как минимум:

- отправку при временной недоступности websocket;
- отправку при refresh access token;
- отправку во время reconnect;
- отправку после изменения состава группы;
- unlock на устройстве без локального encrypted state;
- password change + unlock на втором профиле;
- удаление/редактирование сообщения после reload;
- race между send и immediate reload;
- чтение входящего сообщения, которое сначала было unreadable snapshot, а потом стало plaintext.

## 8. Обязательные артефакты для каждого серьезного дефекта

Если найден дефект уровня `Blocker`, `Critical` или `Major`, тестировщик обязан приложить:

- build revision;
- среду (`local`, `staging`, `prod`);
- браузер и версию;
- один или несколько аккаунтов, участвующих в сценарии;
- точное время события;
- `chatId`, если известен;
- `messageId`, если известен;
- `clientMessageId`, если известен;
- шаги воспроизведения;
- фактический результат;
- ожидаемый результат;
- скриншот или короткое видео;
- если доступно: transport info (`ws` / `http fallback`);
- если доступно: diagnostics из `send-diagnostics` или `message-hydration-diagnostics`.

## 9. Классификация дефектов

### 9.1 Blocker

- потеря сообщения;
- commit mismatch между UI и сервером;
- возможность читать/мутировать чужой чат;
- backend хранит plaintext вместо encrypted payload;
- массовая недоступность логина, unlock или realtime.

### 9.2 Critical

- свежие сообщения регулярно становятся `[Encrypted message unavailable]`;
- direct/group send регулярно падает в `Retry` без реальной причины;
- delete/edit ломает историю сообщений;
- read receipts или typing системно неверны;
- смена пароля ломает E2EE unlock в штатном сценарии.

### 9.3 Major

- одна из ключевых функций нестабильна, но есть обходной путь;
- производительность заметно деградировала;
- preview/history/stream рассогласованы;
- баг проявляется только при reload/reconnect/second tab.

### 9.4 Minor

- косметические дефекты;
- незначительные проблемы текста/локализации;
- необязательные UX-несоответствия без риска потери данных.

## 10. Обязательный smoke после каждого релиза в production

Минимальный production smoke:

1. Открыть приложение и восстановить сессию.
2. Открыть encrypted chats и убедиться, что unlock-path штатный.
3. Отправить одно direct message.
4. Отправить одно group message.
5. Убедиться, что оба сообщения:
   - отправились;
   - отображаются как plaintext;
   - переживают reload;
   - не ушли в `Retry`.
6. Проверить read receipt.
7. Проверить typing.
8. Проверить хотя бы один сценарий `JOIN_ONLY` или `FULL_HISTORY`, если релиз затрагивал группы или E2EE.
9. Проверить delete for self/everyone на тестовом сообщении.
10. Проверить хотя бы один attachment flow.

Если smoke не пройден, релиз считается подозрительным даже при “зеленом” CI.

### 10.1 Как правильно проверять encrypted send/readback в production

Для direct/group сообщений с E2EE production-проверка считается корректной только если отправка и последующая проверка readback выполняются в одном и том же live browser context.

Обязательные правила:

- нельзя отправлять сообщение из cloned browser state и проверять его в другой живой вкладке;
- нельзя делать вывод о корректности E2EE readback, если отправка была выполнена из отдельного synthetic/headless профиля с подложенными `localStorage/sessionStorage`;
- нельзя считать `[Encrypted message unavailable]` server-side дефектом, пока не подтверждено, что send и readback шли из одного и того же локального E2EE state;
- при production smoke для encrypted chats нужно фиксировать не только server commit, но и client-side readback в той же вкладке/профиле.

Корректный workflow:

1. Открыть именно тот браузерный профиль, в котором потом будет проверяться readback.
2. Выполнить unlock encrypted chats в этом же профиле, если требуется.
3. Отправить direct/group сообщение из этой же вкладки или из automation, подключенной к этой же вкладке по live DevTools/CDP.
4. В этой же вкладке проверить:
   - bubble после send;
   - preview слева;
   - состояние после reload;
   - отсутствие ложных `[Encrypted message unavailable]`.
5. Только после этого сверять transport/server facts:
   - `ws` или `http fallback`;
   - `clientMessageId`;
   - `messageId`;
   - `serverOrder`;
   - server commit/logs.

Некорректный workflow:

- отправка из headless browser с copied storage и чтение в обычном окне пользователя;
- отправка из одного профиля и проверка readback в другом;
- проверка только по БД/логам без client readback;
- проверка только по UI без reload и без transport correlation.

## 11. Границы ответственности тестировщика

Тестировщик не обязан:

- анализировать криптографические алгоритмы на уровне formal proof;
- исправлять код;
- принимать на веру только UI.

Тестировщик обязан:

- сверять UI с реальным поведением после reload/reconnect;
- уметь отличать auth problem от E2EE unlock problem;
- эскалировать любые случаи message loss, commit mismatch, unreadable fresh messages и silent realtime regressions.

## 12. Критерий готовности релиза

Релиз считается готовым только если:

- нет открытых `Blocker` и `Critical`;
- production smoke пройден;
- direct и group send подтверждены;
- нет новых системных `[Encrypted message unavailable]` для свежих сообщений;
- нет новых ложных `Retry`;
- нет новой регрессии по read receipts и typing;
- нет признаков рассинхронизации между UI, realtime и persisted history.

