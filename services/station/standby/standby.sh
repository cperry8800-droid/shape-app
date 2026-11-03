#!/bin/sh
# Shape Radio's standby loop: always on the server's /standby mount, so a listener whose music
# stops (the engine restarting, Shape out of reach, nothing licensed to play) hears this instead of
# silence or a dropped connection, and goes back to the music the moment it returns.
#
# It plays STANDBY_FILE on a loop (any audio file ffmpeg reads: a Shape ident, an ambient bed the
# owner has the rights to). Without one it makes its own: a quiet, slowly moving chord with no
# melody, no voice and no recording, so it needs no licence and reports no plays.
#
#   ICECAST_SOURCE_PASSWORD  as the server's
#   ICECAST_HOST             default icecast:8000
#   STANDBY_FILE             optional, e.g. /standby/standby.mp3
#   NORA_BITRATE             default 192k (the same as the engine's, so players cross without a hitch)
set -eu

host=${ICECAST_HOST:-icecast:8000}
bitrate=${NORA_BITRATE:-192k}
printf '%s' "${ICECAST_SOURCE_PASSWORD:-}" | grep -Eq '^[A-Za-z0-9]{16,128}$' \
  || { echo 'standby: ICECAST_SOURCE_PASSWORD must be 16 or more letters and digits' >&2; exit 2; }
printf '%s' "$bitrate" | grep -Eq '^[0-9]{2,3}k$' || { echo 'standby: NORA_BITRATE must look like 192k' >&2; exit 2; }

file=${STANDBY_FILE:-}
if [ -z "$file" ] || [ ! -r "$file" ]; then
  [ -n "$file" ] && echo "standby: $file cannot be read; playing the built-in loop" >&2
  file=${TMPDIR:-/tmp}/standby-default.flac
  if [ ! -s "$file" ]; then
    # 60 s that loop without a seam: every tone and every swell completes whole cycles in a minute.
    ffmpeg -hide_banner -v error -y -f lavfi -i "aevalsrc='\
0.050*sin(2*PI*110*t)*(0.75+0.25*sin(2*PI*t/20))+\
0.040*sin(2*PI*9890/60*t)*(0.7+0.3*sin(2*PI*t/15))+\
0.034*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*t/12))+\
0.026*sin(2*PI*277.25*t)*(0.5+0.5*sin(2*PI*t/30))+\
0.020*sin(2*PI*329.6*t)*(0.5+0.5*sin(2*PI*t/10))|\
0.050*sin(2*PI*110*t)*(0.75+0.25*sin(2*PI*t/20+1))+\
0.040*sin(2*PI*9890/60*t)*(0.7+0.3*sin(2*PI*t/15+1))+\
0.034*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*t/12+1))+\
0.026*sin(2*PI*277.25*t)*(0.5+0.5*sin(2*PI*t/30+1))+\
0.020*sin(2*PI*329.6*t)*(0.5+0.5*sin(2*PI*t/10+1))':s=44100:d=60" -c:a flac "$file"
  fi
fi

echo "standby: looping $(basename "$file") into $host/standby"
# The server restarting drops this connection: connect again, for as long as the container runs.
while :; do
  ffmpeg -hide_banner -v error -re -stream_loop -1 -i "$file" -vn -ac 2 -ar 44100 \
    -c:a libmp3lame -b:a "$bitrate" -f mp3 \
    -content_type audio/mpeg -ice_name 'Shape Radio' -ice_description 'Shape Radio' \
    "icecast://source:${ICECAST_SOURCE_PASSWORD}@${host}/standby" || true
  sleep 2
done
