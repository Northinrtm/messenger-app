package com.north.messenger.application.message;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MessageLinkExtractorTest {

    private final MessageLinkExtractor extractor = new MessageLinkExtractor();

    @Test
    void extractLinksShouldKeepDistinctHttpUrlsInMessageOrder() {
        List<MessageLinkExtractor.ExtractedMessageLink> links = extractor.extractLinks(
                "Read https://example.com/docs and https://example.com/docs plus https://north.test/path?q=1."
        );

        assertThat(links)
                .extracting(MessageLinkExtractor.ExtractedMessageLink::url)
                .containsExactly("https://example.com/docs", "https://north.test/path?q=1");
        assertThat(links)
                .extracting(MessageLinkExtractor.ExtractedMessageLink::positionIndex)
                .containsExactly(0, 1);
    }

    @Test
    void extractLinksShouldTrimCommonTrailingPunctuation() {
        List<MessageLinkExtractor.ExtractedMessageLink> links = extractor.extractLinks(
                "One (https://example.com/path), two https://north.test/ok! and https://alpha.test/demo)."
        );

        assertThat(links)
                .extracting(MessageLinkExtractor.ExtractedMessageLink::url)
                .containsExactly(
                        "https://example.com/path",
                        "https://north.test/ok",
                        "https://alpha.test/demo"
                );
    }
}
