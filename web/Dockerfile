FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json .
COPY package-lock.json .
COPY tsconfig.json .
COPY vite.config.ts .
COPY index.html .
COPY public public
COPY scripts scripts
COPY src src

ARG VITE_API_URL=/
ARG VITE_APP_REVISION=dev
ARG VITE_WS_URL=
ARG VITE_JITSI_BASE_URL=http://localhost:8090

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_REVISION=${VITE_APP_REVISION}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_JITSI_BASE_URL=${VITE_JITSI_BASE_URL}

RUN npm ci --no-audit --no-fund
RUN npm run build

FROM public.ecr.aws/docker/library/nginx:1.29-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
