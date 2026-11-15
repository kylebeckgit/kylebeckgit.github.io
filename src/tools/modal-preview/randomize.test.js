import assert from 'node:assert/strict';
import test from 'node:test';
import { audiblePartials, defaultControls, previewPartials, zebraExport } from './engine.js';
import { barsStayDistinct, decayStrandSegments, defaultCamera, layoutTriangles, sliceFromPartial } from './modal-view.js';
import {
  MATERIALS,
  assessQuality,
  createRollHistory,
  defaultLocks,
  describeKnobs,
  descriptionAgrees,
  familyPartials,
  identityKnobs,
  knobDistance,
  pushRoll,
  redoRoll,
  rollSound,
  undoRoll,
} from './randomize.js';

const base = previewPartials(defaultControls());

function locksAll(on) {
  return {
    tune: on, detune: on, decay: on, decayKf: on, position: on, density: on, absorb: on, disperse: on, normalize: on,
  };
}

test('one thousand seeded rolls per material pass the quality check', () => {
  for (const material of MATERIALS) {
    if (material === 'wild') continue;
    for (let i = 0; i < 1000; i++) {
      const rolled = rollSound({
        base,
        current: identityKnobs(),
        material,
        amount: 1,
        locks: defaultLocks(),
        seed: i + 1,
      });
      assert.equal(rolled.quality.ok, true, `${material} ${i} ${rolled.quality.reasons.join(',')}`);
      assert.equal(rolled.knobs.tune, 0, `${material} moved locked tune`);
      assert.equal(descriptionAgrees(rolled.description, rolled.knobs, rolled.partials), true, rolled.description);
      const seconds = rolled.partials[0].decay;
      if (seconds >= 1.2) assert.equal(/\bshort\b/i.test(rolled.description), false, `${rolled.description} ${seconds}`);
      if (seconds <= 3) assert.equal(/\blong\b/i.test(rolled.description), false, `${rolled.description} ${seconds}`);
      if (/\bmuted\b/i.test(rolled.description)) {
        const highs = rolled.partials.filter((partial) => partial.ratio > rolled.partials[0].ratio * 2.2);
        assert.ok(highs.length >= 2 && highs.every((partial) => partial.decay < seconds * 0.4 && partial.decay < 1));
      }
    }
  }
});

test('one thousand wild rolls stay usable and the description matches', () => {
  for (let i = 0; i < 1000; i++) {
    const rolled = rollSound({
      base,
      current: identityKnobs(),
      material: 'wild',
      amount: 1,
      wildness: i % 5 === 0 ? 1 : 0.7,
      locks: defaultLocks(),
      seed: 5000 + i,
    });
    assert.equal(rolled.quality.ok, true, `wild ${i} ${rolled.quality.reasons.join(',')}`);
    assert.equal(descriptionAgrees(rolled.description, rolled.knobs, rolled.partials), true, `${rolled.description} ${JSON.stringify(rolled.knobs)}`);
  }
});

test('no roll packs the bars into one slab', () => {
  for (const material of MATERIALS) {
    for (let i = 0; i < 40; i++) {
      const rolled = rollSound({
        base,
        current: identityKnobs(),
        material,
        amount: 1,
        wildness: 1,
        locks: defaultLocks(),
        seed: 9000 + i + material.length * 100,
      });
      assert.equal(rolled.quality.reasons.includes('merged'), false, `${material} ${i} density ${rolled.knobs.density}`);
      assert.equal(barsStayDistinct(rolled.partials, rolled.knobs), true, `${material} ${rolled.knobs.density}`);
    }
  }
});

function isGeneric(text) {
  return /^(long |short )?(bright |dark )?(metal|wooden|glass|skin|bell) (tone|ring|knock|ping|shimmer|thump|strike)(, (muted|slightly detuned|detuned))*$/i.test(text);
}

test('wildness pulls rolls away from the material center', () => {
  for (const material of MATERIALS) {
    const means = [0, 0.5, 1].map((wildness) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        const rolled = rollSound({
          base,
          current: identityKnobs(),
          material,
          amount: 1,
          wildness,
          locks: defaultLocks(),
          seed: 20000 + i + wildness * 1000 + material.length * 50,
        });
        assert.equal(rolled.quality.ok, true, `${material} ${wildness} ${rolled.quality.reasons.join(',')}`);
        assert.equal(descriptionAgrees(rolled.description, rolled.knobs, rolled.partials), true, rolled.description);
        sum += knobDistance(rolled.knobs, material);
      }
      return sum / 200;
    });
    assert.ok(means[0] < means[1] && means[1] < means[2], `${material} distances ${means.map((n) => n.toFixed(3)).join(' < ')}`);
  }
});

test('wildness 1 descriptions stay specific', () => {
  for (const material of MATERIALS) {
    const lines = [];
    for (let i = 0; i < 50; i++) {
      const rolled = rollSound({
        base,
        current: identityKnobs(),
        material,
        amount: 1,
        wildness: 1,
        locks: defaultLocks(),
        seed: 30000 + i + material.length * 20,
      });
      lines.push(rolled.description);
    }
    const distinct = new Set(lines).size;
    const generic = lines.filter(isGeneric).length;
    assert.ok(distinct / lines.length >= 0.4, `${material} distinct ${distinct}/50`);
    assert.ok(generic / lines.length < 0.2, `${material} generic ${generic}/50`);
  }
});

test('short, long, and muted follow the rendered decays', () => {
  const knobs = identityKnobs();
  const ringing = [
    { ratio: 1, gainDb: 0, decay: 5.5 },
    { ratio: 2.1, gainDb: -6, decay: 4.2 },
    { ratio: 3.4, gainDb: -10, decay: 3.1 },
    { ratio: 5, gainDb: -14, decay: 2.4 },
  ];
  const text = describeKnobs({ ...knobs, decay: -0.8 }, 'skin', ringing);
  assert.equal(/\bshort\b/i.test(text), false, text);
  assert.equal(descriptionAgrees('Short skin thump', knobs, ringing), false);
  const thump = ringing.map((partial, index) => ({ ...partial, decay: index === 0 ? 0.5 : 0.15 }));
  const shortText = describeKnobs(knobs, 'skin', thump);
  assert.match(shortText, /\bshort\b/i);
  assert.equal(descriptionAgrees(shortText, knobs, thump), true, shortText);
  const knock = [
    { ratio: 1, gainDb: 0, decay: 7 },
    { ratio: 2.76, gainDb: -8, decay: 2.2 },
    { ratio: 5.4, gainDb: -14, decay: 1.1 },
  ];
  assert.equal(/\bshort\b/i.test(describeKnobs(knobs, 'wood', knock)), false);
  assert.equal(descriptionAgrees('Dark wooden knock, muted', knobs, knock), false);
});

test('woody damping is only claimed when absorb is high', () => {
  const partials = [
    { ratio: 1, gainDb: 0, decay: 4 },
    { ratio: 2.8, gainDb: -4, decay: 0.4 },
    { ratio: 5.2, gainDb: -8, decay: 0.3 },
    { ratio: 8, gainDb: -12, decay: 0.2 },
  ];
  const bright = { ...identityKnobs(), normalize: 0.5, absorb: -0.2 };
  const text = describeKnobs(bright, 'glass', partials);
  assert.equal(/\bwoody\b/i.test(text), false, text);
  assert.equal(descriptionAgrees(text, bright, partials), true, text);
  const damped = { ...bright, absorb: 0.5 };
  const woody = describeKnobs(damped, 'glass', partials);
  assert.match(woody, /\bwoody\b/i);
  assert.equal(descriptionAgrees(woody, damped, partials), true, woody);
});

test('any and wild keep one family at wildness 0', () => {
  for (const material of ['any', 'wild']) {
    for (let seed = 1; seed <= 40; seed++) {
      const rolled = rollSound({ material, wildness: 0, amount: 1, seed });
      const text = rolled.description.toLowerCase();
      const second = rolled.partials[1].ratio / rolled.partials[0].ratio;
      const third = rolled.partials[2].ratio / rolled.partials[0].ratio;
      if (/\bskin\b/.test(text)) {
        assert.ok(second > 1.4 && second < 1.9, `${text} ${second}`);
        assert.ok(rolled.knobs.decay <= -0.2 && rolled.knobs.absorb >= 0.25, text);
      } else if (/\bbell\b/.test(text)) {
        assert.ok(Math.abs(rolled.partials[0].ratio - 1) < 0.02, text);
        assert.ok(second > 1.9 && second < 2.2, `${text} ${second}`);
      } else if (/\bglass\b/.test(text)) {
        assert.ok(second > 2.4 && third > 4.6, `${text} ${second} ${third}`);
        assert.ok(rolled.knobs.decay >= 0.25, text);
      } else if (/\bwooden\b/.test(text)) {
        assert.ok(second > 2.4 && third > 4.6, `${text} ${second} ${third}`);
        assert.ok(rolled.knobs.decay <= 0.1 && rolled.knobs.absorb >= 0.15, text);
      } else if (/\bmetal\b/.test(text)) {
        assert.ok(second > 2.2 && third < 5.2, `${text} ${second} ${third}`);
        assert.ok(rolled.knobs.decay >= 0, text);
      } else {
        assert.fail(rolled.description);
      }
    }
  }
});

test('each material starts from its own mode series', () => {
  const close = (actual, expected) => Math.abs(actual - expected) / expected < 0.04;
  const skin = familyPartials('skin').slice(0, 6).map((partial) => partial.ratio);
  for (const [actual, expected] of [[skin[0], 1], [skin[1], 1.594], [skin[2], 2.136], [skin[3], 2.296]]) {
    assert.ok(close(actual, expected), `skin ${skin.join(', ')}`);
  }
  const wood = familyPartials('wood').slice(0, 4).map((partial) => partial.ratio);
  for (const [actual, expected] of [[wood[0], 1], [wood[1], 2.756], [wood[2], 5.404], [wood[3], 8.933]]) {
    assert.ok(close(actual, expected), `wood ${wood.join(', ')}`);
  }
  const bell = familyPartials('bell').slice(0, 5).map((partial) => partial.ratio);
  for (const [actual, expected] of [[bell[0], 1], [bell[1], 2], [bell[2], 2.4], [bell[3], 3], [bell[4], 4]]) {
    assert.ok(close(actual, expected), `bell ${bell.join(', ')}`);
  }
  const metal = familyPartials('metal')[1].ratio;
  assert.ok(Math.abs(metal - 2) > 0.2, `metal second ratio ${metal}`);
  const glass = familyPartials('glass').slice(0, 4).map((partial) => partial.ratio);
  assert.ok(close(glass[1], 2.8), `glass ${glass.join(', ')}`);
  assert.ok(familyPartials('skin')[0].decay < 1.2);
  assert.ok(familyPartials('glass')[0].decay > 3);
  for (let seed = 1; seed <= 24; seed++) {
    const skinRoll = rollSound({ material: 'skin', wildness: 0, amount: 1, seed });
    const skinRatio = skinRoll.partials[1].ratio / skinRoll.partials[0].ratio;
    assert.ok(skinRatio > 1.45 && skinRatio < 1.8, `skin roll ${skinRatio}`);
    const woodRoll = rollSound({ material: 'wood', wildness: 0, amount: 1, seed });
    const woodRatio = woodRoll.partials[1].ratio / woodRoll.partials[0].ratio;
    assert.ok(woodRatio > 2.5 && woodRatio < 3.0, `wood roll ${woodRatio}`);
    const bellRoll = rollSound({ material: 'bell', wildness: 0, amount: 1, seed });
    const humToPrime = bellRoll.partials[1].ratio / bellRoll.partials[0].ratio;
    const primeToTierce = bellRoll.partials[2].ratio / bellRoll.partials[1].ratio;
    assert.ok(humToPrime > 1.9 && humToPrime < 2.45, `bell roll ${humToPrime}`);
    assert.ok(Math.abs(primeToTierce - 1.2) < 0.08, `bell tierce ${primeToTierce}`);
    assert.ok(skinRoll.partials[0].decay < 1.2, skinRoll.description);
    assert.equal(/\bshort\b/i.test(skinRoll.description) || /\bthump\b/i.test(skinRoll.description), true, skinRoll.description);
    if (/\blong\b/i.test(skinRoll.description)) assert.fail(skinRoll.description);
  }
});

test('the lowest ratio of every roll is 1', () => {
  for (const material of MATERIALS) {
    for (const wildness of [0, 0.5, 1]) {
      for (let seed = 1; seed <= 200; seed++) {
        const rolled = rollSound({ material, wildness, amount: 1, seed: seed + wildness * 1000 });
        const lowest = Math.min(...rolled.partials.map((partial) => partial.ratio));
        assert.ok(Math.abs(lowest - 1) <= 0.001, `${material} ${wildness} ${lowest}`);
        const exported = zebraExport(rolled.partials, { description: rolled.description });
        const fileLowest = Math.min(...rowsOfExport(exported.csv));
        assert.ok(Math.abs(fileLowest - 1) <= 0.001, `${exported.filename} ${fileLowest}`);
      }
    }
  }
});

function rowsOfExport(csv) {
  return csv.trim().split('\n').slice(1).map((line) => Number(line.split(';')[0]));
}

test('wildness 0 stays within 50 cents of the reference series', () => {
  for (const material of ['metal', 'wood', 'glass', 'skin', 'bell']) {
    const ref = familyPartials(material).map((partial) => partial.ratio);
    for (let seed = 1; seed <= 40; seed++) {
      const rolled = rollSound({ material, wildness: 0, amount: 1, seed });
      const count = Math.min(5, ref.length, rolled.partials.length);
      for (let i = 1; i < count; i++) {
        const cents = Math.abs(1200 * Math.log2(rolled.partials[i].ratio / ref[i]));
        assert.ok(cents <= 50, `${material} partial ${i + 1} is ${cents.toFixed(1)} cents off`);
      }
    }
  }
});

test('knock, thump, ping, bell, and wood match the sound', () => {
  const knobs = identityKnobs();
  const harmonic = [1, 2, 3, 4, 5].map((ratio, index) => ({ ratio, gainDb: -index * 4, decay: 3.4 }));
  assert.equal(descriptionAgrees('Short wooden knock', knobs, harmonic), false);
  assert.equal(descriptionAgrees('Long metal bell strike', knobs, harmonic), false);
  assert.equal(descriptionAgrees('Bright glass ping', knobs, harmonic), false);
  const bar = familyPartials('wood').slice(0, 5).map((partial) => ({ ...partial, decay: partial.ratio === 1 ? 0.8 : partial.decay }));
  const wooden = describeKnobs(knobs, 'wood', bar);
  assert.match(wooden, /\bwooden\b/i);
  assert.match(wooden, /\bknock\b/i);
  assert.equal(descriptionAgrees(wooden, knobs, bar), true, wooden);
  const ringing = bar.map((partial) => ({ ...partial, decay: 3.4 }));
  assert.equal(/\bknock\b/i.test(describeKnobs(knobs, 'wood', ringing)), false);
  const medium = bar.map((partial) => ({ ...partial, decay: 1.2 }));
  assert.equal(/\bknock\b/i.test(describeKnobs(knobs, 'wood', medium)), false);
  const darkRows = [1, 2, 3, 4, 5, 6].map((ratio, index) => ({ ratio, gainDb: -index * 14, decay: 2 }));
  const falselyBright = describeKnobs({ ...knobs, normalize: 0.8 }, 'metal', darkRows);
  assert.equal(/\bbright\b/i.test(falselyBright), false, falselyBright);
  const brightRows = [
    { ratio: 1, gainDb: -20, decay: 2 },
    { ratio: 2.2, gainDb: -14, decay: 2 },
    { ratio: 3.5, gainDb: -6, decay: 1.4 },
    { ratio: 5, gainDb: -2, decay: 1 },
    { ratio: 7.5, gainDb: 0, decay: 0.8 },
  ];
  const brightLine = describeKnobs(knobs, 'metal', brightRows);
  assert.match(brightLine, /\bbright\b/i);
  assert.equal(descriptionAgrees(brightLine, knobs, brightRows), true, brightLine);
  const bell = familyPartials('bell').slice(0, 6);
  const stretch = 1 - 0.92 * 0.28;
  const squashed = bell.map((partial) => ({
    ...partial,
    ratio: 2 ** (Math.log2(partial.ratio) * stretch),
  }));
  assert.equal(/\bbell\b/i.test(describeKnobs(knobs, 'bell', squashed)), false);
});

test('rolled views keep a decay curve across the comb', () => {
  const cases = [['metal', 0], ['wood', 0], ['glass', 0], ['skin', 0], ['bell', 0], ['any', 0], ['wild', 0], ['wood', 1], ['bell', 1], ['wild', 1]];
  for (const [material, wildness] of cases) {
    for (let seed = 1; seed <= 6; seed++) {
      const rolled = rollSound({ material, wildness, amount: 1, seed });
      const slices = audiblePartials(rolled.partials).map((partial) => sliceFromPartial(partial));
      const tris = layoutTriangles(slices, defaultCamera(), 640, 516, 0);
      const xs = tris.map((tri) => tri.foot.x);
      const span = Math.max(...xs) - Math.min(...xs);
      assert.ok(span > 200, `${material} w${wildness} span ${span.toFixed(0)}`);
      assert.ok(Math.min(...xs) < 300, `${material} w${wildness} left ${Math.min(...xs).toFixed(0)}`);
      const strands = decayStrandSegments(slices, defaultCamera(), 640, 516, 0);
      const reach = Math.max(...strands.map((strand) => Math.hypot(strand.end.x - strand.start.x, strand.end.y - strand.start.y)));
      assert.ok(reach > 70, `${material} w${wildness} reach ${reach.toFixed(0)}`);
      for (const partial of audiblePartials(rolled.partials)) {
        assert.ok(partial.decay >= 0.005, `${material} decay ${partial.decay}`);
      }
    }
  }
});

test('locks and a small amount keep the current knobs', () => {
  const current = { ...identityKnobs(), tune: 7, decay: -0.4, absorb: 0.2 };
  const locked = rollSound({
    base,
    current,
    material: 'metal',
    amount: 1,
    locks: locksAll(true),
    seed: 3,
  });
  assert.deepEqual(locked.knobs, current);
  const nudged = rollSound({
    base,
    current,
    material: 'glass',
    amount: 0,
    locks: defaultLocks(),
    seed: 9,
  });
  assert.equal(nudged.knobs.tune, 7);
  assert.ok(Math.abs(nudged.knobs.decay - current.decay) < 0.12);
  assert.equal(assessQuality(nudged.partials, nudged.knobs).ok, true);
});

test('roll history keeps the last ten and walks back and forward', () => {
  const history = createRollHistory(10);
  for (let i = 0; i < 12; i++) pushRoll(history, { i });
  assert.equal(history.past.length, 10);
  assert.equal(history.past[0].i, 2);
  const current = { i: 99 };
  const previous = undoRoll(history, current);
  assert.equal(previous.i, 11);
  assert.equal(history.future[0].i, 99);
  const forward = redoRoll(history, previous);
  assert.equal(forward.i, 99);
  assert.equal(history.past.at(-1).i, 11);
});
