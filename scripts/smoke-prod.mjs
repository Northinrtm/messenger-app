#!/usr/bin/env node

import { randomUUID, webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const MESSAGE_SCHEME = "RSA-OAEP-256/AES-GCM";
const KDF_ITERATIONS = 250_000;

const config = {
  baseUrl: process.env.SMOKE_BASE_URL ?? "https://pishi.ktsf.ru",
  userCount: clampInt(process.env.SMOKE_USER_COUNT, 4, 3, 8),
  keepUsers: process.env.SMOKE_KEEP_USERS === "1",
  password: process.env.SMOKE_PASSWORD ?? "S3cure!RiverQa",
  requestTimeoutMs: clampInt(process.env.SMOKE_TIMEOUT_MS, 15_000, 5_000, 60_000),
};

const runId = `smk${Date.now().toString(36)}`;
const startedAt = new Date();

/** @typedef {{token:string, tokenExpiresAt:string, sessionId:string, user:{id:string, username:string, displayName:string}}} AuthResponse */
/** @typedef {{id:string, username:string, displayName:string, avatarUrl:string|null, online:boolean}} Participant */
/** @typedef {{id:string, direct:boolean, title:string, members:Participant[], lastMessage:string|null, lastMessageAt:string|null, updatedAt:string, unreadCount:number, pinnedMessage:{id:string, sender:Participant, createdAt:string, preview:string}|null}} ChatSummary */

const users = [];

main().catch((error) => {
  console.error("\n[smoke] FAILED");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  console.log(`[smoke] baseUrl=${config.baseUrl}`);
  console.log(`[smoke] runId=${runId}`);
  console.log(`[smoke] userCount=${config.userCount}`);
  console.log(`[smoke] startedAt=${startedAt.toISOString()}`);

  try {
    await createUsersAndKeys();
    await runRestSmokeScenario();
  } finally {
    if (!config.keepUsers) {
      await cleanupUsers();
    } else {
      console.warn("[smoke] keeping users because SMOKE_KEEP_USERS=1");
    }
  }

  const finishedAt = new Date();
  console.log(`\n[smoke] COMPLETED`);
  console.log(`[smoke] finishedAt=${finishedAt.toISOString()}`);
  console.log(`[smoke] metricsWindow=${startedAt.toISOString()} .. ${finishedAt.toISOString()}`);
  console.log("[smoke] Grafana panels to inspect:");
  console.log("  - Message Send Latency p95");
  console.log("  - Message Dispatch Latency p95");
  console.log("  - Chat Summary Broadcast Latency p95");
  console.log("  - JVM Heap");
  console.log("[smoke] Tempo query:");
  console.log('  { resource.service.name = "messenger-backend" && duration > 200ms }');
}

async function createUsersAndKeys() {
  for (let index = 0; index < config.userCount; index += 1) {
    const suffix = String.fromCharCode(97 + index);
    const username = `${runId}${suffix}`;
    const displayName = `Smoke ${suffix.toUpperCase()} ${runId}`;
    const session = await registerWithRetry(username, displayName, config.password);
    const identity = await ensureEncryptionReady(session, config.password);
    users.push({
      username,
      password: config.password,
      session,
      identity,
    });
    console.log(`[smoke] user ready @${username}`);
  }
}

async function runRestSmokeScenario() {
  const [alpha, beta, gamma, delta] = users;
  const allUsernames = users.map((user) => user.username);

  console.log("[smoke] updating profile");
  alpha.session = {
    ...alpha.session,
    user: await updateProfile(alpha.session, {
      displayName: `${alpha.session.user.displayName} Updated`,
    }),
  };

  console.log("[smoke] contact lifecycle");
  await addContact(alpha.session, beta.username);
  await addContact(alpha.session, gamma.username);
  if (delta) {
    await addContact(alpha.session, delta.username);
    await removeContact(alpha.session, delta.username);
  }
  const contacts = await getContacts(alpha.session);
  expect(
    contacts.some((contact) => contact.username === beta.username),
    "alpha should see beta in contacts"
  );

  console.log("[smoke] direct chat lifecycle");
  const directChat = await createDirectChat(alpha.session, beta.username);
  const directMembers = directChat.members;
  const directMessage = await sendEncryptedMessage(alpha, directChat.id, directMembers, {
    content: `direct-${runId}-hello`,
  });
  const betaDirectMessages = await waitForMessages(beta, directChat.id, (messages) =>
    messages.some((message) => message.id === directMessage.id && message.content === `direct-${runId}-hello`)
  );
  expect(betaDirectMessages.some((message) => message.id === directMessage.id), "beta should receive direct message");

  await acknowledgeDelivered(beta.session, directChat.id, [directMessage.id]);
  await acknowledgeRead(beta.session, directChat.id, [directMessage.id]);
  await waitForMessages(alpha, directChat.id, (messages) => {
    const delivered = messages.find((message) => message.id === directMessage.id);
    return Boolean(delivered?.status?.state === "READ");
  });

  await toggleReaction(beta.session, directChat.id, directMessage.id, "EYES");
  await waitForMessages(alpha, directChat.id, (messages) => {
    const reacted = messages.find((message) => message.id === directMessage.id);
    return reacted?.reactions?.some((reaction) => reaction.key === "EYES" && reaction.count === 1);
  });

  const edited = await updateEncryptedMessage(alpha, directChat.id, directMembers, directMessage.id, {
    content: `direct-${runId}-edited`,
  });
  await waitForMessages(beta, directChat.id, (messages) =>
    messages.some((message) => message.id === edited.id && message.content === `direct-${runId}-edited`)
  );

  const replyMessage = await sendEncryptedMessage(beta, directChat.id, directMembers, {
    content: `reply-${runId}`,
    replyToMessageId: directMessage.id,
  });
  const alphaMessagesWithReply = await waitForMessages(alpha, directChat.id, (messages) =>
    messages.some((message) => message.id === replyMessage.id && message.replyTo?.id === directMessage.id)
  );
  expect(
    alphaMessagesWithReply.some((message) => message.id === replyMessage.id && message.replyTo?.id === directMessage.id),
    "alpha should see reply metadata"
  );

  await pinMessage(alpha.session, directChat.id, directMessage.id);
  await waitFor(async () => {
    const chatsAfterPin = await getChats(alpha.session);
    const pinnedDirect = chatsAfterPin.find((chat) => chat.id === directChat.id);
    return pinnedDirect?.pinnedMessage?.id === directMessage.id;
  }, "direct chat should show pinned message");

  await sendTypingState(beta.session, directChat.id, true);
  await waitFor(async () => {
    const typingParticipants = await getTypingParticipants(alpha.session, directChat.id);
    return typingParticipants.some((participant) => participant.username === beta.username);
  }, "alpha should see beta typing");

  await deleteMessage(beta.session, directChat.id, replyMessage.id, "EVERYONE");
  await waitForMessages(alpha, directChat.id, (messages) => !messages.some((message) => message.id === replyMessage.id));

  await updateArchivedChat(alpha.session, directChat.id, true);
  const archivedDirectIds = await getArchivedChats(alpha.session);
  expect(archivedDirectIds.includes(directChat.id), "direct chat should be archived");
  await updateArchivedChat(alpha.session, directChat.id, false);

  console.log("[smoke] group lifecycle");
  const groupChat = await createGroupChat(alpha.session, {
    title: `Smoke Group ${runId}`,
    participantUsernames: [beta.username, gamma.username],
  });
  if (delta) {
    await addGroupParticipants(alpha.session, groupChat.id, [delta.username]);
  }

  const groupFromGamma = (await getChats(gamma.session)).find((chat) => chat.id === groupChat.id);
  expect(Boolean(groupFromGamma), "gamma should see the group chat");

  const groupMembers =
    (await getChats(alpha.session)).find((chat) => chat.id === groupChat.id)?.members ?? groupChat.members;
  const groupMessage = await sendEncryptedMessage(gamma, groupChat.id, groupMembers, {
    content: `group-${runId}-hello`,
  });
  await waitForMessages(alpha, groupChat.id, (messages) =>
    messages.some((message) => message.id === groupMessage.id && message.content === `group-${runId}-hello`)
  );
  await toggleReaction(alpha.session, groupChat.id, groupMessage.id, "LIKE");
  await pinMessage(alpha.session, groupChat.id, groupMessage.id);
  await waitFor(async () => {
    const chatsAfterGroupPin = await getChats(alpha.session);
    const pinnedGroup = chatsAfterGroupPin.find((chat) => chat.id === groupChat.id);
    return pinnedGroup?.pinnedMessage?.id === groupMessage.id;
  }, "group chat should show pinned message");

  console.log("[smoke] conference lifecycle");
  const conference = await createConference(alpha.session, {
    title: `Smoke Conference ${runId}`,
    scheduledAt: new Date().toISOString(),
    participantUsernames: allUsernames.filter((username) => username !== alpha.username).slice(0, 2),
  });
  await startConference(alpha.session, conference.id);
  if (delta) {
    await addConferenceParticipants(alpha.session, conference.id, [delta.username]);
  }
  await endConference(alpha.session, conference.id);
  await waitFor(async () => {
    const archivedConferences = await listArchivedConferences(alpha.session);
    return archivedConferences.some((item) => item.id === conference.id);
  }, "conference should appear in archive after end");

  console.log("[smoke] account/session endpoints");
  const sessions = await listSessions(alpha.session);
  expect(sessions.length >= 1, "alpha should have at least one active session");
}

async function cleanupUsers() {
  console.log("\n[smoke] cleanup started");
  for (const user of [...users].reverse()) {
    try {
      await deleteOwnAccount(user.session);
      console.log(`[smoke] deleted @${user.username}`);
    } catch (error) {
      console.warn(`[smoke] cleanup failed for @${user.username}: ${describeError(error)}`);
    }
  }
}

async function register(username, displayName, password) {
  return request("/api/auth/register", {
    method: "POST",
    body: { username, displayName, password },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function registerWithRetry(username, displayName, password, attempts = 3) {
  let attempt = 0;
  while (attempt < attempts) {
    attempt += 1;
    try {
      return await register(username, displayName, password);
    } catch (error) {
      if (!(error instanceof SmokeError) || error.status !== 429 || attempt >= attempts) {
        throw error;
      }
      const retryAfterSeconds = Number(error.retryAfterSeconds ?? 0);
      const waitMs = Math.max((Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 30) * 1000, 5_000);
      console.warn(`[smoke] auth rate limited, waiting ${Math.ceil(waitMs / 1000)}s before retry ${attempt + 1}/${attempts}`);
      await sleep(waitMs);
    }
  }
  throw new Error(`Failed to register @${username} after ${attempts} attempts`);
}

async function updateProfile(session, body) {
  return request("/api/auth/me", {
    method: "PUT",
    token: session.token,
    body,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function addContact(session, username) {
  return request("/api/users/contacts", {
    method: "POST",
    token: session.token,
    body: { username },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function removeContact(session, username) {
  return request(`/api/users/contacts/${encodeURIComponent(username)}`, {
    method: "DELETE",
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function getContacts(session) {
  return request("/api/users/contacts", {
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function createDirectChat(session, participantUsername) {
  return request("/api/chats/direct", {
    method: "POST",
    token: session.token,
    body: { participantUsername },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function createGroupChat(session, body) {
  return request("/api/chats/group", {
    method: "POST",
    token: session.token,
    body,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function addGroupParticipants(session, chatId, participantUsernames) {
  return request(`/api/chats/${chatId}/participants`, {
    method: "POST",
    token: session.token,
    body: { participantUsernames },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function getChats(session) {
  return request("/api/chats", {
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function getArchivedChats(session) {
  return request("/api/chats/archive", {
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function updateArchivedChat(session, chatId, archived) {
  return request(`/api/chats/${chatId}/archive`, {
    method: "PUT",
    token: session.token,
    body: { archived },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function pinMessage(session, chatId, messageId) {
  return request(`/api/chats/${chatId}/pin`, {
    method: "PUT",
    token: session.token,
    body: { messageId },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function sendTypingState(session, chatId, typing) {
  return request(`/api/chats/${chatId}/typing`, {
    method: "POST",
    token: session.token,
    body: { typing },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function getTypingParticipants(session, chatId) {
  return request(`/api/chats/${chatId}/typing`, {
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function listMessages(user, chatId, options = {}) {
  const rawMessages = await request(`/api/chats/${chatId}/messages`, {
    token: user.session.token,
    query: options,
    timeoutMs: config.requestTimeoutMs,
  });
  return Promise.all(rawMessages.map((message) => decryptChatMessage(message, user.identity)));
}

async function sendEncryptedMessage(user, chatId, members, { content, replyToMessageId = null }) {
  const encryptedPayload = await encryptMessage(content, user.session.token, members);
  const response = await request(`/api/chats/${chatId}/messages`, {
    method: "POST",
    token: user.session.token,
    body: {
      clientMessageId: randomUUID(),
      replyToMessageId,
      encryptedPayload,
    },
    timeoutMs: config.requestTimeoutMs,
  });
  return decryptChatMessage(response, user.identity);
}

async function updateEncryptedMessage(user, chatId, members, messageId, { content }) {
  const encryptedPayload = await encryptMessage(content, user.session.token, members);
  const response = await request(`/api/chats/${chatId}/messages/${messageId}`, {
    method: "PUT",
    token: user.session.token,
    body: { encryptedPayload },
    timeoutMs: config.requestTimeoutMs,
  });
  return decryptChatMessage(response, user.identity);
}

async function acknowledgeDelivered(session, chatId, messageIds) {
  return request(`/api/chats/${chatId}/messages/delivered`, {
    method: "POST",
    token: session.token,
    body: { messageIds },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function acknowledgeRead(session, chatId, messageIds) {
  return request(`/api/chats/${chatId}/messages/read`, {
    method: "POST",
    token: session.token,
    body: { messageIds },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function toggleReaction(session, chatId, messageId, key) {
  return request(`/api/chats/${chatId}/messages/${messageId}/reactions`, {
    method: "PUT",
    token: session.token,
    body: { key },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function deleteMessage(session, chatId, messageId, scope) {
  return request(`/api/chats/${chatId}/messages/${messageId}`, {
    method: "DELETE",
    token: session.token,
    query: { scope },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function createConference(session, body) {
  return request("/api/conferences", {
    method: "POST",
    token: session.token,
    body,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function startConference(session, conferenceId) {
  return request(`/api/conferences/${conferenceId}/start`, {
    method: "POST",
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function addConferenceParticipants(session, conferenceId, participantUsernames) {
  return request(`/api/conferences/${conferenceId}/participants`, {
    method: "POST",
    token: session.token,
    body: { participantUsernames },
    timeoutMs: config.requestTimeoutMs,
  });
}

async function endConference(session, conferenceId) {
  return request(`/api/conferences/${conferenceId}`, {
    method: "DELETE",
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function listArchivedConferences(session) {
  return request("/api/conferences/archive", {
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function listSessions(session) {
  return request("/api/auth/sessions", {
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function deleteOwnAccount(session) {
  return request("/api/auth/me", {
    method: "DELETE",
    token: session.token,
    timeoutMs: config.requestTimeoutMs,
  });
}

async function ensureEncryptionReady(session, password) {
  try {
    const bundle = await request("/api/e2ee/me", {
      token: session.token,
      timeoutMs: config.requestTimeoutMs,
    });
    const privateKey = await unwrapPrivateKey(bundle, password);
    return { userId: session.user.id, publicKey: bundle.publicKey, privateKey };
  } catch (error) {
    if (!(error instanceof SmokeError) || error.status !== 404) {
      throw error;
    }
  }

  const identity = await generateIdentity();
  const wrappedPrivateKey = await wrapPrivateKey(identity.privateKey, password);
  const bundle = await request("/api/e2ee/me", {
    method: "PUT",
    token: session.token,
    body: {
      publicKey: identity.publicKey,
      encryptedPrivateKey: wrappedPrivateKey.ciphertext,
      kdfSalt: wrappedPrivateKey.salt,
      kdfIv: wrappedPrivateKey.iv,
      kdfIterations: wrappedPrivateKey.iterations,
    },
    timeoutMs: config.requestTimeoutMs,
  });

  return {
    userId: session.user.id,
    publicKey: bundle.publicKey,
    privateKey: identity.privateKey,
  };
}

async function encryptMessage(content, token, participants) {
  const keys = await request("/api/e2ee/keys/resolve", {
    method: "POST",
    token,
    body: { userIds: participants.map((participant) => participant.id) },
    timeoutMs: config.requestTimeoutMs,
  });
  const publicKeysByUserId = new Map(keys.map((entry) => [entry.userId, entry.publicKey]));
  const contentKey = await subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
  const rawContentKey = await subtle.exportKey("raw", contentKey);
  const iv = randomBytes(12);
  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    contentKey,
    textEncoder.encode(content)
  );
  const encryptedKeysByUserId = {};
  for (const [userId, publicKey] of publicKeysByUserId.entries()) {
    const imported = await importPublicKey(publicKey);
    const encryptedKey = await subtle.encrypt({ name: "RSA-OAEP" }, imported, rawContentKey);
    encryptedKeysByUserId[userId] = bytesToBase64(new Uint8Array(encryptedKey));
  }

  return {
    scheme: MESSAGE_SCHEME,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    encryptedKeysByUserId,
  };
}

async function decryptChatMessage(message, identity) {
  if (!message?.encryptedPayload) {
    return { ...message, content: "[Encrypted payload missing]" };
  }

  const privateKey = await importPrivateKey(identity.privateKey);
  const rawContentKey = await subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    base64ToBytes(message.encryptedPayload.encryptedKey)
  );
  const contentKey = await subtle.importKey(
    "raw",
    rawContentKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(message.encryptedPayload.iv),
    },
    contentKey,
    base64ToBytes(message.encryptedPayload.ciphertext)
  );

  return {
    ...message,
    content: textDecoder.decode(plaintext),
  };
}

async function waitForMessages(user, chatId, predicate, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const messages = await listMessages(user, chatId, { limit: 50 });
    if (predicate(messages)) {
      return messages;
    }
    await sleep(400);
  }
  throw new Error(`Timed out while waiting for messages in chat ${chatId}`);
}

async function waitFor(check, message, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) {
      return;
    }
    await sleep(400);
  }
  throw new Error(message);
}

async function generateIdentity() {
  const keyPair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKey = await subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await subtle.exportKey("jwk", keyPair.privateKey);
  return {
    publicKey: JSON.stringify(publicKey),
    privateKey: JSON.stringify(privateKey),
  };
}

async function wrapPrivateKey(privateKey, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(password, salt, KDF_ITERATIONS);
  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(privateKey)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations: KDF_ITERATIONS,
  };
}

async function unwrapPrivateKey(bundle, password) {
  const wrappingKey = await deriveWrappingKey(password, base64ToBytes(bundle.kdfSalt), bundle.kdfIterations);
  const plaintext = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(bundle.kdfIv),
    },
    wrappingKey,
    base64ToBytes(bundle.encryptedPrivateKey)
  );
  return textDecoder.decode(plaintext);
}

async function deriveWrappingKey(password, salt, iterations) {
  const keyMaterial = await subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function importPublicKey(serializedPublicKey) {
  return subtle.importKey(
    "jwk",
    JSON.parse(serializedPublicKey),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );
}

async function importPrivateKey(serializedPrivateKey) {
  return subtle.importKey(
    "jwk",
    JSON.parse(serializedPrivateKey),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"]
  );
}

async function request(path, options = {}) {
  const url = buildUrl(path, options.query);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), options.timeoutMs ?? config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return undefined;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      throw new SmokeError(
        typeof body === "object" && body?.error ? body.error : `Request failed (${response.status})`,
        response.status,
        body,
        response.headers.get("retry-after")
      );
    }

    return body;
  } catch (error) {
    if (error instanceof SmokeError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SmokeError(`Timed out calling ${path}`, 0, null);
    }
    throw new SmokeError(`Network failure calling ${path}: ${error instanceof Error ? error.message : String(error)}`, 0, null);
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildUrl(path, query) {
  const normalizedBaseUrl = config.baseUrl.endsWith("/") ? config.baseUrl.slice(0, -1) : config.baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBaseUrl}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

function randomBytes(length) {
  const buffer = new Uint8Array(length);
  webcrypto.getRandomValues(buffer);
  return buffer;
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function base64ToBytes(value) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function bytesToBase64(value) {
  return Buffer.from(value).toString("base64");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(rawValue, fallback, min, max) {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function describeError(error) {
  if (error instanceof SmokeError) {
    return `${error.message}${error.status ? ` [${error.status}]` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

class SmokeError extends Error {
  constructor(message, status, body, retryAfterSeconds = null) {
    super(message);
    this.name = "SmokeError";
    this.status = status;
    this.body = body;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
