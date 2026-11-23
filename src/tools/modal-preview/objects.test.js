import assert from 'node:assert/strict';
import test from 'node:test';
import { OBJECTS, baseProfile, exportOptions, matchObjectText, objectById, objectNoteText, playPitch, searchObjects, sourceLine } from './objects.js';
import { loadObject, mutateProfile, rollObject } from './objects-randomize.js';
import { mulberry32, rollSound, defaultLocks, identityKnobs, EXTREME_WILDNESS, exoticAmount } from './randomize.js';
import { previewPartials, defaultControls, zebraExport, fromCsv, A4_HZ, ZEBRA_PARTIAL_LIMIT_HZ, audiblePartials } from './engine.js';
import { buildShare, decodeShare } from './share.js';

const BASIS_RATIO = new Set(['measured', 'published tuning', 'physics', 'approximation']);

test('the library has at least twelve objects with the documented fields', () => {
  assert.ok(OBJECTS.length >= 12);
  const ids = new Set();
  for (const object of OBJECTS) {
    assert.equal(ids.has(object.id), false, `duplicate ${object.id}`);
    ids.add(object.id);
    for (const key of ['id', 'name', 'family', 'notes']) assert.equal(typeof object[key], 'string', `${object.id} ${key}`);
    assert.ok(Array.isArray(object.aliases) && object.aliases.length >= 2, `${object.id} aliases`);
    assert.ok(Array.isArray(object.sources) && object.sources.length >= 1, `${object.id} sources`);
    assert.ok(BASIS_RATIO.has(object.basis.ratio), `${object.id} basis.ratio`);
    assert.equal(object.basis.gain, 'approximation', `${object.id} levels are approximations`);
    assert.ok(['measured as printed', 'approximation'].includes(object.basis.decay), `${object.id} basis.decay`);
    assert.ok(object.mutate && object.mutate.ratioJitterCents >= 0, `${object.id} mutate`);
  }
});

test('an approximation is plainly labeled and cites nothing it did not use', () => {
  for (const object of OBJECTS.filter((o) => o.basis.ratio === 'approximation')) {
    assert.match(object.notes, /^Approximation/, `${object.id} notes start with Approximation`);
    assert.ok(object.sources.every((line) => /^(None|No measurement)/.test(line)), `${object.id} sources`);
  }
  const measured = OBJECTS.filter((o) => o.basis.ratio === 'measured').map((o) => o.id).sort();
  assert.deepEqual(measured, ['church-bell', 'singing-bowl']);
});

test('base profiles fit the profile shape the share link keeps', () => {
  for (const object of OBJECTS) {
    const list = baseProfile(object);
    assert.ok(list.length >= 4 && list.length <= 256, `${object.id} count ${list.length}`);
    assert.equal(list[0].ratio, 1, `${object.id} starts at 1`);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      assert.ok(p.ratio > 0 && p.ratio <= 80, `${object.id} ratio ${p.ratio}`);
      assert.ok(p.gainDb >= -96 && p.gainDb <= 0, `${object.id} gain ${p.gainDb}`);
      assert.ok(p.decay >= 0.05 && p.decay <= 30, `${object.id} decay ${p.decay}`);
      if (i) assert.ok(p.ratio >= list[i - 1].ratio, `${object.id} sorted`);
    }
    assert.ok(list.some((p) => p.gainDb === 0), `${object.id} peak at 0 dB`);
  }
});

test('physics entries carry the standard series', () => {
  const near = (a, b, tol = 0.002) => assert.ok(Math.abs(a - b) <= tol * b, `${a} vs ${b}`);
  const lith = objectById('lithophone').partials.map((p) => p.ratio);
  [1, 2.756, 5.404, 8.933, 13.344].forEach((v, i) => near(lith[i], v));
  const tine = objectById('kalimba').partials.map((p) => p.ratio);
  [1, 6.267, 17.55, 34.39].forEach((v, i) => near(tine[i], v));
  const bell = objectById('church-bell').partials.map((p) => p.ratio);
  [1, 2, 2.366, 3.012, 4].forEach((v, i) => near(bell[i], v));
  const bowl = objectById('singing-bowl').partials.map((p) => p.ratio);
  near(bowl[0], 1);
  near(bowl[1], 1.0046, 0.001);
  near(bowl[2], 2.7737, 0.001);
  assert.equal(bowl.length, 14);
  const glass = objectById('wine-glass').partials.map((p) => p.ratio);
  [1, 2.83, 5.42, 8.77].forEach((v, i) => near(glass[i], v, 0.005));
});

test('free text finds the nearest object without a network', () => {
  const cases = {
    'a rusty hubcap in a vacuum': 'hubcap',
    'tibetan singing bowl': 'singing-bowl',
    'thumb piano': 'kalimba',
    'steel drum': 'steel-pan',
    'a slinky falling down stairs': 'slinky',
    'granite slab': 'lithophone',
    'kempul': 'bonang',
    'hang drum': 'handpan',
    'bowed cymbal': 'bowed-cymbal',
    'cymbal': 'cymbal',
    'church bell': 'church-bell',
  };
  for (const [text, id] of Object.entries(cases)) {
    const hit = matchObjectText(text);
    assert.equal(hit ? hit.object.id : null, id, text);
  }
  assert.equal(matchObjectText('an unknowable thing'), null);
  assert.equal(matchObjectText(''), null);
  assert.equal(matchObjectText('waterphon')?.object.id, 'waterphone');
});

test('typeahead ranks prefixes first and searches aliases', () => {
  assert.equal(searchObjects('way')[0], undefined);
  assert.equal(searchObjects('slin')[0].object.id, 'slinky');
  assert.equal(searchObjects('mbira')[0].object.id, 'kalimba');
  const bow = searchObjects('bowed').map((hit) => hit.object.id);
  assert.ok(bow.includes('bowed-cymbal') && bow.includes('daxophone'));
  assert.equal(searchObjects('rusty hub')[0].object.id, 'hubcap');
  assert.ok(searchObjects('').length > 0);
});

test('object rolls are deterministic and stay valid across seeds', () => {
  for (const object of OBJECTS) {
    for (let i = 0; i < 60; i++) {
      const args = { object, seed: 100 + i, wildness: i % 4 === 0 ? 1 : 0.4, amount: 1, locks: defaultLocks() };
      const a = rollObject(args);
      const b = rollObject(args);
      assert.deepEqual(a.partials, b.partials, `${object.id} deterministic`);
      assert.equal(a.quality.ok, true, `${object.id} ${i} ${a.quality.reasons.join(',')}`);
      assert.ok(a.partials.length >= 4 && a.partials.length <= 256);
      assert.equal(a.knobs.tune, 0, 'locked tune stays');
      assert.equal(a.object, object.id);
      for (const p of a.partials) {
        assert.ok(p.ratio > 0 && p.ratio <= 80 && p.gainDb >= -96 && p.gainDb <= 0 && p.decay >= 0.005);
      }
    }
  }
});

test('a roll moves the object but keeps its identity at low wildness', () => {
  for (const object of OBJECTS) {
    const base = baseProfile(object);
    const rolled = mutateProfile(mulberry32(7), object, 0.3);
    const lowest = rolled[0].ratio;
    assert.ok(Math.abs(lowest - 1) < 1e-9, `${object.id} root stays`);
    assert.ok(rolled.length >= base.length);
    const drift = base.map((p, i) => Math.abs(1200 * Math.log2(rolled.find((q) => Math.abs(1200 * Math.log2(q.ratio / p.ratio)) < 120)?.ratio / p.ratio)));
    assert.ok(drift.every((d) => Number.isFinite(d)), `${object.id} each base partial survives`);
  }
  assert.deepEqual(mutateProfile(mulberry32(3), objectById('handpan'), 0), baseProfile(objectById('handpan')));
});

test('loading an object gives its own series at native density', () => {
  for (const object of OBJECTS) {
    const loaded = loadObject(object);
    assert.equal(loaded.partials.length, object.partials.length);
    assert.equal(loaded.knobs.density, object.partials.length);
    assert.deepEqual(loaded.partials.map((p) => p.ratio), object.partials.map((p) => p.ratio));
    assert.equal(loaded.quality.ok, true, `${object.id} ${loaded.quality.reasons.join(',')}`);
  }
});

test('rolls at wildness 0.7 and below match the locked hashes', async () => {
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const lock = JSON.parse(readFileSync(new URL('./wildness-lock.json', import.meta.url), 'utf8'));
  const fingerprint = (rolled) => createHash('sha256').update(JSON.stringify({
    knobs: rolled.knobs,
    partials: rolled.partials,
    profile: rolled.profile,
    description: rolled.description,
  })).digest('hex');
  assert.equal(exoticAmount(0.7), 0);
  assert.equal(exoticAmount(0.3), 0);
  assert.ok(exoticAmount(EXTREME_WILDNESS) === 1);
  for (const [material, byWild] of Object.entries(lock.materials)) {
    for (const [wildness, bySeed] of Object.entries(byWild)) {
      for (const [seed, hash] of Object.entries(bySeed)) {
        const rolled = rollSound({
          current: identityKnobs(),
          material,
          amount: 1,
          wildness: Number(wildness),
          locks: defaultLocks(),
          seed: Number(seed),
        });
        assert.equal(fingerprint(rolled), hash, `${material} wildness ${wildness} seed ${seed}`);
      }
    }
  }
  for (const [id, byWild] of Object.entries(lock.objects)) {
    const object = objectById(id);
    for (const [wildness, bySeed] of Object.entries(byWild)) {
      for (const [seed, hash] of Object.entries(bySeed)) {
        const rolled = rollObject({
          object,
          current: identityKnobs(),
          amount: 1,
          wildness: Number(wildness),
          locks: defaultLocks(),
          seed: Number(seed),
        });
        assert.equal(fingerprint(rolled), hash, `${id} wildness ${wildness} seed ${seed}`);
      }
    }
    assert.equal(
      fingerprint({
        knobs: {},
        partials: mutateProfile(mulberry32(7), object, 0.3),
        profile: mutateProfile(mulberry32(11), object, 0.7),
        description: '',
      }),
      lock.mutate[id],
      `${id} mutate`,
    );
  }
});

function stdev(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function knobSpread(rolls) {
  return ['decay', 'decayKf', 'absorb', 'disperse', 'normalize']
    .reduce((sum, key) => sum + stdev(rolls.map((rolled) => rolled.knobs[key])), 0);
}

function spanVariance(rolls) {
  const spans = rolls.map((rolled) => {
    const list = rolled.partials;
    return Math.log(list[list.length - 1].ratio / list[0].ratio);
  });
  return stdev(spans) ** 2;
}

test('high Wild rolls are more varied than mid Wild and all pass the quality check', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => 2000 + i);
  const midWild = 0.5;
  const highWild = EXTREME_WILDNESS;
  const knobRatios = [];
  const spanRatios = [];
  const check = (label, midRolls, highRolls) => {
    for (const rolled of [...midRolls, ...highRolls]) {
      assert.equal(rolled.quality.ok, true, `${label} ${rolled.quality.reasons.join(',')}`);
      assert.equal(/feral/i.test(rolled.description), false, rolled.description);
    }
    knobRatios.push(knobSpread(highRolls) / knobSpread(midRolls));
    spanRatios.push(spanVariance(highRolls) / Math.max(spanVariance(midRolls), 1e-9));
  };
  for (const material of ['metal', 'wood', 'glass', 'skin', 'bell', 'any', 'wild']) {
    const mid = [];
    const high = [];
    for (const seed of seeds) {
      mid.push(rollSound({ current: identityKnobs(), material, amount: 1, wildness: midWild, locks: defaultLocks(), seed }));
      high.push(rollSound({ current: identityKnobs(), material, amount: 1, wildness: highWild, locks: defaultLocks(), seed }));
    }
    check(material, mid, high);
  }
  for (const object of OBJECTS) {
    const mid = [];
    const high = [];
    for (const seed of seeds) {
      mid.push(rollObject({ object, current: identityKnobs(), amount: 1, wildness: midWild, locks: defaultLocks(), seed }));
      high.push(rollObject({ object, current: identityKnobs(), amount: 1, wildness: highWild, locks: defaultLocks(), seed }));
    }
    check(object.id, mid, high);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean(knobRatios) > 1.5 && Math.min(...knobRatios) > 1.4, `knob spread ${mean(knobRatios).toFixed(3)} min ${Math.min(...knobRatios).toFixed(3)}`);
  assert.ok(mean(spanRatios) > 2 && Math.min(...spanRatios) > 1.2, `span variance ${mean(spanRatios).toFixed(3)} min ${Math.min(...spanRatios).toFixed(3)}`);
});

test('object profiles export to a Zebra CSV and share without loss of rows', () => {
  for (const object of OBJECTS) {
    const rolled = rollObject({ object, seed: 21, wildness: 0.6 });
    const exported = zebraExport(rolled.partials, exportOptions(object, { description: rolled.description }));
    assert.match(exported.csv, /^Ratio;GainDB;Decay\n/);
    const back = fromCsv(exported.csv, { knob: exported.knob });
    assert.ok(back.length >= 1 && back.length <= rolled.partials.length);
    const built = buildShare({ name: object.name, material: object.material, shape: object.shape, partials: rolled.partials });
    const decoded = decodeShare(`#s=${built.token}`);
    assert.equal(decoded.material, object.material);
    assert.equal(decoded.shape, object.shape);
    assert.equal(decoded.partials.length, rolled.partials.length);
  }
});

test('objects that thin at A4 name a reference pitch and keep at least six rows, or all of them', () => {
  const needed = OBJECTS.filter((object) => {
    const atA4 = object.partials.filter((p) => p.ratio * A4_HZ <= ZEBRA_PARTIAL_LIMIT_HZ).length;
    return atA4 < object.partials.length && atA4 < 6;
  });
  assert.deepEqual(needed.map((o) => o.id).sort(), ['daxophone', 'kalimba', 'slinky', 'wine-glass']);
  for (const object of needed) {
    assert.ok(object.refHz > 0 && object.refNote && object.refReason, object.id);
    assert.ok(object.refHz < A4_HZ, object.id);
    const atA4 = audiblePartials(object.partials, { fundamental: A4_HZ });
    const atRef = audiblePartials(object.partials, exportOptions(object));
    assert.ok(atA4.length < 6, `${object.id} at A4`);
    assert.ok(atRef.length >= Math.min(6, object.partials.length), `${object.id} at ${object.refNote}: ${atRef.length}`);
    assert.equal(atRef.length, object.partials.filter((p) => p.ratio * object.refHz <= ZEBRA_PARTIAL_LIMIT_HZ).length);
    const exported = zebraExport(object.partials, exportOptions(object, { description: object.name }));
    assert.equal(exported.partials.length, atRef.length);
    assert.match(exported.hint, new RegExp(`Play at ${object.refNote.replace('#', '#')} \\(${Math.round(object.refHz)} Hz\\)`));
    assert.match(exported.filename, /_at-[a-g]s?\d_decay\d+\.csv$/);
    assert.ok(objectNoteText(object).includes(`Played at ${object.refNote}`));
    assert.ok(objectNoteText(object).includes(object.refReason));
  }
});

test('objects without a reference pitch, and material rolls, stay at A4', () => {
  for (const object of OBJECTS.filter((o) => !o.refHz)) {
    assert.equal(playPitch(object).note, 'A4');
    assert.equal(exportOptions(object).referenceHz, undefined);
    assert.equal(exportOptions(object).fundamental, 440);
    const exported = zebraExport(object.partials, exportOptions(object, { description: object.name }));
    assert.match(exported.hint, /Rows stop at 6 kHz when the fundamental is A4\./);
    assert.equal(exported.filename.includes('_at-'), false);
  }
  const material = zebraExport(previewPartials(defaultControls()), { description: 'Long bell strike' });
  assert.match(material.hint, /Rows stop at 6 kHz when the fundamental is A4\./);
  assert.equal(material.filename.includes('_at-'), false);
});

test('each object note has a short source line built from its sources', () => {
  for (const object of OBJECTS) {
    const line = sourceLine(object);
    const caption = objectNoteText(object);
    assert.ok(caption.includes(line), object.id);
    assert.equal(caption.includes('OBJECTS-SOURCES') || caption.includes('.md'), false, object.id);
    if (object.basis.ratio === 'approximation') {
      assert.equal(line, 'Approximation, tuned by ear.');
    } else {
      assert.equal(line, `Based on: ${object.credit}.`);
      assert.ok(object.credit, object.id);
    }
  }
  assert.equal(sourceLine(objectById('church-bell')), 'Based on: Rossing and Perrin, 1987.');
  assert.equal(sourceLine(objectById('kalimba')), 'Based on: Fletcher and Rossing, The Physics of Musical Instruments.');
  assert.equal(sourceLine(objectById('waterphone')), 'Approximation, tuned by ear.');
});
