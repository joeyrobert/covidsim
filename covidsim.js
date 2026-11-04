const DEAD_COLOR = '#000000';
const ASYMPTOMATIC_COLOR = '#FF0000';
const SYMPTOMATIC_COLOR = '#8B0000';
const RECOVERED_COLOR = '#4B0082';
const NON_VULNERABLE_COLOR = '#00FF00';
const VULNERABLE_COLOR = '#006400';
const IMMUNE_COLOR = '#0099CC';
const PERSON_SPEED = 0.01;
const WALK_TARGET_THRESHOLD = 0.1;
const WALK_TARGET_THRESHOLD_SQUARED = WALK_TARGET_THRESHOLD * WALK_TARGET_THRESHOLD;
const STEP_DELTA = 2;
const SECONDS_IN_DAY = 86400;
const TWO_PI = Math.PI * 2;
const MAX_GRAPH_POINTS = 500;

// Stats, graph datasets and their counts all share this order.
const STATE_LABELS = ['Non-Vulnerable', 'Vulnerable', 'Asymptomatic', 'Symptomatic', 'Recovered', 'Dead', 'Immune'];
const STATE_COLORS = [
  NON_VULNERABLE_COLOR,
  VULNERABLE_COLOR,
  ASYMPTOMATIC_COLOR,
  SYMPTOMATIC_COLOR,
  RECOVERED_COLOR,
  DEAD_COLOR,
  IMMUNE_COLOR,
];

// One colour group is filled per frame, so this is paint order: healthy first, infectious last
const DRAW_COLORS = [
  NON_VULNERABLE_COLOR,
  VULNERABLE_COLOR,
  IMMUNE_COLOR,
  RECOVERED_COLOR,
  DEAD_COLOR,
  ASYMPTOMATIC_COLOR,
  SYMPTOMATIC_COLOR,
];

const COLOR_INDEX = {};
for (var i = 0; i < STATE_COLORS.length; i++) {
  COLOR_INDEX[STATE_COLORS[i]] = i;
}

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

function getRandomCoinFlip(probability) {
  return Math.random() <= probability;
}

// Seconds until the next event in a process firing eventsPerDay times per day, instead of flipping a tiny coin per person per step
function getRandomEventDelay(eventsPerDay) {
  if (eventsPerDay <= 0) {
    return Infinity;
  }
  return -Math.log(1 - Math.random()) * SECONDS_IN_DAY / eventsPerDay;
}

function getRandomWalkTarget(x, y, radius) {
  const angle = Math.random() * TWO_PI;
  const newX = x + Math.cos(angle) * radius;
  const newY = y + Math.sin(angle) * radius;
  return [newX, newY];
}

class CovidSimulator {
  constructor(population, walksPerDay, walkDistance, infectionDistance, areaPerPerson, initialInfected, vulnerableDeathRate, nonVulnerableDeathRate, vulnerablePopulation, incubationPeriod, symptomaticPeriod, immunityPercentage, movingPercentage) {
    this.time = 0;
    this.population = population;
    this.walksPerDay = walksPerDay;
    this.walkDistance = walkDistance;
    this.infectionDistance = infectionDistance;
    this.infectionDistanceSquared = infectionDistance * infectionDistance;
    this.areaPerPerson = areaPerPerson;
    this.initialInfected = initialInfected;
    this.vulnerableDeathRate = vulnerableDeathRate;
    this.nonVulnerableDeathRate = nonVulnerableDeathRate;
    this.vulnerablePopulation = vulnerablePopulation;
    this.incubationPeriod = incubationPeriod;
    this.symptomaticPeriod = symptomaticPeriod;
    this.immunityPercentage = immunityPercentage;
    this.movingPercentage = movingPercentage;
    this.infectiousPeriod = incubationPeriod + symptomaticPeriod;
    this.generateSimulation();
    this.canvas = document.getElementById('covidsim');
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    this.ctx = this.canvas.getContext('2d');
    this.xScale = this.canvasWidth / this.sideLength;
    this.yScale = this.canvasHeight / this.sideLength;
    this.circleRadius = this.infectionDistance * this.xScale;
    this.drawBuckets = DRAW_COLORS.map(_ => []);
    this.drawBucketIndex = {};
    for (var group = 0; group < DRAW_COLORS.length; group++) {
      this.drawBucketIndex[DRAW_COLORS[group]] = group;
    }
    this.statsCounts = STATE_COLORS.map(_ => 0);
    this.graphSampleCount = 0;
    this.graphSampleStride = 1;
    this.setupGraph();

    // Stats elements, in STATE_COLORS order
    this.timeTotal = document.getElementById('time-total');
    this.statTotals = [
      document.getElementById('non-vulnerable-total'),
      document.getElementById('vulnerable-total'),
      document.getElementById('asymptomatic-total'),
      document.getElementById('symptomatic-total'),
      document.getElementById('recovered-total'),
      document.getElementById('dead-total'),
      document.getElementById('immune-total'),
    ];
    this.rTotal = document.getElementById('r-total');
    this.speedTotal = document.getElementById('speed-total');
  }

  generateSimulation() {
    this.people = [];
    this.area = this.population * this.areaPerPerson;
    this.sideLength = Math.sqrt(this.area);
    const initiallyInfected = Math.min(this.initialInfected, this.population);
    const nonInfected = this.population - initiallyInfected;
    this.gridSize = Math.pow(Math.ceil(Math.sqrt(this.population)), 2);
    this.grid = Array(this.gridSize).fill(0).map(_ => []);
    this.gridLength = Math.sqrt(this.gridSize);
    this.gridLengthPerSide = this.sideLength / this.gridLength;

    // Array of 9 cell neighbours including itself
    this.neighbours = [
      -this.gridLength - 1,
      -this.gridLength,
      -this.gridLength + 1,
      -1,
      0,
      1,
      this.gridLength - 1,
      this.gridLength,
      this.gridLength + 1,
    ];

    // Immune people are never infected and dead people never move, so neither belongs in the collision grid
    for (var i = 0; i < this.population; i++) {
      const infected = i >= nonInfected;
      const immune = infected ? false : getRandomCoinFlip(this.immunityPercentage);
      const person = new CovidPerson(
        getRandomArbitrary(0, this.sideLength),
        getRandomArbitrary(0, this.sideLength),
        this.sideLength,
        getRandomCoinFlip(this.vulnerablePopulation),
        immune,
        getRandomCoinFlip(this.movingPercentage),
        infected,
        this.incubationPeriod,
        this.symptomaticPeriod,
      );
      if (person.moving) {
        person.nextWalkTime = getRandomEventDelay(this.walksPerDay);
      }
      if (!immune) {
        person.cell = this.getCellFor(person);
        this.grid[person.cell].push(person);
      }
      this.people.push(person);
    }

    // The initial infected are infectious from time 0.
    this.activeInfections = initiallyInfected;
  }

  getCellFor(person) {
    return Math.floor(person.gridX / this.gridLengthPerSide) * this.gridLength + Math.floor(person.gridY / this.gridLengthPerSide);
  }

  removePersonFromCell(person) {
    if (person.cell === -1) {
      return;
    }
    const cell = this.grid[person.cell];
    const index = cell.indexOf(person);
    if (index !== -1) {
      // Cell order is irrelevant to collisions, so fill the gap with the last entry.
      cell[index] = cell[cell.length - 1];
      cell.pop();
    }
    person.cell = -1;
  }

  updatePersonCell(person) {
    const cell = this.getCellFor(person);
    if (cell === person.cell) {
      return;
    }
    this.removePersonFromCell(person);
    this.grid[cell].push(person);
    person.cell = cell;
  }

  startWalking(person) {
    person.walking = true;
    // use person.x/y instead of .gridX/Y to generate a possible out of bounds walking target
    person.walkTarget = getRandomWalkTarget(person.x, person.y, this.walkDistance);
  }

  step(timeDelta) {
    // hardcoded assumptions
    // do infected people walk? => eventual boolean
    // people die in their symptomatic state
    // time and timeDelta are unit = seconds
    const endTime = this.time + timeDelta;
    const daysPerStep = timeDelta / SECONDS_IN_DAY;
    const people = this.people;

    for (var i = 0; i < people.length; i++) {
      const person = people[i];
      // A dead person cannot walk, cannot be infected, and has no status left to advance
      if (person.dead) {
        continue;
      }

      // Start people walking
      if (!person.walking && person.moving && endTime >= person.nextWalkTime) {
        this.startWalking(person);
      }

      // Step walking
      if (person.walking) {
        person.walk(timeDelta);
        if (!person.walking) {
          person.nextWalkTime = endTime + getRandomEventDelay(this.walksPerDay);
        }
        if (!person.immune) {
          this.updatePersonCell(person);
        }
      }

      // Advance all infected people's status
      if (person.infected) {
        person.infectionDay += daysPerStep;

        if (person.infectionDay > this.infectiousPeriod) {
          // person has recovered
          person.infected = false;
          person.recovered = true;
          this.activeInfections -= 1;
        } else if (person.infectionDay > this.incubationPeriod) {
          // person is symptomatic, they might die
          if (!person.deathScheduled) {
            person.deathScheduled = true;
            const deathRate = person.vulnerable ? this.vulnerableDeathRate : this.nonVulnerableDeathRate;
            person.nextDeathTime = endTime + getRandomEventDelay(deathRate / this.symptomaticPeriod);
          }
          if (endTime >= person.nextDeathTime) {
            person.dead = true;
            person.walking = false;
            person.infected = false;
            this.activeInfections -= 1;
            this.removePersonFromCell(person);
          }
        }
      }

      // Detect all collisions and new infections!
      if (person.walking && !person.immune) {
        this.detectInfections(person);
      }
    }

    this.time = endTime;
  }

  detectInfections(person) {
    const neighbours = this.neighbours;
    for (var n = 0; n < neighbours.length; n++) {
      const potentialCell = person.cell + neighbours[n];
      if (potentialCell < 0 || potentialCell >= this.gridSize) {
        continue;
      }

      const cell = this.grid[potentialCell];
      for (var c = 0; c < cell.length; c++) {
        const neighbourPerson = cell[c];
        if (person.infected) {
          if (!neighbourPerson.infected && !neighbourPerson.recovered) {
            this.collision(person, neighbourPerson);
          }
        } else if (!person.recovered && neighbourPerson.infected) {
          if (this.collision(neighbourPerson, person)) {
            return;
          }
        }
      }
    }
  }

  collision(infector, infectee) {
    const a = infector.gridX;
    const b = infector.gridY;
    const c = infectee.gridX;
    const d = infectee.gridY;
    const distance = (a - c) * (a - c) + (b - d) * (b - d);

    if (distance <= this.infectionDistanceSquared) {
      infector.numberInfected += 1;
      infectee.infected = true;
      this.activeInfections += 1;
      return true;
    }
    return false;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  draw() {
    this.clear();
    const buckets = this.drawBuckets;
    const people = this.people;
    const radius = this.circleRadius;

    // One path and one fill per colour, instead of one per person
    for (var b = 0; b < buckets.length; b++) {
      buckets[b].length = 0;
    }
    for (var i = 0; i < people.length; i++) {
      const person = people[i];
      buckets[this.drawBucketIndex[person.fillStyle()]].push(person);
    }

    for (var group = 0; group < buckets.length; group++) {
      const bucket = buckets[group];
      if (bucket.length === 0) {
        continue;
      }
      this.ctx.beginPath();
      for (var p = 0; p < bucket.length; p++) {
        const person = bucket[p];
        const x = person.gridX * this.xScale;
        const y = person.gridY * this.yScale;
        // Without this, each arc would draw a line from the previous circle to this one
        this.ctx.moveTo(x + radius, y);
        this.ctx.arc(x, y, radius, 0, TWO_PI);
      }
      this.ctx.fillStyle = DRAW_COLORS[group];
      this.ctx.fill();
    }
  }

  collectStats() {
    const counts = this.statsCounts;
    const people = this.people;
    for (var i = 0; i < counts.length; i++) {
      counts[i] = 0;
    }

    let infectedEver = 0;
    let infections = 0;
    for (var p = 0; p < people.length; p++) {
      const person = people[p];
      counts[COLOR_INDEX[person.fillStyle()]] += 1;
      if (person.infected || person.recovered) {
        infectedEver += 1;
        infections += person.numberInfected;
      }
    }

    this.statsInfectedEver = infectedEver;
    this.statsInfections = infections;
    return counts;
  }

  // Chart.js redraws every point it holds, so widen the sampling stride to keep long runs bounded
  recordGraphPoint(time, counts) {
    this.graphSampleCount += 1;
    if (this.graphSampleCount % this.graphSampleStride !== 0) {
      return;
    }

    const datasets = this.graph.data.datasets;
    for (var i = 0; i < datasets.length; i++) {
      datasets[i].data.push({ x: time, y: counts[i] });
    }
    if (datasets[0].data.length < MAX_GRAPH_POINTS) {
      return;
    }

    // Halve the history in place, keeping the first point of each pair
    this.graphSampleStride *= 2;
    for (var d = 0; d < datasets.length; d++) {
      const data = datasets[d].data;
      var kept = 0;
      for (var point = 0; point < data.length; point += 2) {
        data[kept] = data[point];
        kept += 1;
      }
      data.length = kept;
    }
  }

  drawStats(steps, startTime) {
    const time = this.time / SECONDS_IN_DAY;
    const counts = this.collectStats();
    const avgNumberOfInfections = this.statsInfectedEver === 0 ? 0 : this.statsInfections / this.statsInfectedEver;
    const speed = (steps && startTime) ? steps / ((new Date().getTime() - startTime) / 1000) : 0;

    this.timeTotal.innerHTML = time.toFixed(3);
    for (var i = 0; i < this.statTotals.length; i++) {
      this.statTotals[i].innerHTML = counts[i];
    }
    this.rTotal.innerHTML = avgNumberOfInfections.toFixed(3);
    this.speedTotal.innerHTML = speed.toFixed(1);

    this.recordGraphPoint(time, counts);
    this.graph.update(0);
  }

  setupGraph() {
    const datasets = STATE_COLORS.map((color, index) => {
      return {
        label: STATE_LABELS[index],
        borderColor: color,
        backgroundColor: color,
        data: [],
        showLine: true,
        fill: false,
        pointRadius: 0,
      };
    });
    const graphConfig = {
      type: 'scatter',
      data: {
        datasets: datasets,
      },
      options: {
        responsive: true,
        title: {
          display: false,
        },
        legend: {
          display: false
        },
        scales: {
          xAxes: [
            {
              scaleLabel: {
                display: false,
                labelString: 'Time (days)'
              }
            }
          ],
          yAxes: [
            {
              scaleLabel: {
                display: false,
                labelString: 'People'
              }
            }
          ]
        }
      }
    };
    this.graphCtx = document.getElementById('covidsim-graph').getContext('2d');
    this.graph = new Chart(this.graphCtx, graphConfig);
  }

  // Counted on infection, recovery and death, so ending a run does not scan the population
  isDone() {
    return this.activeInfections === 0;
  }
}

class CovidPerson {
  constructor(x, y, sideLength, vulnerable, immune, moving, infected, incubationPeriod, symptomaticPeriod, infectionDay=0, recovered=false, dead=false, walking=false, walkTarget=[0, 0]) {
    // x and y can be out of bounds, .gridX and .gridY are their in bounds form
    this.x = x;
    this.y = y;
    this.sideLength = sideLength;
    this.setGridPosition();
    this.vulnerable = vulnerable;
    this.immune = immune;
    this.moving = moving;
    this.infected = infected;
    this.incubationPeriod = incubationPeriod;
    this.symptomaticPeriod = symptomaticPeriod;
    this.infectionDay = infectionDay;
    this.recovered = recovered;
    this.dead = dead;
    this.walking = walking;
    this.walkTarget = walkTarget;
    this.numberInfected = 0;
    // Walks and deaths are scheduled at a simulation time instead of rolled every step
    this.cell = -1;
    this.nextWalkTime = Infinity;
    this.nextDeathTime = Infinity;
    this.deathScheduled = false;
  }

  fillStyle() {
    if (this.immune)
      return IMMUNE_COLOR;

    if (this.dead)
      return DEAD_COLOR;

    if (this.recovered)
      return RECOVERED_COLOR;

    if (this.infected) {
      if (this.infectionDay <= this.incubationPeriod)
        return ASYMPTOMATIC_COLOR;
      if (this.infectionDay <= (this.incubationPeriod + this.symptomaticPeriod))
        return SYMPTOMATIC_COLOR;
    }

    if (this.vulnerable)
      return VULNERABLE_COLOR;

    return NON_VULNERABLE_COLOR;
  }

  setGridPosition() {
    // Cached so collisions and cell lookups do not recompute it on every use
    this.gridX = Math.abs(this.x % this.sideLength);
    this.gridY = Math.abs(this.y % this.sideLength);
  }

  walk(timeDelta) {
    // walk towards target using straight line
    if (!this.walking) return;
    const targetX = this.walkTarget[0] - this.x;
    const targetY = this.walkTarget[1] - this.y;
    const distanceSquared = targetX * targetX + targetY * targetY;

    // This stops the person from walking when they reach their target
    if (distanceSquared <= WALK_TARGET_THRESHOLD_SQUARED) {
      this.walking = false;
      return;
    }

    const stepLength = PERSON_SPEED * timeDelta;
    if (stepLength * stepLength >= distanceSquared) {
      // Walking past the target is the same as walking exactly onto it
      this.x += targetX;
      this.y += targetY;
    } else {
      const scale = stepLength / Math.sqrt(distanceSquared);
      this.x += targetX * scale;
      this.y += targetY * scale;
    }
    this.setGridPosition();
  }
}

const BUTTONS = {
  setup: document.getElementById('setup-button'),
  step: document.getElementById('step-button'),
  play: document.querySelectorAll('.play-button'),
  stop: document.getElementById('stop-button'),
};

function setDisabled(key, value) {
  if (BUTTONS[key].length) {
    for (var i = 0; i < BUTTONS[key].length; i++) {
      BUTTONS[key][i].disabled = value;
    }
  } else {
    BUTTONS[key].disabled = value;
  }
}

// The play interval asks for more frames than a display shows, so queue at most one draw per animation frame
let drawRequested = false;

function requestDraw() {
  if (drawRequested || !window.sim) {
    return;
  }
  drawRequested = true;
  window.requestAnimationFrame(function () {
    drawRequested = false;
    window.sim.draw();
  });
}

function covidSetup(event) {
  const population = parseInt(document.getElementById('population').value, 10);
  const walksPerDay = parseFloat(document.getElementById('walks-per-day').value);
  const walkDistance = parseFloat(document.getElementById('walk-distance').value);
  const infectionDistance = parseFloat(document.getElementById('infection-distance').value);
  const areaPerPerson = parseFloat(document.getElementById('area-per-person').value);
  const initialInfected = parseInt(document.getElementById('initial-infected').value, 10);
  const vulnerableDeathRate = parseFloat(document.getElementById('vulnerable-death-rate').value);
  const nonVulnerableDeathRate = parseFloat(document.getElementById('non-vulnerable-death-rate').value);
  const vulnerablePopulation = parseFloat(document.getElementById('vulnerable-population').value);
  const incubationPeriod = parseInt(document.getElementById('incubation-period').value, 10);
  const symptomaticPeriod = parseInt(document.getElementById('symptomatic-period').value, 10);
  const immunityPercentage = parseFloat(document.getElementById('immunity-percentage').value);
  const movingPercentage = parseFloat(document.getElementById('moving-percentage').value);
  window.sim = new CovidSimulator(population, walksPerDay, walkDistance, infectionDistance, areaPerPerson, initialInfected, vulnerableDeathRate, nonVulnerableDeathRate, vulnerablePopulation, incubationPeriod, symptomaticPeriod, immunityPercentage, movingPercentage);
  window.sim.draw();
  window.sim.drawStats();

  // Enable play/step buttons
  setDisabled('stop', true);
  setDisabled('step', false);
  setDisabled('setup', false);
  setDisabled('play', false);

  event.preventDefault();
}

function covidStep(event) {
  window.sim.step(STEP_DELTA);
  requestDraw();
  window.sim.drawStats();
  event.preventDefault();
}

function covidStop(event) {
  clearInterval(window.playInterval);
  clearInterval(window.statInterval);

  // Enable play/step/setup buttons
  setDisabled('stop', true);
  setDisabled('step', false);
  setDisabled('setup', false);
  setDisabled('play', false);

  event.preventDefault();
}

function covidPlay(event, speed) {
  covidStop(event);
  var steps = 0;
  var startTime = new Date().getTime();
  window.playInterval = setInterval(() => {
    for (var i = 0; i < speed; i++) {
      window.sim.step(STEP_DELTA);
    }
    steps += speed;
    requestDraw();

    if (window.sim.isDone()) {
      covidStop(event);
    }
  }, 0);
  window.statInterval = setInterval(() => {
    window.sim.drawStats(steps, startTime);
  }, 250);

  // Enable stop button, disable setup button
  setDisabled('stop', false);
  setDisabled('setup', true);
  setDisabled('step', true);
  setDisabled('play', false);

  event.preventDefault();
}

function covidBenchmark(event) {
  covidSetup(event);
  console.time('covidBenchmark');

  for (var i = 0; i < 50000; i++) {
    window.sim.step(STEP_DELTA);
  }
  console.timeEnd('covidBenchmark');
}
