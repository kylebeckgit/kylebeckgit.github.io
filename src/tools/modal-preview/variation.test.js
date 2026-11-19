import assert from 'node:assert/strict';
import test from 'node:test';
import { audiblePartials, carryControls, controlsFromKnobs, heardSeconds, playedFundamental, previewPartials } from './engine.js';
import { describePrompt } from './recipes.js';
import { renderPreview, scaleToPeak } from './resonator.js';
import { densityForProfile, shapePartials } from './shape.js';

const PROMPTS = ['black hole', 'wood block', 'chandelier', 'distant thunder', 'gong', 'tiny bell', 'huge gong'];

function features(partials, fundamental) {
  let weight = 0;
  let centroid = 0;
  let decay = 0;
  for (const partial of partials) {
    const amp = 10 ** (partial.gainDb / 20);
    const power = amp * amp;
    weight += power;
    centroid += power * partial.ratio * fundamental;
    decay += power * partial.decay;
  }
  const longest = Math.max(...partials.map((partial) => partial.decay));
  const shorts = partials.filter((partial) => partial.decay < longest * 0.92);
  const shortMean = shorts.length
    ? shorts.reduce((sum, partial) => sum + partial.decay, 0) / shorts.length
    : longest;
  return {
    centroid: weight > 0 ? centroid / weight : 0,
    decay: weight > 0 ? decay / weight : 0,
    longest,
    shortMean,
    count: partials.length,
  };
}

// Same rebuild Hear uses: knobs plus the carried variation, then the audible partials.
function hearPartials(variation) {
  const carried = carryControls(variation.controls);
  const controls = controlsFromKnobs({
    preset: variation.controls.preset,
    stiffness: variation.controls.stiffness,
    brightness: variation.controls.brightness,
    damping: variation.controls.damping,
    oddEven: variation.controls.oddEven,
    seed: variation.controls.seed,
  }, carried);
  const fundamental = playedFundamental(controls.pitchScale);
  const built = audiblePartials(previewPartials(controls), { fundamental, sampleRate: 48000 });
  // The preview grid starts at 16. A longer profile steps up to the next
  // density so the high partials are not cut off before Hear.
  const buckets = [8, 16, 32, 64, 128, 256];
  let density = 16;
  if (built.length > density) density = buckets.find((count) => count >= built.length) ?? density;
  const partials = density === built.length ? built : shapePartials(built, { density });
  return { controls, fundamental, partials, features: features(partials, fundamental) };
}

function hearAudio(row, seconds) {
  const samples = renderPreview(row.partials, {
    fundamental: row.fundamental,
    velocity: row.variation.velocity ?? 0.8,
    position: row.variation.position ?? 0.2,
    exciter: row.variation.exciter || 'mallet',
    hardness: row.variation.hardness ?? 0.5,
    sampleRate: 48000,
    seconds,
    matchGains: true,
  });
  return scaleToPeak(samples, 0.45);
}

function relDiff(a, b) {
  const n = Math.min(a.length, b.length);
  let diff = 0;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const delta = a[i] - b[i];
    diff += delta * delta;
    energy += a[i] * a[i];
  }
  return Math.sqrt(diff / (energy + 1e-12));
}

function rmsBetween(samples, sampleRate, start, end) {
  const from = Math.min(samples.length, Math.floor(start * sampleRate));
  const to = Math.min(samples.length, Math.floor(end * sampleRate));
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

test('each variation card stays distinct after the knob rebuild', () => {
  const table = [];
  for (const prompt of PROMPTS) {
    const cards = describePrompt(prompt);
    assert.equal(cards.length, 4, prompt);
    assert.match(cards[1].name, /^Bright /);
    assert.match(cards[2].name, /^Dark /);
    assert.match(cards[3].name, /^Long /);
    const rows = cards.map((variation) => ({ variation, ...hearPartials(variation) }));
    const base = rows[0];
    const bright = rows[1];
    const dark = rows[2];
    const long = rows[3];
    assert.equal(base.controls.variation, '');
    assert.equal(bright.controls.variation, 'bright');
    assert.equal(dark.controls.variation, 'dark');
    assert.equal(long.controls.variation, 'long');

    assert.ok(
      bright.features.centroid >= base.features.centroid * 1.4,
      `${prompt} bright centroid ${bright.features.centroid.toFixed(0)} vs ${base.features.centroid.toFixed(0)}`,
    );
    const lowest = Math.min(...base.partials.map((partial) => partial.ratio)) * base.fundamental;
    const canDarken = base.features.centroid > lowest * 1.08;
    if (canDarken) {
      assert.ok(
        dark.features.centroid <= base.features.centroid * 0.92,
        `${prompt} dark centroid ${dark.features.centroid.toFixed(0)} vs ${base.features.centroid.toFixed(0)}`,
      );
    } else {
      assert.ok(dark.features.centroid <= base.features.centroid * 1.001, `${prompt} dark centroid rose`);
    }
    assert.ok(
      dark.features.longest <= base.features.longest * 0.72,
      `${prompt} dark T60 ${dark.features.longest.toFixed(3)} vs ${base.features.longest.toFixed(3)}`,
    );

    const atCap = base.features.longest * 1.5 > 29.2;
    if (!atCap) {
      assert.ok(
        long.features.longest >= base.features.longest * 1.5,
        `${prompt} long T60 ${long.features.longest.toFixed(3)} vs ${base.features.longest.toFixed(3)}`,
      );
    } else {
      assert.ok(
        long.features.shortMean >= base.features.shortMean * 1.5,
        `${prompt} long shorter partials ${long.features.shortMean.toFixed(2)} vs ${base.features.shortMean.toFixed(2)}`,
      );
      assert.ok(long.features.decay > base.features.decay, `${prompt} long weighted decay did not rise`);
    }

    const seconds = Math.max(...rows.map((row) => heardSeconds(row.partials, { exciter: row.variation.exciter })));
    const audio = rows.map((row) => hearAudio(row, seconds));
    const lateStart = Math.min(0.45 * base.features.longest, seconds * 0.55);
    const lateEnd = Math.min(seconds * 0.92, Math.max(lateStart + 0.05, 0.7 * base.features.longest));
    for (let i = 1; i < rows.length; i++) {
      const diff = relDiff(audio[0], audio[i]);
      assert.ok(diff > 0.18, `${prompt} ${rows[i].variation.name} Hear rel ${diff.toFixed(3)}`);
    }
    if (!atCap && base.features.longest > 0.4) {
      const baseLate = rmsBetween(audio[0], 48000, lateStart, lateEnd);
      const longLate = rmsBetween(audio[3], 48000, lateStart, lateEnd);
      assert.ok(
        longLate > baseLate * 1.12,
        `${prompt} long envelope ${longLate.toFixed(4)} vs ${baseLate.toFixed(4)}`,
      );
    }

    for (const row of rows) {
      table.push({
        prompt,
        card: row.variation.name,
        centroid: row.features.centroid,
        longest: row.features.longest,
      });
    }
    console.log(
      [
        prompt,
        `bright ${ (bright.features.centroid / base.features.centroid).toFixed(2) }x`,
        `dark ${ (dark.features.centroid / base.features.centroid).toFixed(2) }x ${ (dark.features.longest / base.features.longest).toFixed(2) }t`,
        `long ${ (long.features.longest / base.features.longest).toFixed(2) }t`,
      ].join(' | '),
    );
  }
  console.log('prompt\tcard\tcentroid Hz\tlongest T60 s');
  for (const row of table) {
    console.log(`${row.prompt}\t${row.card}\t${row.centroid.toFixed(0)}\t${row.longest.toFixed(3)}`);
  }
});

test('density returns to the chosen grid after a long profile', () => {
  const steps = [8, 16, 32, 64, 128, 256];
  assert.equal(densityForProfile(36, 16, steps), 64);
  assert.equal(densityForProfile(5, 16, steps), 16);
  assert.equal(densityForProfile(15, 16, steps), 16);
  assert.equal(densityForProfile(5, 32, steps), 32);
  assert.equal(densityForProfile(40, 32, steps), 64);
});

test('refining a bright card keeps its plan and can walk back', () => {
  const bright = describePrompt('black hole')[1];
  const gong = describePrompt('gong')[1];
  for (const card of [bright, gong]) {
    const refined = describePrompt('darker', card);
    const applied = refined[0];
    const halfway = refined[2];
    assert.equal(applied.objectName, card.objectName);
    assert.ok(applied.controls.variationTilt < card.controls.variationTilt, card.name);
    assert.ok(halfway.controls.variationTilt < card.controls.variationTilt, `${card.name} halfway`);
    assert.ok(halfway.controls.variationTilt > applied.controls.variationTilt, `${card.name} halfway vs darker`);
    const heard = hearPartials(applied);
    const from = hearPartials(card);
    assert.ok(heard.features.centroid < from.features.centroid, `${card.name} centroid`);
  }
});
