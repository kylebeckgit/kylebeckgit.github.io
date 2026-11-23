import assert from 'node:assert/strict';
import test from 'node:test';
import { OBJECTS, objectById, playPitch, searchObjects, sourceLine } from './objects.js';
import { loadObject, rollObject } from './objects-randomize.js';
import {
  FEATURED_OBJECT_IDS,
  featuredObjects,
  loadObjectVariation,
  moreObjects,
  objectChipLabel,
  variationFromLoaded,
} from './objects-chips.js';
import { createGeneratorSession, rollGenerator, snapshotVariation } from './generator.js';

test('the generator features six unusual objects, with the rest behind more', () => {
  assert.deepEqual(FEATURED_OBJECT_IDS, [
    'daxophone',
    'slinky',
    'kalimba',
    'waterphone',
    'brake-drum',
    'saw-blade',
  ]);
  const featured = featuredObjects();
  assert.equal(featured.length, 6);
  assert.deepEqual(featured.map((object) => object.id), FEATURED_OBJECT_IDS);
  const rest = moreObjects();
  const ids = new Set([...featured, ...rest].map((object) => object.id));
  assert.equal(ids.size, OBJECTS.length);
  assert.equal(featured.length + rest.length, OBJECTS.length);
  for (const object of featured) {
    assert.equal(rest.some((other) => other.id === object.id), false, object.id);
  }
});

test('chip labels are short sentence case and match the library', () => {
  assert.equal(objectChipLabel(objectById('daxophone')), 'Daxophone');
  assert.equal(objectChipLabel(objectById('slinky')), 'Slinky');
  assert.equal(objectChipLabel(objectById('kalimba')), 'Kalimba');
  assert.equal(objectChipLabel(objectById('waterphone')), 'Waterphone');
  assert.equal(objectChipLabel(objectById('brake-drum')), 'Brake drum');
  assert.equal(objectChipLabel(objectById('saw-blade')), 'Saw blade');
  assert.equal(objectChipLabel(objectById('singing-bowl')), 'Singing bowl');
  for (const object of OBJECTS) {
    const label = objectChipLabel(object);
    assert.ok(label);
    assert.equal(label, label.trim());
    assert.match(label, /^[A-Z]/);
    assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(label), false, label);
    assert.ok(label.length <= 18, label);
  }
});

test('loading a chip uses the same base profile as Load object', () => {
  for (const id of FEATURED_OBJECT_IDS) {
    const object = objectById(id);
    const loaded = loadObject(object);
    const variation = loadObjectVariation(object);
    assert.equal(variation.name, object.name);
    assert.equal(variation.objectId, id);
    assert.equal(variation.source, sourceLine(object));
    assert.equal(variation.fundamental, playPitch(object).hz);
    assert.deepEqual(variation.partials, loaded.partials);
    assert.match(variation.source, /^(Based on: |Approximation,)/);
  }
});

test('snapshotVariation keeps a library pitch below the pitch-scale floor', () => {
  const slinky = objectById('slinky');
  const variation = loadObjectVariation(slinky);
  const snap = snapshotVariation(variation);
  assert.ok(playPitch(slinky).hz < 440 * 0.25);
  assert.equal(snap.fundamental, playPitch(slinky).hz);
  assert.deepEqual(snap.partials, variation.partials);
  const plain = snapshotVariation({ name: 'Wood block', controls: { preset: 'bar' }, partials: variation.partials });
  assert.equal(plain.fundamental, 440);
});

test('randomize with a chosen object rolls around that object at the given wildness', () => {
  const object = objectById('daxophone');
  const session = createGeneratorSession();
  const base = loadObject(object);
  const rolled = rollGenerator(session, { wildness: 0.8, seed: 42, object });
  assert.equal(rolled.prompt, object.name);
  assert.equal(rolled.turn.variations.length, 1);
  const variation = rolled.turn.variations[0];
  assert.equal(variation.objectId, 'daxophone');
  assert.equal(variation.source, sourceLine(object));
  assert.ok(variation.partials.length >= 4);
  assert.notDeepEqual(variation.partials, base.partials);
  const direct = rollObject({ object, amount: 1, wildness: 0.8, seed: 42 });
  assert.deepEqual(variation.partials, variationFromLoaded(object, direct).partials);
  const again = rollGenerator(createGeneratorSession(), { wildness: 0.2, seed: 2 });
  const control = rollGenerator(createGeneratorSession(), { wildness: 0.2, seed: 2 });
  assert.equal(again.prompt, control.prompt);
  assert.notEqual(again.prompt, object.name);
});

test('typing an object name still finds it for the generator search box', () => {
  assert.equal(searchObjects('dax', 6)[0].object.id, 'daxophone');
  assert.equal(searchObjects('glass', 8).some((hit) => hit.object.id === 'wine-glass'), true);
  assert.equal(searchObjects('slinky', 1)[0].object.id, 'slinky');
});
