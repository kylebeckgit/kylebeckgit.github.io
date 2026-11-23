import assert from 'node:assert/strict';
import test from 'node:test';
import { OBJECTS, baseProfile, matchObjectText, objectById, searchObjects } from './objects.js';
import { loadObject, mutateProfile, rollObject } from './objects-randomize.js';
import { mulberry32, rollSound, defaultLocks, identityKnobs, safetyCheck } from './randomize.js';
import { previewPartials, defaultControls, zebraExport, fromCsv } from './engine.js';
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

test('feral rolls skip the playable check but stay loadable', () => {
  let differs = 0;
  for (const object of OBJECTS) {
    for (let i = 0; i < 40; i++) {
      const feral = rollObject({ object, seed: 500 + i, wildness: 1, feral: true });
      assert.equal(feral.feral, true);
      assert.equal(safetyCheck(feral.partials).ok, true, `${object.id} ${i}`);
      assert.match(feral.description, /feral/);
      const tame = rollObject({ object, seed: 500 + i, wildness: 1 });
      if (JSON.stringify(feral.partials) !== JSON.stringify(tame.partials)) differs += 1;
    }
  }
  assert.ok(differs > 600);
  for (const material of ['metal', 'wood', 'glass', 'skin', 'bell', 'any', 'wild']) {
    for (let i = 0; i < 40; i++) {
      const rolled = rollSound({ base: previewPartials(defaultControls()), current: identityKnobs(), material, wildness: 1, seed: 900 + i, locks: defaultLocks(), feral: true });
      assert.equal(safetyCheck(rolled.partials).ok, true, `${material} ${i}`);
    }
  }
});

test('a non-feral material roll is unchanged by the feral option existing', () => {
  const base = previewPartials(defaultControls());
  const a = rollSound({ base, current: identityKnobs(), material: 'bell', seed: 12, locks: defaultLocks() });
  const b = rollSound({ base, current: identityKnobs(), material: 'bell', seed: 12, locks: defaultLocks(), feral: false });
  assert.deepEqual(a.partials, b.partials);
  assert.equal(a.quality.ok, true);
});

test('object profiles export to a Zebra CSV and share without loss of rows', () => {
  for (const object of OBJECTS) {
    const rolled = rollObject({ object, seed: 21, wildness: 0.6 });
    const exported = zebraExport(rolled.partials, { fundamental: 440, description: rolled.description });
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
