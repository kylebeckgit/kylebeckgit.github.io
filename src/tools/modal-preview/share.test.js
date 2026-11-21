import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeShare, encodeShare } from './share.js';

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
});

test('a bad share hash is ignored', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#p=abc'), null);
  assert.equal(decodeShare('#s=not-json'), null);
  assert.equal(decodeShare('#s='), null);
  assert.equal(decodeShare('#s=' + encodeShare(sample).slice(0, 8)), null);
  const tagged = JSON.parse(Buffer.from(encodeShare({ ...sample, name: 'Ok' }).replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString());
  tagged.v = 99;
  const bad = Buffer.from(JSON.stringify(tagged)).toString('base64url');
  assert.equal(decodeShare(`#s=${bad}`), null);
});
