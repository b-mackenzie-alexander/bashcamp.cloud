FROM node:22-bookworm-slim

ENV NODE_ENV=production
ARG TTYD_VERSION=1.7.7

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
     > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) ttyd_arch="x86_64"; ttyd_sha256="8a217c968aba172e0dbf3f34447218dc015bc4d5e59bf51db2f2cd12b7be4f55" ;; \
    arm64) ttyd_arch="aarch64"; ttyd_sha256="b38acadd89d1d396a0f5649aa52c539edbad07f4bc7348b27b4f4b7219dd4165" ;; \
    *) echo "Unsupported architecture for ttyd: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${ttyd_arch}" -o /usr/local/bin/ttyd; \
  echo "${ttyd_sha256}  /usr/local/bin/ttyd" | sha256sum -c -; \
  chmod 0755 /usr/local/bin/ttyd; \
  ttyd --version

WORKDIR /app/api

COPY api/package*.json ./
RUN npm ci --omit=dev

COPY api/ ./

EXPOSE 3000

CMD ["npm", "start"]
