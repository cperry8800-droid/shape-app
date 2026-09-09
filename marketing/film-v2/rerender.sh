# rerender.sh -- re-render the chunks a fix touches (here: the cook page in A and the montage in C, both looks), from the checkpointed B chunks; then mux, upload, sheets, verify. Three chunks at a time on the 8 GB sandbox.
cd /home/user/film; t0=$(date +%s); say(){ echo "[$(( $(date +%s) - t0 ))s] $*"; }; echo "cores $(nproc)"; free -m | sed -n 2p
B=https://raw.githubusercontent.com/cperry8800-droid/shape-app/claude/apple-style-product-video-qj19ip/marketing/film-v2
for f in film2.py plan2.json verifyF2.py beat.py meas_d1.py runFilm2.sh; do curl -sfL -o $f $B/$f || echo "FETCH-FAIL $f"; done; md5sum film2.py plan2.json verifyF2.py beat.py meas_d1.py runFilm2.sh
STAGE=prep bash runFilm2.sh   # inputs, tri.png, globe_slow.mp4, meas_d1.json -- all guarded, instant when present
ck(){ f=$1; want=$2; url=$3; [ -s $f ] && [ "$(md5sum $f | cut -c1-32)" = "$want" ] || curl -sfL -o $f $url; echo "$f $(md5sum $f | cut -c1-32) want $want"; }
ck hl_B.mp4 a0b2fa9f83f2c497a455fea68175bc62 https://litter.catbox.moe/v0sp3n.mp4
ck print_B.mp4 453bf10c7ebebce16cacaf5380bcf57d https://litter.catbox.moe/6ap5p3.mp4
say INPUTS-OK
printf "hl A 0-20.0633\nprint A 0-20.0633\nhl C 40.0716-61\nprint C 40.0716-61\n" | xargs -P 3 -L 1 bash -c 'LOOK=$0 NOAUDIO=1 WINDOWS="$2" python3 film2.py ${0}_$1.mp4 > log_${0}_$1.txt 2>&1'
for l in log_hl_A.txt log_print_A.txt log_hl_C.txt log_print_C.txt; do echo "$l: $(tail -n 1 $l | cut -c1-110)"; done; say CHUNKS-DONE
lb(){ f=$1; r=$(curl -s -m 300 -F reqtype=fileupload -F time=72h -F "fileToUpload=@$f" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) echo "CKPT $f $(md5sum $f | cut -c1-32) $(stat -c %s $f) $r";; *) echo "CKPT-FAIL $f $r";; esac; }
for c in hl_A print_A hl_C print_C; do lb $c.mp4 & done; wait
up(){ f=$1; g=$(s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); curl -s -F "file=@$f" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])")
  r=$(curl -s -m 300 -F reqtype=fileupload -F time=72h -F "fileToUpload=@$f" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) l=$r;; *) l=$(curl -s -m 300 -F "files[]=@$f" https://uguu.se/upload | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['url'])" 2>/dev/null);; esac
  echo "UPLOAD $f gofile=$g direct=$l"; }
for look in hl print; do
  for c in A B C; do echo "$look $c $(ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames -of csv=p=0 ${look}_$c.mp4)"; done
  printf "file '${look}_A.mp4'\nfile '${look}_B.mp4'\nfile '${look}_C.mp4'\n" > list_$look.txt
  ffmpeg -y -v error -f concat -safe 0 -i list_$look.txt -i d1.m4a -map 0:v -map 1:a -af "atrim=0:60.083,afade=t=out:st=59.483:d=0.6" -c:v copy -c:a aac -b:a 192k -shortest film_v2_$look.mp4
  md5sum film_v2_$look.mp4; ls -l film_v2_$look.mp4; up film_v2_$look.mp4
done; say RENDER-UPLOAD-DONE
python3 - <<'PYEOF'
import json,subprocess,hashlib,base64,io
from PIL import Image
m=json.load(open('meas_d1.json')); PH=m['phase']; P=60.0/m['bpm']
def bar(b): return PH+4*(b-1)*P
W,H=1440,2560
pages=[('riser',bar(2)),('lifter',bar(4)),('cook',bar(6)),('yoga',bar(8)),('cyclist',bar(10)),('coach',bar(12.5)),('radio',bar(15)),('runner',bar(19)+0.5),('skipper',bar(22)),('montage',bar(23)+1.25),('globe',bar(31)-0.3)]
def frame(F,t):
    o=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.4f}','-i',F,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    return Image.frombytes('RGB',(W,H),o)
for look in ('hl','print'):
    sheet=Image.new('L',(11*80+10*2,142),128)
    for i,(nm,t) in enumerate(pages): sheet.paste(frame(f'film_v2_{look}.mp4',t).convert('L').resize((80,142),Image.LANCZOS),(i*82,0))
    q=sheet.point(lambda v:int(round(v/255*7))*36); b=io.BytesIO(); q.convert('P',palette=Image.ADAPTIVE,colors=8).save(b,'PNG',optimize=True); data=b.getvalue()
    s=base64.b64encode(data).decode(); lines=[s[i:i+400] for i in range(0,len(s),400)]
    with open(f'sheet_{look}.txt','w') as f:
        f.write(f'bytes {len(data)} md5 {hashlib.md5(data).hexdigest()} lines {len(lines)}\n')
        for i,l in enumerate(lines): f.write(f'{i:02d} {hashlib.md5(l.encode()).hexdigest()[:4]} {l}\n')
    print(look,'sheet bytes',len(data),'lines',len(lines))
PYEOF
say SHEETS-OK
for look in hl print; do python3 verifyF2.py film_v2_$look.mp4 $look; done; say VERIFY-DONE; echo RERENDER-DONE
