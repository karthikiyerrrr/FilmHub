FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc
RUN npm prune --production

EXPOSE 8081
ENV PORT=8081
CMD ["node", "dist/index.js"]
