import { describe, expect, it, vi } from "vitest";

import {
  clearCompletedDevicePreparation,
  clearPreparedConversationDeviceState,
  clearPreparedDeviceManifestState,
  clearPreparedOwnSiblingDeviceState,
  readPreparedConversationDeviceState,
  readPreparedDeviceManifestState,
  readPreparedOwnSiblingDeviceState,
  rememberPreparedConversationDeviceState,
  rememberPreparedDeviceManifestState,
  rememberPreparedOwnSiblingDeviceState,
} from "./e2eeDevicePreparationStore";

const bundle = (userId: string, deviceId: string) => ({
  userId,
  deviceId,
  deviceName: `${deviceId}-name`,
  identityKey: `${deviceId}-identity`,
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: `${deviceId}-signature`,
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 1,
  signedPrekeyPublicKey: `${deviceId}-signed-prekey`,
  signedPrekeySignature: "sig",
  signedPrekeyAlgorithm: "X25519",
  deviceVersion: "v1",
  oneTimePrekey: null,
  registeredAt: "2026-04-27T12:00:00.000Z",
  lastSeenAt: "2026-04-27T12:00:00.000Z",
});

describe("e2eeDevicePreparationStore", () => {
  it("stores and expires prepared conversation state by TTL", () => {
    const completedDevicePreparation = new Map<string, number>();
    const preparedConversationDeviceStates = new Map();

    rememberPreparedConversationDeviceState({
      preparationKey: "self:peer",
      preparedState: {
        rawBundles: [bundle("peer", "peer-device")],
        trustedBundles: [],
      },
      completedDevicePreparation,
      preparedConversationDeviceStates,
      now: () => 1000,
    });

    expect(
      readPreparedConversationDeviceState({
        preparationKey: "self:peer",
        completedDevicePreparation,
        preparedConversationDeviceStates,
        ttlMs: 500,
        clearPreparedConversationDeviceState: (preparationKey) =>
          clearPreparedConversationDeviceState({
            preparationKey,
            completedDevicePreparation,
            preparedConversationDeviceStates,
          }),
        now: () => 1200,
      })
    ).toEqual({
      rawBundles: [bundle("peer", "peer-device")],
      trustedBundles: [],
    });

    expect(
      readPreparedConversationDeviceState({
        preparationKey: "self:peer",
        completedDevicePreparation,
        preparedConversationDeviceStates,
        ttlMs: 500,
        clearPreparedConversationDeviceState: (preparationKey) =>
          clearPreparedConversationDeviceState({
            preparationKey,
            completedDevicePreparation,
            preparedConversationDeviceStates,
          }),
        now: () => 1600,
      })
    ).toBeNull();
  });

  it("clones manifest state on read and write", () => {
    const completedDeviceManifestPreparation = new Map<string, number>();
    const preparedDeviceManifestStates = new Map();

    rememberPreparedDeviceManifestState({
      preparationKey: "self:peer",
      preparedState: {
        version: "manifest-v1",
        rawBundles: [bundle("peer", "peer-device")],
      },
      completedDeviceManifestPreparation,
      preparedDeviceManifestStates,
      now: () => 1000,
    });

    const manifestState = readPreparedDeviceManifestState({
      preparationKey: "self:peer",
      completedDeviceManifestPreparation,
      preparedDeviceManifestStates,
      ttlMs: 500,
      clearPreparedDeviceManifestState: (preparationKey) =>
        clearPreparedDeviceManifestState({
          preparationKey,
          completedDeviceManifestPreparation,
          preparedDeviceManifestStates,
        }),
      now: () => 1100,
    });

    expect(manifestState).toEqual({
      version: "manifest-v1",
      rawBundles: [bundle("peer", "peer-device")],
    });
    expect(manifestState?.rawBundles).not.toBe(
      preparedDeviceManifestStates.get("self:peer")?.rawBundles
    );
  });

  it("stores and reads sibling preparation state", () => {
    const completedOwnSiblingDevicePreparation = new Map<string, number>();
    const preparedOwnSiblingDeviceStates = new Map();

    rememberPreparedOwnSiblingDeviceState({
      preparationKey: "self:phone",
      preparedState: {
        rawBundles: [bundle("self", "tablet")],
        trustedBundles: [bundle("self", "tablet")],
      },
      completedOwnSiblingDevicePreparation,
      preparedOwnSiblingDeviceStates,
      now: () => 1000,
    });

    expect(
      readPreparedOwnSiblingDeviceState({
        preparationKey: "self:phone",
        completedOwnSiblingDevicePreparation,
        preparedOwnSiblingDeviceStates,
        ttlMs: 500,
        clearPreparedOwnSiblingDeviceState: (preparationKey) =>
          clearPreparedOwnSiblingDeviceState({
            preparationKey,
            completedOwnSiblingDevicePreparation,
            preparedOwnSiblingDeviceStates,
          }),
        now: () => 1200,
      })
    ).toEqual({
      rawBundles: [bundle("self", "tablet")],
      trustedBundles: [bundle("self", "tablet")],
    });
  });

  it("clears all prepared device state for a user", () => {
    const completedDevicePreparation = new Map([
      ["self:peer", 1],
      ["other:peer", 1],
    ]);
    const preparedConversationDeviceStates = new Map([
      ["self:peer", { rawBundles: [], trustedBundles: [] }],
      ["other:peer", { rawBundles: [], trustedBundles: [] }],
    ]);
    const completedOwnSiblingDevicePreparation = new Map([
      ["self:phone", 1],
      ["other:phone", 1],
    ]);
    const preparedOwnSiblingDeviceStates = new Map([
      ["self:phone", { rawBundles: [], trustedBundles: [] }],
      ["other:phone", { rawBundles: [], trustedBundles: [] }],
    ]);
    const completedDeviceManifestPreparation = new Map([
      ["self:peer", 1],
      ["other:peer", 1],
    ]);
    const preparedDeviceManifestStates = new Map([
      ["self:peer", { version: "v1", rawBundles: [] }],
      ["other:peer", { version: "v1", rawBundles: [] }],
    ]);

    clearCompletedDevicePreparation({
      userId: "self",
      completedDevicePreparation,
      preparedConversationDeviceStates,
      completedOwnSiblingDevicePreparation,
      preparedOwnSiblingDeviceStates,
      completedDeviceManifestPreparation,
      preparedDeviceManifestStates,
      clearPreparedConversationDeviceState: (preparationKey) =>
        clearPreparedConversationDeviceState({
          preparationKey,
          completedDevicePreparation,
          preparedConversationDeviceStates,
        }),
      clearPreparedOwnSiblingDeviceState: (preparationKey) =>
        clearPreparedOwnSiblingDeviceState({
          preparationKey,
          completedOwnSiblingDevicePreparation,
          preparedOwnSiblingDeviceStates,
        }),
      clearPreparedDeviceManifestState: (preparationKey) =>
        clearPreparedDeviceManifestState({
          preparationKey,
          completedDeviceManifestPreparation,
          preparedDeviceManifestStates,
        }),
    });

    expect(completedDevicePreparation.has("self:peer")).toBe(false);
    expect(preparedConversationDeviceStates.has("self:peer")).toBe(false);
    expect(completedOwnSiblingDevicePreparation.has("self:phone")).toBe(false);
    expect(preparedOwnSiblingDeviceStates.has("self:phone")).toBe(false);
    expect(completedDeviceManifestPreparation.has("self:peer")).toBe(false);
    expect(preparedDeviceManifestStates.has("self:peer")).toBe(false);

    expect(completedDevicePreparation.has("other:peer")).toBe(true);
    expect(preparedOwnSiblingDeviceStates.has("other:phone")).toBe(true);
    expect(preparedDeviceManifestStates.has("other:peer")).toBe(true);
  });
});
