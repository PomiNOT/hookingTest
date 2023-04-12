FROM node:18-alpine

ENV CHROME_BIN="/usr/bin/chromium-browser" \
    NODE_ENV="production"

RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
    chromium

WORKDIR /app
COPY . .
RUN npm install
CMD ["npm start"]
