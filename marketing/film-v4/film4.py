# film4.py -- the one-shot film assembly, v4 (no dancer; the runner retimed onto the beat; a thinner, truer outline; eight beams and the mark on each; the sphere larger): two looks (LOOK=print | hl), activities only, crossfade seams, caption bands, the globe close.
# python3 film2.py <out.mp4>; FILM_DIR holds the inputs; WINDOWS="a-b,c-d" renders only those seconds; NOAUDIO=1 writes video only.
import json, math, os, sys, subprocess, numpy as np
from collections import deque
from PIL import Image, ImageFilter, ImageDraw, ImageFont
W,H=1440,2560; FPS=24; D=os.environ.get('FILM_DIR','/home/user/film'); OUT=sys.argv[1]; LOOK=os.environ.get('LOOK','hl')
TEAL=(0x34,0xd6,0xc5); TEALf=np.array(TEAL,np.float32); CREAM=(0xf2,0xea,0xd8); CREAMf=np.array(CREAM,np.float32); INK=(20,20,20); INKf=np.array(INK,np.float32)
m=json.load(open(f'{D}/meas_d1.json')); BPM=m['bpm']; PH=m['phase']; KB=m.get('kick_by_beat') or []; P=60.0/BPM
def beat(n): return PH+n*P
def bar(b): return beat(4*(b-1))
def kof(t):
    u=(t-PH)%P; n=int((t-PH)//P); pres=1.0 if not KB or n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30)); return math.exp(-u/0.20)*pres
def sstep(x): x=min(1.0,max(0.0,x)); return x*x*(3-2*x)
def font(path,size,var=None):
    try:
        f=ImageFont.truetype(path,size)
        if var:
            try: f.set_variation_by_axes(var)
            except Exception: pass
        return f
    except Exception: return ImageFont.load_default(size)
F_MONT=os.environ.get('F_MONT','/usr/share/fonts/truetype/higgsfield/Montserrat-ExtraBold.ttf'); F_NEWS=os.environ.get('F_NEWS',f'{D}/Newsreader.ttf')
f_lab=font(F_MONT,30); f_num=font(F_MONT,46); f_sync=font(F_MONT,64); f_cap=font(F_NEWS,82,[500,60]); f_end=font(F_NEWS,82,[500,60]); f_fee=font(F_MONT,36)
# ---------- the mark ----------
tri=Image.open(f'{D}/tri.png').convert('RGBA'); ASP=tri.width/tri.height
def glow_mark(canvas, mark, cx, cy, h, k, base, flash, blur, amp=0.06):
    s=1.0+amp*k; hh=max(8,int(round(h*s))); ww=max(6,int(round(hh*ASP))); mk=mark.resize((ww,hh),Image.LANCZOS)
    R=blur*3+mk.width//2+mk.height//2; x0,y0=int(cx-R),int(cy-R); S=2*R
    layer=Image.new('RGBA',(S,S),(0,0,0,0)); px,py=int(round(R-mk.width/2)),int(round(R-mk.height/2))
    a=Image.new('L',(S,S),0); a.paste(mk.split()[3],(px,py)); g=a.filter(ImageFilter.GaussianBlur(blur))
    ga=Image.fromarray((np.asarray(g).astype(np.float32)*(base+flash*k)).clip(0,255).astype(np.uint8))
    glow=Image.merge('RGBA',[Image.new('L',(S,S),TEAL[0]),Image.new('L',(S,S),TEAL[1]),Image.new('L',(S,S),TEAL[2]),ga])
    layer=Image.alpha_composite(layer,glow); layer.alpha_composite(mk,(px,py)); canvas.alpha_composite(layer,(x0,y0))
def mark_on(canvas,k,cream):
    if cream: glow_mark(canvas,tri,100+130*ASP/2,150+65,130,k,0.28,0.55,16)
    else: glow_mark(canvas,tri,90+150*ASP/2,30+75,150,k,0.35,0.65,20)
# ---------- the pages (no column rules: the masthead double rule and the ticker only) ----------
def blur_mask(m,r): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255.0
def black_page():
    page=Image.new('RGB',(W,H),(10,10,10)); d=ImageDraw.Draw(page); c=tuple(int(v*0.30+10*0.70) for v in CREAM)
    d.rectangle([90,200,W-90,203],fill=c); d.rectangle([90,214,W-90,215],fill=c)
    d.rectangle([90,H-300,W-90,H-200],fill=(28,28,28)); d.rectangle([90,H-300,102,H-200],fill=TEAL); return page
def cream_page():
    page=Image.new('RGB',(W,H),CREAM); d=ImageDraw.Draw(page)
    d.rectangle([90,99,W-90,103],fill=INK); d.rectangle([90,135,W-90,139],fill=INK)
    d.rectangle([90,H-300,W-90,H-200],fill=INK); d.rectangle([90,H-300,102,H-200],fill=TEAL); return page
PAGE_BLACK=np.asarray(black_page()).astype(np.float32); PAGE_CREAM=np.asarray(cream_page()).astype(np.float32)
CELL=16; _yy,_xx=np.mgrid[0:CELL,0:CELL]; _tile=np.sqrt((_yy-(CELL-1)/2)**2+(_xx-(CELL-1)/2)**2).astype(np.float32); DIST=np.tile(_tile,(H//CELL,W//CELL))
# per-clip options, keyed by the clip's file name: the radio take is a bust with the model's grey pseudo-text behind it, so its figure is taken at luma < 40 (the text is grey, the figure is black) and dissolved over the 260 px above the ticker instead of ending on a straight cut
OPTS={'fig_radio.mp4':dict(thresh=40,fade=260),'fig_driver.mp4':dict(thresh=40,cut_below=1835)}   # the driver take draws the car door below the window as a solid slab (rows 1841-2069): cut, so the figure, the wheel and the window frame stay
class Figure:
    """The figure's mask off the clip (the page's own rules struck), then the look: a teal highlighter stroke with glow on the black page, or a coarse halftone in ink on cream. The centroid trail is the ribbon in both."""
    def __init__(self,src='',carry_teal=False):
        self.rulecols=None; self.trail=deque(maxlen=18); self.carry=carry_teal; o=OPTS.get(os.path.basename(src),{}); self.th=o.get('thresh',90); fade=o.get('fade',0)
        self.vr=None if not fade else np.clip((H-340-np.arange(H))/float(fade),0,1).astype(np.float32)[:,None,None]
        self.cut=o.get('cut_below',0)
    def mask(self,f):
        g=0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]; m=g<self.th; m[:250]=False; m[H-340:]=False
        if self.cut: m[self.cut:]=False
        if self.rulecols is None:   # a column rule is a HAIRLINE: a group of <= 8 dark columns over the page's height, or <= 12 dark through the top zone (rows 250-700), where a rule runs from the masthead and a figure rarely reaches. The cook's left rule stands beside his counter, so over the full height it merges into the counter's columns and only the top zone separates it; a wide figure's columns are just as dark and are not rules
            frac=m[250:H-340].mean(0); top=m[250:700].mean(0); cols=set()
            for thr,arr,wmax in ((0.35,frac,8),(0.8,top,12)):
                cs=[x for x in range(W) if arr[x]>thr]; groups=[]
                for x in cs:
                    if groups and x-groups[-1][-1]<=2: groups[-1].append(x)
                    else: groups.append([x])
                for gp in groups:
                    if len(gp)<=wmax: cols.update(gp)
            self.rulecols=sorted(cols)
        for x in self.rulecols: m[:,max(0,x-4):x+5]=False
        rf=m[:,90:W-90].mean(1); dark=rf>0.5; y=250
        while y<H-340:
            if dark[y]:
                y0=y
                while y<H-340 and dark[y]: y+=1
                if y-y0<=(60 if y0<700 else 12): m[max(0,y0-2):y+2]=False
            else: y+=1
        return m
    def ribbon(self,out,m):
        ys,xs=np.nonzero(m)
        if len(xs)>200: self.trail.append((float(xs.mean()),float(ys.mean())))
        if len(self.trail)>2:
            R=Image.new('L',(W,H),0); dr=ImageDraw.Draw(R); pts=list(self.trail)
            for i in range(1,len(pts)): dr.line([pts[i-1],pts[i]],fill=int(255*i/len(pts)),width=6)
            ra=np.asarray(R.filter(ImageFilter.GaussianBlur(2))).astype(np.float32)[...,None]/255.0*0.8; out=out*(1-ra)+TEALf*ra
        return out
    def frame(self,f):
        m=self.mask(f); ff=f.astype(np.float32)
        if LOOK=='hl':
            # v4: a thinner, truer line (owner: "less like bathroom stick figures, more human outlined") -- the mask is smoothed by 1.5 px instead of 4 so hair, fingers and folds survive, and the stroke is ~4-5 px with a softer glow
            mm=blur_mask(m,1.5)>0.5; bm=blur_mask(mm,4); stroke=((bm>0.25)&(bm<0.75)).astype(np.float32)
            S=Image.fromarray((stroke*255).astype(np.uint8)); glow=np.asarray(S.filter(ImageFilter.GaussianBlur(10))).astype(np.float32)/255.0
            a=np.clip(glow*0.45+stroke*0.95,0,1)[...,None]
            if self.vr is not None: a=a*self.vr
            out=PAGE_BLACK*(1-a)+TEALf*a
            if self.carry:
                tm=((np.abs(ff[...,0]-0x34)<60)&(np.abs(ff[...,1]-0xd6)<60)&(np.abs(ff[...,2]-0xc5)<60)); tg=blur_mask(tm,6); ta=np.clip(tg*0.5+tm.astype(np.float32)*0.95,0,1)[...,None]; out=out*(1-ta)+TEALf*ta
            out=self.ribbon(out,mm)
        else:
            cov=blur_mask(m,3); c=cov.reshape(H//CELL,CELL,W//CELL,CELL).mean((1,3)); r=(CELL/2)*np.sqrt(c)*1.10
            ink=(DIST<np.kron(r,np.ones((CELL,CELL),np.float32))); a=blur_mask(ink,0.8)[...,None]
            if self.vr is not None: a=a*self.vr
            out=PAGE_CREAM*(1-a)+INKf*a
            if self.carry:
                tm=((np.abs(ff[...,0]-0x34)<60)&(np.abs(ff[...,1]-0xd6)<60)&(np.abs(ff[...,2]-0xc5)<60)); tg=blur_mask(tm,4); ta=np.clip(tg*0.4+tm.astype(np.float32)*0.95,0,1)[...,None]; out=out*(1-ta)+TEALf*ta
            out=self.ribbon(out,m)
        return out.clip(0,255).astype(np.uint8)
# ---------- the sync bar ----------
BX0,BX1,BY=560,1120,262; CX=(BX0+BX1)//2; HALF=(BX1-BX0)//2-24; LY0,LY1=150,340; BPMi=int(round(BPM)); HR0=BPMi-36
def spaced(d,x,y,s,fnt,col,anchor,sp=5):
    ws=[fnt.getlength(ch) for ch in s]; tot=sum(ws)+sp*(len(s)-1); x0={'l':x,'r':x-tot,'m':x-tot/2}[anchor]
    for ch,w in zip(s,ws): d.text((x0,y),ch,font=fnt,fill=col,anchor='ls'); x0+=w+sp
def sync_bar(canvas,t,k,T0,TS,ink,barc,teal):
    L=Image.new('RGBA',(W,LY1-LY0),(0,0,0,0)); d=ImageDraw.Draw(L); y=BY-LY0
    d.rectangle([BX0,y-2,BX1,y+2],fill=barc)
    hr=HR0+(BPMi-HR0)*sstep((t-T0)/(TS-T0)); gap=(BPMi-hr)/float(BPMi-HR0); synced=t>=TS
    spaced(d,BX0-40,y-14,'HRM',f_lab,ink,'r'); d.text((BX0-40,y+42),str(int(round(hr))),font=f_num,fill=ink,anchor='rs')
    spaced(d,BX1+40,y-14,'BPM',f_lab,ink,'l'); d.text((BX1+40,y+42),str(BPMi),font=f_num,fill=teal,anchor='ls')
    if not synced:
        xL=CX-gap*HALF; xR=CX+gap*HALF; r=15
        d.ellipse([xL-r,y-r,xL+r,y+r],fill=ink); d.ellipse([xR-r,y-r,xR+r,y+r],fill=teal); canvas.alpha_composite(L,(0,LY0)); return
    u=min(1.0,(t-TS)/0.25); r=15+9*u+4*k
    G=Image.new('L',L.size,0); ImageDraw.Draw(G).ellipse([CX-r-10,y-r-10,CX+r+10,y+r+10],fill=255); G=G.filter(ImageFilter.GaussianBlur(18))
    ga=Image.fromarray((np.asarray(G).astype(np.float32)*(0.35+0.5*k)*u).clip(0,255).astype(np.uint8))
    L.alpha_composite(Image.merge('RGBA',[Image.new('L',L.size,teal[0]),Image.new('L',L.size,teal[1]),Image.new('L',L.size,teal[2]),ga]))
    d=ImageDraw.Draw(L); d.ellipse([CX-r,y-r,CX+r,y+r],fill=teal)
    T=Image.new('RGBA',L.size,(0,0,0,0)); spaced(ImageDraw.Draw(T),CX,y-40,'IN SYNC',f_sync,teal,'m',7)
    if u<1: T.putalpha(T.split()[3].point(lambda v:int(v*u)))
    L.alpha_composite(T); canvas.alpha_composite(L,(0,LY0))
# ---------- captions: a band across the page so the line reads on anything ----------
BAND=(2000,2180); CAP_Y=2118
def band_layer(lines,cream_page_look,play=False):
    L=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(L)
    fill=(0xf2,0xea,0xd8,225) if cream_page_look else (8,8,8,205); col=INK if cream_page_look else CREAM
    y0,y1=BAND[0],BAND[0]+ (180 if len(lines)==1 else 260)
    d.rectangle([90,y0,W-90,y1],fill=fill)
    y=CAP_Y
    for i,(txt,fnt,c) in enumerate(lines):
        c=c or col
        if i==0 and play:
            tw=fnt.getlength(txt); x=W//2-tw/2-70; d.polygon([(x,y-58),(x,y-6),(x+46,y-32)],fill=TEAL); d.text((W//2+35,y),txt,font=fnt,fill=c,anchor='ms')
        else: d.text((W//2,y),txt,font=fnt,fill=c,anchor='ms')
        y+=90
    return L
def with_alpha(L,a):
    if a>=1: return L
    return Image.merge('RGBA',[*L.split()[:3],L.split()[3].point(lambda v:int(v*a))])
def cap_alpha(t,t0,t1): return min(1.0,max(0.0,(t-(t0+0.35))/0.18))*min(1.0,max(0.0,((t1-0.15)-t)/0.18))
# ---------- the close: the globe with the lockup ----------
# the globe page (owner, on v2: "2 shape triangles on this page, make the sphere smaller and put shape logo above it"): the sphere at GS of the frame, centred at GCY; the lockup above it at LOCK_CY; no corner mark on this page
GS=float(os.environ.get('GS','0.76')); GCY=int(os.environ.get('GCY','1400')); LOCK_CY=int(os.environ.get('LOCK_CY','330')); GCROP=(int(os.environ.get('GY0','100')),int(os.environ.get('GY1','1900')))   # v4: the sphere larger (owner: "zoom in on globe more") -- the clip's disc rows cropped, scaled to 76 % of the width: the disc's top (row 128 of the clip at its end) clears the lockup's rule by ~45 px and its bottom (row 1739 at the start) clears the end band by ~38 px, the two extremes a fixed scale must hold at once
def lockup_layers():
    logo=Image.open(f'{D}/logo.png').convert('RGBA'); a=np.asarray(logo.split()[3]); rows=np.nonzero(a[1240:].sum(1)>0)[0]; cols=np.nonzero(a[1240:].sum(0)>0)[0]
    wm=logo.crop((int(cols[0]),1240+int(rows[0]),int(cols[-1])+1,1240+int(rows[-1])+1)); ww=880; wm=wm.resize((ww,int(wm.height*ww/wm.width)),Image.LANCZOS)
    mk=tri.resize((int(300*ASP),300),Image.LANCZOS); cy=LOCK_CY
    a=Image.new('L',(W,H),0); a.paste(mk.split()[3],(W//2-mk.width//2,cy-mk.height//2)); g=np.asarray(a.filter(ImageFilter.GaussianBlur(26))).astype(np.float32)
    return wm,mk,g,cy
# ---------- the globe's pins: the Shape mark at the tip of every beam of light the clip raises from a city ----------
PIN_LUM=float(os.environ.get('PIN_LUM','90')); PIN_H=int(os.environ.get('PIN_H','44')); MAXPINS=int(os.environ.get('MAXPINS','8')); BEAM_W=int(os.environ.get('BEAM_W','30')); BEAM_RIDGE=float(os.environ.get('BEAM_RIDGE','35')); BEAM_MINH=int(os.environ.get('BEAM_MINH','20'))
def narrow(m,wmax=None):
    """Keep only the pixels of horizontal runs no wider than wmax: a beam is narrow in every row, the rim's top and bottom arcs are not -- and a wide arc in the mask would bridge every column it spans, so that the column groups below could not tell one beam from the whole disc."""
    wmax=wmax or BEAM_W; st=m&~np.roll(m,1,axis=1); st[:,0]=m[:,0]
    rid=np.cumsum(st.ravel())*m.ravel(); ln=np.bincount(rid); return (m.ravel()&(ln[rid]<=wmax)).reshape(m.shape)
def beam_mask(fs):
    """A beam of light on the page: a thin vertical cool line -- brighter by BEAM_RIDGE than the page 6-10 px to either side (so the rim, the lit limb and the lit surface, all wide, fail), cool (a city light is warm), above PIN_LUM, and standing in a vertical run of at least BEAM_MINH px. Measured at PAGE scale, because a 3-px beam scaled onto the page by 0.76 with LANCZOS lands well under the luma the raw clip reads, which is why the strict test that found the tips on the clip found almost nothing on the page."""
    g=fs.astype(np.float32); lum=0.299*g[...,0]+0.587*g[...,1]+0.114*g[...,2]; coolish=(g[...,1]+g[...,2])>(2*g[...,0]+40)
    side=np.zeros_like(lum)
    for d in (6,8,10): side=np.maximum(side,np.maximum(np.roll(lum,d,axis=1),np.roll(lum,-d,axis=1)))
    ridge=(lum-side>BEAM_RIDGE)&coolish&(lum>PIN_LUM); ridge[:120]=False; ridge[H-340:]=False; ridge[:,:12]=False; ridge[:,-12:]=False
    rt=np.ascontiguousarray(ridge.T); st=rt&~np.roll(rt,1,axis=1); st[:,0]=rt[:,0]; rid=np.cumsum(st.ravel())*rt.ravel(); ln=np.bincount(rid)
    return np.ascontiguousarray((rt.ravel()&(ln[rid]>=BEAM_MINH)).reshape(rt.shape).T)
def col_groups(mask,gap=3):
    cols=np.nonzero(mask.any(0))[0]; groups=[]
    for x in cols:
        if groups and x-groups[-1][-1]<=gap: groups[-1].append(int(x))
        else: groups.append([int(x)])
    return groups
class Pins:
    """Per frame: the beams (beam_mask: thin vertical cool ridges on the page) grouped by column, each group's topmost pixel a tip. Tips are tracked across frames (matched within 28 px, position smoothed, drawn once seen twice) so the mark rides its beam as the globe turns."""
    def __init__(self): self.tracks=[]; self.nid=0; self.erased=0; self.chosen=[]   # [x, y, frames unseen, frames seen, id]
    def tips(self,f,bm=None):
        cool=beam_mask(f) if bm is None else bm; out=[]
        for gp in col_groups(cool):
            if len(gp)>60: continue   # the atmospheric rim or a lit limb, not a beam
            x0,x1=gp[0],gp[-1]+1; sub=cool[:,x0:x1]; rows=np.nonzero(sub.any(1))[0]; ytop=int(rows.min())
            xs=np.nonzero(sub[ytop:ytop+6].any(0))[0]; out.append((x0+float(xs.mean()),float(ytop)))
        return out
    def update(self,f,bm=None):
        tips=self.tips(f,bm); used=[False]*len(tips)
        for tr in self.tracks:
            best=None
            for i,(x,y) in enumerate(tips):
                if used[i]: continue
                d=math.hypot(x-tr[0],y-tr[1])
                if d<28 and (best is None or d<best[0]): best=(d,i)
            if best: i=best[1]; used[i]=True; tr[0]=0.5*tr[0]+0.5*tips[i][0]; tr[1]=0.5*tr[1]+0.5*tips[i][1]; tr[2]=0; tr[3]+=1
            else: tr[2]+=1
        for i,(x,y) in enumerate(tips):
            if not used[i]: self.tracks.append([x,y,0,1,self.nid]); self.nid+=1
        self.tracks=[tr for tr in self.tracks if tr[2]<=6][:80]
        # at most MAXPINS beams stand at once (owner: "way too many lines coming up"); a slot is held until its beam dies, and a freed slot goes to the live beam farthest across the page from the ones standing, so the eight spread over the disc instead of crowding one side
        alive={tr[4] for tr in self.tracks}; self.chosen=[i for i in self.chosen if i in alive]
        live=[tr for tr in self.tracks if tr[3]>=2 and tr[2]==0]; cand=[tr for tr in live if tr[4] not in self.chosen]
        while len(self.chosen)<MAXPINS and cand:
            cx=[tr[0] for tr in self.tracks if tr[4] in self.chosen]
            best=max(cand,key=lambda tr:((min(abs(tr[0]-x) for x in cx) if cx else 0),-tr[4])); self.chosen.append(best[4]); cand.remove(best)
        return [(tr[0],tr[1]) for tr in live if tr[4] in self.chosen]
    def erase(self,fs,keep,bm=None):
        """Paint out every beam but the kept ones. A beam is a column group of beam_mask pixels (the ridge test that finds the tips) no wider than a beam and not within +-16 px of a kept tip. The groups' columns (+-8) are merged into intervals first, so two beams standing 13 px apart are one region and neither lerps into the other; over each interval's rows (the beams' span +-24) every cool pixel above luma 60 -- the beam and its halo -- is replaced by a horizontal lerp between the page just outside the interval, so the surface's own lights and coasts stay. Columns within 12 px of a kept tip are never touched."""
        g=fs.astype(np.float32); lum=0.299*g[...,0]+0.587*g[...,1]+0.114*g[...,2]; coolish=(g[...,1]+g[...,2])>(2*g[...,0]+40)
        strict=beam_mask(fs) if bm is None else bm; loose=coolish&(lum>45); colmask=np.zeros(W,bool); spans={}
        for gp in col_groups(strict):
            if len(gp)>60: continue
            x0,x1=gp[0],gp[-1]+1
            if any(x0-16<=x<=x1+16 for x,_ in keep): continue
            rows=np.nonzero(strict[:,x0:x1].any(1))[0]; xa=max(1,x0-8); xb=min(W-1,x1+8); colmask[xa:xb]=True
            for x in range(xa,xb): spans[x]=(min(spans.get(x,(H,0))[0],int(rows.min())),max(spans.get(x,(H,0))[1],int(rows.max())))
        prot=np.zeros(W,bool)
        for x,_ in keep: prot[max(0,int(x)-12):int(x)+13]=True
        out=fs.copy(); n=0
        for iv in col_groups(colmask[None,:],gap=1):
            xa,xb=iv[0],iv[-1]+1; y0=max(0,min(spans[x][0] for x in iv)-24); y1=min(H,max(spans[x][1] for x in iv)+25)
            reg=loose[y0:y1,xa:xb].copy(); reg[:,prot[xa:xb]]=False
            if not reg.any(): continue
            reg=blur_mask(reg,1.5)>0.2; reg[:,prot[xa:xb]]=False
            L=out[y0:y1,xa-1].astype(np.float32)[:,None,:]; R=out[y0:y1,xb].astype(np.float32)[:,None,:]; w=np.linspace(0,1,xb-xa,dtype=np.float32)[None,:,None]
            fill=(L*(1-w)+R*w); sub=out[y0:y1,xa:xb]; sub[reg]=fill[reg].astype(np.uint8); n+=1
        self.erased=n; return out
    def draw(self,img,k,pts):
        for x,y in pts: glow_mark(img,tri,x,y-30,PIN_H,k,0.30,0.5,6,amp=0.10)
# ---------- readers ----------
class Reader:
    def __init__(self,src,s0):
        self.p=subprocess.Popen(['ffmpeg','-v','error','-ss',f'{max(0.0,s0):.4f}','-i',src,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,bufsize=10**8); self.last=None
    def read(self):
        b=self.p.stdout.read(W*H*3)
        if len(b)<W*H*3: return self.last
        self.last=np.frombuffer(b,np.uint8).reshape(H,W,3); return self.last
    def close(self):
        try: self.p.kill(); self.p.stdout.close(); self.p.wait()
        except Exception: pass
def strike_clip_rules(f,cols):
    """The runner's clip carries its own thin column rules; on rows where the dark run at the rule is a hairline (<= 10 px) the rule is painted with the page beside it; where the figure crosses it, nothing changes."""
    if not cols: return f
    g=f.astype(np.float32); lum=0.299*g[...,0]+0.587*g[...,1]+0.114*g[...,2]; out=f.copy()
    for x in cols:
        x0,x1=max(0,x-10),min(W,x+11); band=lum[:,x0:x1]<110
        run=band.sum(1); thin=run<=10
        src=out[:,max(0,x0-14):max(1,x0-2)].mean(1).astype(np.uint8)   # the page just left of the rule, per row
        rows=np.nonzero(thin)[0]
        if len(rows): out[rows[:,None],np.arange(x0,x1)[None,:]]=src[rows][:,None,:]
    return out
class RuleFinder:
    def __init__(self): self.cols=None
    def find(self,f):
        if self.cols is None:
            g=f.astype(np.float32); lum=0.299*g[...,0]+0.587*g[...,1]+0.114*g[...,2]; m=lum<90; m[:250]=False; m[H-340:]=False
            frac=m[250:H-340].mean(0); cs=[x for x in range(W) if frac[x]>0.35]; groups=[]
            for x in cs:
                if groups and x-groups[-1][-1]<=2: groups[-1].append(x)
                else: groups.append([x])
            self.cols=[int(round(sum(gp)/len(gp))) for gp in groups if len(gp)<=8]
        return self.cols
PLAN=json.load(open(f'{D}/plan4.json'))
for pg in PLAN: pg['t0']=eval(str(pg['t0'])); pg['t1']=eval(str(pg['t1']))
T_END=PLAN[-1]['t1']; XF=8/FPS; CREAM_LOOK=(LOOK=='print')
wm_img,mk_big,mk_glow,MK_CY=lockup_layers()
END_LINES=band_layer([('Different goals. One Community.',f_end,None),('ONE PLATFORM FEE  ·  $5 /MO  ·  CANCEL ANY TIME',f_fee,TEAL)],False)
class Page:
    def __init__(self,pg):
        self.pg=pg; self.kind=pg['kind']; self.reader=None; self.slot=-1; self.slot_reader=None; self.slot_fig=None
        self.fig=Figure(src=pg.get('src',''),carry_teal=(self.kind=='runner')) if self.kind in ('fig','runner') else None; self.rf=RuleFinder(); self.slot_rf=None
        if self.kind not in ('montage',): self.reader=Reader(f"{D}/{pg['src']}",pg['s0'])
        self.cap=band_layer([(pg['caption'],f_cap,None)],CREAM_LOOK,play=pg.get('play',False)) if pg.get('caption') else None
        self.pins=Pins() if self.kind=='globe' else None
    def page_is_cream(self,src=None):
        return CREAM_LOOK
    def render(self,t):
        k=kof(t); pg=self.pg
        if self.kind=='globe': return self.render_globe(t,k)
        if self.kind=='montage':
            s=min(len(pg['slots'])-1,int((t-pg['t0'])//P))
            if s!=self.slot:
                if self.slot_reader: self.slot_reader.close()
                src,s0=pg['slots'][s]; self.slot=s; self.slot_reader=Reader(f'{D}/{src}',s0); self.slot_fig=Figure(src=src,carry_teal=src.startswith('runner')); self.slot_rf=RuleFinder()
            f=self.slot_reader.read()
            if CREAM_LOOK and self.slot_fig.carry: img=Image.fromarray(strike_clip_rules(f,self.slot_rf.find(f))).convert('RGBA')   # the runner's clip is the print already; its own hairline rules go
            else: img=Image.fromarray(self.slot_fig.frame(f)).convert('RGBA')
            mark_on(img,k,CREAM_LOOK); return img
        f=self.reader.read()
        if self.kind=='runner' and CREAM_LOOK: img=Image.fromarray(strike_clip_rules(f,self.rf.find(f))).convert('RGBA')
        else: img=Image.fromarray(self.fig.frame(f)).convert('RGBA')
        mark_on(img,k,CREAM_LOOK)
        if self.kind=='runner':
            if CREAM_LOOK: sync_bar(img,t,k,pg['t0']+0.5,eval(str(pg['ts'])),INK,(95,95,95),TEAL)
            else: sync_bar(img,t,k,pg['t0']+0.5,eval(str(pg['ts'])),(190,184,170),(80,78,72),TEAL)
        if self.cap is not None:
            a=cap_alpha(t,pg['t0'],pg['t1'])
            if a>0: img.alpha_composite(with_alpha(self.cap,a))
        return img
    def render_globe(self,t,k):
        pg=self.pg; u=t-pg['t0']; f=self.reader.read(); crop=f[GCROP[0]:GCROP[1]]
        bg=tuple(int(v) for v in np.median(np.concatenate([crop[:60,:200].reshape(-1,3),crop[:60,-200:].reshape(-1,3),crop[-60:,:200].reshape(-1,3),crop[-60:,-200:].reshape(-1,3)]),axis=0))   # the clip's own black, so the pasted frame has no edge
        small=Image.fromarray(crop).resize((int(round(W*GS)),int(round((GCROP[1]-GCROP[0])*GS))),Image.LANCZOS)
        fe=np.ones((small.height,small.width),np.float32); ramp=np.linspace(0,1,60,dtype=np.float32); fe[:60]*=ramp[:,None]; fe[-60:]*=ramp[::-1][:,None]; rh=np.linspace(0,1,80,dtype=np.float32); fe[:,:80]*=rh[None,:]; fe[:,-80:]*=rh[::-1][None,:]   # the clip's disc outgrows its frame late in the shot, so the paste's sides are feathered as well as its top and bottom
        sa=np.asarray(small).astype(np.float32); sa=sa*fe[...,None]+np.array(bg,np.float32)*(1-fe[...,None]); small=Image.fromarray(sa.clip(0,255).astype(np.uint8))
        img=Image.new('RGBA',(W,H),bg+(255,)); img.paste(small,(W//2-small.width//2,GCY-small.height//2))
        fs=np.asarray(img.convert('RGB')); bm=beam_mask(fs); pts=self.pins.update(fs,bm); fs2=self.pins.erase(fs,pts,bm); img=Image.fromarray(fs2).convert('RGBA'); self.pins.draw(img,k,pts)   # the beams are found once on the page as drawn; every beam but the kept ones is painted out
        if os.environ.get('PIN_DEBUG'): print('pins',round(t,3),'tips',len(self.pins.tips(fs,bm)),'drawn',len(pts),'erased',self.pins.erased,flush=True)
        al=sstep((u-4.0)/0.5)
        if al>0:
            kk=max(k,math.exp(-(u-4.0)/0.3)); layer=Image.new('RGBA',(W,H),(0,0,0,0))
            ga=Image.fromarray((mk_glow*(0.30+0.6*kk)*al).clip(0,255).astype(np.uint8))
            layer.alpha_composite(Image.merge('RGBA',[Image.new('L',(W,H),TEAL[0]),Image.new('L',(W,H),TEAL[1]),Image.new('L',(W,H),TEAL[2]),ga]))
            layer.alpha_composite(with_alpha(mk_big,al),(W//2-mk_big.width//2,MK_CY-mk_big.height//2)); img.alpha_composite(layer)
        aw=sstep((u-4.6)/0.4)
        if aw>0: img.alpha_composite(with_alpha(wm_img,aw),(W//2-wm_img.width//2,MK_CY+mk_big.height//2+70))
        ar=sstep((u-5.2)/0.5)
        if ar>0:
            yr=MK_CY+mk_big.height//2+70+wm_img.height+40; ImageDraw.Draw(img).rectangle([W//2-440,yr,int(W//2-440+880*ar),yr+4],fill=TEAL)
        a1=sstep((u-6.0)/0.4)
        if a1>0: img.alpha_composite(with_alpha(END_LINES,a1))
        return img
    def close(self):
        if self.reader: self.reader.close()
        if self.slot_reader: self.slot_reader.close()
def crossfade(new,old,f):
    e=f*f*(3-2*f); return Image.blend(old,new,e)
WIN=[tuple(float(v) for v in w.split('-')) for w in os.environ.get('WINDOWS','').split(',') if w]
def want(t): return (not WIN) or any(a<=t<b for a,b in WIN)
VID=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-']
AUD=[] if os.environ.get('NOAUDIO') else ['-i',f'{D}/d1.m4a','-map','0:v','-map','1:a','-af',f'atrim=0:{T_END:.3f},afade=t=out:st={T_END-0.6:.3f}:d=0.6','-c:a','aac','-b:a','192k','-shortest']
wr=subprocess.Popen(VID+AUD+['-c:v','libx264','-preset',os.environ.get('PRESET','medium'),'-crf','18','-pix_fmt','yuv420p',OUT],stdin=subprocess.PIPE)
cur=None; prev=None; nw=0; log=[]; NF=int(math.ceil(T_END*FPS))
import time; t_start=time.time()
for n in range(NF):
    t=n/FPS
    if cur is None or t>=cur.pg['t1']:
        i=0
        while i<len(PLAN)-1 and t>=PLAN[i]['t1']: i+=1
        if cur is not None and cur.pg is not PLAN[i]:
            if prev: prev.close()
            prev=cur; prev_end=cur.pg['t1']
        if cur is None or cur.pg is not PLAN[i]:
            cur=Page(PLAN[i]); log.append((n,round(t,3),PLAN[i]['name']))
    if not want(t):
        if cur.kind!='montage': cur.reader.read()
        if prev is not None and t<prev_end+XF and prev.kind!='montage': prev.reader.read()
        continue
    img=cur.render(t)
    if prev is not None and t<prev_end+XF and prev.kind!='montage' or (prev is not None and t<prev_end+XF and prev.kind=='montage'):
        old=prev.render(t); img=crossfade(img,old,(t-prev_end)/XF)
    wr.stdin.write(img.convert('RGB').tobytes()); nw+=1
    if n%120==0: print('frame',n,'t',round(t,2),cur.pg['name'],'elapsed',int(time.time()-t_start),flush=True)
wr.stdin.close(); wr.wait()
print('LOOK',LOOK,'frames planned',NF,'written',nw,'pages',log); print('FILM2-DONE',flush=True)
