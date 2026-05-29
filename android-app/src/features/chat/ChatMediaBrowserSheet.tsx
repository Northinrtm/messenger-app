import type {ChatAttachmentBrowserItem, ChatAttachmentBrowserKind} from '@north/shared';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {getChatAttachmentBrowserPage, downloadChatAttachment} from '../../lib/api';
import {androidTheme} from '../../theme';
import type {RunAuthorized} from './ChatThreadScreen';
import {Linking} from 'react-native';

const PAGE_SIZE = 40;

type Tab = {kind: ChatAttachmentBrowserKind; label: string};
const TABS: Tab[] = [
  {kind: 'ALL', label: 'Все'},
  {kind: 'PHOTOS', label: 'Фото'},
  {kind: 'DOCUMENTS', label: 'Документы'},
];

type Props = {
  visible: boolean;
  chatId: string;
  runAuthorized: RunAuthorized;
  onClose: () => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPhoto(mimeType: string) {
  return mimeType.startsWith('image/');
}

export function ChatMediaBrowserSheet({visible, chatId, runAuthorized, onClose}: Props) {
  const [activeKind, setActiveKind] = useState<ChatAttachmentBrowserKind>('ALL');
  const [items, setItems] = useState<ChatAttachmentBrowserItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const activeKindRef = useRef(activeKind);
  activeKindRef.current = activeKind;

  const load = useCallback(
    async (kind: ChatAttachmentBrowserKind, cursor?: string | null) => {
      const isFirstPage = !cursor;
      if (isFirstPage) {
        setLoading(true);
        setItems([]);
        setNextCursor(null);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const page = await runAuthorized((token: string) =>
          getChatAttachmentBrowserPage(token, chatId, {kind, cursor, limit: PAGE_SIZE}),
        );
        if (activeKindRef.current !== kind) return;
        setItems(prev => (isFirstPage ? page.items : [...prev, ...page.items]));
        setNextCursor(page.nextCursor);
      } catch {
        if (activeKindRef.current === kind) setError('Не удалось загрузить файлы');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [chatId, runAuthorized],
  );

  useEffect(() => {
    if (visible) {
      load(activeKind);
    }
  }, [visible, activeKind, load]);

  const handleTabChange = (kind: ChatAttachmentBrowserKind) => {
    setActiveKind(kind);
  };

  const handleOpen = async (item: ChatAttachmentBrowserItem) => {
    if (openingId) return;
    setOpeningId(item.id);
    try {
      const result = await runAuthorized((token: string) =>
        downloadChatAttachment(token, chatId, item.id),
      );
      await Linking.openURL(result.url);
    } catch {
      // silently ignore
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Медиафайлы</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {TABS.map(tab => (
            <Pressable
              key={tab.kind}
              style={[styles.tab, activeKind === tab.kind && styles.tabActive]}
              onPress={() => handleTabChange(tab.kind)}>
              <Text style={[styles.tabLabel, activeKind === tab.kind && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={androidTheme.colors.blue} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Файлов нет</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {activeKind === 'PHOTOS' ? (
              <View style={styles.photoGrid}>
                {items.map(item => (
                  <Pressable
                    key={item.id}
                    style={styles.photoCell}
                    onPress={() => handleOpen(item)}
                    disabled={openingId === item.id}>
                    <Image
                      source={{uri: `data:${item.mimeType};base64,`}}
                      style={styles.photoThumb}
                      resizeMode="cover"
                    />
                    {openingId === item.id ? (
                      <View style={styles.photoOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              items.map(item => (
                <Pressable
                  key={item.id}
                  style={styles.fileRow}
                  onPress={() => handleOpen(item)}
                  disabled={openingId === item.id}>
                  <View style={styles.fileIcon}>
                    <Text style={styles.fileIconText}>{isPhoto(item.mimeType) ? '🖼' : '📄'}</Text>
                  </View>
                  <View style={styles.fileMeta}>
                    <Text numberOfLines={1} style={styles.fileName}>
                      {item.fileName}
                    </Text>
                    <Text style={styles.fileSub}>
                      {item.sender.displayName} · {formatFileSize(item.sizeBytes)}
                    </Text>
                  </View>
                  {openingId === item.id ? (
                    <ActivityIndicator color={androidTheme.colors.blue} size="small" />
                  ) : null}
                </Pressable>
              ))
            )}

            {nextCursor ? (
              <Pressable
                style={styles.loadMoreButton}
                onPress={() => load(activeKind, nextCursor)}
                disabled={loadingMore}>
                {loadingMore ? (
                  <ActivityIndicator color={androidTheme.colors.blue} />
                ) : (
                  <Text style={styles.loadMoreLabel}>Загрузить ещё</Text>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: 16,
    color: androidTheme.colors.textSecondary,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: androidTheme.radius.pill,
    backgroundColor: androidTheme.colors.surfaceAlt,
  },
  tabActive: {
    backgroundColor: androidTheme.colors.blueStrong,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: androidTheme.colors.textSecondary,
  },
  tabLabelActive: {
    color: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: androidTheme.colors.textMuted,
    fontSize: 15,
  },
  errorText: {
    color: androidTheme.colors.danger,
    fontSize: 15,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  photoCell: {
    width: '32%',
    aspectRatio: 1,
    backgroundColor: androidTheme.colors.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
    gap: 12,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: androidTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconText: {
    fontSize: 20,
  },
  fileMeta: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: androidTheme.colors.textPrimary,
  },
  fileSub: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
    marginTop: 2,
  },
  loadMoreButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreLabel: {
    color: androidTheme.colors.blue,
    fontSize: 14,
    fontWeight: '500',
  },
});
