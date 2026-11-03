# Shape Radio's standby loop (standby.sh). Built by services/station/docker-compose.yml.
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY standby.sh /station/standby.sh
RUN chmod 0755 /station/standby.sh
USER nobody
ENV TMPDIR=/tmp
ENTRYPOINT ["/station/standby.sh"]
