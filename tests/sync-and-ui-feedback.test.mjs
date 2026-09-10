import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);

async function loadSyncHelpers() {
  const source = await readFile(new URL('js/beat/sync.js', root), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, Array, Boolean, Math, Number }, { filename: 'sync.js' });
  return window.dj.beat;
}

test('completed sync activity stays active until invalidated and teardown suppresses late state', async () => {
  const beat = await loadSyncHelpers();
  const changes = [];
  const activity = beat.createSyncActivity(deck => changes.push(deck));

  const plan = beat.getSyncPlan({
    leaderAudio: { paused: false, ended: false, seeking: false, readyState: 4, duration: 30, currentTime: 1, playbackRate: 1 },
    followerAudio: { paused: true, ended: false, seeking: false, readyState: 4, duration: 30, currentTime: 1, playbackRate: 1 },
    leaderTrack: { url: 'leader' },
    followerTrack: { url: 'follower' },
    leaderResult: { bpm: 120, ticks: [0, 1, 2, 3, 4] },
    followerResult: { bpm: 120, ticks: [0, 1, 2, 3, 4] },
    leaderLoopActive: false,
    followerLoopActive: false,
    maximumPitch: 8
  });
  assert.equal(plan.enabled, true);
  assert.equal(activity.getActiveDeck(), null, 'eligible or pending alignment is not active sync');
  assert.equal(changes.length, 0);

  assert.equal(activity.activate('left'), true);
  assert.equal(activity.isActive('left'), true);
  assert.equal(activity.isActive('right'), false);
  assert.equal(activity.getActiveDeck(), 'left', 'activity remains latched without a timer');
  assert.deepEqual(changes, ['left']);

  assert.equal(activity.clear(), true);
  assert.equal(activity.getActiveDeck(), null);
  assert.deepEqual(changes, ['left', null]);
  activity.activate('right');
  activity.destroy();
  assert.equal(activity.getActiveDeck(), null);
  assert.equal(activity.activate('left'), false);
  assert.deepEqual(changes, ['left', null, 'right'], 'destroy never publishes a late UI update');
});

test('shipped UI wires pitch feedback, persistent sync blink, bottom MIDI status, and zero deck-to-transport spacing', async () => {
  const [mixer, eq, dj, crate, css] = await Promise.all([
    readFile(new URL('js/components/mixer.jsx', root), 'utf8'),
    readFile(new URL('js/components/eq.jsx', root), 'utf8'),
    readFile(new URL('js/components/dj.jsx', root), 'utf8'),
    readFile(new URL('js/components/crate.jsx', root), 'utf8'),
    readFile(new URL('dj-faders.css', root), 'utf8')
  ]);

  const finishStart = mixer.indexOf('const finishAligned');
  const activation = mixer.indexOf('syncActivityRef.current.activate(followerDeck)', finishStart);
  assert.ok(finishStart >= 0 && activation > finishStart, 'sync becomes active only in successful completion');
  assert.match(mixer, /syncActivityRef\.current\.clear\(\)/);
  assert.match(mixer, /aria-pressed=\{activeSyncDeck === 'left'\}/);
  assert.match(mixer, /aria-pressed=\{activeSyncDeck === 'right'\}/);
  assert.match(css, /\.deck-row \.deck-sync\.is-synced[\s\S]*animation:\s*deck-sync-blink 1s step-end infinite/);

  assert.match(mixer, /adjustDeckPitch\('left', delta\); pulsePitchStep\('left', delta\)/);
  assert.match(mixer, /adjustDeckPitch\('right', delta\); pulsePitchStep\('right', delta\)/);
  assert.match(eq, /pitchStepActive\?\.decrease \? ' is-active'/);
  assert.match(eq, /pitchStepActive\?\.increase \? ' is-active'/);
  assert.match(eq, /onBlur=\{\(\) => onPitchStepCancel\(-0\.1\)\}/);
  assert.match(eq, /onPointerCancel=\{\(\) => onPitchStepCancel\(0\.1\)\}/);
  assert.match(css, /\.pitch-step-buttons \.btn\.is-active/);

  assert.ok(dj.indexOf('midi-status-footer') > dj.indexOf('<Crate'), 'the sole MIDI status message follows the crate');
  assert.doesNotMatch(mixer, /className="midi-status/);
  assert.doesNotMatch(crate, /className="card mb-4 bg-transparent"/);

  assert.match(mixer, /className="row deck-row"/);
  assert.match(css, /\.deck-row \{[^}]*margin-bottom:\s*0 !important/);
  assert.match(css, /\.deck-row > div > \.card > \.card-body \{[^}]*padding-bottom:\s*0/);
  assert.match(css, /\.deck-row \.eq-controls \{[\s\S]*?margin-bottom:\s*0;/);
  assert.match(css, /\.dj-fader-horizontal \{[^}]*height:\s*48px/);
});

test('actual EQ component exposes active pitch icons and dispatches one exact GUI adjustment plus cancellation', async () => {
  const esbuild = require('/home/carlos/Documents/hermes/node_modules/esbuild');
  const ReactHarness = {
    createElement(type, props, ...children) {
      return { type, props: { ...(props || {}), children } };
    },
    useEffect() {},
    useLayoutEffect() {},
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}];
    }
  };
  const built = await esbuild.build({
    entryPoints: [new URL('js/components/eq.jsx', root).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    external: ['react']
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    name => name === 'react' ? ReactHarness : require(name), loaded, loaded.exports
  );

  const adjustments = [];
  const cancellations = [];
  const props = {
    nodesRef: { current: {} },
    nodesVersion: null,
    audioContext: null,
    name: 'A',
    audioRef: { current: null },
    bpmControl: ReactHarness.createElement('span', null, 'BPM'),
    pitch: 0,
    pitchStepActive: { decrease: true, increase: false },
    onPitchChange() {},
    onPitchAdjust: delta => adjustments.push(delta),
    onPitchStepCancel: delta => cancellations.push(delta),
    volume: 100,
    onVolumeChange() {},
    timeline: ReactHarness.createElement('div'),
    scrollPreview: ReactHarness.createElement('div'),
    midiEQRef: { current: { left: null, right: null } },
    midiFxRef: { current: { left: [null, null], right: [null, null] } },
    onMidiEqStateChange() {},
    onMidiFxStateChange() {},
    sampleControl: ReactHarness.createElement('div'),
    fxRack: null,
    beatAvailable: false
  };
  const tree = loaded.exports.default(props);
  const findByLabel = (node, label) => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.['aria-label'] === label) return node;
    for (const child of node.props?.children || []) {
      if (Array.isArray(child)) {
        for (const nested of child) {
          const match = findByLabel(nested, label);
          if (match) return match;
        }
      } else {
        const match = findByLabel(child, label);
        if (match) return match;
      }
    }
    return null;
  };
  const decrease = findByLabel(tree, 'Decrease Deck A pitch by 0.1 percentage points');
  const increase = findByLabel(tree, 'Increase Deck A pitch by 0.1 percentage points');
  assert.match(decrease.props.className, /\bis-active\b/);
  assert.doesNotMatch(increase.props.className, /\bis-active\b/);
  decrease.props.onClick();
  increase.props.onClick();
  assert.deepEqual(adjustments, [-0.1, 0.1]);
  decrease.props.onBlur();
  assert.deepEqual(cancellations, [-0.1]);
});
