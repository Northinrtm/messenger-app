package com.north.messenger.config;

import com.north.messenger.api.AuthController;
import com.north.messenger.api.ChatAttachmentController;
import com.north.messenger.api.ChatController;
import com.north.messenger.api.ChatLinkController;
import com.north.messenger.api.InviteLinkController;
import com.north.messenger.api.MessageController;
import com.north.messenger.api.MobileAuthController;
import com.north.messenger.api.PendingOutgoingMessageController;
import com.north.messenger.api.PushNotificationController;
import com.north.messenger.api.SearchController;
import com.north.messenger.api.TypingRestController;
import com.north.messenger.api.UserController;
import com.north.messenger.api.VideoConferenceController;
import com.north.messenger.api.WorkspaceController;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.lang.reflect.Method;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OpenApiControllerResponseAnnotationsTest {

    private static final List<Class<?>> REST_CONTROLLERS = List.of(
            AuthController.class,
            ChatAttachmentController.class,
            ChatController.class,
            ChatLinkController.class,
            InviteLinkController.class,
            MessageController.class,
            MobileAuthController.class,
            PendingOutgoingMessageController.class,
            PushNotificationController.class,
            SearchController.class,
            TypingRestController.class,
            UserController.class,
            VideoConferenceController.class,
            WorkspaceController.class
    );

    @Test
    void everyDocumentedOperationShouldDeclareAnExplicitSuccessResponse() {
        List<String> methodsMissingSuccessResponse = REST_CONTROLLERS.stream()
                .flatMap(controller -> Stream.of(controller.getDeclaredMethods()))
                .filter(method -> method.isAnnotationPresent(Operation.class))
                .filter(method -> !hasExplicitSuccessResponse(method))
                .map(method -> method.getDeclaringClass().getSimpleName() + "#" + method.getName())
                .collect(Collectors.toList());

        assertThat(methodsMissingSuccessResponse)
                .as("Swagger-documented operations should expose explicit 2xx success responses")
                .isEmpty();
    }

    private boolean hasExplicitSuccessResponse(Method method) {
        return Stream.of(method.getAnnotationsByType(ApiResponse.class))
                .map(ApiResponse::responseCode)
                .anyMatch(responseCode -> responseCode.startsWith("2"));
    }
}
