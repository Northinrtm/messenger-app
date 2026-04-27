import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decryptRememberedDeviceSessions,
  encryptRememberedDeviceSessions,
  readRememberedDeviceSessions,
  rememberDeviceSessions,
  removeRememberedDeviceSessions,
} from "./e2eeSessionPersistence";

const bytesToBase64 = (value: Uint8Array) => {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

type SessionRecord = {
  sessionId: string;
  peerUserId: string;
};

describe("e2eeSessionPersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips remembered device sessions", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );

    const record = await encryptRememberedDeviceSessions({
      privateKey: "private-key",
      sessions: {
        "peer:device": {
          sessionId: "session-id",
          peerUserId: "peer",
        },
      },
      kdfIterations: 10,
      randomBytes: (length) => new Uint8Array(length).fill(1),
      deriveWrappingKey: async () => ({ } as CryptoKey),
      bytesToBase64,
      textEncoder: new TextEncoder(),
    });

    await expect(
      decryptRememberedDeviceSessions({
        privateKey: "private-key",
        record,
        kdfIterations: 10,
        deriveWrappingKey: async () => ({ } as CryptoKey),
        base64ToBytes,
        textDecoder: new TextDecoder(),
      })
    ).resolves.toContain("\"sessionId\":\"session-id\"");
  });

  it("persists remembered sessions in localStorage and reads them back", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );

    await rememberDeviceSessions<SessionRecord>({
      userId: "self-user",
      sessions: {
        "peer:device": {
          sessionId: "session-id",
          peerUserId: "peer",
        },
      },
      readUnlockedIdentity: () => ({ privateKey: "private-key" }),
      sanitizeStoredDeviceSessions: (sessions) => sessions,
      encryptRememberedDeviceSessions: (privateKey, sessions) =>
        encryptRememberedDeviceSessions({
          privateKey,
          sessions,
          kdfIterations: 10,
          randomBytes: (length) => new Uint8Array(length).fill(2),
          deriveWrappingKey: async () => ({ } as CryptoKey),
          bytesToBase64,
          textEncoder: new TextEncoder(),
        }),
      getRememberedDeviceSessionStorageKey: (userId) => `remembered:${userId}`,
    });

    await expect(
      readRememberedDeviceSessions<SessionRecord>({
        userId: "self-user",
        readUnlockedIdentity: () => ({ privateKey: "private-key" }),
        getRememberedDeviceSessionStorageKey: (userId) => `remembered:${userId}`,
        decryptRememberedDeviceSessions: (privateKey, record) =>
          decryptRememberedDeviceSessions({
            privateKey,
            record,
            kdfIterations: 10,
            deriveWrappingKey: async () => ({ } as CryptoKey),
            base64ToBytes,
            textDecoder: new TextDecoder(),
          }),
        validateSessionCollection: (
          value
        ): value is Record<string, SessionRecord> =>
          Boolean(
            value &&
              typeof value === "object" &&
              Object.values(value).every(
                (session) =>
                  session &&
                  typeof session === "object" &&
                  typeof (session as { sessionId?: unknown }).sessionId === "string" &&
                  typeof (session as { peerUserId?: unknown }).peerUserId === "string"
              )
          ),
        removeRememberedDeviceSessions: (userId) =>
          removeRememberedDeviceSessions({
            userId,
            getRememberedDeviceSessionStorageKey: (currentUserId) => `remembered:${currentUserId}`,
          }),
      })
    ).resolves.toMatchObject({
      "peer:device": {
        sessionId: "session-id",
      },
    });
  });

  it("removes invalid remembered session records", async () => {
    window.localStorage.setItem("remembered:self-user", JSON.stringify({ nope: true }));

    await expect(
      readRememberedDeviceSessions<SessionRecord>({
        userId: "self-user",
        readUnlockedIdentity: () => ({ privateKey: "private-key" }),
        getRememberedDeviceSessionStorageKey: (userId) => `remembered:${userId}`,
        decryptRememberedDeviceSessions: async () => null,
        validateSessionCollection: (
          value
        ): value is Record<string, SessionRecord> => Boolean(value && typeof value === "object"),
        removeRememberedDeviceSessions: (userId) =>
          removeRememberedDeviceSessions({
            userId,
            getRememberedDeviceSessionStorageKey: (currentUserId) => `remembered:${currentUserId}`,
          }),
      })
    ).resolves.toBeNull();

    expect(window.localStorage.getItem("remembered:self-user")).toBeNull();
  });
});
