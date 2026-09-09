# runFilm4.sh -- the v4 lease: no dancer; the runner retimed onto the beat (a motion-interpolated copy, then beatwarp.py); eight beams on the globe and the mark on each; the sphere larger; the thinner outline. Inputs, the grid, three chunks at a time per look, mux, upload, verify.
cd /home/user/film; t0=$(date +%s); say(){ echo "[$(( $(date +%s) - t0 ))s] $*"; }; echo "cores $(nproc)"; free -m | sed -n 2p
PFX=https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY
LOOKS=${LOOKS:-"hl print"}
for f in film4.py plan4.json beat.py meas_d1.py verifyF4.py beatwarp.py; do [ -s $f ] || { echo "FATAL missing $f"; exit 1; }; done
for pair in "lifter 2ebb9cb6-6fdf-4fda-a507-c08826d10e95 hf_20260909_215442" "cook 7d43a9f8-79ab-42f6-9428-cdb35661c89b hf_20260909_215531" "yoga a09bbd21-1e5f-4460-8877-bfc75d3a76ec hf_20260909_215442" "cyclist 1fa776d0-1152-433c-bd25-7d0ab2c5681a hf_20260909_215531" "coach a51833aa-0ff6-417a-913d-9f620f786ba9 hf_20260909_215531" "skipper bb8f5cfd-7e87-4cff-aa2e-e46ae4a0c248 hf_20260909_215442" "driver c2d4d7aa-92cf-4589-a67c-2d3b1e9ccd57 hf_20260909_215042"; do set -- $pair; [ -s fig_$1.mp4 ] || curl -sfL -o fig_$1.mp4 $PFX/$3_$2.mp4 & done
[ -s runner.mp4 ] || curl -sfL -o runner.mp4 $PFX/hf_20260909_220042_ab1df882-c1b0-401a-9801-883c855f8596.mp4 &
[ -s globe.mp4 ] || curl -sfL -o globe.mp4 $PFX/hf_20260909_220639_9e7a3719-87d9-4363-b05b-8897168bf8b9.mp4 &
[ -s d1.m4a ] || curl -sfL -o d1.m4a $PFX/hf_20260908_212940_35ca8b30-6459-46e7-8fa0-7b0196f6ac69.m4a &
[ -s logo.png ] || curl -sfL -o logo.png https://raw.githubusercontent.com/cperry8800-droid/shape-app/main/public/SHAPE-logo-teal-white.png &
[ -s Newsreader.ttf ] || curl -sfL -o Newsreader.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf" &
wait
[ -s tri.png ] || python3 -c "from PIL import Image;Image.open('logo.png').convert('RGBA').crop((1551,200,2169,990)).save('tri.png')"
[ -s meas_d1.json ] || python3 meas_d1.py; md5sum meas_d1.json; say GRID-OK
# the runner onto the beat: a motion-interpolated copy (HIFPS, default 48) of the clip's first HISEC seconds at its own 720x1280 -- the page uses ~6 s of source at 0.59x, and minterpolate runs at ~2-3 fps at this size, so the whole clip at 96 fps would outrun the lease -- then every footfall mapped to a beat
P=$(python3 -c "import json;print(json.load(open('meas_d1.json'))['P'])"); HIFPS=${HIFPS:-48}; HISEC=${HISEC:-7.2}
[ -s runner_hi.mp4 ] || ffmpeg -v error -y -i runner.mp4 -t $HISEC -vf "minterpolate=fps=$HIFPS:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" -an -c:v libx264 -preset veryfast -crf 12 -pix_fmt yuv420p runner_hi.mp4
say INTERP-DONE; ffprobe -v error -select_streams v -count_frames -show_entries stream=r_frame_rate,nb_read_frames:format=duration -of csv=p=0 runner_hi.mp4 | tr '\n' ' '; echo
[ -s runner_beat.mp4 ] || python3 beatwarp.py runner.mp4 runner_hi.mp4 runner_beat.mp4 $P
say WARP-DONE; ffprobe -v error -select_streams v -count_frames -show_entries stream=width,height,nb_read_frames:format=duration -of csv=p=0 runner_beat.mp4 | tr '\n' ' '; echo; cat footfalls.json; echo
RB=$(ffprobe -v error -show_entries format=duration -of csv=p=0 runner_beat.mp4); python3 -c "import sys; d=float('$RB'); sys.exit(0 if d>=10.4 else 1)" || { echo "FATAL runner_beat.mp4 is $RB s; the runner page needs 10.34 s (raise HISEC)"; exit 1; }
md5sum fig_*.mp4 runner.mp4 runner_hi.mp4 runner_beat.mp4 globe.mp4 d1.m4a tri.png Newsreader.ttf film4.py plan4.json verifyF4.py beatwarp.py beat.py meas_d1.py runFilm4.sh; say INPUTS-OK
[ "$STAGE" = prep ] && { say PREP-DONE; exit 0; }
for look in $LOOKS; do
  LOOK=$look NOAUDIO=1 WINDOWS="0-20.0633" python3 film4.py ${look}_A.mp4 > log_${look}_A.txt 2>&1 &
  LOOK=$look NOAUDIO=1 WINDOWS="20.0633-40.0716" python3 film4.py ${look}_B.mp4 > log_${look}_B.txt 2>&1 &
  LOOK=$look NOAUDIO=1 WINDOWS="40.0716-61" python3 film4.py ${look}_C.mp4 > log_${look}_C.txt 2>&1 &
  wait; for c in A B C; do grep -q FILM2-DONE log_${look}_$c.txt || { echo "FATAL chunk $look $c did not finish"; tail -n 5 log_${look}_$c.txt; exit 1; }; done; say CHUNKS-$look-DONE
done
for l in log_*.txt; do echo "== $l"; tail -n 1 $l | cut -c1-120; done; say CHUNKS-DONE
up(){ f=$1; g=$(s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); curl -s -F "file=@$f" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])")
  r=$(curl -s -m 300 -F reqtype=fileupload -F time=72h -F "fileToUpload=@$f" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) l=$r;; *) l=$(curl -s -m 300 -F "files[]=@$f" https://uguu.se/upload | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['url'])" 2>/dev/null);; esac
  echo "UPLOAD $f gofile=$g direct=$l"; }
for look in $LOOKS; do
  for c in A B C; do echo "$look $c $(ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames -of csv=p=0 ${look}_$c.mp4)"; done
  printf "file '${look}_A.mp4'\nfile '${look}_B.mp4'\nfile '${look}_C.mp4'\n" > list_$look.txt
  ffmpeg -y -v error -f concat -safe 0 -i list_$look.txt -i d1.m4a -map 0:v -map 1:a -af "atrim=0:60.083,afade=t=out:st=59.483:d=0.6" -c:v copy -c:a aac -b:a 192k -shortest film_v4_$look.mp4
  md5sum film_v4_$look.mp4; ls -l film_v4_$look.mp4; up film_v4_$look.mp4
done; say RENDER-UPLOAD-DONE
for look in $LOOKS; do python3 verifyF4.py film_v4_$look.mp4 $look; done; say VERIFY-DONE
echo RUNFILM4-DONE
