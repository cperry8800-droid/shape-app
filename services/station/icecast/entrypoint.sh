#!/bin/sh
# Shape Radio's stream server: writes icecast.xml from the template and the environment, then runs
# Icecast in the foreground. Refuses to start on a missing or unsafe value rather than serve a
# station with a blank or guessable password.
#
#   ICECAST_SOURCE_PASSWORD  the engine's and the standby loop's password (letters and digits, 16+)
#   ICECAST_ADMIN_PASSWORD   Icecast's admin password (letters and digits, 16+)
#   STATION_HOST             the station's public name, e.g. radio.theshapecommunity.com
#   SHAPE_URL                Shape's address, which checks each listener's pass, e.g.
#                            https://www.theshapecommunity.com (https; plain http only on this machine)
#   NORA_ENGINE_TOKEN        the engine's token: the station signs in with it as it tells Shape who
#                            joins and leaves (32 or more letters, digits, . _ ~ -)
#   ICECAST_ADMIN_EMAIL      optional, shown on Icecast's status page
#   ICECAST_MAX_LISTENERS    optional, default 2000
#   ICECAST_PORT             optional, default 8000
#   ICECAST_CONFIG           optional, where to write the config (default /tmp/icecast.xml)
#   ICECAST_LOG_DIR          optional, default /var/log/icecast2
set -eu

here=$(dirname "$0")
template=${ICECAST_TEMPLATE:-$here/icecast.xml.template}
out=${ICECAST_CONFIG:-/tmp/icecast.xml}

fail() { echo "station: $1" >&2; exit 2; }

# Letters and digits only: each password also sits inside the engine's icecast:// address and this
# XML file, where @ : / & < and the like would break them.
safe() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9]{16,128}$'; }
safe "${ICECAST_SOURCE_PASSWORD:-}" || fail 'ICECAST_SOURCE_PASSWORD must be 16 or more letters and digits (openssl rand -hex 24)'
safe "${ICECAST_ADMIN_PASSWORD:-}" || fail 'ICECAST_ADMIN_PASSWORD must be 16 or more letters and digits (openssl rand -hex 24)'
[ "$ICECAST_SOURCE_PASSWORD" != "$ICECAST_ADMIN_PASSWORD" ] || fail 'the two passwords must differ'
printf '%s' "${STATION_HOST:-}" | grep -Eq '^[A-Za-z0-9.-]{1,253}$' || fail 'STATION_HOST must be a host name, e.g. radio.theshapecommunity.com'
# The listeners' door: each pass goes to Shape over HTTPS (a pass in clear text is a pass anyone on
# the way could reuse), but for a Shape on this same machine.
SHAPE_URL=${SHAPE_URL:-}
printf '%s' "$SHAPE_URL" | grep -Eq '^(https://[A-Za-z0-9.-]+|http://(127\.0\.0\.1|localhost))(:[0-9]{2,5})?$' \
  || fail 'SHAPE_URL must be https://<host> (Shape, which checks each listener’s pass)'
# Each listener's session is kept (part 4): the station signs in on its calls, and names this start
# of it, so a session the last start left open is known to have ended by now.
printf '%s' "${NORA_ENGINE_TOKEN:-}" | grep -Eq '^[A-Za-z0-9._~-]{32,}$' \
  || fail 'NORA_ENGINE_TOKEN must be the engine token (32 or more characters), the same as in Vercel'
STATION_TOKEN=$NORA_ENGINE_TOKEN
# ⚠ A SECOND BEFORE NAMING THIS START (Codex, #2582). Shape orders the station's starts by the
# second each was named in, and a session the last start left open ends at the next one. A restart
# inside the same second would share it, and the earlier start's open sessions would never end. A
# start begins after the one before it ended, so waiting a second puts its second after that one's.
sleep 1
BOOT="$(date -u +%s).$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s' "$BOOT" | grep -Eq '^[0-9]{9,11}\.[0-9a-f]{16}$' || fail 'could not name this start of the station'
LISTENER_AUTH_URL="$SHAPE_URL/api/radio/pass?boot=$BOOT"
ICECAST_ADMIN_EMAIL=${ICECAST_ADMIN_EMAIL:-radio@theshapecommunity.com}
printf '%s' "$ICECAST_ADMIN_EMAIL" | grep -Eq '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$' || fail 'ICECAST_ADMIN_EMAIL is not an email address'
ICECAST_MAX_LISTENERS=${ICECAST_MAX_LISTENERS:-2000}
printf '%s' "$ICECAST_MAX_LISTENERS" | grep -Eq '^[0-9]{1,6}$' || fail 'ICECAST_MAX_LISTENERS must be a number'
ICECAST_PORT=${ICECAST_PORT:-8000}
printf '%s' "$ICECAST_PORT" | grep -Eq '^[0-9]{2,5}$' || fail 'ICECAST_PORT must be a port number'
ICECAST_LOG_DIR=${ICECAST_LOG_DIR:-/var/log/icecast2}
printf '%s' "$ICECAST_LOG_DIR" | grep -Eq '^/[A-Za-z0-9._/-]+$' || fail 'ICECAST_LOG_DIR must be an absolute path'

# Every value was checked above, so a plain substitution is safe; nothing else in the template is
# touched.
sed -e "s|\${ICECAST_SOURCE_PASSWORD}|$ICECAST_SOURCE_PASSWORD|g" \
    -e "s|\${ICECAST_ADMIN_PASSWORD}|$ICECAST_ADMIN_PASSWORD|g" \
    -e "s|\${STATION_HOST}|$STATION_HOST|g" \
    -e "s|\${ICECAST_ADMIN_EMAIL}|$ICECAST_ADMIN_EMAIL|g" \
    -e "s|\${ICECAST_MAX_LISTENERS}|$ICECAST_MAX_LISTENERS|g" \
    -e "s|\${ICECAST_LOG_DIR}|$ICECAST_LOG_DIR|g" \
    -e "s|\${ICECAST_PORT}|$ICECAST_PORT|g" \
    -e "s|\${LISTENER_AUTH_URL}|$LISTENER_AUTH_URL|g" \
    -e "s|\${STATION_TOKEN}|$STATION_TOKEN|g" \
    "$template" > "$out"
chmod 600 "$out"
if grep -q '\${' "$out"; then fail "a value in $template was left unfilled"; fi

[ "${ICECAST_CHECK_ONLY:-}" = 1 ] && exit 0
exec icecast2 -c "$out"
