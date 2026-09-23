# Build from repository root:
#   docker build -f backend/Dockerfile .
FROM golang:1.27-bookworm AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
COPY migrations ./migrations
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/api \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/migrate ./cmd/migrate

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /out/migrate /app/migrate
COPY --from=build /src/migrations /app/migrations
ENV MIGRATIONS_DIR=/app/migrations
ENV API_ADDR=:8080
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/api"]
