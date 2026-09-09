cd /home/user/film; t0=$(date +%s); say(){ echo "[$(( $(date +%s) - t0 ))s] $*"; }; echo "cores $(nproc)"
PFX=https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY
LOOKS=${LOOKS:-"hl print"}
for f in film2.py plan2.json beat.py meas_d1.py verifyF2.py; do [ -s $f ] || { echo "FATAL missing $f"; exit 1; }; done
for pair in "riser ab46e09f-673e-4472-a786-9295c5252c57 hf_20260909_181112" "lifter 18f57dfd-3376-419b-b839-257387e17bed hf_20260909_181112" "cook e5ae899a-8f7b-4334-8330-9ff42025a91c hf_20260909_181112" "coach c739d3a7-3538-4748-a8f1-5bed0265097c hf_20260909_181112" "skipper a15ce573-8f24-4561-a059-eb80cf6726f3 hf_20260909_181112" "yoga e2269340-1db6-40b9-a10c-3c2ae91d25a3 hf_20260909_192019" "cyclist de795141-1050-440a-9f60-25aee30c685c hf_20260909_192131" "radio 0a0efbdd-f348-4cec-98f0-e207f2d9a938 hf_20260909_192018"; do set -- $pair; [ -s fig_$1.mp4 ] || curl -sfL -o fig_$1.mp4 $PFX/$3_$2.mp4 & done
[ -s runner.mp4 ] || curl -sfL -o runner.mp4 $PFX/hf_20260909_175056_e7f33f15-d306-4e50-99e8-9a7612d7daca.mp4 &
[ -s globe.mp4 ] || curl -sfL -o globe.mp4 $PFX/hf_20260907_232214_135d629d-2aa5-48ad-b734-02e2e72aa721.mp4 &
[ -s d1.m4a ] || curl -sfL -o d1.m4a $PFX/hf_20260908_212940_35ca8b30-6459-46e7-8fa0-7b0196f6ac69.m4a &
[ -s logo.png ] || curl -sfL -o logo.png https://raw.githubusercontent.com/cperry8800-droid/shape-app/main/public/SHAPE-logo-teal-white.png &
[ -s Newsreader.ttf ] || curl -sfL -o Newsreader.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf" &
wait
[ -s tri.png ] || python3 -c "from PIL import Image;Image.open('logo.png').convert('RGBA').crop((1551,200,2169,990)).save('tri.png')"
# the globe close: the Americas at night hold for ~4.5 s of the source before the sunrise; stretched x2.6667 they cover the six-bar page (12.0 s) without a frozen frame
[ -s globe_slow.mp4 ] || ffmpeg -v error -y -i globe.mp4 -t 12.1 -vf "setpts=2.6667*PTS,minterpolate=fps=24:mi_mode=blend,scale=1440:2560" -an -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p globe_slow.mp4
ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames:format=duration -of csv=p=0 globe_slow.mp4
md5sum fig_*.mp4 runner.mp4 globe.mp4 globe_slow.mp4 d1.m4a tri.png Newsreader.ttf film2.py plan2.json verifyF2.py beat.py meas_d1.py runFilm2.sh; say INPUTS-OK
[ -s meas_d1.json ] || python3 meas_d1.py; md5sum meas_d1.json; say GRID-OK
[ "$STAGE" = prep ] && { say PREP-DONE; exit 0; }
# three chunks at a time: the sandbox has 8 GB, and six x264 encoders at 1440x2560 (~1.1 GB each) beside six assemblies (~0.9 GB each) were OOM-killed on the first lease
for look in $LOOKS; do
  LOOK=$look NOAUDIO=1 WINDOWS="0-20.0633" python3 film2.py ${look}_A.mp4 > log_${look}_A.txt 2>&1 &
  LOOK=$look NOAUDIO=1 WINDOWS="20.0633-40.0716" python3 film2.py ${look}_B.mp4 > log_${look}_B.txt 2>&1 &
  LOOK=$look NOAUDIO=1 WINDOWS="40.0716-61" python3 film2.py ${look}_C.mp4 > log_${look}_C.txt 2>&1 &
  wait; say CHUNKS-$look-DONE
done
for l in log_*.txt; do echo "== $l"; tail -n 1 $l | cut -c1-120; done; say CHUNKS-DONE
up(){ f=$1; g=$(s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); curl -s -F "file=@$f" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])")
  r=$(curl -s -m 300 -F reqtype=fileupload -F time=72h -F "fileToUpload=@$f" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) l=$r;; *) l=$(curl -s -m 300 -F "files[]=@$f" https://uguu.se/upload | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['url'])" 2>/dev/null);; esac
  echo "UPLOAD $f gofile=$g direct=$l"; }
for look in $LOOKS; do
  for c in A B C; do ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames -of csv=p=0 ${look}_$c.mp4; done
  printf "file '${look}_A.mp4'\nfile '${look}_B.mp4'\nfile '${look}_C.mp4'\n" > list_$look.txt
  ffmpeg -y -v error -f concat -safe 0 -i list_$look.txt -i d1.m4a -map 0:v -map 1:a -af "atrim=0:60.083,afade=t=out:st=59.483:d=0.6" -c:v copy -c:a aac -b:a 192k -shortest film_v2_$look.mp4
  md5sum film_v2_$look.mp4; ls -l film_v2_$look.mp4; up film_v2_$look.mp4
done; say RENDER-UPLOAD-DONE
for look in $LOOKS; do python3 verifyF2.py film_v2_$look.mp4 $look; done; say VERIFY-DONE
echo RUNFILM2-DONE
