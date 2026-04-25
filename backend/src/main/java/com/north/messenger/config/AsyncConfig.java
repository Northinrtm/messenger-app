package com.north.messenger.config;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.jvm.ExecutorServiceMetrics;
import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class AsyncConfig {

    @Bean(name = "messageDispatchExecutor")
    public Executor messageDispatchExecutor(MeterRegistry meterRegistry) {
        return buildMonitoredExecutor(
                meterRegistry,
                "message-dispatch-",
                4,
                16,
                500,
                "messenger.message.dispatch.executor"
        );
    }

    @Bean(name = "pushNotificationExecutor")
    public Executor pushNotificationExecutor(MeterRegistry meterRegistry) {
        return buildMonitoredExecutor(
                meterRegistry,
                "push-notify-",
                2,
                8,
                200,
                "messenger.push.notification.executor"
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
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
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
