import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyVoiceCap,
  bufferStopTime,
  buildStrikeBody,
  CLIP_CEILING,
  createImpulse,
  createStreamPlanner,
  isScalePitch,
  limiterCurve,
  linearPeakCeiling,
  masterGainForCap,
  MAX_PARTIALS,
  MAX_VOICES,
  mergePlan,
  nowPlaying,
  PEAK_PER_VOICE,
  PLAN_CHUNK,
  planStream,
  pruneStrikes,
  STREAM_MATERIALS,
  streamClimate,
  strikeLabel,
} from './stream.js';

function samePlan(a, b) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].time, b[i].time);
    assert.equal(a[i].midi, b[i].midi);
    assert.equal(a[i].note, b[i].note);
    assert.equal(a[i].source, b[i].source);
    assert.equal(a[i].objectId, b[i].objectId);
    assert.equal(a[i].material, b[i].material);
    assert.equal(a[i].rollSeed, b[i].rollSeed);
    assert.equal(a[i].ringSeconds, b[i].ringSeconds);
  }
}

test('a seeded plan is deterministic and a different seed is not', () => {
  const a = planStream(1, 90);
  const b = planStream(1, 90);
  const c = planStream(2, 90);
  assert.ok(a.length > 10);
  samePlan(a, b);
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
});

test('every planned pitch sits on the stream scale', () => {
  const plan = planStream(17, 180);
  assert.ok(plan.length > 20);
  for (const strike of plan) {
    assert.ok(isScalePitch(strike.midi), `${strike.note} (${strike.midi}) is off the scale`);
    assert.equal(strikeLabel(strike), `${strike.objectName}, ${strike.note}`);
  }
});

test('climate drifts density, register and material over minutes', () => {
  const start = streamClimate(0);
  const mid = streamClimate(210);
  const later = streamClimate(420);
  assert.ok(Math.abs(start.interval - mid.interval) > 0.4);
  assert.ok(Math.abs(start.register - later.register) > 3);
  assert.ok(STREAM_MATERIALS.includes(start.material));
  assert.notEqual(start.material, later.material);
});

test('voice cap never allows more overlapping strikes than the limit', () => {
  const plan = planStream(9, 240, { maxVoices: MAX_VOICES });
  const times = new Set();
  for (const strike of plan) {
    times.add(strike.time);
    times.add(strike.time + strike.ringSeconds - 1e-6);
  }
  let peak = 0;
  for (const time of times) {
    const count = plan.filter((strike) => strike.time <= time && time < strike.time + strike.ringSeconds).length;
    peak = Math.max(peak, count);
    assert.ok(count <= MAX_VOICES, `found ${count} overlapping voices at ${time}`);
  }
  assert.ok(peak <= MAX_VOICES);
  const uncapped = applyVoiceCap([
    { time: 0, ringSeconds: 5 },
    { time: 0.2, ringSeconds: 5 },
    { time: 0.4, ringSeconds: 5 },
    { time: 0.6, ringSeconds: 5 },
    { time: 0.8, ringSeconds: 5 },
  ], 3);
  assert.equal(uncapped.length, 3);
});

test('stacked voices stay under unity gain without relying on the limiter', () => {
  const gain = masterGainForCap();
  const ceiling = linearPeakCeiling();
  assert.ok(gain > 0);
  assert.ok(ceiling <= 1);
  assert.ok(ceiling <= CLIP_CEILING);
  assert.ok(CLIP_CEILING - ceiling < 1e-12);
  assert.ok(PEAK_PER_VOICE * MAX_VOICES > 1, 'the raw stack would clip without the master gain');
});

test('the limiter curve stays inside minus one to one', () => {
  const curve = limiterCurve();
  assert.equal(curve.length, 1024);
  let peak = 0;
  let bestI = 0;
  let bestX = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const value = curve[i];
    assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(value) <= 1 + 1e-12);
    peak = Math.max(peak, Math.abs(value));
    const x = (i / (curve.length - 1)) * 2 - 1;
    if (Math.abs(x) < bestX) {
      bestX = Math.abs(x);
      bestI = i;
    }
  }
  assert.ok(Math.abs(curve[bestI]) < 0.01);
  assert.ok(peak <= 1);
  assert.ok(Math.abs(curve[0] + 1) < 1e-12);
  assert.ok(Math.abs(curve[curve.length - 1] - 1) < 1e-12);
});

test('buildStrikeBody reuses object and material profiles and caps voices', () => {
  const plan = planStream(3, 45);
  const objectStrike = plan.find((strike) => strike.source === 'object');
  const materialStrike = plan.find((strike) => strike.source === 'material');
  assert.ok(objectStrike, 'plan should include a library object');
  assert.ok(materialStrike, 'plan should include a rolled material');
  const objectBody = buildStrikeBody(objectStrike);
  const again = buildStrikeBody(objectStrike);
  assert.deepEqual(objectBody.partials, again.partials);
  assert.ok(objectBody.partials.length > 0);
  assert.ok(objectBody.partials.length <= MAX_PARTIALS);
  assert.equal(objectBody.fundamental, objectStrike.hz);
  assert.ok(objectBody.seconds > 0);
  assert.ok(objectBody.seconds <= 5.5);
  const materialBody = buildStrikeBody(materialStrike);
  assert.ok(materialBody.partials.length > 0);
  assert.ok(materialBody.partials.length <= MAX_PARTIALS);
  for (const partial of [...objectBody.partials, ...materialBody.partials]) {
    assert.ok(partial.ratio > 0);
    assert.ok(Number.isFinite(partial.gainDb));
    assert.ok(partial.decay > 0);
  }
});

test('a reverb impulse decays and stays finite', () => {
  let i = 0;
  const rng = () => {
    i += 1;
    return ((i * 17) % 100) / 100;
  };
  const data = createImpulse(44100, 1.2, rng);
  assert.equal(data.length, Math.floor(44100 * 1.2));
  let peak = 0;
  for (const value of data) {
    assert.ok(Number.isFinite(value));
    peak = Math.max(peak, Math.abs(value));
  }
  assert.ok(peak > 0);
  assert.ok(peak <= 1);
  const early = Math.abs(data[20]);
  const late = Math.abs(data[data.length - 20]);
  assert.ok(late < early);
});

test('a scheduled buffer stops after its duration in seconds', () => {
  const when = 2;
  const sampleRate = 44100;
  const duration = 5.5;
  const buffer = { duration, length: Math.round(duration * sampleRate), sampleRate };
  const stop = bufferStopTime(when, buffer);
  assert.equal(stop, when + duration);
  assert.equal(stop, 7.5);
  const sliced = when + buffer.duration / sampleRate;
  assert.ok(stop - sliced > 5, `stop ${stop} looks like duration / sampleRate (${sliced})`);
  assert.ok(Math.abs(stop - (when + buffer.length / sampleRate)) < 1e-9);
  assert.equal(bufferStopTime(when, { length: duration * sampleRate, sampleRate }), when + duration);
});

test('pruning drops finished strikes and keeps ringing or upcoming ones', () => {
  const strikes = [
    { time: 0, ringSeconds: 2 },
    { time: 1, ringSeconds: 5 },
    { time: 8, ringSeconds: 2 },
  ];
  const kept = pruneStrikes(strikes, 3);
  assert.deepEqual(kept.map((strike) => strike.time), [1, 8]);
});

test('the first window keeps short opening strikes in the live plan', () => {
  const planner = createStreamPlanner(1);
  const result = planner.planUntil(PLAN_CHUNK);
  const full = planStream(1, PLAN_CHUNK);
  samePlan(result.added, full);
  const plan = mergePlan([], result.added, 0);
  samePlan(plan, full);
  const shortOpening = full.filter((strike) => strike.time < 4 && strike.time + strike.ringSeconds < PLAN_CHUNK);
  assert.ok(shortOpening.length > 0, 'expected short opening strikes');
  for (const strike of shortOpening) {
    assert.ok(plan.some((row) => row.time === strike.time), `missing opening strike at ${strike.time}`);
  }
});

test('strikes still sounding at now remain in the plan after a chunk boundary', () => {
  const planner = createStreamPlanner(1);
  const first = planner.planUntil(PLAN_CHUNK);
  let plan = mergePlan([], first.added, 0);
  const last = first.added[first.added.length - 1];
  const now = last.time + last.ringSeconds * 0.5;
  const second = planner.planUntil(Math.max(PLAN_CHUNK * 2, now + PLAN_CHUNK));
  plan = mergePlan(plan, second.added, now);
  const stillSounding = first.added.filter((strike) => strike.time < now && strike.time + strike.ringSeconds > now);
  assert.ok(stillSounding.length > 0, 'expected a strike still sounding at the boundary');
  for (const strike of stillSounding) {
    assert.ok(plan.some((row) => row.time === strike.time), `lost sounding strike at ${strike.time}`);
  }
  const finished = first.added.filter((strike) => strike.time + strike.ringSeconds <= now);
  assert.ok(finished.length > 0, 'expected at least one finished first-window strike');
  for (const strike of finished) {
    assert.ok(!plan.some((row) => row.time === strike.time), `finished strike ${strike.time} was not pruned`);
  }
  for (const strike of second.added) {
    if (strike.time + strike.ringSeconds <= now) continue;
    assert.ok(plan.some((row) => row.time === strike.time), `missing second-window strike at ${strike.time}`);
  }
});

test('now playing resolves to a started strike while it is sounding', () => {
  const planner = createStreamPlanner(1);
  const first = planner.planUntil(PLAN_CHUNK);
  const plan = mergePlan([], first.added, 0);
  const strike = plan[0];
  const started = new Set([strike.time]);
  const during = strike.time + Math.min(0.25, strike.ringSeconds / 2);
  const current = nowPlaying(plan, started, during);
  assert.ok(current, 'now playing was empty while a started strike is sounding');
  assert.equal(current.time, strike.time);
  assert.ok(strikeLabel(current).length > 0);
  assert.equal(nowPlaying(plan, started, strike.time + strike.ringSeconds), null);
  assert.equal(nowPlaying(plan, new Set(), during), null);
});

test('incremental planning stays bounded over two hours and stays deterministic', () => {
  const duration = 2 * 60 * 60;
  const chunk = PLAN_CHUNK;
  const planner = createStreamPlanner(1);
  const added = [];
  const sizes = [];
  const works = [];
  let plan = [];
  for (let end = chunk; end <= duration; end += chunk) {
    const result = planner.planUntil(end);
    const now = end - chunk;
    plan = mergePlan(plan, result.added, now);
    added.push(...result.added);
    sizes.push(plan.length);
    works.push(result.work);
  }
  const full = planStream(1, duration);
  samePlan(added, full);
  const again = createStreamPlanner(1);
  const repeat = [];
  for (let end = chunk; end <= duration; end += chunk) {
    repeat.push(...again.planUntil(end).added);
  }
  samePlan(repeat, added);
  const other = createStreamPlanner(2).planUntil(duration).added;
  assert.notEqual(JSON.stringify(added.slice(0, 20)), JSON.stringify(other.slice(0, 20)));

  const bound = Math.ceil(chunk / 0.28) + MAX_VOICES + 2;
  const peak = Math.max(...sizes);
  assert.ok(peak <= bound, `live plan grew to ${peak}, bound ${bound}`);
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const early = mean(works.slice(0, 15));
  const late = mean(works.slice(-15));
  assert.ok(late < early * 3, `per-chunk work grew from ${early.toFixed(1)} to ${late.toFixed(1)}`);
});
