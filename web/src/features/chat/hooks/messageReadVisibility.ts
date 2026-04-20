type OpenChatReadOptions = {
  isActiveChatOpen: boolean;
  isDocumentVisible: boolean;
  hasDocumentFocus: boolean;
};

type IncomingMessageReadOptions = OpenChatReadOptions & {
  activeChatId: string | null;
  messageChatId: string;
};

export function canAcknowledgeVisibleMessagesAsRead(options: OpenChatReadOptions) {
  return options.isActiveChatOpen && options.isDocumentVisible && options.hasDocumentFocus;
}

export function shouldAcknowledgeIncomingMessageAsRead(options: IncomingMessageReadOptions) {
  return (
    options.messageChatId === options.activeChatId &&
    canAcknowledgeVisibleMessagesAsRead(options)
  );
}
