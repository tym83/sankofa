# The web museum, served by unprivileged nginx on port 8080.
# Build from the repository root so the content and the CLI are in context:
#   docker build -f web/Dockerfile -t sankofa-museum .

FROM golang:1.26-alpine AS data
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY pkg ./pkg
RUN go build -o /out/sankofa ./cmd/sankofa

FROM node:24-alpine AS web
# libvips makes the smaller image copies (scripts/build-media.ts).
RUN apk add --no-cache vips-tools libwebp-tools
WORKDIR /src
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci --no-audit --no-fund
COPY --from=data /out/sankofa /usr/local/bin/sankofa
COPY content ./content
COPY web ./web
# Same steps as web/scripts/build-data.sh, with the prebuilt CLI instead of go run.
RUN set -eu; cd /src; \
    if ls content/chapters/*.md >/dev/null 2>&1; then src=content; else src=web/fixtures; fi; \
    mkdir -p web/public/data web/public/media; \
    sankofa content export "$src/cards" -o web/public/data/cards.json; \
    node web/scripts/build-chapters.ts "$src/chapters" web/public/data/chapters.json; \
    if [ -d "$src/media" ]; then cp -R "$src/media/." web/public/media/; fi; \
    node web/scripts/build-media.ts web/public/media web/public/data/media.json; \
    cd web && npx vite build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web /src/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
