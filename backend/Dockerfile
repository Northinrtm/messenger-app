FROM public.ecr.aws/docker/library/maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /workspace

COPY pom.xml .

RUN mvn -B \
      -DskipTests \
      -Dmaven.wagon.http.retryHandler.count=5 \
      -Dmaven.wagon.http.retryHandler.requestSentEnabled=true \
      dependency:go-offline

COPY src src

RUN mvn -B \
      -DskipTests \
      -Dmaven.wagon.http.retryHandler.count=5 \
      -Dmaven.wagon.http.retryHandler.requestSentEnabled=true \
      package

FROM public.ecr.aws/docker/library/eclipse-temurin:17-jre
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /workspace/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
