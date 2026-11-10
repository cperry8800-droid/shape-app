# Shape Radio's stream server: Icecast 2.4 from Debian, with the station's config written from the
# environment at start (entrypoint.sh). Built by services/station/docker-compose.yml.
FROM debian:bookworm-slim
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends icecast2 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/log/icecast2 /run/station \
 && chown icecast2:icecast /var/log/icecast2 /run/station
# ⚠ /run/station IS MADE HERE, OWNED BY ICECAST (Codex P1 on #2675). It is the station_run volume
# (docker-compose.yml), where the entrypoint writes this start's name for the door. A new named
# volume takes the owner of the directory the image has at its mount point; without one it was
# root's, the write failed under `set -e`, and Icecast never started. The door only reads it.
COPY icecast.xml.template entrypoint.sh /station/
RUN chmod 0755 /station/entrypoint.sh
# Icecast refuses to run as root.
USER icecast2
EXPOSE 8000
ENTRYPOINT ["/station/entrypoint.sh"]
