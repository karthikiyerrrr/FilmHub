FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc
RUN npm prune --production

EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/index.js"]
