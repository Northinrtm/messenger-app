package com.north.messenger.application.mail;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.UserAccount;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "true", matchIfMissing = false)
public class UserMailService {

    private static final Logger log = LoggerFactory.getLogger(UserMailService.class);
    private static final int DEFAULT_PAGE_SIZE = 25;

    private final MailProperties properties;
    private final UserMailboxCredentialService credentialService;
    private final AuthService authService;

    public UserMailService(
            MailProperties properties,
            UserMailboxCredentialService credentialService,
            AuthService authService
    ) {
        this.properties = properties;
        this.credentialService = credentialService;
        this.authService = authService;
    }

    public List<MailMessageSummary> listInbox(String username, int page, int size) {
        UserAccount user = authService.requireAuthenticatedUser(username);
        return withImapFolder(user, "INBOX", (folder) -> fetchSummaries(folder, page, size));
    }

    public List<MailMessageSummary> listSent(String username, int page, int size) {
        UserAccount user = authService.requireAuthenticatedUser(username);
        return withImapFolder(user, "Sent", (folder) -> fetchSummaries(folder, page, size));
    }

    public MailMessageDetail getMessage(String username, String messageId) {
        UserAccount user = authService.requireAuthenticatedUser(username);
        String[] parts = messageId.split(":", 2);
        if (parts.length != 2) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invalid message ID");
        }
        String folderName = parts[0];
        long uid;
        try {
            uid = Long.parseLong(parts[1]);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invalid message ID");
        }

        return withImapUidFolder(user, folderName, (folder) -> {
            jakarta.mail.UIDFolder uidFolder = (jakarta.mail.UIDFolder) folder;
            Message msg = uidFolder.getMessageByUID(uid);
            if (msg == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found");
            }
            msg.setFlag(Flags.Flag.SEEN, true);
            return toDetail(folderName, uid, msg);
        });
    }

    public void sendMessage(String username, String to, String subject, String body) {
        UserAccount user = authService.requireAuthenticatedUser(username);
        String fromAddress = properties.imapAddress(user.getUsername());
        String imapPassword = credentialService.derivePassword(user.getId());

        Properties props = new Properties();
        props.put("mail.smtp.host", properties.smtpHost());
        props.put("mail.smtp.port", String.valueOf(properties.smtpPort()));
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.ssl.enable", "false");
        props.put("mail.smtp.starttls.enable", "false");
        props.put("mail.smtp.connectiontimeout", "5000");
        props.put("mail.smtp.timeout", "10000");

        try {
            Session session = Session.getInstance(props);
            MimeMessage message = new MimeMessage(session);
            message.setFrom(new InternetAddress(fromAddress));
            message.setRecipient(Message.RecipientType.TO, new InternetAddress(to));
            message.setSubject(subject, "UTF-8");
            message.setText(body, "UTF-8", "plain");
            message.setSentDate(new Date());

            Transport.send(message, user.getUsername(), imapPassword);
        } catch (MessagingException exception) {
            log.warn("Failed to send mail from {} to {}: {}", fromAddress, to, exception.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to send message");
        }
    }

    public void deleteMessage(String username, String messageId) {
        UserAccount user = authService.requireAuthenticatedUser(username);
        String[] parts = messageId.split(":", 2);
        if (parts.length != 2) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invalid message ID");
        }
        String folderName = parts[0];
        long uid;
        try {
            uid = Long.parseLong(parts[1]);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invalid message ID");
        }

        withImapUidFolder(user, folderName, (folder) -> {
            jakarta.mail.UIDFolder uidFolder = (jakarta.mail.UIDFolder) folder;
            Message msg = uidFolder.getMessageByUID(uid);
            if (msg != null) {
                msg.setFlag(Flags.Flag.DELETED, true);
                folder.expunge();
            }
            return null;
        });
    }

    private <T> T withImapFolder(UserAccount user, String folderName, FolderConsumer<T> consumer) {
        return withImapUidFolder(user, folderName, consumer);
    }

    private <T> T withImapUidFolder(UserAccount user, String folderName, FolderConsumer<T> consumer) {
        Properties props = new Properties();
        props.put("mail.store.protocol", "imap");
        props.put("mail.imap.host", properties.imapHost());
        props.put("mail.imap.port", String.valueOf(properties.imapPort()));
        props.put("mail.imap.ssl.enable", "false");
        props.put("mail.imap.connectiontimeout", "5000");
        props.put("mail.imap.timeout", "15000");

        String imapUser = user.getUsername();
        String imapPassword = credentialService.derivePassword(user.getId());

        Session session = Session.getInstance(props);
        try (Store store = session.getStore("imap")) {
            store.connect(properties.imapHost(), properties.imapPort(), imapUser, imapPassword);
            Folder folder = store.getFolder(folderName);
            if (folder == null || !folder.exists()) {
                return null instanceof T ? null : returnEmpty(consumer);
            }
            folder.open(Folder.READ_WRITE);
            try {
                return consumer.apply(folder);
            } finally {
                folder.close(true);
            }
        } catch (MessagingException | IOException exception) {
            log.warn("IMAP error for user {} folder {}: {}", user.getUsername(), folderName, exception.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Mail service temporarily unavailable");
        }
    }

    @SuppressWarnings("unchecked")
    private <T> T returnEmpty(FolderConsumer<T> consumer) {
        return (T) List.of();
    }

    private List<MailMessageSummary> fetchSummaries(Folder folder, int page, int size) throws MessagingException {
        if (folder == null || !folder.exists()) {
            return List.of();
        }
        int total = folder.getMessageCount();
        if (total == 0) {
            return List.of();
        }

        int effectiveSize = size <= 0 || size > 100 ? DEFAULT_PAGE_SIZE : size;
        int end = total - (page * effectiveSize);
        int start = Math.max(1, end - effectiveSize + 1);
        if (end < 1) {
            return List.of();
        }

        jakarta.mail.UIDFolder uidFolder = (jakarta.mail.UIDFolder) folder;
        Message[] messages = folder.getMessages(start, end);
        List<MailMessageSummary> result = new ArrayList<>(messages.length);
        for (int i = messages.length - 1; i >= 0; i--) {
            Message msg = messages[i];
            long uid = uidFolder.getUID(msg);
            result.add(toSummary(folder.getName(), uid, msg));
        }
        return result;
    }

    private MailMessageSummary toSummary(String folderName, long uid, Message msg) throws MessagingException {
        String id = folderName + ":" + uid;
        String from = extractFrom(msg);
        String subject = msg.getSubject() != null ? msg.getSubject() : "(без темы)";
        Date sent = msg.getSentDate();
        Instant sentAt = sent != null ? sent.toInstant() : Instant.now();
        boolean read = msg.isSet(Flags.Flag.SEEN);
        return new MailMessageSummary(id, from, subject, sentAt, read);
    }

    private MailMessageDetail toDetail(String folderName, long uid, Message msg) throws MessagingException, IOException {
        String id = folderName + ":" + uid;
        String from = extractFrom(msg);
        List<String> to = extractTo(msg);
        String subject = msg.getSubject() != null ? msg.getSubject() : "(без темы)";
        Date sent = msg.getSentDate();
        Instant sentAt = sent != null ? sent.toInstant() : Instant.now();
        boolean read = msg.isSet(Flags.Flag.SEEN);
        String body = extractBody(msg);
        return new MailMessageDetail(id, from, to, subject, body, sentAt, read);
    }

    private String extractFrom(Message msg) throws MessagingException {
        InternetAddress[] addresses = (InternetAddress[]) msg.getFrom();
        if (addresses == null || addresses.length == 0) {
            return "";
        }
        InternetAddress addr = addresses[0];
        String personal = addr.getPersonal();
        return personal != null ? personal + " <" + addr.getAddress() + ">" : addr.getAddress();
    }

    private List<String> extractTo(Message msg) throws MessagingException {
        InternetAddress[] addresses = (InternetAddress[]) msg.getRecipients(Message.RecipientType.TO);
        if (addresses == null) {
            return List.of();
        }
        return Arrays.stream(addresses)
                .map(InternetAddress::getAddress)
                .toList();
    }

    private String extractBody(Part part) throws MessagingException, IOException {
        if (part.isMimeType("text/plain")) {
            return (String) part.getContent();
        }
        if (part.isMimeType("text/html")) {
            return stripHtml((String) part.getContent());
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            String plain = null;
            String html = null;
            for (int i = 0; i < multipart.getCount(); i++) {
                Part bp = multipart.getBodyPart(i);
                if (bp.isMimeType("text/plain") && plain == null) {
                    plain = (String) bp.getContent();
                } else if (bp.isMimeType("text/html") && html == null) {
                    html = (String) bp.getContent();
                }
            }
            if (plain != null) return plain;
            if (html != null) return stripHtml(html);
        }
        return "";
    }

    private String stripHtml(String html) {
        return html.replaceAll("<[^>]+>", " ")
                .replaceAll("&nbsp;", " ")
                .replaceAll("&amp;", "&")
                .replaceAll("&lt;", "<")
                .replaceAll("&gt;", ">")
                .replaceAll("\\s+", " ")
                .trim();
    }

    @FunctionalInterface
    private interface FolderConsumer<T> {
        T apply(Folder folder) throws MessagingException, IOException;
    }
}
