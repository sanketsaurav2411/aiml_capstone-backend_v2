FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p /app/uploads /app/data && \
    chown -R node:node /app

USER node

EXPOSE 4000

CMD ["node", "src/server.js"]
