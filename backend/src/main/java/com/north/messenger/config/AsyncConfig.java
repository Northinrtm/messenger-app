package com.north.messenger.config;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.jvm.ExecutorServiceMetrics;
import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class AsyncConfig {

    @Bean(name = "messageDispatchExecutor")
    public Executor messageDispatchExecutor(
            MeterRegistry meterRegistry,
            @Value("${app.async.message-dispatch.core-pool-size:4}") int corePoolSize,
            @Value("${app.async.message-dispatch.max-pool-size:16}") int maxPoolSize,
            @Value("${app.async.message-dispatch.queue-capacity:500}") int queueCapacity
    ) {
        return buildMonitoredExecutor(
                meterRegistry,
                "message-dispatch-",
                corePoolSize,
                maxPoolSize,
                queueCapacity,
                "messenger.message.dispatch.executor"
        );
    }

    @Bean(name = "pushNotificationExecutor")
    public Executor pushNotificationExecutor(
            MeterRegistry meterRegistry,
            @Value("${app.async.push-notification.core-pool-size:2}") int corePoolSize,
            @Value("${app.async.push-notification.max-pool-size:8}") int maxPoolSize,
            @Value("${app.async.push-notification.queue-capacity:200}") int queueCapacity
    ) {
        return buildMonitoredExecutor(
                meterRegistry,
                "push-notify-",
                corePoolSize,
                maxPoolSize,
                queueCapacity,
                "messenger.push.notification.executor"
        );
    }

    @Bean(name = "e2eeMaintenanceExecutor")
    public Executor e2eeMaintenanceExecutor(
            MeterRegistry meterRegistry,
            @Value("${app.async.e2ee-maintenance.core-pool-size:2}") int corePoolSize,
            @Value("${app.async.e2ee-maintenance.max-pool-size:8}") int maxPoolSize,
            @Value("${app.async.e2ee-maintenance.queue-capacity:1000}") int queueCapacity
    ) {
        return buildMonitoredExecutor(
                meterRegistry,
                "e2ee-maintenance-",
                corePoolSize,
                maxPoolSize,
                queueCapacity,
                "messenger.e2ee.maintenance.executor"
        );
    }

    private Executor buildMonitoredExecutor(
            MeterRegistry meterRegistry,
            String threadNamePrefix,
            int corePoolSize,
            int maxPoolSize,
            int queueCapacity,
            String metricName
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.max(1, corePoolSize));
        executor.setMaxPoolSize(Math.max(Math.max(1, corePoolSize), maxPoolSize));
        executor.setQueueCapacity(Math.max(0, queueCapacity));
        executor.setThreadNamePrefix(threadNamePrefix);
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.initialize();
        ExecutorServiceMetrics.monitor(
                meterRegistry,
                executor.getThreadPoolExecutor(),
                metricName
        );
        return executor;
    }
}
