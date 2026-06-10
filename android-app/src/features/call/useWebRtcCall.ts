import {useCallback, useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import InCallManager from 'react-native-incall-manager';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import type {CallSignalEvent, CallSignalType} from '@north/shared';
import {CALL_ICE_SERVERS} from '../../config';
import type {IceServerConfig} from '../../lib/api';
import {sendCallSignal} from '../../lib/realtime';

// react-native-webrtc inherits addEventListener from event-target-shim's
// EventTarget, but those overloads do not surface through its bundled types.
// This local view restores just the two events we use, fully typed.
type CallPeerConnection = RTCPeerConnection & {
  addEventListener(
    type: 'icecandidate',
    listener: (event: {candidate: RTCIceCandidate | null}) => void,
  ): void;
  addEventListener(type: 'connectionstatechange', listener: () => void): void;
};

export type CallStatus =
  | 'idle'
  | 'calling'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'ended';

export type CallState = {
  status: CallStatus;
  callId: string | null;
  peerUsername: string | null;
  peerDisplayName: string | null;
  isCaller: boolean;
  muted: boolean;
  speakerOn: boolean;
  connectedAt: number | null;
};

const IDLE_CALL: CallState = {
  status: 'idle',
  callId: null,
  peerUsername: null,
  peerDisplayName: null,
  isCaller: false,
  muted: false,
  speakerOn: false,
  connectedAt: null,
};

// Ring/answer window before the call auto-cancels.
const CALL_TIMEOUT_MS = 45_000;
const ENDED_FLASH_MS = 1_500;

function randomCallId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultIceServers(): IceServerConfig[] {
  return CALL_ICE_SERVERS.map(server => ({urls: server.urls}));
}

function toRtcIceServers(servers: IceServerConfig[]) {
  return servers.map(server => ({
    urls: server.urls,
    ...(server.username ? {username: server.username} : {}),
    ...(server.credential ? {credential: server.credential} : {}),
  }));
}

async function ensureMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export type WebRtcCall = {
  call: CallState;
  startCall: (username: string, displayName: string) => void;
  acceptCall: () => void;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  handleSignal: (event: CallSignalEvent) => void;
};

/**
 * Native 1-on-1 WebRTC audio call engine. Media flows peer-to-peer; only
 * SDP/ICE negotiation is relayed through the backend (see {@link sendCallSignal}).
 */
export function useWebRtcCall(
  selfDisplayName: string,
  onRing?: (callId: string, targetUsername: string, callerDisplayName: string) => void,
  fetchIceServers?: () => Promise<IceServerConfig[]>,
): WebRtcCall {
  const [call, setCall] = useState<CallState>(IDLE_CALL);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const peerRef = useRef<string | null>(null);
  const remoteReadyRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidate[]>([]);
  const incomingOfferRef = useRef<string | null>(null);
  const offerSdpRef = useRef<string | null>(null);
  const offerResendRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inCallStartedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<CallStatus>('idle');
  const selfNameRef = useRef(selfDisplayName);
  selfNameRef.current = selfDisplayName;
  const onRingRef = useRef(onRing);
  onRingRef.current = onRing;
  const fetchIceServersRef = useRef(fetchIceServers);
  fetchIceServersRef.current = fetchIceServers;

  useEffect(() => {
    statusRef.current = call.status;
  }, [call.status]);

  const clearCallTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearOfferResend = useCallback(() => {
    if (offerResendRef.current) {
      clearInterval(offerResendRef.current);
      offerResendRef.current = null;
    }
  }, []);

  const sendSignal = useCallback(
    (
      type: CallSignalType,
      extra?: {sdp?: string; candidate?: string; callerDisplayName?: string},
    ) => {
      const callId = callIdRef.current;
      const target = peerRef.current;
      if (!callId || !target) {
        return;
      }
      sendCallSignal({
        callId,
        targetUsername: target,
        type,
        sdp: extra?.sdp ?? null,
        candidate: extra?.candidate ?? null,
        callerDisplayName: extra?.callerDisplayName ?? null,
      });
    },
    [],
  );

  const teardown = useCallback(
    (flashEnded: boolean) => {
      clearCallTimeout();
      clearOfferResend();
      if (inCallStartedRef.current) {
        try {
          InCallManager.stop();
        } catch {
          // ignore
        }
        inCallStartedRef.current = false;
      }
      const pc = pcRef.current;
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
      }
      pcRef.current = null;
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
      }
      localStreamRef.current = null;
      callIdRef.current = null;
      peerRef.current = null;
      remoteReadyRef.current = false;
      pendingIceRef.current = [];
      incomingOfferRef.current = null;
      offerSdpRef.current = null;

      if (flashEnded) {
        setCall({...IDLE_CALL, status: 'ended'});
        timeoutRef.current = setTimeout(() => {
          setCall(current => (current.status === 'ended' ? IDLE_CALL : current));
        }, ENDED_FLASH_MS);
      } else {
        setCall(IDLE_CALL);
      }
    },
    [clearCallTimeout, clearOfferResend],
  );

  // Re-send the offer while ringing so a callee that comes online mid-call (e.g.
  // after tapping the wake-up push) still receives a fresh offer over realtime.
  const startOfferResend = useCallback(() => {
    clearOfferResend();
    offerResendRef.current = setInterval(() => {
      if (statusRef.current === 'calling' && offerSdpRef.current) {
        sendSignal('OFFER', {
          sdp: offerSdpRef.current,
          callerDisplayName: selfNameRef.current,
        });
      } else {
        clearOfferResend();
      }
    }, 3_000);
  }, [sendSignal, clearOfferResend]);

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) {
      return;
    }
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore late/duplicate candidates
      }
    }
  }, []);

  const resolveIceServers = useCallback(async (): Promise<IceServerConfig[]> => {
    const fetcher = fetchIceServersRef.current;
    if (fetcher) {
      try {
        const fetched = await fetcher();
        if (fetched && fetched.length > 0) {
          return fetched;
        }
      } catch {
        // fall back to public STUN
      }
    }
    return defaultIceServers();
  }, []);

  const createPeerConnection = useCallback(
    (servers: IceServerConfig[]): RTCPeerConnection => {
      const pc = new RTCPeerConnection({
        iceServers: toRtcIceServers(servers),
      }) as CallPeerConnection;

    pc.addEventListener('icecandidate', event => {
      if (event.candidate) {
        sendSignal('ICE', {candidate: JSON.stringify(event.candidate)});
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        clearCallTimeout();
        clearOfferResend();
        if (!inCallStartedRef.current) {
          // Switch the device into in-call audio mode: routes to the earpiece by
          // default, grabs audio focus, and enables the proximity sensor.
          try {
            InCallManager.start({media: 'audio'});
          } catch {
            // ignore
          }
          inCallStartedRef.current = true;
        }
        setCall(current =>
          current.status === 'connected'
            ? current
            : {...current, status: 'connected', connectedAt: Date.now()},
        );
      } else if (state === 'failed' || state === 'closed') {
        teardown(true);
      }
    });

    pcRef.current = pc;
    return pc;
  }, [sendSignal, clearCallTimeout, clearOfferResend, teardown]);

  const attachLocalAudio = useCallback(async (pc: RTCPeerConnection) => {
    const granted = await ensureMicrophonePermission();
    if (!granted) {
      throw new Error('Microphone permission denied');
    }
    const stream = await mediaDevices.getUserMedia({audio: true, video: false});
    localStreamRef.current = stream;
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });
  }, []);

  const startCall = useCallback(
    (username: string, displayName: string) => {
      if (statusRef.current !== 'idle') {
        return;
      }
      const callId = randomCallId();
      callIdRef.current = callId;
      peerRef.current = username;
      remoteReadyRef.current = false;
      setCall({
        status: 'calling',
        callId,
        peerUsername: username,
        peerDisplayName: displayName,
        isCaller: true,
        muted: false,
        speakerOn: false,
        connectedAt: null,
      });

      (async () => {
        try {
          const servers = await resolveIceServers();
          const pc = createPeerConnection(servers);
          await attachLocalAudio(pc);
          const offer = await pc.createOffer({});
          await pc.setLocalDescription(offer);
          offerSdpRef.current = offer.sdp ?? null;
          sendSignal('OFFER', {
            sdp: offer.sdp,
            callerDisplayName: selfNameRef.current,
          });
        } catch {
          teardown(true);
          return;
        }
        // Wake the callee's devices (best-effort) and keep re-offering while ringing.
        onRingRef.current?.(callId, username, selfNameRef.current);
        startOfferResend();
        clearCallTimeout();
        timeoutRef.current = setTimeout(() => {
          if (statusRef.current === 'calling') {
            sendSignal('CANCEL');
            teardown(true);
          }
        }, CALL_TIMEOUT_MS);
      })();
    },
    [
      createPeerConnection,
      attachLocalAudio,
      sendSignal,
      teardown,
      clearCallTimeout,
      startOfferResend,
      resolveIceServers,
    ],
  );

  const acceptCall = useCallback(() => {
    if (statusRef.current !== 'incoming') {
      return;
    }
    const offerSdp = incomingOfferRef.current;
    if (!offerSdp) {
      return;
    }
    setCall(current => ({...current, status: 'connecting'}));

    (async () => {
      try {
        const servers = await resolveIceServers();
        const pc = createPeerConnection(servers);
        await attachLocalAudio(pc);
        await pc.setRemoteDescription(
          new RTCSessionDescription({type: 'offer', sdp: offerSdp}),
        );
        remoteReadyRef.current = true;
        await flushPendingIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('ANSWER', {sdp: answer.sdp});
      } catch {
        sendSignal('END');
        teardown(true);
      }
    })();
  }, [
    createPeerConnection,
    attachLocalAudio,
    flushPendingIce,
    sendSignal,
    teardown,
    resolveIceServers,
  ]);

  const decline = useCallback(() => {
    if (statusRef.current === 'incoming') {
      sendSignal('DECLINE');
    } else {
      sendSignal('CANCEL');
    }
    teardown(false);
  }, [sendSignal, teardown]);

  const hangUp = useCallback(() => {
    sendSignal('END');
    teardown(true);
  }, [sendSignal, teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    setCall(current => {
      const nextMuted = !current.muted;
      stream.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
      return {...current, muted: nextMuted};
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setCall(current => {
      const nextSpeaker = !current.speakerOn;
      try {
        InCallManager.setForceSpeakerphoneOn(nextSpeaker);
      } catch {
        // ignore
      }
      return {...current, speakerOn: nextSpeaker};
    });
  }, []);

  const handleSignal = useCallback(
    (event: CallSignalEvent) => {
      const type = event.type as CallSignalType;

      if (type === 'OFFER') {
        // A resend of the call we are already handling: refresh the stored offer
        // but do not reset the ringing UI or timer.
        if (callIdRef.current === event.callId && statusRef.current !== 'idle') {
          if (statusRef.current === 'incoming' && event.sdp) {
            incomingOfferRef.current = event.sdp;
          }
          return;
        }
        // Busy with a different call: tell the new caller.
        if (statusRef.current !== 'idle') {
          sendCallSignal({
            callId: event.callId,
            targetUsername: event.fromUsername,
            type: 'BUSY',
            sdp: null,
            candidate: null,
            callerDisplayName: null,
          });
          return;
        }
        callIdRef.current = event.callId;
        peerRef.current = event.fromUsername;
        incomingOfferRef.current = event.sdp ?? null;
        remoteReadyRef.current = false;
        pendingIceRef.current = [];
        setCall({
          status: 'incoming',
          callId: event.callId,
          peerUsername: event.fromUsername,
          peerDisplayName: event.callerDisplayName ?? event.fromUsername,
          isCaller: false,
          muted: false,
          speakerOn: false,
          connectedAt: null,
        });
        clearCallTimeout();
        timeoutRef.current = setTimeout(() => {
          if (statusRef.current === 'incoming') {
            sendSignal('DECLINE');
            teardown(true);
          }
        }, CALL_TIMEOUT_MS);
        return;
      }

      // Every other signal must match the active call.
      if (!event.callId || event.callId !== callIdRef.current) {
        return;
      }

      switch (type) {
        case 'ANSWER': {
          const pc = pcRef.current;
          if (!pc || !event.sdp) {
            return;
          }
          setCall(current =>
            current.status === 'calling' ? {...current, status: 'connecting'} : current,
          );
          (async () => {
            try {
              await pc.setRemoteDescription(
                new RTCSessionDescription({type: 'answer', sdp: event.sdp ?? ''}),
              );
              remoteReadyRef.current = true;
              await flushPendingIce();
            } catch {
              teardown(true);
            }
          })();
          return;
        }
        case 'ICE': {
          if (!event.candidate) {
            return;
          }
          let candidate: RTCIceCandidate;
          try {
            candidate = new RTCIceCandidate(JSON.parse(event.candidate));
          } catch {
            return;
          }
          const pc = pcRef.current;
          if (pc && remoteReadyRef.current) {
            pc.addIceCandidate(candidate).catch(() => undefined);
          } else {
            pendingIceRef.current.push(candidate);
          }
          return;
        }
        case 'END':
        case 'CANCEL':
        case 'DECLINE':
        case 'BUSY': {
          teardown(true);
          return;
        }
        default:
          return;
      }
    },
    [sendSignal, flushPendingIce, teardown, clearCallTimeout],
  );

  useEffect(() => {
    return () => {
      clearCallTimeout();
      clearOfferResend();
      if (inCallStartedRef.current) {
        try {
          InCallManager.stop();
        } catch {
          // ignore
        }
        inCallStartedRef.current = false;
      }
      try {
        pcRef.current?.close();
      } catch {
        // ignore
      }
      localStreamRef.current?.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    };
  }, [clearCallTimeout, clearOfferResend]);

  return {
    call,
    startCall,
    acceptCall,
    decline,
    hangUp,
    toggleMute,
    toggleSpeaker,
    handleSignal,
  };
}
