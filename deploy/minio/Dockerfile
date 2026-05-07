FROM public.ecr.aws/docker/library/alpine:3.20

ARG MINIO_RELEASE=RELEASE.2025-02-03T21-03-04Z

RUN apk add --no-cache ca-certificates curl \
    && curl -fsSLo /usr/local/bin/minio \
      -4 \
      --retry 5 \
      --retry-all-errors \
      --connect-timeout 60 \
      --max-time 900 \
      "https://github.com/minio/minio/releases/download/${MINIO_RELEASE}/minio.linux-amd64.${MINIO_RELEASE}" \
    && chmod +x /usr/local/bin/minio

EXPOSE 9000 9001

ENTRYPOINT ["/usr/local/bin/minio"]
