#!/usr/bin/env python3
"""Rebuild the WebDeckDJ guide from the preserved source's exact path geometry.
Only this directory is written. No dependencies beyond Python and lxml; render with Inkscape.
"""
from pathlib import Path
from copy import deepcopy
from lxml import etree as E

HERE = Path(__file__).resolve().parent
NS = 'http://www.w3.org/2000/svg'


def tag(name):
    return '{' + NS + '}' + name


def node(parent, name, **attrs):
    return E.SubElement(parent, tag(name), {
        key.replace('_', '-'): str(value) for key, value in attrs.items()
    })


def text(parent, x, y, value, size=24, color='#e8eef5', anchor='middle', weight=600):
    item = node(parent, 'text', x=x, y=y, fill=color, font_size=size,
                font_weight=weight, text_anchor=anchor,
                font_family='DejaVu Sans, sans-serif')
    item.text = value
    return item


def line(parent, points, color, width=3):
    return node(parent, 'polyline',
                points=' '.join(f'{x},{y}' for x, y in points), fill='none',
                stroke=color, stroke_width=width, stroke_linecap='round',
                stroke_linejoin='round')


def knob(parent, x, y, lines, color, radius=48, sizes=None):
    node(parent, 'circle', cx=x, cy=y, r=radius, fill='#172330',
         stroke=color, stroke_width=4)
    sizes = sizes or ([24] if len(lines) == 1 else [22, 17])
    offsets = [7] if len(lines) == 1 else [-2, 22]
    for label, size, offset in zip(lines, sizes, offsets):
        text(parent, x, y + offset, label, size, color=color,
             weight=700 if offset <= 7 else 500)


def button(parent, x, y, lines, color, width=102, height=58, size=20):
    node(parent, 'rect', x=x - width / 2, y=y - height / 2,
         width=width, height=height, rx=8, fill='#172b38',
         stroke=color, stroke_width=3)
    if len(lines) == 1:
        text(parent, x, y + 7, lines[0], size, color=color)
    else:
        text(parent, x, y - 1, lines[0], size, color=color)
        text(parent, x, y + 21, lines[1], size - 2, color=color, weight=500)


src = E.parse(str(HERE / 'source-original.svg.txt'),
              E.XMLParser(resolve_entities=False, no_network=True))
root = E.Element(tag('svg'), nsmap={None: NS}, viewBox='0 0 1520 1760',
                 width='1520', height='1760', role='img',
                 attrib={'aria-labelledby': 'guide-title guide-desc'})
node(root, 'title', id='guide-title').text = (
    'Numark Total Control — current WebDeckDJ MIDI mapping')
node(root, 'desc', id='guide-desc').text = (
    'Source-verified top view of the current app mapping. Deck A is left and Deck B is right. '
    'Mapped controls include both FX knobs and their mode buttons, Fine Pitch and Tap repurposed '
    'for Samples1 and Samples2, Gain repurposed for pitch, persistent pitch step buttons, jog wheels, '
    'deck volume, crossfader, push-to-kill EQ, manual Loop In and Out, Cue, Set Cue, Play, and crate '
    'browse, enter, directory, and load controls. Gray controls are not mapped: PFL, Key, Sync, Par '
    'and Par On/Off, master and headphone controls, and physical pitch sliders. Hardware has not been '
    'acceptance-tested. EQ kill is the knob press; the small adjacent circles are LEDs.')
node(root, 'rect', x=0, y=0, width=1520, height=1760, rx=24, fill='#0b1018')
text(root, 60, 50, 'NUMARK TOTAL CONTROL', 32, anchor='start', weight=700)
text(root, 1460, 50, 'MIDI GUIDE', 22, color='#97a6b9', anchor='end')
text(root, 60, 91, 'Current WebDeckDJ app mapping', 22,
     color='#97a6b9', anchor='start', weight=400)
text(root, 1460, 91, 'Gray = not mapped', 22,
     color='#97a6b9', anchor='end', weight=400)
text(root, 80, 135, 'DECK A', 26, anchor='start')
text(root, 1440, 135, 'DECK B', 26, anchor='end')

# Controller template remains 1400px wide. The preserved paths are copied unchanged.
scene = node(root, 'g', id='controller', transform='translate(60 160)')
scale = 1400 / 343.34668
base = node(scene, 'g', id='sanitized-source-geometry', transform=f'scale({scale})')
node(base, 'rect', x=0, y=0, width=343.34668, height=311.58667, rx=2,
     fill='#35404e')
defs = node(base, 'defs')
clip = deepcopy(src.xpath('//*[@id="clipPath36"]')[0])
defs.append(clip)
geom = node(base, 'g',
            transform='matrix(1.3333333,0,0,-1.3333333,0,311.58667) scale(0.1)')
# No source text, links, images, metadata, scripts, logos, or foreign objects.
ids = [22] + list(range(38, 74, 2)) + list(range(822, 928, 2))
for ident in ids:
    found = src.xpath('//*[@id=$i]', i=f'path{ident}')
    if not found:
        continue
    original = found[0]
    color = '#151d28' if ident == 22 else '#263241' if 38 <= ident <= 72 else '#4c5a6c'
    if ident == 40:
        color = '#151d28'
    if ident in [54, 56, 58, 60, 62, 64, 66, 68]:
        color = '#485463'
    path = node(geom, 'path', id=f'source-path{ident}', d=original.get('d'), fill=color)
    if 38 <= ident <= 72:
        path.set('clip-path', 'url(#clipPath36)')

amber = '#ffc86a'
green = '#73e3ad'
cyan = '#77d5ff'
purple = '#c4a1ff'
pink = '#ff9fc7'
gray = '#97a6b9'

# The four physical effect controls on each deck. The button names preserve the panel labels;
# WebDeckDJ uses both buttons as mode switches, not effect bypasses.
for x in [245, 1013]:
    knob(scene, x, 62, ['FX 1', 'turn'], purple)
for x in [384, 1153]:
    knob(scene, x, 62, ['FX 2', 'turn'], purple)
for x in [245, 1013]:
    button(scene, x, 165, ['SELECT', 'mode'], purple)
for x in [384, 1153]:
    button(scene, x, 165, ['FILTER', 'ON/OFF'], purple, size=18)

# Fine Pitch/Tap are the CC3/Note58 and CC7/Note62 pairs. The neighboring PAR pairs stay gray.
for x, sample in [(384, 'Sample 1'), (1153, 'Sample 2')]:
    knob(scene, x, 270, [sample, 'select'], pink, sizes=[18, 17])
    button(scene, x, 370, ['TAP', 'trigger'], pink)
for x in [245, 1013]:
    text(scene, x, 265, 'PAR', 21, color=gray)
    text(scene, x, 289, 'unmapped', 16, color=gray, weight=400)
    text(scene, x, 366, 'PAR ON/OFF', 16, color=gray)
    text(scene, x, 389, 'unmapped', 15, color=gray, weight=400)

# Gain is intentionally repurposed as the current app's pitch/speed owner.
for x in [553, 845]:
    knob(scene, x, 62, ['Pitch', '/ speed'], amber, sizes=[25, 18])
    text(scene, x, 124, 'GAIN knob', 20, color=amber, weight=400)
    for y, label in [(188, 'Treble'), (314, 'Mid'), (440, 'Bass')]:
        knob(scene, x, y, [label, 'press: kill'], green, sizes=[24, 15])

# Leaders terminate on the EQ knobs, never the adjacent LED circles.
text(scene, 300, 442, 'EQ + push kill', 22, color=green)
line(scene, [(397, 435), (451, 435), (505, 440)], green)
text(scene, 1100, 442, 'EQ + push kill', 22, color=green)
line(scene, [(1003, 435), (949, 435), (893, 440)], green)

# Physical pitch sliders are gray; the bend buttons are persistent app steps.
for x in [81, 1316]:
    text(scene, x, 701, 'PITCH', 17, color=gray)
    text(scene, x, 724, 'unmapped', 16, color=gray, weight=400)
for x, label in [(245, '− 0.1'), (384, '+ 0.1'), (1013, '− 0.1'), (1153, '+ 0.1')]:
    button(scene, x, 520, ['PITCH', label], amber, size=18)

# Manual Loop buttons are the lower pair immediately above each jog wheel.
for x, label in [(245, 'IN'), (384, 'OUT'), (1013, 'IN'), (1153, 'OUT')]:
    button(scene, x, 650, ['LOOP', label], purple, height=78, size=22)

# Central library controls: the official input diagram shows Note79 on the CC26 encoder press.
knob(scene, 700, 540, ['Browse', 'turn / press'], cyan, radius=55, sizes=[22, 15])
for x, label in [(553, 'LOAD A'), (845, 'LOAD B')]:
    button(scene, x, 620, [label, 'load only'], cyan, width=105, height=62, size=18)
button(scene, 700, 680, ['DIRECTORY', 'folders'], cyan, width=110, height=62, size=17)

# Existing fader slots are highlighted without inventing cap positions.
for x, deck in [(552, 'A'), (843, 'B')]:
    node(scene, 'rect', x=x - 12, y=746, width=24, height=313, rx=12,
         fill='#1e3644', stroke=cyan, stroke_width=3)
    text(scene, x, 1094, 'Volume ' + deck, 25, color=cyan)
    line(scene, [(x, 1060), (x, 1071)], cyan)

for x, deck in [(223, 'A'), (1177, 'B')]:
    node(scene, 'circle', cx=x, cy=924, r=199, fill='#1d3340',
         stroke=cyan, stroke_width=5, opacity='0.72')
    text(scene, x, 905, 'JOG ' + deck, 30, color=cyan)
    text(scene, x, 943, 'playing: bend', 21, color=cyan, weight=500)
    text(scene, x, 976, 'paused: scroll', 21, color=cyan, weight=500)

for x, label in [(80, 'Cue'), (220, 'Set Cue'), (361, 'Play'),
                 (1037, 'Cue'), (1177, 'Set Cue'), (1317, 'Play')]:
    button(scene, x, 1204, label.split(), cyan, height=80, size=23)
node(scene, 'rect', x=543, y=1167, width=314, height=24, rx=12,
     fill='#24404b', stroke=cyan, stroke_width=3)
text(scene, 700, 1140, 'Crossfader', 25, color=cyan)
line(scene, [(700, 1148), (700, 1166)], cyan)
text(scene, 567, 1240, '← A', 25, color=cyan)
text(scene, 833, 1240, 'B →', 25, color=cyan)

# Explicitly name the prominent neutral controls so gray does not imply an omitted claim.
for x, y, label in [(80, 62, 'PFL'), (80, 165, 'KEY'), (80, 270, 'SYNC'),
                    (1317, 62, 'PFL'), (1317, 165, 'KEY'), (1317, 270, 'SYNC')]:
    text(scene, x, y + 7, label, 19, color=gray)
text(scene, 700, 113, 'MASTER', 18, color=gray)
text(scene, 700, 239, 'PH MIX', 17, color=gray)
text(scene, 700, 365, 'PH VOL', 17, color=gray)

# Behavior legend uses app semantics, not the hardware's original software labels.
text(root, 60, 1485, 'HOW THE CURRENT APP USES IT', 23, color='#e8eef5', anchor='start')
text(root, 60, 1530, 'FX 1 / FX 2', 22, color=purple, anchor='start')
text(root, 255, 1530, 'Turn selects effect (4 relative units = 1 step).', 20,
     color='#d9e1eb', anchor='start', weight=400)
text(root, 255, 1562, 'SELECT / FILTER buttons switch to Strength; sensitivity stays 1% per unit.', 20,
     color='#d9e1eb', anchor='start', weight=400)
text(root, 60, 1610, 'CUE / LOOPS', 22, color=cyan, anchor='start')
text(root, 255, 1610, 'Cue returns to the saved cue and pauses · Set Cue saves the current position.', 20,
     color='#d9e1eb', anchor='start', weight=400)
text(root, 255, 1642, 'Loop In saves a new start · Loop Out sets/activates or exits the manual loop.', 20,
     color='#d9e1eb', anchor='start', weight=400)
text(root, 60, 1692, 'Hardware layout source-verified · input only · no LED output · not hardware acceptance-tested',
     19, color=gray, anchor='start', weight=400)
text(root, 60, 1728, 'Gray: PFL · Key · Sync · PAR / PAR On-Off · master / headphones · physical pitch sliders',
     18, color=gray, anchor='start', weight=400)

# Defense in depth: output only inert drawing tags and local fragment references.
allowed = {'svg', 'title', 'desc', 'rect', 'g', 'defs', 'clipPath', 'path',
           'circle', 'text', 'polyline'}
for element in root.iter():
    assert E.QName(element).localname in allowed
    for key, value in element.attrib.items():
        assert not key.lower().startswith('on') and 'href' not in key.lower()
        assert 'url(' not in value or value == 'url(#clipPath36)'

output = HERE / 'numark-total-control-guide.svg'
output.write_bytes(E.tostring(root, xml_declaration=True, encoding='UTF-8',
                              pretty_print=True))
print('Wrote', output, '1520 × 1760')
