FROM node:18-alpine
ENV PORT=8080
ENV IS_DOCKER=1
ENV CHROME_BIN="/usr/bin/chromium-browser" \
    NODE_ENV="production"
RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
    chromium bash
RUN adduser --shell /sbin/nologin --disabled-password runner
WORKDIR /home/runner/app
COPY . .
RUN npm install
USER runner
CMD ["npm", "run", "start-prod"]
