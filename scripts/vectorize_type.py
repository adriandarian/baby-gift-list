"""Trace the approved hand-lettering into smooth resolution-independent SVG.
Keeps the original glyph shapes and watercolor ornaments; never substitutes fonts.
"""
from pathlib import Path
from io import BytesIO
import base64
import numpy as np
import cv2
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "approved"
TARGET = ROOT / "assets" / "type"

SPECS = {
    "brand": (60, None, "#483329", [(0,0,60,59)]),
    "headline": (0,362,"#443127",[(356,0,413,89)]),
    "tagline": (0,None,"#352a25",[]),
    "browse-heading": (61,312,"#171615",[(0,0,61,37),(307,0,359,37)]),
    "thank-you": (0,157,"#17120f",[(154,0,189,44)]),
    "heading-travel": (42,None,"#172741",[(0,0,43,33)]),
    "heading-nursery": (43,None,"#172741",[(0,0,44,36)]),
    "heading-bath": (42,None,"#172741",[(0,0,43,34)]),
    "heading-clothing": (43,None,"#172741",[(0,0,44,35)]),
    "heading-diapering": (41,None,"#172741",[(0,0,42,36)]),
    "heading-feeding": (40,None,"#172741",[(0,0,41,38)]),
    "heading-health": (43,None,"#172741",[(0,0,44,36)]),
    "heading-playtime": (42,None,"#172741",[(0,0,43,37)]),
}

def generate(name, left, right, color, ornaments):
    image = Image.open(SOURCE / (name + ".webp")).convert("RGB")
    w, h = image.size
    rgb = np.asarray(image).astype("float32")
    r,g,b = [rgb[:,:,i] for i in range(3)]
    if name.startswith("heading-"):
        mask = (r<170)&(g<183)&(b<195)
    elif name=="headline":
        mask = (r<175)&(g<155)&(b<152)
    elif name=="brand":
        mask = (r<175)&(g<160)&(b<150)
    else:
        mask = (r<175)&(g<175)&(b<175)
    mask[:,:left] = False
    if right is not None:
        mask[:,right:] = False
    scale = 4
    blurred = cv2.GaussianBlur(mask.astype("float32"),(0,0),.8)
    smooth = cv2.resize(blurred,(w*scale,h*scale),interpolation=cv2.INTER_CUBIC)
    contours,_ = cv2.findContours((smooth>.45).astype("uint8")*255,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)
    shapes=[]
    for contour in contours:
        if cv2.contourArea(contour) < scale*scale*.85:
            continue
        points = cv2.approxPolyDP(contour,scale*.37,True)[:,0,:] / scale
        if len(points) < 3:
            continue
        mids=(points+np.roll(points,-1,axis=0))/2
        commands=[f"M{mids[-1,0]:.2f} {mids[-1,1]:.2f}"]
        for j,point in enumerate(points):
            commands.append(f"Q{point[0]:.2f} {point[1]:.2f} {mids[j,0]:.2f} {mids[j,1]:.2f}")
        shapes.append(" ".join(commands)+" Z")
    assert shapes, f"No lettering traced for {name}"
    fragments=[]
    for x0,y0,x1,y1 in ornaments:
        crop = np.asarray(image.crop((x0,y0,x1,y1)),dtype="float32")
        background = np.array([254,252,249],dtype="float32")
        alpha = np.clip((np.max(np.abs(crop-background),axis=2)-7)/30*255,0,255).astype("uint8")
        pixels = np.dstack([crop.astype("uint8"),alpha])
        stream=BytesIO()
        Image.fromarray(pixels,"RGBA").save(stream,format="PNG",optimize=True)
        encoded=base64.b64encode(stream.getvalue()).decode("ascii")
        fragments.append(f'<image x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" href="data:image/png;base64,{encoded}"/>')
    path=" ".join(shapes)
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n' + "\n".join(fragments) + f'\n<path d="{path}" fill="{color}" fill-rule="evenodd"/>\n</svg>\n'
    output=TARGET/(name+".svg")
    output.write_text(svg,encoding="utf-8")
    print(f"Created {output.relative_to(ROOT)} ({len(svg)} bytes)")

def apply():
    TARGET.mkdir(parents=True,exist_ok=True)
    for name,(left,right,color,ornaments) in SPECS.items():
        generate(name,left,right,color,ornaments)
    index=ROOT/"index.html"
    html=index.read_text(encoding="utf-8")
    for name in ["brand","headline","tagline","browse-heading","thank-you"]:
        original=f"assets/approved/{name}.webp"
        replacement=f"assets/type/{name}.svg"
        assert original in html or replacement in html,original
        html=html.replace(original,replacement)
    index.write_text(html,encoding="utf-8")
    js_file=ROOT/"app.js"
    js=js_file.read_text(encoding="utf-8")
    old="art('heading-'+category.id)"
    new="`assets/type/heading-${category.id}.svg`"
    assert old in js or new in js
    js_file.write_text(js.replace(old,new),encoding="utf-8")

if __name__=="__main__":
    apply()
