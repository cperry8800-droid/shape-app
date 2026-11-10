# Shape Radio's door (door.mjs). Built by services/station/docker-compose.yml.
# Node only; no npm dependencies.
FROM node:22-slim
WORKDIR /app
COPY door.mjs ./
USER node
CMD ["node", "door.mjs"]
