import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShare, decodeShare, encodeShare } from './share.js';

const sample = {
  name: 'Kelp harp',
  description: 'A large water string.',
  objectName: 'Kelp harp',
  material: 'water',
  shape: 'string',
  size: 'large',
  exciter: 'mallet',
  hardness: 0.42,
  velocity: 0.8,
  position: 0.2,
  detune: 0.1254,
  controls: {
    preset: 'string',
    stiffness: 0.3512,
    brightness: -0.2,
    damping: 0.3,
    oddEven: 0,
    seed: 42,
    count: 12,
    voice: '',
    decayScale: 1,
    pitchScale: 1.5,
    variation: 'long',
    variationTilt: 0,
    variationDecay: 1.6,
    variationLift: 0.4,
  },
  partials: [
    { ratio: 1.23456, gainDb: -0.004, decay: 2.3456 },
    { ratio: 3.2, gainDb: -8.126, decay: 0.5 },
    { ratio: 9, gainDb: -14, decay: 12 },
  ],
};

test('a share link round-trips the profile', () => {
  const decoded = decodeShare(`#s=${encodeShare(sample)}`);
  assert.equal(decoded.name, 'Kelp harp');
  assert.equal(decoded.description, 'A large water string.');
  assert.equal(decoded.objectName, 'Kelp harp');
  assert.equal(decoded.material, 'water');
  assert.equal(decoded.shape, 'string');
  assert.equal(decoded.size, 'large');
  assert.equal(decoded.controls.preset, 'string');
  assert.equal(decoded.controls.pitchScale, 1.5);
  assert.equal(decoded.controls.variation, 'long');
  assert.equal(decoded.controls.seed, 42);
  assert.equal(decoded.partials.length, 3);
  assert.equal(decoded.partials[0].ratio, 1.2346);
  assert.equal(decoded.partials[1].gainDb, -8.13);
  assert.equal(decoded.detune, 0.125);
});

test('share values are clamped and text is not markup', () => {
  const decoded = decodeShare(`#s=${encodeShare({
    name: '<img src=x> <b>Bell</b>',
    description: '<script>alert(1)</script>long ring',
    material: 'unobtanium',
    shape: 'nope',
    size: 'galactic',
    exciter: 'laser',
    hardness: 4,
    velocity: -2,
    position: 8,
    detune: 9,
    controls: { preset: 'nope', stiffness: 12, brightness: -9, damping: 3, seed: -4, pitchScale: 99 },
    partials: [{ ratio: 400, gainDb: 20, decay: 0 }, { ratio: 0, gainDb: 0, decay: 1 }],
  })}`);
  assert.equal(decoded.name, 'Bell');
  assert.equal(decoded.description.includes('<'), false);
  assert.match(decoded.description, /long ring/);
  assert.equal(decoded.material, '');
  assert.equal(decoded.shape, '');
  assert.equal(decoded.size, 'medium');
  assert.equal(decoded.exciter, 'mallet');
  assert.equal(decoded.hardness, 1);
  assert.equal(decoded.velocity, 0);
  assert.equal(decoded.position, 0.98);
  assert.equal(decoded.detune, 1);
  assert.equal(decoded.controls.preset, 'string');
  assert.equal(decoded.controls.stiffness, 1);
  assert.equal(decoded.controls.brightness, -1);
  assert.equal(decoded.controls.damping, 1);
  assert.equal(decoded.controls.seed, 0);
  assert.equal(decoded.controls.pitchScale, 4);
  assert.equal(decoded.partials.length, 2);
  assert.equal(decoded.partials[0].ratio, 80);
  assert.equal(decoded.partials[0].gainDb, 0);
  assert.equal(decoded.partials[0].decay, 0.05);
  assert.equal(decoded.partials[1].ratio, 0.05);
  const many = Array.from({ length: 64 }, (_, index) => ({ ratio: 1 + index, gainDb: -90, decay: 1 }));
  const kept = decodeShare(`#s=${encodeShare({ ...sample, partials: many })}`);
  assert.equal(kept.partials.length, 64);
  assert.equal(kept.partials[10].gainDb, -90);
});

test('64 and 256 partials round-trip, including -96 dB', () => {
  for (const count of [64, 256]) {
    const partials = Array.from({ length: count }, (_, index) => ({
      ratio: 1 + index * 0.05,
      gainDb: index === count - 1 ? -96 : Math.max(-96, -index * 0.25),
      decay: 0.05 + (index % 10) * 0.5,
    }));
    const decoded = decodeShare(`#s=${encodeShare({ ...sample, partials })}`);
    assert.equal(decoded.partials.length, count);
    assert.equal(decoded.partials[count - 1].gainDb, -96);
    assert.equal(decoded.partials[0].ratio, 1);
  }
});

test('a link that cannot fit drops quiet partials', () => {
  const partials = Array.from({ length: 40 }, (_, index) => ({
    ratio: 1 + index * 0.2,
    gainDb: index === 0 ? 0 : -index,
    decay: 1,
  }));
  const built = buildShare({ ...sample, partials }, { maxToken: 500 });
  assert.equal(built.shortened, true);
  const decoded = decodeShare(`#s=${built.token}`);
  assert.ok(decoded.partials.length < 40);
  assert.ok(decoded.partials.some((partial) => partial.gainDb === 0));
});

test('shortening drops the quietest partial even when it is first', () => {
  const partials = [
    { ratio: 1, gainDb: -96, decay: 1 },
    { ratio: 2, gainDb: -12, decay: 1 },
    { ratio: 3, gainDb: 0, decay: 1 },
    { ratio: 4, gainDb: -3, decay: 1 },
  ];
  const full = buildShare({ ...sample, partials });
  const built = buildShare({ ...sample, partials }, { maxToken: full.token.length - 1 });
  assert.equal(built.shortened, true);
  const decoded = decodeShare(`#s=${built.token}`);
  assert.equal(decoded.partials.length, 3);
  assert.ok(decoded.partials.every((partial) => partial.gainDb !== -96));
  assert.ok(decoded.partials.some((partial) => partial.gainDb === 0));
});

test('a 256-partial link is one base64 of the packed bytes', () => {
  const partials = Array.from({ length: 256 }, (_, index) => ({
    ratio: 1 + index * 0.05,
    gainDb: Math.max(-96, -index * 0.25),
    decay: 1,
  }));
  const built = buildShare({ ...sample, partials });
  assert.equal(built.shortened, false);
  const padded = built.token.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((built.token.length + 3) % 4);
  const bytes = Buffer.from(padded, 'base64');
  const jsonLength = bytes[1] | (bytes[2] << 8);
  assert.equal(bytes.length, 3 + jsonLength + 256 * 8);
  const expected = Math.ceil(bytes.length / 3) * 4 - [0, 2, 1][bytes.length % 3];
  assert.equal(built.token.length, expected);
  assert.ok(built.token.length < 3800);
});

test('a bad share hash is ignored', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#p=abc'), null);
  assert.equal(decodeShare('#s=not-json'), null);
  assert.equal(decodeShare('#s='), null);
  assert.equal(decodeShare('#s=' + encodeShare(sample).slice(0, 8)), null);
  const token = encodeShare({ ...sample, name: 'Ok' });
  const padded = token.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((token.length + 3) % 4);
  const bytes = Buffer.from(padded, 'base64');
  const jsonLength = bytes[1] | (bytes[2] << 8);
  const tagged = JSON.parse(bytes.subarray(3, 3 + jsonLength).toString());
  tagged.v = 99;
  const json = Buffer.from(JSON.stringify(tagged));
  const rebuilt = Buffer.concat([
    Buffer.from([1, json.length & 0xff, (json.length >> 8) & 0xff]),
    json,
    bytes.subarray(3 + jsonLength),
  ]);
  assert.equal(decodeShare(`#s=${rebuilt.toString('base64url')}`), null);
});
