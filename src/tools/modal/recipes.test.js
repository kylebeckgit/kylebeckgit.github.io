import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPartials } from './engine.js';
import { renderPreview, peakStats, scaleToPeak } from './resonator.js';
import { describePrompt, fileSlug, readRecipe } from './recipes.js';
import { rememberedIndex } from './studio.js';

test('a glass bowl becomes four different plate variations', () => {
  const prompt = 'glass bowl struck softly, slightly detuned, long shimmer';
  const variations = describePrompt(prompt);
  assert.equal(variations.length, 4);
  assert.equal(variations[0].controls.preset, 'plate');
  assert.equal(variations[0].exciter, 'mallet');
  assert.ok(variations[0].hardness < 0.4);
  assert.ok(variations[0].controls.seed > 0);
  assert.ok(variations[1].controls.brightness > variations[0].controls.brightness);
  assert.ok(variations[2].controls.brightness < variations[0].controls.brightness);
  assert.ok(variations[3].controls.stiffness > variations[0].controls.stiffness);
  const signatures = new Set(variations.map((variation) => JSON.stringify(variation.controls)));
  assert.equal(signatures.size, 4);
  for (const variation of variations) {
    assert.equal(buildPartials(variation.controls).length, 64);
  }
});

test('refining keeps the object and moves one physical control', () => {
  const bowl = describePrompt('glass bowl struck softly, long shimmer')[0];
  const darker = describePrompt('darker', bowl)[0];
  const shorter = describePrompt('shorter tail', bowl)[0];
  const gamelan = describePrompt('like a gamelan', bowl)[0];
  assert.equal(darker.objectName, 'Glass bowl');
  assert.ok(darker.controls.brightness < bowl.controls.brightness);
  const darkerSet = describePrompt('darker', bowl);
  assert.ok(darkerSet[1].controls.brightness < darkerSet[0].controls.brightness);
  assert.equal(darkerSet[3].name, 'Shorter glass bowl');
  assert.ok(shorter.controls.damping > bowl.controls.damping);
  assert.equal(gamelan.controls.preset, 'bell');
  assert.ok(gamelan.controls.stiffness > 0.4);
});

test('a mallet strike is quiet until it is scaled to a listenable level', () => {
  const recipe = describePrompt('glass bowl struck softly')[0];
  const partials = buildPartials(recipe.controls);
  const samples = renderPreview(partials, {
    fundamental: 440,
    velocity: recipe.velocity,
    position: recipe.position,
    exciter: recipe.exciter,
    hardness: recipe.hardness,
    sampleRate: 48000,
    seconds: 0.8,
  });
  const raw = peakStats(samples);
  assert.ok(raw.peak > 1e-5);
  const heard = scaleToPeak(samples, 0.45);
  const stats = peakStats(heard);
  assert.ok(stats.peak > 0.4 && stats.peak < 0.5);
  assert.ok(stats.rms > 0.01);
});

test('step back restores the variation that was selected', () => {
  const bowl = describePrompt('glass bowl struck softly') ;
  const turn = { variations: bowl, selected: 2 };
  assert.equal(rememberedIndex(turn), 2);
  assert.equal(rememberedIndex({ variations: bowl }), 0);
  assert.equal(rememberedIndex({ variations: bowl, selected: 9 }), 3);
});

test('the same sentence always gives the same recipe', () => {
  const first = readRecipe('small prayer bell, hard strike');
  const second = readRecipe('small prayer bell, hard strike');
  assert.deepEqual(first, second);
  assert.equal(first.controls.preset, 'bell');
  assert.equal(fileSlug(first.objectName), 'prayer-bell.csv');
});
