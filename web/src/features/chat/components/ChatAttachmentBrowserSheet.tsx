import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getChatAttachmentBrowserPage, getChatLinkBrowserPage } from "../../../lib/api";
import type {
  ChatAttachmentBrowserItem,
  ChatAttachmentBrowserKind,
  ChatLinkBrowserItem,
  ChatMessageAttachment,
  ChatSummary,
  SourceMessageJumpTarget,
} from "../../../lib/types";

const PAGE_SIZE = 60;
const PHOTO_VIEWER_MIN_ZOOM = 0.25;
const PHOTO_VIEWER_MAX_ZOOM = 4;
const PHOTO_VIEWER_ZOOM_STEP = 0.25;

type ChatBrowserTab = ChatAttachmentBrowserKind | "LINKS";

const FILTERS: Array<{ kind: ChatBrowserTab; label: string }> = [
  { kind: "ALL", label: "Все" },
  { kind: "PHOTOS", label: "Фото" },
  { kind: "DOCUMENTS", label: "Документы" },
  { kind: "LINKS", label: "Ссылки" },
];

type Props = {
  activeChat: ChatSummary | null;
  sessionToken: string;
  onClose: () => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onJumpToSourceMessage: (chatId: string, item: SourceMessageJumpTarget) => void;
};

type BrowserItemProps = {
  item: ChatAttachmentBrowserItem;
  chatId: string;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onJumpToSourceMessage: (chatId: string, item: SourceMessageJumpTarget) => void;
  onOpenPhotoViewer: (itemId: string) => void;
};

type LinkRowProps = {
  item: ChatLinkBrowserItem;
  chatId: string;
  onJumpToSourceMessage: (chatId: string, item: SourceMessageJumpTarget) => void;
};

type CombinedBrowserItem =
  | { kind: "attachment"; item: ChatAttachmentBrowserItem }
  | { kind: "link"; item: ChatLinkBrowserItem };

type PhotoViewerProps = {
  activeChatTitle: string;
  chatId: string;
  items: ChatAttachmentBrowserItem[];
  currentItemId: string;
  onClose: () => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onJumpToSourceMessage: (chatId: string, item: SourceMessageJumpTarget) => void;
  onOpenPhotoViewerItem: (itemId: string) => void;
};

export function buildAttachmentMessageJumpCursor(messageServerOrder: number | null) {
  return messageServerOrder == null ? null : String(messageServerOrder + 1);
}

export function clampPhotoViewerZoom(zoom: number) {
  return Math.min(PHOTO_VIEWER_MAX_ZOOM, Math.max(PHOTO_VIEWER_MIN_ZOOM, Number(zoom.toFixed(2))));
}

export function resolveAdjacentPhotoViewerIndex(
  currentIndex: number,
  offset: number,
  total: number
) {
  if (total <= 0) {
    return null;
  }

  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= total) {
    return null;
  }

  return nextIndex;
}

export function ChatAttachmentBrowserSheet({
  activeChat,
  sessionToken,
  onClose,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onJumpToSourceMessage,
}: Props) {
  const [kind, setKind] = useState<ChatBrowserTab>("ALL");
  const [photoViewerItemId, setPhotoViewerItemId] = useState<string | null>(null);

  useEffect(() => {
    setKind("ALL");
    setPhotoViewerItemId(null);
  }, [activeChat?.id]);

  const attachmentQuery = useInfiniteQuery({
    queryKey: ["chat-attachment-browser", sessionToken, activeChat?.id, kind],
    queryFn: ({ pageParam }) =>
      getChatAttachmentBrowserPage(sessionToken, activeChat!.id, {
        kind: kind === "LINKS" ? "ALL" : kind,
        cursor: pageParam ?? null,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(activeChat?.id) && kind !== "LINKS",
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const linkQuery = useInfiniteQuery({
    queryKey: ["chat-link-browser", sessionToken, activeChat?.id],
    queryFn: ({ pageParam }) =>
      getChatLinkBrowserPage(sessionToken, activeChat!.id, {
        cursor: pageParam ?? null,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(activeChat?.id) && (kind === "LINKS" || kind === "ALL"),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const attachmentItems = useMemo(
    () => attachmentQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [attachmentQuery.data]
  );
  const linkItems = useMemo(
    () => linkQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [linkQuery.data]
  );
  const allItems = useMemo<CombinedBrowserItem[]>(
    () =>
      [...attachmentItems.map((item) => ({ kind: "attachment" as const, item })), ...linkItems.map((item) => ({ kind: "link" as const, item }))]
        .sort((left, right) => {
          const leftOrder = left.item.messageServerOrder ?? Number.MIN_SAFE_INTEGER;
          const rightOrder = right.item.messageServerOrder ?? Number.MIN_SAFE_INTEGER;
          if (leftOrder !== rightOrder) {
            return rightOrder - leftOrder;
          }
          return right.item.createdAt.localeCompare(left.item.createdAt);
        }),
    [attachmentItems, linkItems]
  );
  const photoItems = useMemo(() => attachmentItems.filter(isImageAttachment), [attachmentItems]);
  const isPhotosMode = kind === "PHOTOS";
  const isLinksMode = kind === "LINKS";
  const isAllMode = kind === "ALL";
  const activeQuery = isLinksMode ? linkQuery : attachmentQuery;
  const allModeLoading = attachmentQuery.isLoading || linkQuery.isLoading;
  const allModeError = attachmentQuery.isError || linkQuery.isError;
  const allModeHasNextPage = attachmentQuery.hasNextPage || linkQuery.hasNextPage;
  const allModeFetchingNextPage =
    attachmentQuery.isFetchingNextPage || linkQuery.isFetchingNextPage;

  useEffect(() => {
    if (
      photoViewerItemId &&
      !attachmentQuery.isFetching &&
      !photoItems.some((item) => item.id === photoViewerItemId)
    ) {
      setPhotoViewerItemId(null);
    }
  }, [photoItems, photoViewerItemId, attachmentQuery.isFetching]);

  return (
    <div className="sheet-card chat-attachment-browser-sheet">
      <div className="sheet-head">
        <div>
          <div className="section-title">Медиа и файлы</div>
          <p className="sheet-copy">
            {activeChat
              ? `Все вложения чата "${activeChat.title}" в одном месте.`
              : "Откройте чат, чтобы посмотреть вложения."}
          </p>
        </div>
        <button type="button" className="ghost-button compact" onClick={onClose}>
          Закрыть
        </button>
      </div>

      {activeChat ? (
        <>
          <div className="chat-attachment-browser-filters" role="tablist" aria-label="Фильтр медиа и файлов">
            {FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.kind}
                role="tab"
                aria-selected={kind === filter.kind}
                className={
                  kind === filter.kind
                    ? "ghost-button compact is-active"
                    : "ghost-button compact"
                }
                onClick={() => setKind(filter.kind)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {isAllMode ? (
            allModeLoading ? (
              <div className="empty-list">Loading media, files and links...</div>
            ) : allModeError ? (
              <div className="empty-list">Could not load media, files and links.</div>
            ) : allItems.length === 0 ? (
              <div className="empty-list">{buildEmptyStateLabel(kind)}</div>
            ) : (
              <div className="sheet-list chat-attachment-browser-list">
                {allItems.map((entry) =>
                  entry.kind === "link" ? (
                    <LinkBrowserRow
                      key={`link-${entry.item.id}`}
                      item={entry.item}
                      chatId={activeChat.id}
                      onJumpToSourceMessage={onJumpToSourceMessage}
                    />
                  ) : isImageAttachment(entry.item) ? (
                    <MixedImageBrowserRow
                      key={`attachment-${entry.item.id}`}
                      item={entry.item}
                      chatId={activeChat.id}
                      onDownloadAttachment={onDownloadAttachment}
                      onLoadAttachmentPreview={onLoadAttachmentPreview}
                      onJumpToSourceMessage={onJumpToSourceMessage}
                      onOpenPhotoViewer={setPhotoViewerItemId}
                    />
                  ) : (
                    <DocumentBrowserRow
                      key={`attachment-${entry.item.id}`}
                      item={entry.item}
                      chatId={activeChat.id}
                      onDownloadAttachment={onDownloadAttachment}
                      onJumpToSourceMessage={onJumpToSourceMessage}
                      onOpenPhotoViewer={setPhotoViewerItemId}
                      onLoadAttachmentPreview={onLoadAttachmentPreview}
                    />
                  )
                )}
              </div>
            )
          ) : activeQuery.isLoading ? (
            <div className="empty-list">{isLinksMode ? "Загружаем ссылки..." : "Загружаем вложения..."}</div>
          ) : activeQuery.isError ? (
            <div className="empty-list">
              {isLinksMode
                ? "Не удалось загрузить ссылки. Попробуйте еще раз."
                : "Не удалось загрузить вложения. Попробуйте еще раз."}
            </div>
          ) : isLinksMode && linkItems.length === 0 ? (
            <div className="empty-list">{buildEmptyStateLabel(kind)}</div>
          ) : !isLinksMode && attachmentItems.length === 0 ? (
            <div className="empty-list">{buildEmptyStateLabel(kind)}</div>
          ) : isLinksMode ? (
            <div className="sheet-list chat-attachment-browser-list">
              {linkItems.map((item) => (
                <LinkBrowserRow
                  key={item.id}
                  item={item}
                  chatId={activeChat.id}
                  onJumpToSourceMessage={onJumpToSourceMessage}
                />
              ))}
            </div>
          ) : isPhotosMode ? (
            <div className="chat-attachment-browser-photo-grid">
              {photoItems.map((item) => (
                <PhotoBrowserCard
                  key={item.id}
                  item={item}
                  chatId={activeChat.id}
                  onDownloadAttachment={onDownloadAttachment}
                  onLoadAttachmentPreview={onLoadAttachmentPreview}
                  onJumpToSourceMessage={onJumpToSourceMessage}
                  onOpenPhotoViewer={setPhotoViewerItemId}
                />
              ))}
            </div>
          ) : (
            <div className="sheet-list chat-attachment-browser-list">
              {attachmentItems.map((item) =>
                isImageAttachment(item) ? (
                  <MixedImageBrowserRow
                    key={item.id}
                    item={item}
                    chatId={activeChat.id}
                    onDownloadAttachment={onDownloadAttachment}
                    onLoadAttachmentPreview={onLoadAttachmentPreview}
                    onJumpToSourceMessage={onJumpToSourceMessage}
                    onOpenPhotoViewer={setPhotoViewerItemId}
                  />
                ) : (
                  <DocumentBrowserRow
                    key={item.id}
                    item={item}
                    chatId={activeChat.id}
                    onDownloadAttachment={onDownloadAttachment}
                    onJumpToSourceMessage={onJumpToSourceMessage}
                    onOpenPhotoViewer={setPhotoViewerItemId}
                    onLoadAttachmentPreview={onLoadAttachmentPreview}
                  />
                )
              )}
            </div>
          )}

          {(isAllMode ? allModeHasNextPage : activeQuery.hasNextPage) ? (
            <button
              type="button"
              className="ghost-button history-button"
              onClick={() => {
                if (isAllMode) {
                  if (attachmentQuery.hasNextPage) {
                    void attachmentQuery.fetchNextPage();
                  }
                  if (linkQuery.hasNextPage) {
                    void linkQuery.fetchNextPage();
                  }
                  return;
                }

                void activeQuery.fetchNextPage();
              }}
              disabled={isAllMode ? allModeFetchingNextPage : activeQuery.isFetchingNextPage}
            >
              {activeQuery.isFetchingNextPage ? "Загружаем..." : "Показать еще"}
            </button>
          ) : null}

          {photoViewerItemId ? (
            <PhotoViewerOverlay
              activeChatTitle={activeChat.title}
              chatId={activeChat.id}
              items={photoItems}
              currentItemId={photoViewerItemId}
              onClose={() => setPhotoViewerItemId(null)}
              onDownloadAttachment={onDownloadAttachment}
              onLoadAttachmentPreview={onLoadAttachmentPreview}
              onJumpToSourceMessage={onJumpToSourceMessage}
              onOpenPhotoViewerItem={setPhotoViewerItemId}
            />
          ) : null}
        </>
      ) : (
        <div className="empty-list">Чат не выбран.</div>
      )}
    </div>
  );
}

function PhotoBrowserCard({
  item,
  chatId,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onJumpToSourceMessage,
  onOpenPhotoViewer,
}: BrowserItemProps) {
  const { previewUrl, previewError } = useAttachmentPreviewUrl(
    chatId,
    item,
    onLoadAttachmentPreview
  );
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const attachment = toAttachment(item);

  return (
    <div className="chat-attachment-browser-photo-card">
      <button
        type="button"
        className="chat-attachment-browser-photo-card-main"
        onClick={() => onJumpToSourceMessage(chatId, item)}
        title={`Перейти к сообщению с ${item.fileName}`}
      >
        {previewUrl && !previewError ? (
          <img
            className={
              previewLoaded
                ? "chat-attachment-browser-photo-image"
                : "chat-attachment-browser-photo-image is-loading"
            }
            src={previewUrl}
            alt={item.fileName}
            onLoad={() => setPreviewLoaded(true)}
            onError={() => setPreviewLoaded(false)}
          />
        ) : (
          <span className="chat-attachment-browser-photo-placeholder">
            {previewError ? "Превью недоступно" : "Загружаем изображение..."}
          </span>
        )}
        <span className="chat-attachment-browser-photo-meta">
          <strong>{item.fileName}</strong>
          <span>
            {item.sender.displayName} · {formatFileSize(item.sizeBytes)} ·{" "}
            {formatAttachmentMoment(item.createdAt)}
          </span>
        </span>
      </button>
      <div className="chat-attachment-browser-photo-actions">
        <button
          type="button"
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            onOpenPhotoViewer(item.id);
          }}
        >
          Открыть
        </button>
        <button
          type="button"
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            onDownloadAttachment(chatId, attachment);
          }}
        >
          Скачать
        </button>
      </div>
    </div>
  );
}

function MixedImageBrowserRow({
  item,
  chatId,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onJumpToSourceMessage,
  onOpenPhotoViewer,
}: BrowserItemProps) {
  const { previewUrl, previewError } = useAttachmentPreviewUrl(
    chatId,
    item,
    onLoadAttachmentPreview
  );
  const attachment = toAttachment(item);

  return (
    <div className="sheet-row chat-attachment-browser-row">
      <button
        type="button"
        className="chat-attachment-browser-row-main"
        onClick={() => onJumpToSourceMessage(chatId, item)}
        title={`Перейти к сообщению с ${item.fileName}`}
      >
        <div className="chat-attachment-browser-row-identity">
          <div className="chat-attachment-browser-thumb-shell">
            {previewUrl && !previewError ? (
              <img
                className="chat-attachment-browser-thumb"
                src={previewUrl}
                alt={item.fileName}
              />
            ) : (
              <span className="chat-attachment-browser-thumb-placeholder">Фото</span>
            )}
          </div>
          <div className="sheet-row-copy">
            <strong>{item.fileName}</strong>
            <span>
              {item.sender.displayName} · {formatAttachmentMoment(item.createdAt)}
            </span>
          </div>
        </div>
      </button>
      <div className="sheet-row-actions">
        <span className="message-attachment-action">{formatFileSize(item.sizeBytes)}</span>
        <button
          type="button"
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            onOpenPhotoViewer(item.id);
          }}
        >
          Открыть
        </button>
        <button
          type="button"
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            onDownloadAttachment(chatId, attachment);
          }}
        >
          Скачать
        </button>
      </div>
    </div>
  );
}

function DocumentBrowserRow({
  item,
  chatId,
  onDownloadAttachment,
  onJumpToSourceMessage,
}: BrowserItemProps) {
  const attachment = toAttachment(item);

  return (
    <div className="sheet-row chat-attachment-browser-row">
      <button
        type="button"
        className="chat-attachment-browser-row-main"
        onClick={() => onJumpToSourceMessage(chatId, item)}
        title={`Перейти к сообщению с ${item.fileName}`}
      >
        <div className="chat-attachment-browser-row-identity">
          <span className="message-attachment-icon chat-attachment-browser-doc-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M7 3.8h7.4L19 8.4v11.8H7z"
                fill="none"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M14.2 3.8v4.8H19"
                fill="none"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <div className="sheet-row-copy">
            <strong>{item.fileName}</strong>
            <span>
              {item.sender.displayName} · {formatAttachmentMoment(item.createdAt)}
            </span>
          </div>
        </div>
      </button>
      <div className="sheet-row-actions">
        <span className="message-attachment-action">{formatFileSize(item.sizeBytes)}</span>
        <button
          type="button"
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            onDownloadAttachment(chatId, attachment);
          }}
        >
          Скачать
        </button>
      </div>
    </div>
  );
}

function LinkBrowserRow({ item, chatId, onJumpToSourceMessage }: LinkRowProps) {
  return (
    <div className="sheet-row chat-attachment-browser-row">
      <button
        type="button"
        className="chat-attachment-browser-row-main"
        onClick={() => onJumpToSourceMessage(chatId, item)}
        title={`Перейти к сообщению со ссылкой ${item.url}`}
      >
        <div className="chat-attachment-browser-row-identity">
          <span className="message-attachment-icon chat-attachment-browser-doc-icon" aria-hidden="true">
            🔗
          </span>
          <div className="sheet-row-copy">
            <strong>{item.host ?? item.url}</strong>
            <span>
              {item.sender.displayName} · {formatAttachmentMoment(item.createdAt)}
            </span>
            <span className="chat-attachment-browser-link-url">{item.url}</span>
          </div>
        </div>
      </button>
      <div className="sheet-row-actions">
        <button
          type="button"
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            openExternalLink(item.url);
          }}
        >
          Открыть
        </button>
        <button
          type="button"
          className="ghost-button compact"
          onClick={(event) => {
            event.stopPropagation();
            void navigator.clipboard.writeText(item.url);
          }}
        >
          Копировать
        </button>
      </div>
    </div>
  );
}

function PhotoViewerOverlay({
  activeChatTitle,
  chatId,
  items,
  currentItemId,
  onClose,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onJumpToSourceMessage,
  onOpenPhotoViewerItem,
}: PhotoViewerProps) {
  const currentIndex = items.findIndex((item) => item.id === currentItemId);
  const currentItem = currentIndex >= 0 ? items[currentIndex] ?? null : null;
  const { previewUrl, previewError, previewPending } = useAttachmentPreviewUrl(
    chatId,
    currentItem,
    onLoadAttachmentPreview,
    { enabled: Boolean(currentItem) }
  );
  const [zoom, setZoom] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setZoom(1);
    setImageLoaded(false);
  }, [currentItemId]);

  useEffect(() => {
    if (!currentItem) {
      onClose();
    }
  }, [currentItem, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!currentItem) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        const nextIndex = resolveAdjacentPhotoViewerIndex(currentIndex, -1, items.length);
        if (nextIndex !== null) {
          event.preventDefault();
          onOpenPhotoViewerItem(items[nextIndex]!.id);
        }
        return;
      }

      if (event.key === "ArrowRight") {
        const nextIndex = resolveAdjacentPhotoViewerIndex(currentIndex, 1, items.length);
        if (nextIndex !== null) {
          event.preventDefault();
          onOpenPhotoViewerItem(items[nextIndex]!.id);
        }
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => clampPhotoViewerZoom(value + PHOTO_VIEWER_ZOOM_STEP));
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((value) => clampPhotoViewerZoom(value - PHOTO_VIEWER_ZOOM_STEP));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentIndex, currentItem, items, onClose, onOpenPhotoViewerItem]);

  if (!currentItem) {
    return null;
  }

  const previousIndex = resolveAdjacentPhotoViewerIndex(currentIndex, -1, items.length);
  const nextIndex = resolveAdjacentPhotoViewerIndex(currentIndex, 1, items.length);
  const attachment = toAttachment(currentItem);

  return (
    <div
      className="chat-attachment-browser-photo-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр изображения ${currentItem.fileName}`}
      onClick={onClose}
    >
      <div
        className="chat-attachment-browser-photo-viewer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-attachment-browser-photo-viewer-toolbar">
          <div className="chat-attachment-browser-photo-viewer-copy">
            <strong>{currentItem.fileName}</strong>
            <span>
              {activeChatTitle} · {currentItem.sender.displayName} ·{" "}
              {formatAttachmentMoment(currentItem.createdAt)}
            </span>
          </div>
          <div className="chat-attachment-browser-photo-viewer-actions">
            <button
              type="button"
              className="ghost-button compact"
              onClick={() => setZoom((value) => clampPhotoViewerZoom(value - PHOTO_VIEWER_ZOOM_STEP))}
              disabled={zoom <= PHOTO_VIEWER_MIN_ZOOM}
            >
              -
            </button>
            <span className="chat-attachment-browser-photo-viewer-zoom">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="ghost-button compact"
              onClick={() => setZoom((value) => clampPhotoViewerZoom(value + PHOTO_VIEWER_ZOOM_STEP))}
              disabled={zoom >= PHOTO_VIEWER_MAX_ZOOM}
            >
              +
            </button>
            <button
              type="button"
              className="ghost-button compact"
              onClick={() => {
                onClose();
                onJumpToSourceMessage(chatId, currentItem);
              }}
            >
              К сообщению
            </button>
            <button
              type="button"
              className="ghost-button compact"
              onClick={() => onDownloadAttachment(chatId, attachment)}
            >
              Скачать
            </button>
            <button type="button" className="ghost-button compact" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>

        <div className="chat-attachment-browser-photo-viewer-stage">
          <button
            type="button"
            className="chat-attachment-browser-photo-viewer-nav"
            onClick={() => previousIndex !== null && onOpenPhotoViewerItem(items[previousIndex]!.id)}
            disabled={previousIndex === null}
            aria-label="Предыдущее фото"
          >
            ‹
          </button>

          <div className="chat-attachment-browser-photo-viewer-image-shell">
            {previewUrl && !previewError ? (
              <img
                className={imageLoaded ? "chat-attachment-browser-photo-viewer-image" : "chat-attachment-browser-photo-viewer-image is-viewer-loading"}
                src={previewUrl}
                alt={currentItem.fileName}
                style={{ transform: `scale(${zoom})` }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
              />
            ) : (
              <div className="chat-attachment-browser-photo-viewer-empty">
                {previewPending
                  ? "Загружаем изображение..."
                  : "Не удалось загрузить изображение. Можно скачать файл или перейти к сообщению."}
              </div>
            )}
          </div>

          <button
            type="button"
            className="chat-attachment-browser-photo-viewer-nav"
            onClick={() => nextIndex !== null && onOpenPhotoViewerItem(items[nextIndex]!.id)}
            disabled={nextIndex === null}
            aria-label="Следующее фото"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

function useAttachmentPreviewUrl(
  chatId: string,
  item: ChatAttachmentBrowserItem | null,
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>,
  options: { enabled?: boolean } = {}
) {
  const previewObjectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const enabled = options.enabled ?? true;
  const previewKey = item
    ? `${item.id}|${item.fileName}|${item.mimeType}|${item.sizeBytes}`
    : null;
  const previewItemId = item?.id ?? null;
  const previewFileName = item?.fileName ?? null;
  const previewMimeType = item?.mimeType ?? null;
  const previewSizeBytes = item?.sizeBytes ?? null;

  useEffect(() => {
    let cancelled = false;
    if (previewObjectUrlRef.current) {
      window.URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewError(false);
    setPreviewPending(false);

    if (!enabled || !previewItemId || !previewFileName || !previewMimeType || previewSizeBytes === null) {
      return;
    }

    const attachmentToPreview = {
      id: previewItemId,
      fileName: previewFileName,
      mimeType: previewMimeType,
      sizeBytes: previewSizeBytes,
    };
    setPreviewPending(true);
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setPreviewError(true);
        setPreviewPending(false);
      }
    }, 15_000);

    onLoadAttachmentPreview(chatId, attachmentToPreview)
      .then((blob) => {
        window.clearTimeout(timeoutId);
        if (cancelled) {
          return;
        }

        const objectUrl = window.URL.createObjectURL(blob);
        previewObjectUrlRef.current = objectUrl;
        setPreviewError(false);
        setPreviewUrl(objectUrl);
        setPreviewPending(false);
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setPreviewError(true);
          setPreviewPending(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    chatId,
    enabled,
    onLoadAttachmentPreview,
    previewItemId,
    previewFileName,
    previewMimeType,
    previewSizeBytes,
    previewKey,
  ]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        window.URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  return {
    previewUrl,
    previewError,
    previewPending,
  };
}

function buildEmptyStateLabel(kind: ChatBrowserTab) {
  switch (kind) {
    case "PHOTOS":
      return "В этом чате пока нет фотографий.";
    case "DOCUMENTS":
      return "В этом чате пока нет документов.";
    case "LINKS":
      return "В этом чате пока нет ссылок.";
    default:
      return "В этом чате пока нет вложений.";
  }
}

function toAttachment(item: ChatAttachmentBrowserItem): ChatMessageAttachment {
  return {
    id: item.id,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
  };
}

function isImageAttachment(item: ChatAttachmentBrowserItem) {
  return item.mimeType.toLowerCase().startsWith("image/");
}

function formatAttachmentMoment(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = sizeBytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function openExternalLink(url: string) {
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (openedWindow) {
    openedWindow.opener = null;
  }
}
