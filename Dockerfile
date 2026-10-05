FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_FILE=/data/data.json TZ=Asia/Jakarta
RUN apk add --no-cache tzdata
COPY package.json server.js ./
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- "http://127.0.0.1:8080/api?action=health" || exit 1
CMD ["node", "server.js"]
