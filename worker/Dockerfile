FROM node:20-slim

# Install curl for Modal API calls and gcloud CLI for GCS operations
RUN apt-get update && apt-get install -y curl gnupg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] http://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add - && \
    apt-get update && apt-get install -y google-cloud-cli && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

# Copy skill files (placed here by the deploy script)
COPY .claude/ .claude/

ENV PROJECT_ROOT=/app
EXPOSE 8081
ENV PORT=8081
CMD ["node", "dist/index.js"]
