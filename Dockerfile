FROM node:22-slim

# Install curl for healthcheck and obsidian-cli
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Install obsidian-cli (notesmd-cli)
ARG NOTESMD_VERSION=0.3.3
RUN curl -fsSL "https://github.com/Yakitrak/notesmd-cli/releases/download/v${NOTESMD_VERSION}/notesmd-cli_${NOTESMD_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin notesmd-cli && \
    ln -s /usr/local/bin/notesmd-cli /usr/local/bin/obsidian-cli

WORKDIR /app

# Install openclaw globally
RUN npm install -g openclaw@latest

# Copy workspace (agent instructions, skills, etc.)
COPY workspace/ /root/.openclaw/workspace/

# Copy server config template
COPY config/openclaw.json /root/.openclaw/openclaw.json

# Create vault directory
RUN mkdir -p /vault /root/.openclaw/workspace/memory

# Set default vault path for obsidian-cli
RUN obsidian-cli set-default /vault 2>/dev/null || true

ENV NODE_ENV=production

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:18789/health || exit 1

CMD ["openclaw", "gateway", "--port", "18789"]
