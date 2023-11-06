FROM node:18-alpine3.18

ENV PORT=8080
ENV IS_DOCKER=1
ENV CHROME_BIN="/usr/bin/chromium-browser"
ENV NODE_ENV="production"

RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
    chromium bash dumb-init ca-certificates iptables ip6tables tailscale

RUN adduser --shell /sbin/nologin --disabled-password runner
WORKDIR /home/runner/app
COPY . .
RUN npm install
USER runner
ENTRYPOINT ["./entrypoint.sh"]
