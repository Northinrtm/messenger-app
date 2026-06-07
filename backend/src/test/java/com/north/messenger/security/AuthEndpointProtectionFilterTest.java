package com.north.messenger.security;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthEndpointProtectionFilterTest {

    @Test
    void resolveClientAddressUsesProxyAppendedRightmostForwardedForEntry() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        // A client could forge the first hop; the trusted proxy appends the real client IP last.
        when(request.getHeader("X-Forwarded-For")).thenReturn("9.9.9.9, 203.0.113.5");

        assertThat(AuthEndpointProtectionFilter.resolveClientAddress(request)).isEqualTo("203.0.113.5");
    }

    @Test
    void resolveClientAddressIgnoresTrailingBlankForwardedForSegments() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("X-Forwarded-For")).thenReturn("203.0.113.5,  ");

        assertThat(AuthEndpointProtectionFilter.resolveClientAddress(request)).isEqualTo("203.0.113.5");
    }

    @Test
    void resolveClientAddressFallsBackToRemoteAddrWhenNoForwardedForHeader() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("X-Forwarded-For")).thenReturn(null);
        when(request.getRemoteAddr()).thenReturn("10.0.0.2");

        assertThat(AuthEndpointProtectionFilter.resolveClientAddress(request)).isEqualTo("10.0.0.2");
    }
}
