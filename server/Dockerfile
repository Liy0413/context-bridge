FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/data && chown -R node:node /app
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 8787
CMD ["node", "dist/src/index.js"]
