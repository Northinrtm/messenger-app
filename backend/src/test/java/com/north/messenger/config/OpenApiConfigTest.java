package com.north.messenger.config;

import io.swagger.v3.oas.models.OpenAPI;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OpenApiConfigTest {

    @Test
    void openApiShouldExposeBearerSchemeAndReusableErrorResponses() {
        OpenAPI openAPI = new OpenApiConfig().northMessengerOpenApi();

        assertThat(openAPI.getComponents()).isNotNull();
        assertThat(openAPI.getComponents().getSecuritySchemes())
                .containsKey("bearerAuth");
        assertThat(openAPI.getComponents().getSchemas())
                .containsKey("ApiError");
        assertThat(openAPI.getComponents().getResponses())
                .containsKeys(
                        "BadRequestError",
                        "UnauthorizedError",
                        "ForbiddenError",
                        "NotFoundError",
                        "ConflictError",
                        "GoneError",
                        "InternalServerError"
                );
    }
}
