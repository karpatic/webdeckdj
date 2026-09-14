// Author: Codex app agent, 2026-09-14
// Isolated browser; synthetic MIDI only. No playback or user's stored music.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/install-navigation.browser.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launchPersistentContext('', { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const input = new EventTarget();
    Object.assign(input, { id: 'test-midi', type: 'input', manufacturer: 'Numark', name: 'Total Control', state: 'connected', async open() {}, async close() {} });
    const access = new EventTarget();
    access.inputs = new Map([[input.id, input]]); access.outputs = new Map();
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access });
    window.sendMidi = note => {
      for (const data of [[0x90, note, 127], [0x80, note, 0]]) {
        const event = new Event('midimessage'); event.data = new Uint8Array(data); input.dispatchEvent(event);
      }
    };
    window.scrollCalls = [];
    const scroll = window.scrollTo.bind(window);
    window.scrollTo = options => { window.scrollCalls.push(options); scroll(options); };
    window.directoryCalls = [];
    const intoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(options) { window.directoryCalls.push(options); intoView.call(this, options); };
  });
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8879/');
  await page.waitForSelector('.crate-track-row', { timeout: 60000 });
  const session = await page.context().newCDPSession(page);
  const manifest = await session.send('Page.getAppManifest');
  assert.deepEqual(manifest.errors, []);
  assert.deepEqual((await session.send('Page.getInstallabilityErrors')).installabilityErrors, [], 'Chromium installability checks');
  const data = JSON.parse(manifest.data);
  assert.equal(data.display, 'standalone');
  for (const icon of data.icons) {
    const result = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode(); return [img.naturalWidth, img.naturalHeight];
    }, icon.src);
    assert.equal(result.join('x'), icon.sizes);
  }
  for (const [width, height] of [[393, 852], [852, 393], [320, 568], [576, 800], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}`);
    const decks = await page.locator('.deck-row > div').evaluateAll(els => els.map(e => e.getBoundingClientRect().x));
    assert.ok(decks[1] > decks[0]);
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const a = box('.eq-controls-A'), b = box('.eq-controls-B');
      const loopsA = box('.eq-controls-A .loop-buttons'), loopsB = box('.eq-controls-B .loop-buttons');
      const fxA = box('.eq-controls-A .deck-fx-section'), fxB = box('.eq-controls-B .deck-fx-section');
      return {
        sameRow: a.y === b.y,
        outerLoops: loopsA.right <= fxA.x && loopsB.x >= fxB.right,
        alignedLoops: loopsA.y === fxA.y && loopsB.y === fxB.y,
        gap: box('.shared-transport').y - Math.max(a.bottom, b.bottom),
        knobs: [...document.querySelectorAll('.deck-row .rotary-control')].every(e => e.offsetWidth >= 44 && e.offsetHeight >= 44),
        footerBelowCrate: !document.querySelector('.midi-status-footer') || box('.midi-status-footer').y >= box('.crate-browser').bottom
      };
    });
    assert.ok(layout.sameRow && layout.outerLoops && layout.alignedLoops, `mirrored outer loops at ${width}`);
    assert.ok(layout.gap <= 1, `no trailing deck reservation at ${width}: ${layout.gap}`);
    assert.ok(layout.knobs, `touch knobs retained at ${width}`);
    assert.ok(layout.footerBelowCrate, 'MIDI status stays below crate');
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: 'MIDI', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'MIDI', exact: true }).click();
  const noPlayback = async () => assert.ok(await page.locator('audio').evaluateAll(els => els.every(a => a.paused)));
  for (const reduced of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion: reduced });
    const behavior = reduced === 'reduce' ? 'instant' : 'smooth';
    await page.evaluate(() => { window.scrollCalls = []; window.directoryCalls = []; window.sendMidi(0x48); });
    await page.waitForFunction(() => window.directoryCalls.length === 1);
    assert.equal(await page.evaluate(() => window.directoryCalls[0].behavior), behavior);
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => scrollY > 0));
    await page.getByRole('button', { name: 'Directory', exact: true }).click();
    assert.equal(await page.evaluate(() => window.directoryCalls.length), 2);
    await page.locator('.crate-track-row > button').first().click();
    await page.getByRole('button', { name: /^Load left to Deck A:/ }).click();
    await page.waitForFunction(() => window.scrollCalls.length === 1);
    await page.waitForFunction(() => scrollY === 0);
    assert.equal(await page.evaluate(() => window.scrollCalls[0].behavior), behavior);
    await noPlayback();
    for (const note of [0x34, 0x4b]) {
      await page.evaluate(() => window.sendMidi(0x48));
      await page.waitForTimeout(200);
      await page.locator('.crate-directories[data-browse-focus="true"]').waitFor();
      await page.evaluate(() => window.sendMidi(0x4f));
      await page.locator('.crate-files[data-browse-focus="true"]').waitFor();
      await page.getByText('Loading MP3…', { exact: true }).waitFor({ state: 'hidden' });
      const before = await page.evaluate(() => window.scrollCalls.length);
      await page.evaluate(note => window.sendMidi(note), note);
      await page.waitForFunction(before => window.scrollCalls.length === before + 1, before).catch(async error => { console.log(await page.locator('.crate-browser').innerText(), await page.locator('.midi-status-footer').allTextContents()); throw error; });
      await page.waitForFunction(() => scrollY === 0);
      await noPlayback();
    }
    const count = await page.evaluate(() => window.scrollCalls.length);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.scrollCalls.length), count, 'renders do not scroll again');
  }
  await page.locator('.crate-track-row > button').first().click();
  const guiBefore = await page.evaluate(() => window.scrollCalls.length);
  await page.getByRole('button', { name: 'Load to Deck B', exact: true }).click();
  await page.waitForFunction(before => window.scrollCalls.length === before + 1, guiBefore);
  await page.waitForFunction(() => scrollY === 0);
  await noPlayback();
  // Relocated loop controls still use the same paused deck transport and state.
  for (const deck of ['A', 'B']) {
    await page.evaluate(deck => { document.querySelector(`#deck-${deck}-audio`).currentTime = 1; }, deck);
    await page.locator(`#deck-${deck}-loop-in`).click();
    await page.evaluate(deck => { document.querySelector(`#deck-${deck}-audio`).currentTime = 2; }, deck);
    await page.locator(`#deck-${deck}-loop-out`).click();
    assert.equal(await page.locator(`#deck-${deck}-loop-out`).getAttribute('aria-pressed'), 'true');
    await page.locator(`#deck-${deck}-loop-out`).click();
    assert.equal(await page.locator(`#deck-${deck}-loop-out`).getAttribute('aria-pressed'), 'false');
    for (const beats of [8, 16, 4]) {
      await page.getByRole('button', { name: `Cycle Deck ${deck} Auto Loop length: 4, 8, then 16 measured beats`, exact: true }).click();
      assert.equal(await page.locator(`#deck-${deck}-auto-loop`).getAttribute('aria-label'), `Deck ${deck} Auto Loop, ${beats} measured beats`);
    }
    await noPlayback();
  }
  await page.screenshot({ path: '/tmp/webdeck-mobile.png', fullPage: true });
  // Failed network loads must leave the user in the crate with an error.
  await page.route('**/examples/dj-tutorial/*.mp3', route => route.abort());
  await page.locator('.crate-track-row > button').first().click();
  const before = await page.evaluate(() => window.scrollCalls.length);
  await page.getByRole('button', { name: 'Load to Deck B', exact: true }).click();
  await page.getByText(/Could not load.*bundled audio file/).waitFor();
  assert.equal(await page.evaluate(() => window.scrollCalls.length), before);
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('PASS: manifest/icons; compact 320/393/576/852/1024/1440 layouts; outer loops and transport gap; loop in/out and length cycling; GUI/mobile and MIDI loads/Directory; smooth/reduced motion; no render scrolling or autoplay; failed load stays in crate.');
} finally { await browser.close(); }
