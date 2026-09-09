# Numark Total Control — local-review MIDI guide

**Status: current WebDeckDJ app mapping. Physical locations are source-verified; attached-hardware behavior is not acceptance-tested. Local review only. Redistribution rights for the source artwork are unverified; do not externally publish these assets until rights are resolved.**

## Assets

- `numark-total-control-guide.svg`: self-contained, inert SVG; 1520 × 1760 viewBox and intrinsic dimensions. Preferred zoomable illustration. Includes SVG title, description and readable text labels.
- `numark-total-control-guide.png`: 1520 × 1760 raster rendering of the SVG.
- `popup-preview.png`: 760 × 880 rendering for popup-width review; not a replacement for the full-resolution guide.
- `source-original.svg.txt`: exact, unchanged 185,917-byte source preserved as text, not an embeddable SVG. Do not embed it.
- `source-preview.png`: original source rendered at 1400 × 1270, retained for anchor comparison. Contains obsolete Mixxx annotations; **not the current mapping guide**.
- `build-guide.py`: bounded reproducible illustration builder; writes only `numark-total-control-guide.svg` in this directory.

## Accessible mapping description

Top view: Deck A is on the left; Deck B is on the right.

For **both decks**, the art follows the decoder and current Mixer owners:

- **Pitch / playback speed:** turn the top **GAIN** knob in the inner vertical knob column. This is an intentional app remap, not the factory gain function. The physical pitch sliders at the far left/right are **not mapped**.
- **Pitch step:** the physical pitch-bend −/+ buttons make persistent −0.1/+0.1 percentage-point adjustments. They do not use the factory temporary-bend behavior.
- **Jog:** while playing, turning temporarily bends playback rate; while paused/ended, it scrolls the play position. Jog does not change the stored pitch.
- **EQ:** below GAIN, the knobs are **Treble, Mid, Bass**, in that top-to-bottom order. Turn for band level; **press the same knob for its band kill switch**. The small circles beside these knobs are **LED indicators, not buttons**. The illustration does not promise LED output support.
- **Loop In / Loop Out:** the lower pair of buttons immediately above each jog wheel, left to right. The mapped persistent pitch-step buttons are the row directly above them.
- **Volume:** the inner vertical fader beside the jog wheel, A left and B right.
- **Transport:** the bottom three buttons on each deck are **Cue, Set Cue, Play**, left to right.
- **FX 1 / FX 2:** the physical FX Amt and Filter Amt knobs drive the app's two serial FX slots. While selecting, four relative MIDI units move one effect step; the physical Select and Filter On/Off buttons switch their respective knob between Select and Strength. Strength remains one percentage point per relative unit. These buttons are mode switches, not bypasses.

**Crossfader:** the bottom horizontal fader; left favors Deck A and right favors Deck B. The intended direction is shown rather than raw MIDI polarity.

**Samples:** the physical Deck A Fine Pitch/Tap pair selects and restarts **Samples1**; the Deck B pair independently selects and restarts **Samples2**. Selection is silent and each Tap restarts only its own channel. The adjacent physical Par and Par On/Off pair on each deck remains unmapped.

**Crate navigation:** Directory returns to the folder list; Browse turns the selection through folders/files; pressing Browse enters the selected folder; Load A/B loads the selected track without starting playback. The manufacturer MIDI diagram places combined Note 79/CC 26 on that encoder, independently of the app dispatch. This is source verification, not an attached-unit acceptance result.

**Cue behavior:** Cue returns to the saved cue and pauses; Set Cue saves the current position. Loop In saves a fresh start; Loop Out sets a later end and activates the manual loop, or exits it when already active. Auto Loop lengths, measured-downbeat controls, timeline actions, and Sync have no physical mapping in the current dispatcher.

**Gray means not mapped in this guide:** outer physical pitch sliders, Sync, Key, PFL/headphone controls, Par/Par On/Off, master controls, and LEDs. No Sync hardware assignment is implied.

Color is supplementary: amber = pitch; green = EQ and knob-press kill; violet = FX and loop; pink = samples; cyan = transport, jog, browsing, and mixing. All mapped controls have text labels.

## Artwork evidence boundary

The exact artwork table is the current `notes`, `controllers`, and `browseNotes` definitions in `js/midi/numark-total-control.mjs`, plus the action dispatcher in `js/components/mixer.jsx` and the EQ/FX owners it calls. The illustration groups those implemented inputs rather than duplicating the full byte table already maintained in `docs/numark-midi.md`. It intentionally excludes software-only Auto Loop, Sync, downbeat, and timeline features.

## Provenance and accuracy

Original local artwork:

`old_projects/Misc_Past_Labs/notes/ds/Misc_Basics/InfoGraphic Cheatsheets/totalControl.svg` (relative to the local GitHub workspace root)

Original SHA-256:

`03dea2f2185287900a7c343a9b3c860fccaaacbdb764484272d9c88dd013919e`

The original is a Total Control cutout/vector template containing a Mixxx logo and alternate microphone/sampler annotations. It is not a photograph. Its identity/layout was visually checked against the official Numark product photo, quickstart manual, and MIDI diagram. The guide reuses its unchanged hardware outline, cutouts, panel paths and fader ticks. Obsolete text, text-as-path labels and the Mixxx logo are excluded from the derived drawing, not modified in the original. All unmapped geometry is recolored neutral gray. Highlight outlines and leader endpoints are measured against the source rendering; this is a visual guide, not a dimensionally certified replacement faceplate or fabrication template. No fader cap positions were invented.

Official references consulted:

- Product: https://www.numark.com/product/totalcontrol
- Product photo: https://www.numark.com/images/sized/images/product_large/total_control_new_ortho_large-624x390.jpg
- Quickstart v1.5, printed pages 6–7: https://www.numark.com/images/product_downloads/total_control___quickstart_guide___v1.5.pdf
- Hardware MIDI diagram: https://www.numark.com/images/product_downloads/totalcontrol_midimap.pdf
- Secondary input cross-check: https://raw.githubusercontent.com/mixxxdj/mixxx/main/res/controllers/Numark%20Total%20Control.midi.xml

Important manual detail: EQ is explicitly push-to-kill, with an LED beside the knob. Hardware GAIN inputs are CC 13/14 (0x0d/0x0e); the outer physical pitch-slider inputs are CC 11/12 (0x0b/0x0c). The guide intentionally assigns pitch/speed to the former, per Carlos's request. The upstream mapping is evidence about physical input identity, not authority for this app's chosen actions.

## License / publication limit

The local SVG metadata identifies an SVG image but contains no explicit creator attribution or redistribution license. Its folder placement does not establish permission to republish. Numark/Mixxx names and original artwork remain their respective owners' material. This directory is supplied **for local review**, without a claim of relicensing the derivative. Resolve underlying artwork rights before external deployment. Official reference PDFs were downloaded for inspection and removed afterward; only their URLs are retained here. The original file outside this directory remains untouched.

## Sanitization and reproduction

The displayed SVG is rebuilt from an explicit drawing-path allowlist. It includes only SVG drawing/text tags and a single local-fragment clip path, with no scripts, event handlers, links, external images, embedded remote resources, foreign objects, animation or external font dependencies. The byte-preserved original has a `.txt` suffix and must not be used as the popup image.

From this directory:

```sh
python3 build-guide.py
inkscape numark-total-control-guide.svg --export-type=png --export-filename=numark-total-control-guide.png --export-width=1520
inkscape numark-total-control-guide.svg --export-type=png --export-filename=popup-preview.png --export-width=760
```

Verified: successful Inkscape rasterization, native visual inspection against the source and official MIDI diagram, and a 760px popup-size visual check. The guide SVG, full PNG and popup PNG are checked for exact served-byte parity at `http://127.0.0.1:8876/music/assets/midi/numark-total-control/`. Attached-controller testing and public deployment are separate tasks.
