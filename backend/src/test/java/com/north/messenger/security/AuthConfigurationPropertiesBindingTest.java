package com.north.messenger.security;

import com.north.messenger.application.auth.EmailVerificationProperties;
import com.north.messenger.application.auth.PasswordResetProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class AuthConfigurationPropertiesBindingTest {

    @Test
    void shouldBindAuthPropertiesFromDefaultConfigurationFiles() {
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(TestApplication.class)
                .profiles("dev")
                .properties("spring.main.web-application-type=none")
                .run()) {
            RefreshTokenCookieProperties refreshCookieProperties = context.getBean(RefreshTokenCookieProperties.class);
            EmailVerificationProperties emailVerificationProperties = context.getBean(EmailVerificationProperties.class);
            PasswordResetProperties passwordResetProperties = context.getBean(PasswordResetProperties.class);

            assertThat(refreshCookieProperties.name()).isEqualTo("north_refresh_token");
            assertThat(refreshCookieProperties.path()).isEqualTo("/api/auth");
            assertThat(refreshCookieProperties.sameSite()).isEqualTo("Lax");
            assertThat(refreshCookieProperties.secure()).isFalse();

            assertThat(emailVerificationProperties.enabled()).isFalse();
            assertThat(emailVerificationProperties.tokenTtl()).isEqualTo(Duration.ofHours(24));
            assertThat(emailVerificationProperties.urlBase()).isEqualTo("http://localhost:5173/");

            assertThat(passwordResetProperties.enabled()).isFalse();
            assertThat(passwordResetProperties.tokenTtl()).isEqualTo(Duration.ofMinutes(30));
            assertThat(passwordResetProperties.urlBase()).isEqualTo("http://localhost:5173/");
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties({
            RefreshTokenCookieProperties.class,
            EmailVerificationProperties.class,
            PasswordResetProperties.class
    })
    static class TestApplication {
    }
}
