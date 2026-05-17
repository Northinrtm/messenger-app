import type {AuthResponse, VideoConference} from '@north/shared';
import {useEffect, useMemo, useState} from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {API_URL, JITSI_BASE_URL} from '../../config';

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    'start' | 'join' | 'leave' | 'cancel' | 'end' | 'invite' | 'share' | null
  >(null);
  const [presenceMarked, setPresenceMarked] = useState(
    conference.activeParticipantUserIds.includes(session.user.id),
  );
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

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
        ? buildConferenceJoinUrl(JITSI_BASE_URL, conference.roomName)
        : null,
    [conference.roomName],
  );
  const statusLabel = formatConferenceStatusLabel(conference);
  const stageHint = formatConferenceStageHint(conference, isOrganizer);

  useEffect(() => {
    setPresenceMarked(
      conference.activeParticipantUserIds.includes(session.user.id),
    );
  }, [conference.activeParticipantUserIds, session.user.id]);

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

  const handleJoinExternally = async () => {
    if (!joinUrl) {
      return;
    }

    return runAction('join', async () => {
      if (!presenceMarked) {
        await onTouchConferencePresence(conference.id);
        setPresenceMarked(true);
      }

      await Linking.openURL(joinUrl);
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerButton}>
          <Text style={styles.headerButtonLabel}>Back</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Conference</Text>
          <Text style={styles.headerTitle}>{conference.title}</Text>
          <Text style={styles.headerSubtitle}>{statusLabel}</Text>
        </View>
      </View>

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <MetaRow
          label="Organizer"
          value={formatOrganizerLabel(conference, session)}
        />
        <MetaRow label="Role" value={isOrganizer ? 'Organizer' : 'Participant'} />
        <MetaRow
          label="Scheduled"
          value={formatConferenceSchedule(conference.scheduledAt)}
        />
        <MetaRow
          label="Participants"
          value={formatParticipantCount(conference.participants.length)}
        />
        <MetaRow
          label="Room"
          value={
            conference.roomName
              ? 'Available to invited participants'
              : 'Not open yet'
          }
        />
        <Text style={styles.helper}>{stageHint}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Actions</Text>
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
                {pendingAction === 'start' ? 'Starting...' : 'Start conference'}
              </Text>
            </Pressable>
          ) : null}

          {canJoin && joinUrl ? (
            <Pressable
              onPress={() => {
                handleJoinExternally().catch(() => undefined);
              }}
              disabled={pendingAction !== null}
              style={
                pendingAction ? styles.actionDisabled : styles.actionPrimary
              }
              testID="conference-join-button">
              <Text style={styles.actionPrimaryLabel}>
                {pendingAction === 'join' ? 'Opening...' : 'Open in browser'}
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
                {pendingAction === 'leave' ? 'Clearing...' : 'Mark left'}
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
              <Text style={styles.actionMutedLabel}>Open group chat</Text>
            </Pressable>
          ) : null}

          {canShareInviteLink ? (
            <View style={styles.invitePanel}>
              <Text style={styles.inviteTitle}>Invite link</Text>
              <Text style={styles.helper}>
                Share a short link that opens this conference for invited
                participants.
              </Text>
              {inviteUrl ? (
                <Text selectable style={styles.inviteValue}>
                  {inviteUrl}
                </Text>
              ) : (
                <Text style={styles.invitePlaceholder}>
                  Invite link has not been generated yet.
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
                      ? 'Generating...'
                      : inviteUrl
                        ? 'Refresh link'
                        : 'Generate link'}
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
                    {pendingAction === 'share' ? 'Sharing...' : 'Share link'}
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
                  ? 'Cancelling...'
                  : 'Cancel schedule'}
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
                {pendingAction === 'end' ? 'Ending...' : 'End for everyone'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Participants</Text>
        <View style={styles.participantList}>
          {conference.participants.map(participant => (
            <View key={participant.id} style={styles.participantPill}>
              <Text style={styles.participantName}>
                {participant.displayName}
                {participant.id === conference.createdBy.id ? ' (org.)' : ''}
              </Text>
              <Text style={styles.participantMeta}>
                @{participant.username}
                {participant.online ? ' | online' : ''}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {conference.recordingCreatedAt ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recording</Text>
          <MetaRow
            label="Created"
            value={formatConferenceSchedule(conference.recordingCreatedAt)}
          />
          <MetaRow
            label="Size"
            value={
              conference.recordingSizeBytes != null
                ? formatFileSize(conference.recordingSizeBytes)
                : 'Unknown'
            }
          />
          <MetaRow
            label="Type"
            value={conference.recordingMimeType ?? 'Unknown'}
          />
          <Text style={styles.helper}>
            Recording download is not wired on Android yet.
          </Text>
        </View>
      ) : null}
    </ScrollView>
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

function buildConferenceJoinUrl(baseUrl: string, roomName: string) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(encodeURIComponent(roomName), normalizedBaseUrl).toString();
}

function buildInviteUrl(code: string) {
  return new URL(`/j/${encodeURIComponent(code)}`, API_URL).toString();
}

function formatOrganizerLabel(
  conference: VideoConference,
  session: AuthResponse,
) {
  return conference.createdBy.id === session.user.id
    ? `${conference.createdBy.displayName} (you)`
    : conference.createdBy.displayName;
}

function formatParticipantCount(count: number) {
  return count === 1 ? '1 participant' : `${count} participants`;
}

function formatConferenceStatusLabel(conference: VideoConference) {
  if (conference.endedAt) {
    return `Ended ${formatConferenceSchedule(conference.endedAt)}`;
  }

  if (conference.startedAt) {
    return conference.activeParticipantCount > 0
      ? `Live now | ${conference.activeParticipantCount} on stage`
      : 'Live now';
  }

  if (conference.roomName || conference.activatedAt) {
    return 'Room is open for invited participants';
  }

  return `Opens ${formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString(),
  )}`;
}

function formatConferenceStageHint(
  conference: VideoConference,
  isOrganizer: boolean,
) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `Conference ended ${formatConferenceSchedule(conference.endedAt)}.`;
  }

  if (conference.startedAt) {
    return 'Conference is already running.';
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return 'Room is already open for invited participants.';
    }

    return isOrganizer
      ? `Room is prepared. Participants can join automatically at ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`
      : `Join will open automatically at ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`;
  }

  return `Room becomes available 5 minutes before start: ${formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString(),
  )}.`;
}

function getConferenceActivationTime(value: string) {
  return new Date(new Date(value).getTime() - 5 * 60 * 1000);
}

function formatConferenceSchedule(value: string) {
  return new Date(value).toLocaleString(undefined, {
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

  return 'Unexpected error';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f3efe7',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    backgroundColor: '#fffaf1',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 18,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  headerButton: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe4d3',
    paddingHorizontal: 14,
  },
  headerButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b4b3c',
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
    color: '#8a5a2b',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f1a14',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6f6256',
  },
  error: {
    color: '#8b221c',
    backgroundColor: '#f8dfdb',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fffaf1',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f1a14',
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6f6256',
  },
  metaRow: {
    gap: 3,
  },
  metaLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#8d7b67',
  },
  metaValue: {
    fontSize: 15,
    color: '#2d251d',
  },
  actionStack: {
    gap: 10,
  },
  invitePanel: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
    backgroundColor: '#f5ecde',
  },
  inviteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1f1a14',
  },
  inviteValue: {
    fontSize: 13,
    lineHeight: 18,
    color: '#2d251d',
  },
  invitePlaceholder: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8d7b67',
  },
  inviteActions: {
    gap: 10,
  },
  actionPrimary: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c5c53',
    paddingHorizontal: 14,
  },
  actionMuted: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe4d3',
    paddingHorizontal: 14,
  },
  actionDanger: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8dfdb',
    paddingHorizontal: 14,
  },
  actionDisabled: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d8d0c4',
    paddingHorizontal: 14,
  },
  actionPrimaryLabel: {
    color: '#fffaf1',
    fontSize: 15,
    fontWeight: '800',
  },
  actionMutedLabel: {
    color: '#5b4b3c',
    fontSize: 15,
    fontWeight: '800',
  },
  actionDangerLabel: {
    color: '#8b221c',
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
    backgroundColor: '#efe4d3',
    gap: 2,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f1a14',
  },
  participantMeta: {
    fontSize: 12,
    color: '#6f6256',
  },
});
