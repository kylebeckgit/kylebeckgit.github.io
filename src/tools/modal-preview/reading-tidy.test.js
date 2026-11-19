import assert from 'node:assert/strict';
import test from 'node:test';
import { highWildPrompts, promptForRoll } from './generator.js';
import { readRecipe } from './recipes.js';

const STOP = new Set(['a', 'of', 'the']);
const CONFLICTS = [
  ['frozen', 'melting'],
  ['frozen', 'burning'],
  ['burning', 'underwater'],
];

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((word) => word && !STOP.has(word));
}

function readingProblems(prompt) {
  const recipe = readRecipe(prompt);
  const list = words(recipe.reading);
  const issues = [];
  const seen = new Set();
  for (const word of list) {
    if (seen.has(word)) issues.push(`repeat:${word}`);
    seen.add(word);
  }
  const made = prompt.match(/\bmade of ([a-z]+)\b/);
  if (made && !new RegExp(`\\b${made[1]}\\b`).test(recipe.reading.toLowerCase())) issues.push(`material:${made[1]}`);
  if (/\bin a cathedral\b/.test(prompt) && recipe.objectName === 'Cavern') issues.push('scene');
  for (const [left, right] of CONFLICTS) {
    if (list.includes(left) && list.includes(right)) issues.push(`conflict:${left}/${right}`);
  }
  return issues;
}

test('explicit materials, scenes, and singing bowls keep a clean reading', () => {
  const wood = readRecipe('church bell made of wood, frozen');
  assert.equal(wood.material, 'wood');
  assert.match(wood.reading, /Church bell: a huge wood shell/);
  assert.match(wood.reading, /frozen/);
  assert.doesNotMatch(wood.reading, /\bice\b/);
  for (const state of ['frozen', 'melting', 'rusty', 'underwater', 'inside out', 'burning']) {
    const recipe = readRecipe(`church bell made of wood, ${state}`);
    assert.equal(recipe.material, 'wood', state);
    assert.match(recipe.reading, /\bwood\b/, state);
    assert.doesNotMatch(recipe.reading, /\bice\b/, state);
  }

  const scene = readRecipe('chime in a cathedral at the bottom of the sea');
  assert.equal(scene.objectName, 'Chime');
  assert.match(scene.reading, /^Chime:/);
  assert.match(scene.reading, /huge/);
  assert.match(scene.reading, /dark/);
  assert.doesNotMatch(scene.reading, /cavern/i);

  const string = readRecipe('broken string made of metal, inside out');
  assert.equal(string.objectName, 'String');
  assert.match(string.reading, /\bmetal\b/);
  assert.doesNotMatch(string.reading, /string string/);
  assert.equal(readingProblems(string.reading && 'broken string made of metal, inside out').length, 0);

  const bowl = readRecipe('singing bowl');
  assert.equal(bowl.objectName, 'Singing bowl');
  assert.equal(bowl.material, 'metal');
  assert.match(bowl.reading, /Singing bowl:/);
  assert.match(bowl.reading, /\bmetal\b/);
  assert.doesNotMatch(bowl.reading, /glass bowl/i);
  const plainBowl = readRecipe('glass bowl');
  const sameBowl = readRecipe('glass bowl made of glass');
  assert.equal(sameBowl.controls.voice, plainBowl.controls.voice);
  assert.equal(sameBowl.controls.brightness, plainBowl.controls.brightness);
  assert.equal(sameBowl.controls.damping, plainBowl.controls.damping);
  const woodBowl = readRecipe('glass bowl made of wood');
  assert.equal(woodBowl.material, 'wood');
  assert.equal(woodBowl.controls.voice, '');

  const clay = readRecipe('singing bowl made of clay');
  assert.equal(clay.objectName, 'Singing bowl');
  assert.equal(clay.material, 'clay');
  assert.match(clay.reading, /\bclay\b/);
  assert.doesNotMatch(clay.reading, /glass/i);
});

test('every high-wildness prompt and a long random sample reads cleanly', () => {
  const prompts = highWildPrompts();
  assert.ok(prompts.length >= 2000, `only ${prompts.length} high prompts`);
  const bad = [];
  for (const prompt of prompts) {
    const issues = readingProblems(prompt);
    if (issues.length) bad.push(`${prompt} :: ${readRecipe(prompt).reading} :: ${issues.join(', ')}`);
  }
  for (let i = 1; i <= 2000; i++) {
    const prompt = promptForRoll(i * 17 + 3, 1);
    const issues = readingProblems(prompt);
    if (issues.length) bad.push(`${prompt} :: ${readRecipe(prompt).reading} :: ${issues.join(', ')}`);
  }
  assert.equal(bad.length, 0, bad.slice(0, 8).join('\n'));
});
