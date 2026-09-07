#!/usr/bin/env python3
"""Rebuild the local-review guide from the preserved source's exact path geometry.
Only this directory is written. No dependencies beyond Python and lxml; render with Inkscape.
"""
from pathlib import Path
from copy import deepcopy
from lxml import etree as E

HERE = Path(__file__).resolve().parent
NS = 'http://www.w3.org/2000/svg'
def tag(n): return '{'+NS+'}'+n
def node(parent, name, **attrs):
    return E.SubElement(parent, tag(name), {k.replace('_','-'):str(v) for k,v in attrs.items()})
def text(parent, x, y, value, size=24, color='#e8eef5', anchor='middle', weight=600):
    n=node(parent,'text',x=x,y=y,fill=color,font_size=size,font_weight=weight,text_anchor=anchor,font_family='DejaVu Sans, sans-serif'); n.text=value; return n

def line(parent, pts, color, width=3):
    return node(parent,'polyline',points=' '.join(f'{x},{y}' for x,y in pts),fill='none',stroke=color,stroke_width=width,stroke_linecap='round',stroke_linejoin='round')

src=E.parse(str(HERE/'source-original.svg.txt'), E.XMLParser(resolve_entities=False,no_network=True))
root=E.Element(tag('svg'),nsmap={None:NS},viewBox='0 0 1520 1520',width='1520',height='1520',role='img',attrib={'aria-labelledby':'guide-title guide-desc'})
node(root,'title',id='guide-title').text='Numark Total Control — WebDeckDJ approved target MIDI guide'
node(root,'desc',id='guide-desc').text=(
    'Top view; Deck A left and Deck B right. On both decks, the top GAIN knob controls pitch and playback speed; '
    'the outer physical pitch slider is not mapped. Under each GAIN knob, Treble, Mid and Bass EQ knobs control band levels; '
    'press each EQ knob to activate its kill switch. The small circles beside the EQ knobs are LEDs, not kill buttons. '
    'Loop In and Loop Out are the two buttons immediately above each jog wheel. Bottom transport buttons, left to right '
    'on each deck: Cue, Set Cue, Play. The two inner vertical faders control deck volume. The bottom horizontal crossfader '
    'selects Deck A to the left and Deck B to the right. The Directory button returns to folders; the center browse encoder '
    'moves the selection and enters a folder; the left/right Load buttons load the selected track into Deck A/B without playback. '
    'Gray controls, including jog wheels, Sync, FX, master and headphone '
    'controls, are not mapped in this guide. Approved target mapping, not a claim of completed integration or hardware testing.')
node(root,'rect',x=0,y=0,width=1520,height=1520,rx=24,fill='#0b1018')
text(root,60,50,'NUMARK TOTAL CONTROL',32,anchor='start',weight=700)
text(root,1460,50,'MIDI GUIDE',22,color='#97a6b9',anchor='end')
text(root,60,91,'Approved target mapping',22,color='#97a6b9',anchor='start',weight=400)
text(root,1460,91,'Gray = not mapped',22,color='#97a6b9',anchor='end',weight=400)
text(root,80,135,'DECK A',26,color='#e8eef5',anchor='start')
text(root,1440,135,'DECK B',26,color='#e8eef5',anchor='end')

# Controller template at 1400px wide; unchanged source paths retain exact physical geometry.
scene=node(root,'g',id='controller',transform='translate(60 160)')
scale=1400/343.34668
base=node(scene,'g',id='sanitized-source-geometry',transform=f'scale({scale})')
node(base,'rect',x=0,y=0,width=343.34668,height=311.58667,rx=2,fill='#35404e')
defs=node(base,'defs')
clip=deepcopy(src.xpath('//*[@id="clipPath36"]')[0]); defs.append(clip)
geom=node(base,'g',transform='matrix(1.3333333,0,0,-1.3333333,0,311.58667) scale(0.1)')
# Explicit geometry allowlist: no source text, links, images, metadata, scripts, logos, or foreign objects.
ids=[22]+list(range(38,74,2))+list(range(822,928,2))
for ident in ids:
    found=src.xpath('//*[@id=$i]',i=f'path{ident}')
    if not found: continue
    original=found[0]
    color='#151d28' if ident==22 else '#263241' if 38<=ident<=72 else '#4c5a6c'
    if ident in [40]: color='#151d28'
    if ident in [54,56,58,60,62,64,66,68]: color='#485463'
    p=node(geom,'path',id=f'source-path{ident}',d=original.get('d'),fill=color)
    if 38<=ident<=72: p.set('clip-path','url(#clipPath36)')

amber='#ffc86a'; green='#73e3ad'; cyan='#77d5ff'; purple='#c4a1ff'; white='#e8eef5'
# Source coordinates below are measured on the native 1400px source raster and checked against the original cutouts.
for x in [553,845]:
    node(scene,'circle',cx=x,cy=62,r=48,fill='#302719',stroke=amber,stroke_width=4)
    text(scene,x,60,'Pitch',25,color=amber)
    text(scene,x,84,'/ speed',18,color=amber,weight=400)
    text(scene,x,124,'GAIN knob',20,color=amber,weight=400)
    for y,label in [(188,'Treble'),(314,'Mid'),(440,'Bass')]:
        node(scene,'circle',cx=x,cy=y,r=48,fill='#142d26',stroke=green,stroke_width=4)
        text(scene,x,y+1,label,24,color=green)
        text(scene,x,y+24,'press: kill',15,color=green,weight=400)

# Short leader callouts explicitly attach to EQ knobs, never the adjacent LEDs.
text(scene,300,442,'EQ + push kill',24,color=green)
line(scene,[(399,435),(453,435),(505,440)],green)
text(scene,1100,442,'EQ + push kill',24,color=green)
line(scene,[(1001,435),(947,435),(893,440)],green)

# Original lower loop buttons, NOT the pitch-bend buttons on the row above.
for x,label in [(244,'Loop In'),(384,'Loop Out'),(1013,'Loop In'),(1153,'Loop Out')]:
    node(scene,'rect',x=x-51,y=622,width=102,height=79,rx=8,fill='#29213d',stroke=purple,stroke_width=3)
    text(scene,x,654,'Loop',24,color=purple)
    text(scene,x,684,label.split()[-1],24,color=purple)

# Source channel-fader slots. Highlight the existing slots, not an invented fader cap position.
for x,deck in [(552,'A'),(843,'B')]:
    node(scene,'rect',x=x-12,y=746,width=24,height=313,rx=12,fill='#1e3644',stroke=cyan,stroke_width=3)
    text(scene,x,1094,'Volume '+deck,25,color=cyan)
    line(scene,[(x,1060),(x,1071)],cyan)

# Neutral jog centers carry no action labels or color rings.
for x in [223,1177]:
    text(scene,x,924,'JOG',27,color='#7f8b9a',weight=400)
    text(scene,x,957,'not mapped',21,color='#7f8b9a',weight=400)
# Outer physical pitch sliders are intentionally left neutral.
for x in [81,1316]:
    text(scene,x,719,'unmapped',18,color='#97a6b9',weight=400)

for x,label in [(80,'Cue'),(220,'Set Cue'),(361,'Play'),(1037,'Cue'),(1177,'Set Cue'),(1317,'Play')]:
    node(scene,'rect',x=x-51,y=1164,width=102,height=80,rx=8,fill='#183443',stroke=cyan,stroke_width=3)
    if label=='Set Cue':
        text(scene,x,1198,'Set',23,color=cyan)
        text(scene,x,1226,'Cue',23,color=cyan)
    else:
        text(scene,x,1212,label,23,color=cyan)
node(scene,'rect',x=543,y=1167,width=314,height=24,rx=12,fill='#24404b',stroke=cyan,stroke_width=3)
text(scene,700,1140,'Crossfader',25,color=cyan)
line(scene,[(700,1148),(700,1166)],cyan)
text(scene,567,1240,'← A',25,color=cyan)
text(scene,833,1240,'B →',25,color=cyan)
text(root,60,1480,'GAIN → pitch/speed',22,color=amber,anchor='start')
text(root,760,1480,'EQ: turn = level · press = kill',22,color=green)
text(root,1460,1480,'Local review',20,color='#97a6b9',anchor='end',weight=400)
# Crate browsing controls are separate from transport and playback.
text(root,60,1415,'Directory = folders',20,color=cyan,anchor='start')
text(root,760,1415,'Browse encoder: turn = move · press = enter',20,color=cyan)
text(root,1460,1415,'Load A / Load B = load only',20,color=cyan,anchor='end')

# Defense-in-depth verification: output only inert SVG drawing tags and local fragment references.
allowed={'svg','title','desc','rect','g','defs','clipPath','path','circle','text','polyline'}
for e in root.iter():
    assert E.QName(e).localname in allowed
    for k,v in e.attrib.items():
        assert not k.lower().startswith('on') and 'href' not in k.lower()
        assert 'url(' not in v or v=='url(#clipPath36)'
(HERE/'numark-total-control-guide.svg').write_bytes(E.tostring(root,xml_declaration=True,encoding='UTF-8',pretty_print=True))
print('Wrote',HERE/'numark-total-control-guide.svg','1520 × 1520')
