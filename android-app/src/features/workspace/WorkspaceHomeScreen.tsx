import type {
  AuthResponse,
  ChatDraft,
  ChatSummary,
  PendingOutgoingMessage,
  UserProfile,
  VideoConference,
  WorkspaceBootstrap,
} from '@north/shared';
import {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {API_URL, APP_CONFIG_NOTE} from '../../config';

type WorkspaceTab = 'chats' | 'contacts' | 'conferences' | 'profile';

type Props = {
  session: AuthResponse;
  workspace: WorkspaceBootstrap;
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenChat: (chatId: string) => void;
};

export function WorkspaceHomeScreen({
  session,
  workspace,
  loading,
  error,
  onReload,
  onLogout,
  onOpenChat,
}: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chats');
  const archivedChatIds = new Set(workspace.archivedChatIds);
  const draftsByChatId = new Map(workspace.drafts.map(draft => [draft.chatId, draft]));
  const pendingByChatId = buildPendingOutgoingCounts(workspace.pendingOutgoingMessages);
  const activeChats = workspace.chats.filter(chat => !archivedChatIds.has(chat.id));
  const archivedChats = workspace.chats.filter(chat => archivedChatIds.has(chat.id));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>Android workspace</Text>
          <Text style={styles.title}>{session.user.displayName}</Text>
          <Text style={styles.copy}>
            Sprint 1 now has a real workspace shell, and chat threads open on the
            mobile client without going through browser cookies.
          </Text>
        </View>
        <View style={styles.heroActions}>
          <Pressable
            onPress={onReload}
            disabled={loading}
            style={loading ? styles.actionDisabled : styles.actionPrimary}>
            <Text style={styles.actionPrimaryLabel}>
              {loading ? 'Refreshing...' : 'Refresh workspace'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onLogout}
            style={styles.actionGhost}>
            <Text style={styles.actionGhostLabel}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Chats" value={String(activeChats.length)} />
        <SummaryCard label="Archived" value={String(archivedChats.length)} />
        <SummaryCard label="Contacts" value={String(workspace.contacts.length)} />
        <SummaryCard
          label="Conferences"
          value={String(workspace.conferences.length)}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.tabRow}>
        <TabButton
          label="Chats"
          active={activeTab === 'chats'}
          onPress={() => setActiveTab('chats')}
        />
        <TabButton
          label="Contacts"
          active={activeTab === 'contacts'}
          onPress={() => setActiveTab('contacts')}
        />
        <TabButton
          label="Conferences"
          active={activeTab === 'conferences'}
          onPress={() => setActiveTab('conferences')}
        />
        <TabButton
          label="Profile"
          active={activeTab === 'profile'}
          onPress={() => setActiveTab('profile')}
        />
      </View>

      {activeTab === 'chats' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Chats"
            subtitle="Unread, drafts, and pending outgoing state come from the workspace bootstrap."
          />
          {activeChats.length === 0 ? (
            <EmptyState label="No active chats yet." />
          ) : (
            activeChats.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                draft={draftsByChatId.get(chat.id) ?? null}
                pendingCount={pendingByChatId.get(chat.id) ?? 0}
                archived={false}
                onPress={() => onOpenChat(chat.id)}
              />
            ))
          )}

          <SectionHeader
            title="Archived chats"
            subtitle="Archive state already comes from backend workspace data."
          />
          {archivedChats.length === 0 ? (
            <EmptyState label="No archived chats." />
          ) : (
            archivedChats.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                draft={draftsByChatId.get(chat.id) ?? null}
                pendingCount={pendingByChatId.get(chat.id) ?? 0}
                archived
                onPress={() => onOpenChat(chat.id)}
              />
            ))
          )}
        </View>
      ) : null}

      {activeTab === 'contacts' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Contacts"
            subtitle="Read-only contact list for the current workspace snapshot."
          />
          {workspace.contacts.length === 0 ? (
            <EmptyState label="No contacts yet." />
          ) : (
            workspace.contacts.map(profile => (
              <ProfileRow key={profile.id} profile={profile} />
            ))
          )}
        </View>
      ) : null}

      {activeTab === 'conferences' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Conferences"
            subtitle="Conference list is visible now; in-app Jitsi join stays for the later call sprint."
          />
          {workspace.conferences.length === 0 ? (
            <EmptyState label="No conferences yet." />
          ) : (
            workspace.conferences.map(conference => (
              <ConferenceRow key={conference.id} conference={conference} />
            ))
          )}
        </View>
      ) : null}

      {activeTab === 'profile' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Profile"
            subtitle="Session and account state are coming from the dedicated mobile auth contract."
          />
          <View style={styles.card}>
            <MetaRow label="Username" value={`@${session.user.username}`} />
            <MetaRow label="Email" value={session.user.email ?? 'hidden'} />
            <MetaRow
              label="Verification"
              value={session.user.emailVerified ? 'verified' : 'not verified'}
            />
            <MetaRow label="Session" value={session.sessionId.slice(0, 8)} />
            <MetaRow label="API" value={API_URL} />
            <MetaRow
              label="Mailboxes"
              value={String(workspace.mailboxes.length)}
            />
            <MetaRow
              label="Pending outgoing"
              value={String(workspace.pendingOutgoingMessages.length)}
            />
            <Text style={styles.metaNote}>{APP_CONFIG_NOTE}</Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function buildPendingOutgoingCounts(messages: PendingOutgoingMessage[]) {
  const counts = new Map<string, number>();
  messages.forEach(message => {
    counts.set(message.chatId, (counts.get(message.chatId) ?? 0) + 1);
  });
  return counts;
}

type SummaryCardProps = {
  label: string;
  value: string;
};

function SummaryCard({label, value}: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

type TabButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function TabButton({label, active, onPress}: TabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={active ? styles.tabButtonActive : styles.tabButton}>
      <Text style={active ? styles.tabButtonLabelActive : styles.tabButtonLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

type SectionHeaderProps = {
  title: string;
  subtitle: string;
};

function SectionHeader({title, subtitle}: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

type ChatRowProps = {
  chat: ChatSummary;
  draft: ChatDraft | null;
  pendingCount: number;
  archived: boolean;
  onPress: () => void;
};

function ChatRow({chat, draft, pendingCount, archived, onPress}: ChatRowProps) {
  const metadata = [
    chat.direct ? 'Direct' : 'Group',
    chat.unreadCount > 0 ? `Unread ${chat.unreadCount}` : null,
    draft ? 'Draft' : null,
    pendingCount > 0 ? `Pending ${pendingCount}` : null,
    archived ? 'Archived' : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.rowHeader}>
        <Text style={styles.cardTitle}>{chat.title}</Text>
        <Text style={styles.rowChevron}>Open</Text>
      </View>
      <Text style={styles.cardMeta}>{metadata || 'No chat activity yet'}</Text>
      <Text style={styles.cardSnippet}>{chat.lastMessage ?? 'No messages yet'}</Text>
      {draft ? (
        <Text style={styles.cardHint}>Draft: {draft.content || 'empty draft'}</Text>
      ) : null}
    </Pressable>
  );
}

type ProfileRowProps = {
  profile: UserProfile;
};

function ProfileRow({profile}: ProfileRowProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{profile.displayName}</Text>
      <Text style={styles.cardMeta}>
        @{profile.username} | {profile.online ? 'online' : 'offline'}
      </Text>
      <Text style={styles.cardSnippet}>
        {profile.profession?.trim() || 'No profession set'}
      </Text>
    </View>
  );
}

type ConferenceRowProps = {
  conference: VideoConference;
};

function ConferenceRow({conference}: ConferenceRowProps) {
  const state = conference.startedAt
    ? 'Live now'
    : conference.roomName
      ? 'Joinable'
      : 'Scheduled';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{conference.title}</Text>
      <Text style={styles.cardMeta}>
        {conference.participants.length} participants | {state}
      </Text>
      <Text style={styles.cardSnippet}>
        {conference.chatId ? 'Bound to a group chat' : 'Standalone conference'}
      </Text>
    </View>
  );
}

type MetaRowProps = {
  label: string;
  value: string;
};

function MetaRow({label, value}: MetaRowProps) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

type EmptyStateProps = {
  label: string;
};

function EmptyState({label}: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f3efe7',
  },
  content: {
    padding: 20,
    gap: 18,
  },
  hero: {
    backgroundColor: '#fffaf1',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 20,
    gap: 18,
  },
  heroCopy: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#8a5a2b',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#1f1a14',
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4f463c',
  },
  heroActions: {
    gap: 12,
  },
  actionPrimary: {
    minHeight: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c5c53',
    paddingHorizontal: 18,
  },
  actionDisabled: {
    minHeight: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9aa8a3',
    paddingHorizontal: 18,
  },
  actionGhost: {
    minHeight: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe4d3',
    paddingHorizontal: 18,
  },
  actionPrimaryLabel: {
    color: '#fffaf1',
    fontWeight: '800',
    fontSize: 15,
  },
  actionGhostLabel: {
    color: '#5b4b3c',
    fontWeight: '800',
    fontSize: 15,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: '#1f5149',
    borderRadius: 22,
    padding: 16,
    gap: 4,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fffaf1',
  },
  summaryLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#c6ddd8',
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
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tabButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#efe4d3',
  },
  tabButtonActive: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2c5c53',
  },
  tabButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b4b3c',
  },
  tabButtonLabelActive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fffaf1',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f1a14',
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6f6256',
  },
  card: {
    backgroundColor: '#fffaf1',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 16,
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowChevron: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c5c53',
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1f1a14',
  },
  cardMeta: {
    fontSize: 13,
    color: '#6a5d50',
  },
  cardSnippet: {
    fontSize: 14,
    lineHeight: 20,
    color: '#40372f',
  },
  cardHint: {
    fontSize: 13,
    color: '#8a5a2b',
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
  metaNote: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#6f6256',
  },
  emptyState: {
    backgroundColor: '#efe4d3',
    borderRadius: 18,
    padding: 16,
  },
  emptyLabel: {
    color: '#6a5d50',
    fontSize: 14,
  },
});
