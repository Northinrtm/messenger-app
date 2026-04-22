package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatRoom;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {

    @Query("""
            select room
            from ChatRoom room
            where room.direct = true
              and exists (
                select 1 from ChatParticipant membership
                where membership.chatId = room.id and membership.userId = :firstUserId
              )
              and exists (
                select 1 from ChatParticipant membership
                where membership.chatId = room.id and membership.userId = :secondUserId
              )
            """)
    Optional<ChatRoom> findDirectChatByParticipantIds(
            @Param("firstUserId") UUID firstUserId,
            @Param("secondUserId") UUID secondUserId
    );

    Optional<ChatRoom> findByDirectIsTrueAndDirectUserLowIdAndDirectUserHighId(
            UUID directUserLowId,
            UUID directUserHighId
    );

    @Modifying
    @Query(
            value = """
                    delete from chat_rooms room
                    where room.id in (
                      select candidate.id
                      from chat_rooms candidate
                      left join chat_participants participant on participant.chat_id = candidate.id
                      where candidate.is_direct = true
                      group by candidate.id
                      having count(participant.id) < 2
                    )
                    """,
            nativeQuery = true
    )
    void deleteDirectRoomsWithFewerThanTwoParticipants();

    @Modifying
    @Query(
            value = """
                    delete from chat_rooms room
                    where room.id in (
                      select candidate.id
                      from chat_rooms candidate
                      left join chat_participants participant on participant.chat_id = candidate.id
                      group by candidate.id
                      having count(participant.id) = 0
                    )
                    """,
            nativeQuery = true
    )
    void deleteRoomsWithoutParticipants();
}
