package com.north.messenger.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProductionDeploymentConfigTest {

    private static final Path REPO_ROOT = Path.of("..").toAbsolutePath().normalize();

    @Test
    void productionComposeShouldAllowMissingPrometheusScrapeCredentialsUntilRuntime() throws Exception {
        String compose = readRepoFile("docker-compose.prod.yml");

        assertThat(compose)
                .contains("APP_REALTIME_REDIS_ENABLED: ${APP_REALTIME_REDIS_ENABLED:-true}")
                .contains("APP_AUTH_RATE_LIMIT_REDIS_ENABLED: ${APP_AUTH_RATE_LIMIT_REDIS_ENABLED:-true}")
                .contains("APP_REALTIME_REDIS_MAC_SECRET: ${APP_REALTIME_REDIS_MAC_SECRET:-}")
                .doesNotContain("APP_E2EE_")
                .doesNotContain("vault:")
                .doesNotContain("container_name: messenger-backend")
                .doesNotContain("container_name: messenger-web")
                .contains("APP_ACTUATOR_SCRAPE_USERNAME: ${APP_ACTUATOR_SCRAPE_USERNAME:-}")
                .contains("APP_ACTUATOR_SCRAPE_PASSWORD: ${APP_ACTUATOR_SCRAPE_PASSWORD:-}")
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
    void edgeShouldRouteApiAndWebsocketTrafficDirectlyToBackend() throws Exception {
        String caddyfile = readRepoFile("deploy", "Caddyfile");

        assertThat(caddyfile)
                .contains("@backend_websocket")
                .contains("path /ws /ws/*")
                .contains("log_name ws_access")
                .contains("@backend_api path /api/*")
                .contains("@backend_docs")
                .contains("path /v3/api-docs /v3/api-docs/* /v3/api-docs.yaml /swagger-ui /swagger-ui/* /swagger-ui.html")
                .contains("reverse_proxy backend:8080")
                .contains("reverse_proxy web:80");
    }

    @Test
    void remoteUpdateShouldRollRuntimeServicesInDependencyOrder() throws Exception {
        String script = readRepoFile("deploy", "remote-update.sh");

        assertThat(script)
                .contains("wait_for_service_ready()")
                .contains("deploy_runtime_service()")
                .contains("acquire_deploy_lock()")
                .contains("DEPLOY_LOCK_FILE")
                .contains("flock -w \"$DEPLOY_LOCK_WAIT_SECONDS\" 9")
                .contains("deploy_order=(backend web edge)")
                .contains("deploy_runtime_service \"$service\" \"$(scale_for_service \"$service\")\"")
                .doesNotContain("up -d --no-deps --force-recreate \"${runtime_scale_args[@]}\" $RUNTIME_SERVICES");
    }

    @Test
    void docsShouldDescribeServerTrustedMessagingAndAvoidWeakPrometheusFallback() throws Exception {
        String readme = readRepoFile("README.md");
        String productionRunbook = readRepoFile("deploy", "PRODUCTION.md");

        assertThat(readme)
                .contains("server-trusted")
                .contains("PlainMessagePayload")
                .contains("This project must not be described as E2EE.")
                .contains("Swagger UI: `/swagger-ui.html`")
                .contains("OpenAPI JSON: `/v3/api-docs`")
                .doesNotContain("APP_E2EE_")
                .doesNotContain("Vault Transit")
                .doesNotContain("prometheus/prometheus");
        assertThat(productionRunbook)
                .contains("server-trusted")
                .contains("Do not describe the product as E2EE.")
                .doesNotContain("APP_E2EE_")
                .doesNotContain("vault-transit")
                .doesNotContain("deploy/vault/bootstrap-transit.sh")
                .doesNotContain("prometheus/prometheus");
    }

    private String readRepoFile(String first, String... more) throws IOException {
        return Files.readString(REPO_ROOT.resolve(Path.of(first, more)));
    }
}
