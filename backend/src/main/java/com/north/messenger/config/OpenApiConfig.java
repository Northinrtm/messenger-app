package com.north.messenger.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.DateTimeSchema;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI northMessengerOpenApi() {
        Components components = new Components()
                .addSecuritySchemes("bearerAuth", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT"))
                .addSchemas("ApiError", new ObjectSchema()
                        .addProperty("timestamp", new DateTimeSchema().description("Server timestamp when the error response was generated"))
                        .addProperty("status", new IntegerSchema().description("HTTP status code"))
                        .addProperty("error", new Schema<String>().type("string").description("Human-readable error summary"))
                        .addProperty("path", new Schema<String>().type("string").description("Request path that produced the error"))
                        .addProperty("details", new ArraySchema()
                                .description("Optional list of field-level or validation details")
                                .items(new Schema<String>().type("string"))))
                .addResponses("BadRequestError", errorResponse(
                        "Request validation failed or payload/query parameters are invalid"
                ))
                .addResponses("UnauthorizedError", errorResponse(
                        "Authentication is required or the supplied access/refresh token is invalid"
                ))
                .addResponses("ForbiddenError", errorResponse(
                        "The authenticated user does not have permission to perform this action"
                ))
                .addResponses("NotFoundError", errorResponse(
                        "The requested resource was not found"
                ))
                .addResponses("ConflictError", errorResponse(
                        "The requested operation conflicts with the current resource state"
                ))
                .addResponses("GoneError", errorResponse(
                        "The referenced token or resource has expired and can no longer be used"
                ))
                .addResponses("InternalServerError", errorResponse(
                        "Unexpected server-side failure"
                ));

        return new OpenAPI()
                .info(new Info()
                        .title("North Messenger HTTP API")
                        .version("v1")
                        .description("REST API for North Messenger. Realtime WebSocket/STOMP message commands are not described in this OpenAPI document."))
                .components(components);
    }

    private ApiResponse errorResponse(String description) {
        return new ApiResponse()
                .description(description)
                .content(new io.swagger.v3.oas.models.media.Content().addMediaType(
                        org.springframework.http.MediaType.APPLICATION_JSON_VALUE,
                        new MediaType().schema(new Schema<>().$ref("#/components/schemas/ApiError"))
                ));
    }
}
