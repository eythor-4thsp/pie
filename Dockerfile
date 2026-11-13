FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server-dist/index.mjs"]
