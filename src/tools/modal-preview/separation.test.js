import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyHandoff,
  createDesignerSession,
  createGeneratorSession,
  currentSnapshot,
  handoffPayload,
  loadGeneratorTurn,
  promptForRoll,
  randomizeDesigner,
  redoDesigner,
  redoGenerator,
  rollGenerator,
  snapshotVariation,
  undoDesigner,
  undoGenerator,
} from './generator.js';
import { describePrompt } from './recipes.js';

function signature(partials) {
  return partials.map((partial) => [
    partial.ratio.toFixed(4),
    partial.gainDb.toFixed(2),
    partial.decay.toFixed(3),
  ].join(':')).join('|');
}

test('the designer and the generator keep separate bodies', () => {
  const designer = createDesignerSession();
  const generator = createGeneratorSession();
  const before = signature(designer.partials);
  loadGeneratorTurn(generator, 'black hole');
  const generated = signature(currentSnapshot(generator).partials);
  assert.notEqual(generated, before);
  assert.equal(signature(designer.partials), before);
  randomizeDesigner(designer, 11, { material: 'wood', wildness: 0.2 });
  assert.notEqual(signature(designer.partials), before);
  assert.equal(signature(currentSnapshot(generator).partials), generated);
});

test('open in designer copies the chosen partials exactly', () => {
  const generator = createGeneratorSession();
  loadGeneratorTurn(generator, 'gong');
  generator.turn.selected = 1;
  const payload = handoffPayload(generator);
  const chosen = snapshotVariation(generator.turn.variations[1]);
  assert.equal(signature(payload.partials), signature(chosen.partials));
  assert.equal(payload.partials.length, chosen.partials.length);
  const designer = createDesignerSession();
  applyHandoff(designer, payload);
  assert.equal(signature(designer.partials), signature(payload.partials));
  assert.equal(designer.name, payload.name);
  assert.equal(designer.custom, true);
  for (let i = 0; i < payload.partials.length; i++) {
    assert.equal(designer.partials[i].ratio, payload.partials[i].ratio);
    assert.equal(designer.partials[i].gainDb, payload.partials[i].gainDb);
    assert.equal(designer.partials[i].decay, payload.partials[i].decay);
  }
  randomizeDesigner(designer, 4, { material: 'glass' });
  assert.notEqual(signature(designer.partials), signature(payload.partials));
  assert.equal(signature(currentSnapshot(generator).partials), signature(payload.partials));
});

test('each tool randomizes into a different body and can undo', () => {
  const designer = createDesignerSession();
  const first = signature(designer.partials);
  const rolled = randomizeDesigner(designer, 3, { material: 'metal', wildness: 0.4 });
  const second = randomizeDesigner(designer, 9, { material: 'bell', wildness: 0.8 });
  assert.notEqual(signature(designer.partials), first);
  assert.notEqual(signature(rolled.partials), signature(second.partials));
  assert.ok(rolled.partials.length > 0);
  undoDesigner(designer);
  assert.equal(signature(designer.partials), signature(rolled.partials));
  undoDesigner(designer);
  assert.equal(signature(designer.partials), first);
  redoDesigner(designer);
  assert.equal(signature(designer.partials), signature(rolled.partials));

  const generator = createGeneratorSession();
  const calm = rollGenerator(generator, { wildness: 0.2, seed: 2 });
  const calmSig = signature(currentSnapshot(generator).partials);
  const wild = rollGenerator(generator, { wildness: 1, seed: 5 });
  const wildSig = signature(currentSnapshot(generator).partials);
  assert.notEqual(calm.prompt, wild.prompt);
  assert.notEqual(calmSig, wildSig);
  assert.ok(currentSnapshot(generator).partials.length > 0);
  assert.equal(describePrompt(wild.prompt).length, 4);
  undoGenerator(generator);
  assert.equal(signature(currentSnapshot(generator).partials), calmSig);
  assert.equal(generator.turn.prompt, calm.prompt);
  redoGenerator(generator);
  assert.equal(signature(currentSnapshot(generator).partials), wildSig);
  assert.notEqual(promptForRoll(2, 0.2), promptForRoll(5, 1));
});
