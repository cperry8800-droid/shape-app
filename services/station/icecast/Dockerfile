# Shape Radio's stream server: Icecast 2.4 from Debian, with the station's config written from the
# environment at start (entrypoint.sh). Built by services/station/docker-compose.yml.
FROM debian:bookworm-slim
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends icecast2 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/log/icecast2 \
 && chown icecast2:icecast /var/log/icecast2
COPY icecast.xml.template entrypoint.sh /station/
RUN chmod 0755 /station/entrypoint.sh
# Icecast refuses to run as root.
USER icecast2
EXPOSE 8000
ENTRYPOINT ["/station/entrypoint.sh"]
