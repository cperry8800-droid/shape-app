# Nora's engine (README.md). Build from this folder:
#   docker build -t nora-engine services/nora-engine
# Node and ffmpeg only; the engine has no npm dependencies.
FROM node:22-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json engine.mjs mixer.mjs main.mjs ./
USER node
CMD ["node", "main.mjs"]
