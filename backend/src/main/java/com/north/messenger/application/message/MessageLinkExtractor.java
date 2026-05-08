package com.north.messenger.application.message;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
class MessageLinkExtractor {

    private static final Pattern LINK_PATTERN = Pattern.compile("(?i)\\bhttps?://[^\\s<>\"']+");

    List<ExtractedMessageLink> extractLinks(String plainContent) {
        if (plainContent == null || plainContent.isBlank()) {
            return List.of();
        }

        Matcher matcher = LINK_PATTERN.matcher(plainContent);
        Set<String> seenUrls = new LinkedHashSet<>();
        List<ExtractedMessageLink> extractedLinks = new ArrayList<>();
        while (matcher.find()) {
            String sanitized = sanitizeCandidate(matcher.group());
            if (sanitized == null || !seenUrls.add(sanitized)) {
                continue;
            }
            extractedLinks.add(new ExtractedMessageLink(sanitized, extractedLinks.size()));
        }

        return extractedLinks;
    }

    private String sanitizeCandidate(String candidate) {
        String trimmed = trimTrailingNoise(candidate);
        if (trimmed.isEmpty()) {
            return null;
        }

        try {
            URI uri = new URI(trimmed);
            String scheme = uri.getScheme();
            if (scheme == null) {
                return null;
            }
            String normalizedScheme = scheme.toLowerCase(Locale.ROOT);
            if (!normalizedScheme.equals("http") && !normalizedScheme.equals("https")) {
                return null;
            }
            if ((uri.getHost() == null || uri.getHost().isBlank())
                    && (uri.getRawAuthority() == null || uri.getRawAuthority().isBlank())) {
                return null;
            }
            return uri.toString();
        } catch (URISyntaxException exception) {
            return null;
        }
    }

    private String trimTrailingNoise(String value) {
        String candidate = value.trim();
        while (!candidate.isEmpty()) {
            char lastCharacter = candidate.charAt(candidate.length() - 1);
            if (".,!?;:".indexOf(lastCharacter) >= 0) {
                candidate = candidate.substring(0, candidate.length() - 1);
                continue;
            }
            if (lastCharacter == ')' && countCharacter(candidate, '(') < countCharacter(candidate, ')')) {
                candidate = candidate.substring(0, candidate.length() - 1);
                continue;
            }
            if (lastCharacter == ']' && countCharacter(candidate, '[') < countCharacter(candidate, ']')) {
                candidate = candidate.substring(0, candidate.length() - 1);
                continue;
            }
            if (lastCharacter == '}' && countCharacter(candidate, '{') < countCharacter(candidate, '}')) {
                candidate = candidate.substring(0, candidate.length() - 1);
                continue;
            }
            break;
        }
        return candidate;
    }

    private int countCharacter(String value, char target) {
        int count = 0;
        for (int index = 0; index < value.length(); index += 1) {
            if (value.charAt(index) == target) {
                count += 1;
            }
        }
        return count;
    }

    record ExtractedMessageLink(String url, int positionIndex) {
    }
}
