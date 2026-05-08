import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { getChatAttachmentBrowserPage } from "../../../lib/api";
import type {
  ChatAttachmentBrowserItem,
  ChatAttachmentBrowserKind,
  ChatMessageAttachment,
  ChatSummary,
} from "../../../lib/types";

const PAGE_SIZE = 60;

const FILTERS: Array<{ kind: ChatAttachmentBrowserKind; label: string }> = [
  { kind: "ALL", label: "Все" },
  { kind: "PHOTOS", label: "Фото" },
  { kind: "DOCUMENTS", label: "Документы" },
];

type Props = {
  activeChat: ChatSummary | null;
  sessionToken: string;
  onClose: () => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onJumpToSourceMessage: (chatId: string, item: ChatAttachmentBrowserItem) => void;
};

export function ChatAttachmentBrowserSheet({
  activeChat,
  sessionToken,
  onClose,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onJumpToSourceMessage,
}: Props) {
  const [kind, setKind] = useState<ChatAttachmentBrowserKind>("ALL");

  useEffect(() => {
    setKind("ALL");
  }, [activeChat?.id]);

  const attachmentQuery = useInfiniteQuery({
    queryKey: ["chat-attachment-browser", sessionToken, activeChat?.id, kind],
    queryFn: ({ pageParam }) =>
      getChatAttachmentBrowserPage(sessionToken, activeChat!.id, {
        kind,
        cursor: pageParam ?? null,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(activeChat?.id),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const items = useMemo(
    () => attachmentQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [attachmentQuery.data]
  );

  const isPhotosMode = kind === "PHOTOS";

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
          <div className="chat-attachment-browser-filters" role="tablist" aria-label="Фильтр вложений">
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

          {attachmentQuery.isLoading ? (
            <div className="empty-list">Загружаем вложения...</div>
          ) : attachmentQuery.isError ? (
            <div className="empty-list">Не удалось загрузить вложения. Попробуйте еще раз.</div>
          ) : items.length === 0 ? (
            <div className="empty-list">{buildEmptyStateLabel(kind)}</div>
          ) : isPhotosMode ? (
            <div className="chat-attachment-browser-photo-grid">
              {items.map((item) => (
                <PhotoBrowserCard
                  key={item.id}
                  item={item}
                  chatId={activeChat.id}
                  onDownloadAttachment={onDownloadAttachment}
                  onLoadAttachmentPreview={onLoadAttachmentPreview}
                  onJumpToSourceMessage={onJumpToSourceMessage}
                />
              ))}
            </div>
          ) : (
            <div className="sheet-list chat-attachment-browser-list">
              {items.map((item) =>
                isImageAttachment(item) ? (
                  <MixedImageBrowserRow
                    key={item.id}
                    item={item}
                    chatId={activeChat.id}
                    onDownloadAttachment={onDownloadAttachment}
                    onLoadAttachmentPreview={onLoadAttachmentPreview}
                    onJumpToSourceMessage={onJumpToSourceMessage}
                  />
                ) : (
                  <DocumentBrowserRow
                    key={item.id}
                    item={item}
                    chatId={activeChat.id}
                    onDownloadAttachment={onDownloadAttachment}
                    onJumpToSourceMessage={onJumpToSourceMessage}
                  />
                )
              )}
            </div>
          )}

          {attachmentQuery.hasNextPage ? (
            <button
              type="button"
              className="ghost-button history-button"
              onClick={() => void attachmentQuery.fetchNextPage()}
              disabled={attachmentQuery.isFetchingNextPage}
            >
              {attachmentQuery.isFetchingNextPage ? "Загружаем..." : "Показать еще"}
            </button>
          ) : null}
        </>
      ) : (
        <div className="empty-list">Чат не выбран.</div>
      )}
    </div>
  );
}

type BrowserItemProps = {
  item: ChatAttachmentBrowserItem;
  chatId: string;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onJumpToSourceMessage: (chatId: string, item: ChatAttachmentBrowserItem) => void;
};

export function buildAttachmentMessageJumpCursor(messageServerOrder: number | null) {
  return messageServerOrder == null ? null : String(messageServerOrder + 1);
}

function PhotoBrowserCard({
  item,
  chatId,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onJumpToSourceMessage,
}: BrowserItemProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const inFlightPreviewRef = useRef<Promise<Blob> | null>(null);

  const attachment = toAttachment(item);
  const previewIdentity = `${chatId}:${item.id}:${item.mimeType}:${item.sizeBytes}`;

  const loadPreviewBlob = () => {
    if (inFlightPreviewRef.current) {
      return inFlightPreviewRef.current;
    }

    const request = onLoadAttachmentPreview(chatId, attachment).finally(() => {
      if (inFlightPreviewRef.current === request) {
        inFlightPreviewRef.current = null;
      }
    });
    inFlightPreviewRef.current = request;
    return request;
  };

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setPreviewError(true);
      }
    }, 15_000);

    inFlightPreviewRef.current = null;
    if (previewObjectUrlRef.current) {
      window.URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewError(false);
    setPreviewLoaded(false);

    loadPreviewBlob()
      .then((blob) => {
        window.clearTimeout(timeoutId);
        if (cancelled) {
          return;
        }

        const objectUrl = window.URL.createObjectURL(blob);
        previewObjectUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setPreviewError(true);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [chatId, item.id, item.mimeType, item.sizeBytes, onLoadAttachmentPreview, previewIdentity]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        window.URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, []);

  const openPreview = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (previewUrl && !previewError) {
      const openedWindow = window.open(previewUrl, "_blank");
      if (!openedWindow) {
        onDownloadAttachment(chatId, attachment);
      } else {
        openedWindow.opener = null;
      }
      return;
    }

    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = item.fileName;
      previewWindow.document.body.style.margin = "0";
      previewWindow.document.body.style.background = "#050d16";
      previewWindow.document.body.style.color = "#d8eafa";
      previewWindow.document.body.style.display = "grid";
      previewWindow.document.body.style.placeItems = "center";
      previewWindow.document.body.style.minHeight = "100vh";
      previewWindow.document.body.textContent = "Загружаем изображение...";
    }

    setIsOpeningPreview(true);
    loadPreviewBlob()
      .then((blob) => {
        const objectUrl = window.URL.createObjectURL(blob);
        if (previewWindow) {
          previewWindow.location.href = objectUrl;
        } else {
          const openedWindow = window.open(objectUrl, "_blank");
          if (!openedWindow) {
            onDownloadAttachment(chatId, attachment);
          } else {
            openedWindow.opener = null;
          }
        }
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
      })
      .catch(() => {
        previewWindow?.close();
        setPreviewError(true);
      })
      .finally(() => setIsOpeningPreview(false));
  };

  const downloadAttachment = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDownloadAttachment(chatId, attachment);
  };

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
            onError={() => setPreviewError(true)}
          />
        ) : (
          <span className="chat-attachment-browser-photo-placeholder">
            {previewError ? "Превью недоступно" : "Загружаем изображение..."}
          </span>
        )}
        <span className="chat-attachment-browser-photo-meta">
          <strong>{item.fileName}</strong>
          <span>
            {item.sender.displayName} - {formatFileSize(item.sizeBytes)} -{" "}
            {formatAttachmentMoment(item.createdAt)}
          </span>
        </span>
      </button>
      <div className="chat-attachment-browser-photo-actions">
        <button type="button" className="ghost-button compact" onClick={openPreview}>
          {isOpeningPreview ? "Открываем..." : "Открыть"}
        </button>
        <button type="button" className="ghost-button compact" onClick={downloadAttachment}>
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
}: BrowserItemProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const attachment = toAttachment(item);
  const previewIdentity = `${chatId}:${item.id}:${item.mimeType}:${item.sizeBytes}`;

  useEffect(() => {
    let cancelled = false;
    if (previewObjectUrlRef.current) {
      window.URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewError(false);

    onLoadAttachmentPreview(chatId, attachment)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const objectUrl = window.URL.createObjectURL(blob);
        previewObjectUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(true);
        }
      });

    return () => {
      cancelled = true;
      if (previewObjectUrlRef.current) {
        window.URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, [chatId, item.id, item.mimeType, item.sizeBytes, onLoadAttachmentPreview, previewIdentity]);

  const openPreview = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (previewUrl && !previewError) {
      const openedWindow = window.open(previewUrl, "_blank");
      if (!openedWindow) {
        onDownloadAttachment(chatId, attachment);
      } else {
        openedWindow.opener = null;
      }
      return;
    }
    onDownloadAttachment(chatId, attachment);
  };

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
              {item.sender.displayName} - {formatAttachmentMoment(item.createdAt)}
            </span>
          </div>
        </div>
      </button>
      <div className="sheet-row-actions">
        <span className="message-attachment-action">{formatFileSize(item.sizeBytes)}</span>
        <button type="button" className="ghost-button compact" onClick={openPreview}>
          Открыть
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
}: Omit<BrowserItemProps, "onLoadAttachmentPreview">) {
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
              {item.sender.displayName} - {formatAttachmentMoment(item.createdAt)}
            </span>
          </div>
        </div>
      </button>
      <div className="sheet-row-actions">
        <span className="message-attachment-action">{formatFileSize(item.sizeBytes)}</span>
        <button
          type="button"
          className="ghost-button compact"
          onClick={() => onDownloadAttachment(chatId, attachment)}
        >
          Скачать
        </button>
      </div>
    </div>
  );
}

function buildEmptyStateLabel(kind: ChatAttachmentBrowserKind) {
  switch (kind) {
    case "PHOTOS":
      return "В этом чате пока нет фотографий.";
    case "DOCUMENTS":
      return "В этом чате пока нет документов.";
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
