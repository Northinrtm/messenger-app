import {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {androidTheme} from '../../theme';
import {useI18n} from '../../i18n/I18nProvider';
import type {CallState} from './useWebRtcCall';

type CallOverlayProps = {
  call: CallState;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  suppressIncoming?: boolean;
};

function formatDuration(connectedAt: number | null, now: number): string {
  if (!connectedAt) {
    return '0:00';
  }
  const totalSeconds = Math.max(0, Math.floor((now - connectedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function CallOverlay({
  call,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  onToggleSpeaker,
  suppressIncoming = false,
}: CallOverlayProps) {
  const {t} = useI18n();
  const [now, setNow] = useState(() => Date.now());

  // When the native ConnectionService UI handles the incoming call, the in-app
  // overlay stays hidden until the call is answered (status leaves 'incoming').
  const visible =
    call.status !== 'idle' &&
    !(call.status === 'incoming' && suppressIncoming);
  const isConnected = call.status === 'connected';

  // Tick the in-call timer once per second.
  useEffect(() => {
    if (!isConnected) {
      return;
    }
    setNow(Date.now());
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [isConnected]);

  if (!visible) {
    return null;
  }

  const name = call.peerDisplayName ?? call.peerUsername ?? '';

  let statusLabel: string;
  switch (call.status) {
    case 'calling':
      statusLabel = t('call.calling');
      break;
    case 'incoming':
      statusLabel = t('call.incoming');
      break;
    case 'connecting':
      statusLabel = t('call.connecting');
      break;
    case 'connected':
      statusLabel = formatDuration(call.connectedAt, now);
      break;
    default:
      statusLabel = t('call.ended');
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.glyph}>📞</Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.status}>{statusLabel}</Text>

          {call.status === 'incoming' ? (
            <View style={styles.actions}>
              <Pressable style={styles.decline} onPress={onDecline}>
                <Text style={styles.declineLabel}>{t('call.decline')}</Text>
              </Pressable>
              <Pressable style={styles.accept} onPress={onAccept}>
                <Text style={styles.acceptLabel}>{t('call.accept')}</Text>
              </Pressable>
            </View>
          ) : call.status === 'connected' ? (
            <View style={styles.connectedActions}>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.secondary, call.muted && styles.secondaryActive]}
                  onPress={onToggleMute}>
                  <Text style={styles.secondaryLabel}>
                    {call.muted ? t('call.unmute') : t('call.mute')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondary, call.speakerOn && styles.secondaryActive]}
                  onPress={onToggleSpeaker}>
                  <Text style={styles.secondaryLabel}>{t('call.speaker')}</Text>
                </Pressable>
              </View>
              <Pressable style={styles.decline} onPress={onHangUp}>
                <Text style={styles.declineLabel}>{t('call.hangUp')}</Text>
              </Pressable>
            </View>
          ) : call.status === 'ended' ? null : (
            <View style={styles.actions}>
              <Pressable style={styles.decline} onPress={onDecline}>
                <Text style={styles.declineLabel}>{t('call.cancel')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 12, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 34,
    paddingHorizontal: 26,
    borderRadius: 28,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    ...androidTheme.shadow,
  },
  glyph: {
    fontSize: 40,
    marginBottom: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  status: {
    fontSize: 15,
    color: androidTheme.colors.textSecondary,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
  },
  connectedActions: {
    alignSelf: 'stretch',
    gap: 12,
  },
  decline: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 92, 92, 0.16)',
  },
  declineLabel: {
    color: '#ff8f8f',
    fontSize: 15,
    fontWeight: '800',
  },
  accept: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3ecf8e',
  },
  acceptLabel: {
    color: '#06210f',
    fontSize: 15,
    fontWeight: '800',
  },
  secondary: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryActive: {
    backgroundColor: 'rgba(120, 180, 255, 0.22)',
  },
  secondaryLabel: {
    color: androidTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
