import type {AuthResponse, VideoConference} from '@north/shared';
import {useEffect, useMemo, useState} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {API_URL, JITSI_BASE_URL} from '../../config';
import {androidTheme} from '../../theme';
import {useI18n} from '../../i18n/I18nProvider';
import {getActiveLocale, tActive, tpActive} from '../../i18n';

type Props = {
  session: AuthResponse;
  conference: VideoConference;
  onBack: () => void;
  onOpenChat: (chatId: string) => void;
  onStartConference: (conferenceId: string) => Promise<VideoConference>;
  onEndConference: (conferenceId: string) => Promise<VideoConference>;
  onCancelConference: (conferenceId: string) => Promise<void>;
  onCreateConferenceInviteLink: (
    conferenceId: string,
    options?: {refresh?: boolean},
  ) => Promise<{code: string}>;
  onTouchConferencePresence: (conferenceId: string) => Promise<void>;
  onClearConferencePresence: (conferenceId: string) => Promise<void>;
};

export function ConferenceDetailScreen({
  session,
  conference,
  onBack,
  onOpenChat,
  onStartConference,
  onEndConference,
  onCancelConference,
  onCreateConferenceInviteLink,
  onTouchConferencePresence,
  onClearConferencePresence,
}: Props) {
  const {t} = useI18n();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    'start' | 'join' | 'leave' | 'cancel' | 'end' | 'invite' | 'share' | null
  >(null);
  const [presenceMarked, setPresenceMarked] = useState(
    conference.activeParticipantUserIds.includes(session.user.id),
  );
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [jitsiOpen, setJitsiOpen] = useState(false);

  const isOrganizer = conference.createdBy.id === session.user.id;
  const canJoin = Boolean(
    conference.roomName && conference.activatedAt && !conference.endedAt,
  );
  const canStart = Boolean(
    isOrganizer && !conference.startedAt && !conference.endedAt,
  );
  const canEnd = Boolean(
    isOrganizer && conference.startedAt && !conference.endedAt,
  );
  const canCancel = Boolean(
    isOrganizer && !conference.startedAt && !conference.endedAt,
  );
  const canShareInviteLink = Boolean(
    isOrganizer && !conference.chatId && !conference.endedAt,
  );
  const joinUrl = useMemo(
    () =>
      conference.roomName
        ? buildConferenceJoinUrl(
            JITSI_BASE_URL,
            conference.roomName,
            session.user.displayName,
          )
        : null,
    [conference.roomName, session.user.displayName],
  );
  const statusLabel = formatConferenceStatusLabel(conference);
  const stageHint = formatConferenceStageHint(conference, isOrganizer);

  useEffect(() => {
    setPresenceMarked(
      conference.activeParticipantUserIds.includes(session.user.id),
    );
  }, [conference.activeParticipantUserIds, session.user.id]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const runAction = async <T,>(
    action: NonNullable<typeof pendingAction>,
    operation: () => Promise<T>,
  ) => {
    setPendingAction(action);
    setActionError(null);
    try {
      return await operation();
    } catch (error) {
      setActionError(toErrorText(error));
      return null;
    } finally {
      setPendingAction(currentAction =>
        currentAction === action ? null : currentAction,
      );
    }
  };

  const handleJoinInApp = async () => {
    if (!joinUrl) {
      return;
    }

    return runAction('join', async () => {
      if (!presenceMarked) {
        await onTouchConferencePresence(conference.id);
        setPresenceMarked(true);
      }
      setJitsiOpen(true);
      return true;
    });
  };

  const handleClearPresence = async () => {
    if (!presenceMarked) {
      return;
    }

    await runAction('leave', async () => {
      await onClearConferencePresence(conference.id);
      setPresenceMarked(false);
      return true;
    });
  };

  const handleGenerateInviteLink = async (refresh = false) => {
    await runAction('invite', async () => {
      const inviteLink = await onCreateConferenceInviteLink(conference.id, {
        refresh,
      });
      setInviteUrl(buildInviteUrl(inviteLink.code));
      return inviteLink;
    });
  };

  const handleShareInviteLink = async () => {
    if (!inviteUrl) {
      return;
    }

    await runAction('share', async () => {
      await Share.share({
        title: conference.title,
        message: inviteUrl,
        url: inviteUrl,
      });
      return true;
    });
  };

  return (
    <>
    <KeyboardAvoidingView
      behavior={Platform.select({ios: 'padding', android: 'height'})}
      style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerButton}>
          <Text style={styles.headerButtonLabel}>{t('common.back')}</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>{t('cd.eyebrow')}</Text>
          <Text style={styles.headerTitle}>{conference.title}</Text>
          <Text style={styles.headerSubtitle}>{statusLabel}</Text>
        </View>
      </View>

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('cd.overview')}</Text>
        <MetaRow
          label={t('cd.organizer')}
          value={formatOrganizerLabel(conference, session)}
        />
        <MetaRow label={t('cd.role')} value={isOrganizer ? t('cd.organizer') : t('cd.participant')} />
        <MetaRow
          label={t('cd.scheduled')}
          value={formatConferenceSchedule(conference.scheduledAt)}
        />
        <MetaRow
          label={t('cd.participants')}
          value={formatParticipantCount(conference.participants.length)}
        />
        <MetaRow
          label={t('cd.room')}
          value={
            conference.roomName
              ? t('cd.roomAvailable')
              : t('cd.roomNotOpen')
          }
        />
        <Text style={styles.helper}>{stageHint}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('cd.actions')}</Text>
        <View style={styles.actionStack}>
          {canStart ? (
            <Pressable
              onPress={() => {
                runAction('start', () =>
                  onStartConference(conference.id),
                ).catch(() => undefined);
              }}
              disabled={pendingAction !== null}
              style={
                pendingAction ? styles.actionDisabled : styles.actionPrimary
              }
              testID="conference-start-button">
              <Text style={styles.actionPrimaryLabel}>
                {pendingAction === 'start' ? t('cd.starting') : t('cd.startConference')}
              </Text>
            </Pressable>
          ) : null}

          {canJoin && joinUrl ? (
            <Pressable
              onPress={() => {
                handleJoinInApp().catch(() => undefined);
              }}
              disabled={pendingAction !== null}
              style={
                pendingAction ? styles.actionDisabled : styles.actionPrimary
              }
              testID="conference-join-button">
              <Text style={styles.actionPrimaryLabel}>
                {pendingAction === 'join' ? t('cd.opening') : t('cd.open')}
              </Text>
            </Pressable>
          ) : null}

          {presenceMarked ? (
            <Pressable
              onPress={() => {
                handleClearPresence().catch(() => undefined);
              }}
              disabled={pendingAction !== null}
              style={pendingAction ? styles.actionDisabled : styles.actionMuted}
              testID="conference-leave-button">
              <Text style={styles.actionMutedLabel}>
                {pendingAction === 'leave' ? t('cd.clearing') : t('cd.markLeft')}
              </Text>
            </Pressable>
          ) : null}

          {conference.chatId ? (
            <Pressable
              onPress={() => {
                onOpenChat(conference.chatId!);
              }}
              style={styles.actionMuted}
              testID="conference-open-chat-button">
              <Text style={styles.actionMutedLabel}>{t('cd.openGroupChat')}</Text>
            </Pressable>
          ) : null}

          {canShareInviteLink ? (
            <View style={styles.invitePanel}>
              <Text style={styles.inviteTitle}>{t('cd.inviteLink')}</Text>
              <Text style={styles.helper}>{t('cd.inviteDesc')}</Text>
              {inviteUrl ? (
                <Text selectable style={styles.inviteValue}>
                  {inviteUrl}
                </Text>
              ) : (
                <Text style={styles.invitePlaceholder}>
                  {t('cd.inviteNotGenerated')}
                </Text>
              )}
              <View style={styles.inviteActions}>
                <Pressable
                  onPress={() => {
                    handleGenerateInviteLink(Boolean(inviteUrl)).catch(
                      () => undefined,
                    );
                  }}
                  disabled={pendingAction !== null}
                  style={
                    pendingAction !== null
                      ? styles.actionDisabled
                      : styles.actionMuted
                  }
                  testID="conference-generate-invite-button">
                  <Text style={styles.actionMutedLabel}>
                    {pendingAction === 'invite'
                      ? t('cd.generating')
                      : inviteUrl
                        ? t('cd.refreshLink')
                        : t('cd.generateLink')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    handleShareInviteLink().catch(() => undefined);
                  }}
                  disabled={pendingAction !== null || !inviteUrl}
                  style={
                    pendingAction !== null || !inviteUrl
                      ? styles.actionDisabled
                      : styles.actionPrimary
                  }
                  testID="conference-share-invite-button">
                  <Text style={styles.actionPrimaryLabel}>
                    {pendingAction === 'share' ? t('cd.sharing') : t('cd.shareLink')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {canCancel ? (
            <Pressable
              onPress={() => {
                runAction('cancel', () =>
                  onCancelConference(conference.id),
                ).catch(() => undefined);
              }}
              disabled={pendingAction !== null}
              style={pendingAction ? styles.actionDisabled : styles.actionDanger}
              testID="conference-cancel-button">
              <Text style={styles.actionDangerLabel}>
                {pendingAction === 'cancel'
                  ? t('cd.cancelling')
                  : t('cd.cancelSchedule')}
              </Text>
            </Pressable>
          ) : null}

          {canEnd ? (
            <Pressable
              onPress={() => {
                runAction('end', () =>
                  onEndConference(conference.id),
                ).catch(() => undefined);
              }}
              disabled={pendingAction !== null}
              style={pendingAction ? styles.actionDisabled : styles.actionDanger}
              testID="conference-end-button">
              <Text style={styles.actionDangerLabel}>
                {pendingAction === 'end' ? t('cd.ending') : t('cd.endForEveryone')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('cd.participants')}</Text>
        <View style={styles.participantList}>
          {conference.participants.map(participant => (
            <View key={participant.id} style={styles.participantPill}>
              <Text style={styles.participantName}>
                {participant.displayName}
                {participant.id === conference.createdBy.id ? t('cd.orgSuffix') : ''}
              </Text>
              <Text style={styles.participantMeta}>
                @{participant.username}
                {participant.online ? t('cd.onlineSuffix') : ''}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {conference.recordingCreatedAt ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('cd.recording')}</Text>
          <MetaRow
            label={t('cd.created')}
            value={formatConferenceSchedule(conference.recordingCreatedAt)}
          />
          <MetaRow
            label={t('cd.size')}
            value={
              conference.recordingSizeBytes != null
                ? formatFileSize(conference.recordingSizeBytes)
                : t('cd.unknown')
            }
          />
          <MetaRow
            label={t('cd.type')}
            value={conference.recordingMimeType ?? t('cd.unknown')}
          />
          <Text style={styles.helper}>
            {t('cd.recordingNotWired')}
          </Text>
        </View>
      ) : null}
      </ScrollView>
    </KeyboardAvoidingView>

    {joinUrl ? (
      <Modal
        visible={jitsiOpen}
        animationType="slide"
        onRequestClose={() => setJitsiOpen(false)}
        statusBarTranslucent>
        <SafeAreaView style={styles.jitsiContainer}>
          <StatusBar backgroundColor="#000" barStyle="light-content" />
          <View style={styles.jitsiHeader}>
            <Pressable
              onPress={() => setJitsiOpen(false)}
              style={styles.jitsiCloseButton}>
              <Text style={styles.jitsiCloseLabel}>{t('cd.jitsiExit')}</Text>
            </Pressable>
            <Text style={styles.jitsiTitle} numberOfLines={1}>
              {conference.title}
            </Text>
          </View>
          <WebView
            source={{uri: joinUrl}}
            style={styles.jitsiWebView}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
            // Auto-grant camera/mic so the native permission dialog doesn't appear mid-call
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPermissionRequest={(event: any) => event.grant(event.resources)}
            originWhitelist={['*']}
          />
        </SafeAreaView>
      </Modal>
    ) : null}
    </>
  );
}

function MetaRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function buildConferenceJoinUrl(
  baseUrl: string,
  roomName: string,
  displayName?: string,
) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const base = new URL(encodeURIComponent(roomName), normalizedBaseUrl).toString();
  if (displayName) {
    return `${base}#userInfo.displayName=${encodeURIComponent(displayName)}`;
  }
  return base;
}

function buildInviteUrl(code: string) {
  return new URL(`/j/${encodeURIComponent(code)}`, API_URL).toString();
}

function formatOrganizerLabel(
  conference: VideoConference,
  session: AuthResponse,
) {
  return conference.createdBy.id === session.user.id
    ? tActive('cd.organizerYou', {name: conference.createdBy.displayName})
    : conference.createdBy.displayName;
}

function formatParticipantCount(count: number) {
  return tpActive('cd.participantCount', count);
}

function formatConferenceStatusLabel(conference: VideoConference) {
  if (conference.endedAt) {
    return tActive('cd.statusEndedAt', {time: formatConferenceSchedule(conference.endedAt)});
  }

  if (conference.startedAt) {
    return conference.activeParticipantCount > 0
      ? tActive('cd.statusLiveCount', {count: conference.activeParticipantCount})
      : tActive('cd.statusLive');
  }

  if (conference.roomName || conference.activatedAt) {
    return tActive('cd.statusRoomOpen');
  }

  return tActive('cd.statusOpensAt', {
    time: formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString(),
    ),
  });
}

function formatConferenceStageHint(
  conference: VideoConference,
  isOrganizer: boolean,
) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return tActive('cd.hintEndedAt', {time: formatConferenceSchedule(conference.endedAt)});
  }

  if (conference.startedAt) {
    return tActive('cd.hintRunning');
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return tActive('cd.hintRoomOpen');
    }

    return isOrganizer
      ? tActive('cd.hintRoomPrepared', {
          time: formatConferenceSchedule(conference.scheduledAt),
        })
      : tActive('cd.hintJoinOpens', {
          time: formatConferenceSchedule(conference.scheduledAt),
        });
  }

  return tActive('cd.hintAvailableBefore', {
    time: formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString(),
    ),
  });
}

function getConferenceActivationTime(value: string) {
  return new Date(new Date(value).getTime() - 5 * 60 * 1000);
}

function formatConferenceSchedule(value: string) {
  return new Date(value).toLocaleString(getActiveLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = sizeBytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function toErrorText(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return tActive('common.unexpectedError');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
    backgroundColor: androidTheme.colors.background,
  },
  header: {
    backgroundColor: androidTheme.colors.surface,
    borderRadius: androidTheme.radius.cardLarge,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    padding: 18,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    ...androidTheme.shadow,
  },
  headerButton: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  headerButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: androidTheme.colors.warm,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
  },
  error: {
    color: androidTheme.colors.danger,
    backgroundColor: androidTheme.colors.dangerSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: androidTheme.colors.surface,
    borderRadius: androidTheme.radius.card,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
    color: androidTheme.colors.textSecondary,
  },
  metaRow: {
    gap: 3,
  },
  metaLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: androidTheme.colors.textMuted,
  },
  metaValue: {
    fontSize: 15,
    color: androidTheme.colors.textPrimary,
  },
  actionStack: {
    gap: 10,
  },
  invitePanel: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  inviteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  inviteValue: {
    fontSize: 13,
    lineHeight: 18,
    color: androidTheme.colors.textPrimary,
  },
  invitePlaceholder: {
    fontSize: 13,
    lineHeight: 18,
    color: androidTheme.colors.textMuted,
  },
  inviteActions: {
    gap: 10,
  },
  actionPrimary: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
    paddingHorizontal: 14,
  },
  actionMuted: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  actionDanger: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.dangerSoft,
    paddingHorizontal: 14,
  },
  actionDisabled: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
  },
  actionPrimaryLabel: {
    color: androidTheme.colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  actionMutedLabel: {
    color: androidTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  actionDangerLabel: {
    color: androidTheme.colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  participantList: {
    gap: 10,
  },
  participantPill: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    gap: 2,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  participantMeta: {
    fontSize: 12,
    color: androidTheme.colors.textSecondary,
  },
  jitsiContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  jitsiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
  },
  jitsiCloseButton: {
    minHeight: 40,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  jitsiCloseLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  jitsiTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  jitsiWebView: {
    flex: 1,
    backgroundColor: '#000',
  },
});
