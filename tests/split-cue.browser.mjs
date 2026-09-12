// Author: Codex app agent, 2026-09-11
// Run with PLAYWRIGHT_MODULE pointing to an installed playwright module.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on("pageerror", error => console.error(error.message));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.goto(process.env.TEST_URL || 'http://localhost:8879/dj.html');
  await page.waitForSelector('#split-cue', { timeout: 60000 });
  assert.equal(await page.locator('#split-cue').getAttribute('aria-pressed'), 'false');
  await page.locator('#split-cue').click();
  await page.waitForSelector('#split-cue[aria-pressed="true"]');
  await page.getByRole('button', { name: 'PFL A', exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'PFL A' && b.getAttribute('aria-pressed') === 'true')); 
  for (const [width, height] of [[1440, 900], [393, 852], [852, 393]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `/tmp/split-cue-${width}.png`, fullPage: true });
    assert.ok(await page.locator('#split-cue').isVisible());
    const bounds = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    const monitorBounds = await page.locator('.monitor-controls').boundingBox();
    assert.ok(monitorBounds.x >= 0 && monitorBounds.x + monitorBounds.width <= bounds.width, JSON.stringify(monitorBounds));
    const decks = await page.locator('.deck-row > .col-md-6').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    assert.equal(decks.length, 2);
    assert.equal(decks[0].y, decks[1].y);
    assert.ok(decks[1].x > decks[0].x);
  }
  await page.getByRole('button', { name: 'Load to Deck A', exact: true }).click();
  await page.getByRole('button', { name: 'Play Deck A', exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).some(a => !a.paused && a.currentTime > 0.1));
  await page.locator('#deck-A-volume').focus();
  await page.keyboard.press('Home');
  await page.evaluate(() => {
    const context = window.dj.audio.getAudioContext();
    const router = window.dj.getOutputRouter();
    window.testCue = context.createAnalyser();
    window.testMaster = context.createAnalyser();
    router.pfl.left.connect(window.testCue);
    router.master.connect(window.testMaster);
  });
  await page.waitForFunction(() => {
    const peak = node => { const data = new Float32Array(node.fftSize); node.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs)); };
    return peak(window.testCue) > 0.001 && peak(window.testMaster) < 0.00001;
  });
  console.log('Bundled MP3 with fader down: PFL audible, master silent');
  const source = await readFile(new URL('../js/audio/output-router.js', import.meta.url), 'utf8');
  const results = await page.evaluate(async source => {
    // Render the shipped output graph, with distinct stereo signals per deck.
    const factory = new Function('window', source + '; return window.dj.createOutputRouter;')({});
    const results = [];
    for (const scenario of [
      { name: 'fader-down PFL / no cue leak', enabled: true, left: true, a: 0, b: 0, expected: [.3, 0] },
      { name: 'master only', enabled: true, a: 0, b: 1, expected: [0, .1] },
      { name: 'isolated cue and master', enabled: true, left: true, a: 0, b: 1, expected: [.3, .1] },
      { name: 'PH Mix master', enabled: true, left: true, mix: 1, a: 0, b: 1, expected: [.1, .1] },
      { name: 'PH volume', enabled: true, left: true, volume: .5, a: 0, b: 1, expected: [.15, .1] },
      { name: 'master volume independent of PFL', enabled: true, left: true, masterVolume: .5, a: 0, b: 1, expected: [.3, .05] },
      { name: 'both PFL gain safe', enabled: true, left: true, right: true, a: 0, b: 0, expected: [.2, 0] },
      { name: 'switch back to stereo', enabled: false, left: true, a: 0, b: 1, expected: [.3, -.1] }
    ]) {
      const context = new OfflineAudioContext(2, 24000, 48000);
      const router = factory(context);
      for (const [deck, values, level] of [['left', [.2, .4], scenario.a], ['right', [.3, -.1], scenario.b]]) {
        const buffer = context.createBuffer(2, 24000, 48000);
        values.forEach((v, channel) => buffer.getChannelData(channel).fill(v));
        const source = context.createBufferSource(); source.buffer = buffer;
        const fader = context.createGain(); fader.gain.value = level;
        source.connect(fader).connect(router.master);
        source.connect(router.pfl[deck]); source.start();
      }
      router.update({ enabled: true, left: true });
      let switched;
      if (scenario.name === 'switch back to stereo') {
        switched = context.suspend(0.2).then(() => { router.update(scenario); return context.resume(); });
      } else router.update(scenario);
      const rendered = await context.startRendering();
      if (switched) await switched;
      const actual = [0, 1].map(c => rendered.getChannelData(c)[20000]);
      if (actual.some((v, c) => Math.abs(v - scenario.expected[c]) > 1e-6)) throw Error(JSON.stringify({ scenario, actual }));
      results.push({ name: scenario.name, actual });
    }
    return results;
  }, source);
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
