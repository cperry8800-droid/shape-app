cd /home/user/film; t0=$(date +%s); say(){ echo "[$(( $(date +%s) - t0 ))s] $*"; }; free -m | sed -n 2p
# the first lease ran six chunks at once and the kernel OOM-killed three encoders (8 GB: each x264 at 1440x2560 holds ~1.1 GB, each python ~0.9 GB); three chunks at a time is the ceiling, as v1 measured
pkill -f "bash runFilm2[.]sh"; sleep 1
lb(){ f=$1; r=$(curl -s -m 300 -F reqtype=fileupload -F time=72h -F "fileToUpload=@$f" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) echo "CKPT $f $(md5sum $f | cut -c1-32) $(stat -c %s $f) $r";; *) echo "CKPT-FAIL $f $r";; esac; }
while pgrep -f "film2[.]py" >/dev/null; do sleep 5; done; say SURVIVORS-DONE
for l in log_hl_B.txt log_print_B.txt log_print_C.txt; do echo "$l: $(tail -n 1 $l | cut -c1-110)"; done
for c in hl_B print_B print_C; do lb $c.mp4 & done; wait
for job in "hl A 0-20.0633" "hl C 40.0716-61" "print A 0-20.0633"; do set -- $job; LOOK=$1 NOAUDIO=1 WINDOWS="$3" python3 film2.py $1_$2.mp4 > log_$1_$2.txt 2>&1 & done; wait; say FIXED-CHUNKS-DONE
for l in log_hl_A.txt log_hl_C.txt log_print_A.txt; do echo "$l: $(tail -n 1 $l | cut -c1-110)"; done
for c in hl_A hl_C print_A; do lb $c.mp4 & done; wait
up(){ f=$1; g=$(s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); curl -s -F "file=@$f" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])")
  r=$(curl -s -m 300 -F reqtype=fileupload -F time=72h -F "fileToUpload=@$f" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) l=$r;; *) l=$(curl -s -m 300 -F "files[]=@$f" https://uguu.se/upload | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['url'])" 2>/dev/null);; esac
  echo "UPLOAD $f gofile=$g direct=$l"; }
for look in hl print; do
  for c in A B C; do echo "$look $c $(ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames -of csv=p=0 ${look}_$c.mp4)"; done
  printf "file '${look}_A.mp4'\nfile '${look}_B.mp4'\nfile '${look}_C.mp4'\n" > list_$look.txt
  ffmpeg -y -v error -f concat -safe 0 -i list_$look.txt -i d1.m4a -map 0:v -map 1:a -af "atrim=0:60.083,afade=t=out:st=59.483:d=0.6" -c:v copy -c:a aac -b:a 192k -shortest film_v2_$look.mp4
  md5sum film_v2_$look.mp4; ls -l film_v2_$look.mp4; up film_v2_$look.mp4
done; say RENDER-UPLOAD-DONE
for look in hl print; do python3 verifyF2.py film_v2_$look.mp4 $look; done; say VERIFY-DONE
echo RUNFIX-DONE
