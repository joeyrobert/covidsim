// Headless harness for covidsim.js. It stubs the canvas, the form, and Chart.js
// so the simulation can be checked and timed with plain node.
//
//   node bench/sim.js
//   node bench/sim.js --steps 500000 --check-every 25000
//   node bench/sim.js --population 5000 --initial-infected 25
//
// Exit code is 1 if any invariant fails.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = path.join(__dirname, '..', 'covidsim.js');
const SECONDS_IN_DAY = 86400;
const GRAPH_SAMPLES = 2000;

// Defaults as shipped in index.html
const CONFIG = {
  population: 1000,
  walksPerDay: 0.5,
  walkDistance: 100,
  infectionDistance: 1,
  areaPerPerson: 200,
  initialInfected: 10,
  vulnerableDeathRate: 0.1,
  nonVulnerableDeathRate: 0.005,
  vulnerablePopulation: 0.25,
  incubationPeriod: 4,
  symptomaticPeriod: 14,
  immunityPercentage: 0.05,
  movingPercentage: 1,
  stepDelta: 2,
  checkEvery: 10000,
  steps: 200000,
  measureSteps: 3000,
};

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return Number(process.argv[index + 1]);
}

CONFIG.population = arg('population', CONFIG.population);
CONFIG.initialInfected = arg('initial-infected', CONFIG.initialInfected);
CONFIG.steps = arg('steps', CONFIG.steps);
CONFIG.checkEvery = arg('check-every', CONFIG.checkEvery);
CONFIG.measureSteps = arg('measure-steps', CONFIG.measureSteps);

const SOURCE_TEXT = fs.readFileSync(SOURCE, 'utf8');

function makeContext() {
  const noop = () => {};
  const canvas = {
    calls: 0,
    fills: 0,
    reset() { this.calls = 0; this.fills = 0; },
    beginPath() { this.calls++; },
    moveTo() { this.calls++; },
    arc() { this.calls++; },
    clearRect() { this.calls++; },
    fill() { this.calls++; this.fills++; },
  };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, { id, innerHTML: '', width: 800, height: 600, disabled: false, getContext: () => canvas });
    }
    return elements.get(id);
  };
  const results = {};
  return { canvas, results, context: vm.createContext({
    canvas,
    document: { getElementById: element, querySelectorAll: () => [element('play1'), element('play2')] },
    Chart: class {
      constructor(context, config) { this.data = config.data; }
      update() {}
    },
    console,
    RESULTS: results,
    timePhase: (name, iterations, run) => {
      const start = process.hrtime.bigint();
      for (let i = 0; i < iterations; i++) run(i);
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      results[name] = { iterations, ms, perCall: ms / iterations };
    },
  }) };
}

// CONFIG is already in the context, set by run(), so that one run can use a
// different configuration from another
const SETUP = `
sim = new CovidSimulator(CONFIG.population, CONFIG.walksPerDay, CONFIG.walkDistance, CONFIG.infectionDistance,
  CONFIG.areaPerPerson, CONFIG.initialInfected, CONFIG.vulnerableDeathRate, CONFIG.nonVulnerableDeathRate,
  CONFIG.vulnerablePopulation, CONFIG.incubationPeriod, CONFIG.symptomaticPeriod, CONFIG.immunityPercentage,
  CONFIG.movingPercentage);
`;

// Everything that must stay true at every point in a run.
const CHECKS = `
RESULTS.failures = [];
RESULTS.checks = 0;
function fail(message) {
  if (RESULTS.failures.length < 25) RESULTS.failures.push('step ' + step + ': ' + message);
}

function check() {
  RESULTS.checks++;
  var gridMembers = 0;
  for (var cellIndex = 0; cellIndex < sim.grid.length; cellIndex++) {
    var cell = sim.grid[cellIndex];
    var seen = new Set();
    for (var i = 0; i < cell.length; i++) {
      var occupant = cell[i];
      gridMembers++;
      if (seen.has(occupant)) fail('cell ' + cellIndex + ' holds the same person twice');
      seen.add(occupant);
      if (occupant.immune) fail('cell ' + cellIndex + ' holds an immune person');
      if (occupant.dead) fail('cell ' + cellIndex + ' holds a dead person');
      if (occupant.cell !== cellIndex) fail('person records the wrong cell');
      if (sim.getCellFor(occupant) !== cellIndex) fail('person sits outside the cell they are in');
      if (occupant.gridX !== Math.abs(occupant.x % occupant.sideLength)) fail('stale gridX');
      if (occupant.gridY !== Math.abs(occupant.y % occupant.sideLength)) fail('stale gridY');
    }
  }

  var expectedMembers = 0;
  var activeInfections = 0;
  var counts = sim.collectStats();
  for (var p = 0; p < sim.people.length; p++) {
    var person = sim.people[p];
    if (person.dead && person.infected) fail('a person is both dead and infected');
    if (person.dead && person.recovered) fail('a person is both dead and recovered');
    if (person.recovered && person.infected) fail('a person is both recovered and infected');
    if (person.dead && person.walking) fail('a dead person is still walking');
    if (person.walking && !person.moving) fail('a person walks without moving');
    if (person.infected) activeInfections++;
    if (person.immune || person.dead) {
      if (person.cell !== -1) fail('an immune or dead person still holds a cell');
    } else {
      expectedMembers++;
      if (person.cell === -1) fail('a living person is not in any cell');
    }
  }

  if (gridMembers !== expectedMembers) {
    fail('grid holds ' + gridMembers + ' people, expected ' + expectedMembers);
  }
  if (sim.isDone() !== (activeInfections === 0)) {
    fail('isDone returned ' + sim.isDone() + ' with ' + activeInfections + ' people infected');
  }
  var counted = 0;
  for (var c = 0; c < counts.length; c++) counted += counts[c];
  if (counted !== sim.people.length) fail('stats counted ' + counted + ' of ' + sim.people.length + ' people');
}

for (var step = 1; step <= CHECK_STEPS; step++) {
  sim.step(CONFIG.stepDelta);
  if (step % CHECK_EVERY === 0) check();
}

// The graph history must stay bounded and ordered well past the cap, and one
// frame must fill one path per colour rather than one per person
for (var sample = 0; sample < GRAPH_SAMPLES; sample++) {
  for (var tick = 0; tick < 20; tick++) sim.step(CONFIG.stepDelta);
  sim.drawStats(1000, 0);
}
var series = sim.graph.data.datasets;
RESULTS.series = series.length;
RESULTS.graphPoints = 0;
for (var s = 0; s < series.length; s++) {
  var data = series[s].data;
  RESULTS.graphPoints = Math.max(RESULTS.graphPoints, data.length);
  if (data.length > MAX_GRAPH_POINTS) fail('graph series ' + s + ' holds ' + data.length + ' points');
  for (var d = 1; d < data.length; d++) {
    if (data[d].x <= data[d - 1].x) {
      fail('graph series ' + s + ' is not ordered by time');
      break;
    }
  }
}
canvas.reset();
sim.draw();
RESULTS.canvasCalls = canvas.calls;
RESULTS.canvasFills = canvas.fills;
if (canvas.fills > STATE_COLORS.length) {
  fail('a frame filled ' + canvas.fills + ' paths, expected at most ' + STATE_COLORS.length);
}
`;

const BENCHMARK = `
timePhase('warm', 2000, function () { sim.step(CONFIG.stepDelta); });
timePhase('step', MEASURE_STEPS, function () { sim.step(CONFIG.stepDelta); });
timePhase('draw', 50, function () { sim.draw(); });
timePhase('stats', 50, function () { sim.drawStats(1000, 0); });
timePhase('isDone', 500, function () { sim.isDone(); });
`;

// Counting walk starts and deaths over a run, with nothing else going on
const RATES = `
var walkStarts = 0;
for (var i = 0; i < sim.people.length; i++) sim.people[i].wasWalking = false;

for (var step = 0; step < RATE_STEPS; step++) {
  sim.step(CONFIG.stepDelta);
  for (var p = 0; p < sim.people.length; p++) {
    var person = sim.people[p];
    if (person.walking && !person.wasWalking) walkStarts++;
    person.wasWalking = person.walking;
  }
}

var dead = 0, recovered = 0;
for (var d = 0; d < sim.people.length; d++) {
  if (sim.people[d].dead) dead++;
  if (sim.people[d].recovered) recovered++;
}

RESULTS.walkStarts = walkStarts;
RESULTS.dead = dead;
RESULTS.resolved = dead + recovered;
RESULTS.isDone = sim.isDone();
`;

function run(config, script) {
  const { context, canvas } = makeContext();
  const globals = `CONFIG = ${JSON.stringify(config)}; CHECK_STEPS = ${config.steps}; CHECK_EVERY = ${config.checkEvery}; MEASURE_STEPS = ${config.measureSteps}; GRAPH_SAMPLES = ${GRAPH_SAMPLES}; RATE_STEPS = ${config.days * SECONDS_IN_DAY / config.stepDelta};`;
  vm.runInContext(globals, context);
  vm.runInContext(SOURCE_TEXT + script, context);
  return { results: vm.runInContext('RESULTS', context), canvas };
}

const checks = run(CONFIG, SETUP + CHECKS);
const timings = run(CONFIG, SETUP + BENCHMARK);
const t = timings.results;

// Walks and deaths are scheduled from rates, so measure them on their own and
// compare against what the settings ask for.
const walkRate = {
  ...CONFIG,
  walksPerDay: 5,
  walkDistance: 1,
  initialInfected: 0,
  immunityPercentage: 0,
  days: 1,
};
// A one unit walk at PERSON_SPEED lasts 100 seconds, so a person completes
// 86400 / (17280 + 100) walk cycles in a day
const expectedWalkStarts = Math.round(walkRate.population * (SECONDS_IN_DAY / (SECONDS_IN_DAY / walkRate.walksPerDay + 100)));

const deathRate = {
  ...CONFIG,
  initialInfected: CONFIG.population,
  walksPerDay: 0,
  immunityPercentage: 0,
  vulnerableDeathRate: 0.5,
  nonVulnerableDeathRate: 0.2,
  incubationPeriod: 1,
  symptomaticPeriod: 2,
  days: 5,
};
const expectedDeaths = Math.round(deathRate.population * (
  (1 - Math.exp(-deathRate.vulnerableDeathRate)) * deathRate.vulnerablePopulation
  + (1 - Math.exp(-deathRate.nonVulnerableDeathRate)) * (1 - deathRate.vulnerablePopulation)));

const walks = run(walkRate, SETUP + RATES).results;
const sick = run(deathRate, SETUP + RATES).results;

function within(measured, expected, tolerance) {
  return Math.abs(measured - expected) <= expected * tolerance;
}

const rateFailures = [];
if (!within(walks.walkStarts, expectedWalkStarts, 0.05)) {
  rateFailures.push(`walks started ${walks.walkStarts}, expected about ${expectedWalkStarts} for walksPerDay ${walkRate.walksPerDay}`);
}
if (!within(sick.dead, expectedDeaths, 0.15)) {
  rateFailures.push(`${sick.dead} people died, expected about ${expectedDeaths} for those death rates`);
}
if (sick.resolved !== deathRate.population) {
  rateFailures.push(`${sick.resolved} of ${deathRate.population} people recovered or died`);
}
if (sick.isDone !== true) {
  rateFailures.push('isDone was false after every person had recovered or died');
}

const ms = value => (value.perCall < 0.001 ? value.perCall.toFixed(5) : value.perCall.toFixed(4));
console.log(`covidsim headless harness (${CONFIG.population} people, ${CONFIG.steps} steps)`);
console.log('');
console.log(`invariants: ${checks.results.checks} checkpoints, ${checks.results.failures.length} failures`);
for (const failure of checks.results.failures) console.log(`  ${failure}`);
console.log(`graph: ${checks.results.series} series, ${checks.results.graphPoints} points per series`);
console.log(`rates: ${walks.walkStarts} walks started in a day, expected about ${expectedWalkStarts}`);
console.log(`rates: ${sick.dead} deaths of ${deathRate.population} infected, expected about ${expectedDeaths}, ${sick.resolved} recovered or died`);
for (const failure of rateFailures) console.log(`  ${failure}`);
console.log(`canvas calls per frame: ${checks.results.canvasCalls}, fills per frame: ${checks.results.canvasFills}`);
console.log('');
console.log(`throughput (${CONFIG.measureSteps} steps per phase)`);
console.log(`  step   ${ms(t.step)} ms/step  ${Math.round(t.step.iterations / (t.step.ms / 1000)).toLocaleString()} steps/s`);
console.log(`  draw   ${ms(t.draw)} ms/frame`);
console.log(`  stats  ${ms(t.stats)} ms/call`);
console.log(`  isDone ${ms(t.isDone)} ms/call`);

process.exitCode = checks.results.failures.length + rateFailures.length > 0 ? 1 : 0;
