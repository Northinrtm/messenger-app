package com.north.messenger.application.chat;

import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserChatDraft;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.UserChatDraftRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatDraftServiceTest {

    private AuthService authService;
    private ChatRoomRepository chatRoomRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private UserDeletedChatRepository userDeletedChatRepository;
    private UserChatDraftRepository userChatDraftRepository;
    private ChatDraftService chatDraftService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatRoomRepository = mock(ChatRoomRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        userDeletedChatRepository = mock(UserDeletedChatRepository.class);
        userChatDraftRepository = mock(UserChatDraftRepository.class);
        chatDraftService = new ChatDraftService(
                authService,
                chatRoomRepository,
                chatParticipantRepository,
                userDeletedChatRepository,
                userChatDraftRepository
        );
        when(userChatDraftRepository.save(any(UserChatDraft.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void listOwnDraftsReturnsVisibleDraftsOrderedByRepository() {
        UserAccount user = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UUID firstChatId = UUID.randomUUID();
        UUID secondChatId = UUID.randomUUID();
        Instant now = Instant.parse("2026-05-02T10:15:30Z");

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(userChatDraftRepository.findVisibleByUserIdOrderByUpdatedAtDesc(user.getId())).thenReturn(List.of(
                new UserChatDraft(UUID.randomUUID(), user.getId(), firstChatId, "draft one", now),
                new UserChatDraft(UUID.randomUUID(), user.getId(), secondChatId, "draft two", now.minusSeconds(60))
        ));

        var drafts = chatDraftService.listOwnDrafts("north");

        assertThat(drafts).hasSize(2);
        assertThat(drafts.get(0).chatId()).isEqualTo(firstChatId);
        assertThat(drafts.get(0).content()).isEqualTo("draft one");
        assertThat(drafts.get(1).chatId()).isEqualTo(secondChatId);
    }

    @Test
    void upsertOwnDraftCreatesNewDraftForVisibleChatMembership() {
        UserAccount user = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.now());

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())).thenReturn(true);
        when(userDeletedChatRepository.findByUserIdAndChatId(user.getId(), chatId)).thenReturn(Optional.empty());
        when(userChatDraftRepository.findByUserIdAndChatId(user.getId(), chatId)).thenReturn(Optional.empty());

        var response = chatDraftService.upsertOwnDraft("north", chatId, "hello draft");

        assertThat(response.chatId()).isEqualTo(chatId);
        assertThat(response.content()).isEqualTo("hello draft");
        verify(userChatDraftRepository).save(any(UserChatDraft.class));
    }

    @Test
    void upsertOwnDraftDeletesDraftWhenContentBecomesBlank() {
        UserAccount user = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, null, true, Instant.now());

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.existsByChatIdAndUserId(chatId, user.getId())).thenReturn(true);
        when(userDeletedChatRepository.findByUserIdAndChatId(user.getId(), chatId)).thenReturn(Optional.empty());

        var response = chatDraftService.upsertOwnDraft("north", chatId, "   ");

        assertThat(response.chatId()).isEqualTo(chatId);
        assertThat(response.content()).isEmpty();
        verify(userChatDraftRepository).deleteByUserIdAndChatId(user.getId(), chatId);
        verify(userChatDraftRepository, never()).save(any(UserChatDraft.class));
    }

    @Test
    void deleteOwnDraftIsIdempotentEvenWhenChatIsUnknown() {
        UserAccount user = testUserAccount(UUID.randomUUID(), "north", "North", "hash", Instant.now());
        UUID chatId = UUID.randomUUID();

        when(authService.requireAuthenticatedUser("north")).thenReturn(user);

        chatDraftService.deleteOwnDraft("north", chatId);

        verify(userChatDraftRepository).deleteByUserIdAndChatId(user.getId(), chatId);
    }
}
