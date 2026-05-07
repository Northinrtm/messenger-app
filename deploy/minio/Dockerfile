FROM public.ecr.aws/docker/library/alpine:3.20

COPY deploy/minio/bin/minio /usr/local/bin/minio

RUN chmod +x /usr/local/bin/minio

EXPOSE 9000 9001

ENTRYPOINT ["/usr/local/bin/minio"]
