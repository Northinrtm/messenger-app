FROM node:22-alpine AS build
WORKDIR /app

COPY package.json .
COPY package-lock.json .
COPY tsconfig.json .
COPY vite.config.ts .
COPY index.html .
COPY src src

ARG VITE_API_URL=/
ARG VITE_WS_URL=

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

RUN npm ci
RUN npm run build

FROM nginx:1.29-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
