package com.north.messenger.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RefreshTokenCookiePropertiesTest {

    @Test
    void shouldRejectBlankName() {
        assertThatThrownBy(() -> new RefreshTokenCookieProperties(" ", "/api/auth", "Lax", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.auth.refresh-cookie.name must be configured");
    }

    @Test
    void shouldRejectBlankPath() {
        assertThatThrownBy(() -> new RefreshTokenCookieProperties("north_refresh_token", " ", "Lax", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.auth.refresh-cookie.path must be configured");
    }

    @Test
    void shouldRejectBlankSameSite() {
        assertThatThrownBy(() -> new RefreshTokenCookieProperties("north_refresh_token", "/api/auth", " ", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("app.auth.refresh-cookie.same-site must be configured");
    }
}
