package com.north.messenger.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProductionDeploymentConfigTest {

    private static final Path REPO_ROOT = Path.of("..").toAbsolutePath().normalize();

    @Test
    void productionComposeShouldRequireExplicitPrometheusScrapeCredentials() throws Exception {
        String compose = readRepoFile("docker-compose.prod.yml");

        assertThat(compose)
                .contains("APP_ACTUATOR_SCRAPE_USERNAME: ${APP_ACTUATOR_SCRAPE_USERNAME:?APP_ACTUATOR_SCRAPE_USERNAME must be set}")
                .contains("APP_ACTUATOR_SCRAPE_PASSWORD: ${APP_ACTUATOR_SCRAPE_PASSWORD:?APP_ACTUATOR_SCRAPE_PASSWORD must be set}")
                .doesNotContain(":-prometheus");
    }

    @Test
    void prometheusBootstrapScriptShouldFailClosedWhenScrapeCredentialsAreMissing() throws Exception {
        String script = readRepoFile("deploy", "observability", "start-prometheus.sh");

        assertThat(script)
                .contains(": \"${APP_ACTUATOR_SCRAPE_USERNAME:?APP_ACTUATOR_SCRAPE_USERNAME must be set}\"")
                .contains(": \"${APP_ACTUATOR_SCRAPE_PASSWORD:?APP_ACTUATOR_SCRAPE_PASSWORD must be set}\"")
                .doesNotContain(":-prometheus");
    }

    @Test
    void docsShouldNotDescribeWeakPrometheusFallbackOrLegacyCryptoScheme() throws Exception {
        String readme = readRepoFile("README.md");
        String productionRunbook = readRepoFile("deploy", "PRODUCTION.md");

        assertThat(readme)
                .contains("X3DH-DEVICE-AES-GCM")
                .contains("GROUP-SENDER-KEY-AES-GCM")
                .doesNotContain("RSA-OAEP + AES-GCM")
                .doesNotContain("prometheus/prometheus");
        assertThat(productionRunbook).doesNotContain("prometheus/prometheus");
    }

    private String readRepoFile(String first, String... more) throws IOException {
        return Files.readString(REPO_ROOT.resolve(Path.of(first, more)));
    }
}
