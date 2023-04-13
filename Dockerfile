FROM node:18-alpine AS builder
WORKDIR /src
COPY . .
RUN npm install
RUN npm run build

FROM node:18-alpine
EXPOSE 8080
ENV CHROME_BIN="/usr/bin/chromium-browser" \
    NODE_ENV="production"
RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
    chromium
WORKDIR /home/runner/app
COPY --from=builder /src/dist ./dist
RUN adduser --shell /sbin/nologin --disabled-password runner
USER runner
CMD ["node", "dist/server.js"]