const DEAD_COLOR = '#000000';
const ASYMPTOMATIC_COLOR = '#FF0000';
const SYMPTOMATIC_COLOR = '#8B0000';
const RECOVERED_COLOR = '#4B0082';
const NON_VULNERABLE_COLOR = '#00FF00';
const VULNERABLE_COLOR = '#006400';
const IMMUNE_COLOR = '#0099CC';
const PERSON_SPEED = 0.01;
const WALK_TARGET_THRESHOLD = 0.1;
const STEP_DELTA = 2;
const SECONDS_IN_DAY = 86400;

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

function getRandomCoinFlip(probability) {
  return Math.random() <= probability;
}

function getRandomWalkTarget(x, y, radius) {
  const angle = Math.random() * 2 * Math.PI;
  const newX = x + Math.cos(angle) * radius;
  const newY = y + Math.sin(angle) * radius;
  return [newX, newY];
}

function groupByFunc(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]()] = rv[x[key]()] || []).push(x);
    return rv;
  }, {});
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
    this.generateSimulation();
    this.canvas = document.getElementById('covidsim');
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    this.ctx = this.canvas.getContext('2d');
    this.setupGraph();

    // Stats elements
    this.timeTotal = document.getElementById('time-total');
    this.nonVulnerableTotal = document.getElementById('non-vulnerable-total');
    this.vulnerableTotal = document.getElementById('vulnerable-total');
    this.asymptomaticTotal = document.getElementById('asymptomatic-total');
    this.symptomaticTotal = document.getElementById('symptomatic-total');
    this.recoveredTotal = document.getElementById('recovered-total');
    this.deadTotal = document.getElementById('dead-total');
    this.immuneTotal = document.getElementById('immune-total');
    this.rTotal = document.getElementById('r-total');
  }

  generateSimulation() {
    this.people = [];
    this.area = this.population * this.areaPerPerson;
    this.sideLength = Math.sqrt(this.area);
    const nonInfected = this.population - this.initialInfected;
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
    for (var i = 0; i < nonInfected; i++) {
      this.people.push(new CovidPerson(
        getRandomArbitrary(0, this.sideLength),
        getRandomArbitrary(0, this.sideLength),
        this.sideLength,
        getRandomCoinFlip(this.vulnerablePopulation),
        getRandomCoinFlip(this.immunityPercentage),
        getRandomCoinFlip(this.movingPercentage),
        false,
        this.incubationPeriod,
        this.symptomaticPeriod,
      ));
    }

    for (var i = 0; i < this.initialInfected; i++) {
      this.people.push(new CovidPerson(
        getRandomArbitrary(0, this.sideLength),
        getRandomArbitrary(0, this.sideLength),
        this.sideLength,
        getRandomCoinFlip(this.vulnerablePopulation),
        getRandomCoinFlip(this.immunityPercentage),
        getRandomCoinFlip(this.movingPercentage),
        true,
        this.incubationPeriod,
        this.symptomaticPeriod,
      ));
    }

    this.people.forEach(person => {
      person.cell = this.getCellFor(person);
      this.grid[person.cell].push(person);
    });
  }

  getCellFor(person) {
    return Math.floor((person.gridX % this.sideLength) / this.gridLengthPerSide) * this.gridLength + Math.floor((person.gridY % this.sideLength) / this.gridLengthPerSide);
  }

  step(timeDelta) {
    // hardcoded assumptions
    // do infected people walk? => eventual boolean
    // people die in their symptomatic state
    // time and timeDelta are unit = seconds

    // Get people to walk
    const walkProbability = this.walksPerDay * timeDelta / SECONDS_IN_DAY;
    const vulnerableDeathProbability = this.vulnerableDeathRate * timeDelta / (this.symptomaticPeriod * SECONDS_IN_DAY);
    const nonVulnerableDeathProbability = this.nonVulnerableDeathRate * timeDelta / (this.symptomaticPeriod * SECONDS_IN_DAY);
    const nonWalkingPeople = this.people.filter(person => !person.walking && person.moving);

    // Start people walking
    nonWalkingPeople.forEach(person => {
      const startWalking = getRandomCoinFlip(walkProbability);
      if (startWalking) {
        person.walking = true;
        // use person.x/y instead of .gridX/Y to generate a possible out of bounds walking target
        person.walkTarget = getRandomWalkTarget(person.x, person.y, this.walkDistance);
      }
    });

    const walkingPeople = this.people.filter(person => person.walking);

    // Step people's walk
    walkingPeople.forEach(person => {
      person.walk(timeDelta);

      // Update cell
      const oldCell = person.cell;
      person.cell = this.getCellFor(person);
      if (person.cell !== oldCell) {
        // Remove old cell, filter yourself out of it
        this.grid[oldCell] = this.grid[oldCell].filter(personInCell => personInCell !== person);

        // Add to new cell
        this.grid[person.cell].push(person);
      }
    });

    // Advance all infected people's status
    const infectedPeople = this.people.filter(person => person.infected);
    infectedPeople.forEach(person => {
      person.infectionDay += timeDelta / SECONDS_IN_DAY;

      if (person.infectionDay > (this.incubationPeriod + this.symptomaticPeriod)) {
        // person has recovered
        person.infected = false;
        person.recovered = true;
      } else if (person.infectionDay > this.incubationPeriod) {
        // person is symptomatic, they might die
        const dead = getRandomCoinFlip(person.vulnerable ? vulnerableDeathProbability : nonVulnerableDeathProbability);
        if (dead) {
          person.dead = true;
          person.walking = false;
          person.infected = false;
        }
      }
    });

    // Detect all collisions and new infections!
    const neighboursCache = [];

    walkingPeople.forEach(person => {
      const neighbours = this.neighbours.reduce((memo, neighbour) => {
        const potentialCell = person.cell + neighbour;
        if (potentialCell < 0 || potentialCell >= this.gridSize) {
          return memo;
        }
        // Merge grid into memo array without creating a new object (mutable concat)
        Array.prototype.push.apply(memo, this.grid[potentialCell]);
        return memo;
      }, []);

      // Memoize the neighbours result
      neighboursCache[person.cell] = neighbours;

      if (person.infected) {
        const nonInfectedPeople = neighbours.filter(neighbour => !neighbour.infected && !neighbour.recovered);

        nonInfectedPeople.forEach(infectee => {
          this.collision(person, infectee);
        });
      } else if (!person.recovered) {
        const infectedPeople = neighbours.filter(neighbour => neighbour.infected && !neighbour.recovered);

        // For loop so I can break easily
        for (var i = 0; i < infectedPeople.length; i++) {
          const infector = infectedPeople[i];
          if (this.collision(infector, person)) {
            // If infected once, stop looking for more infections
            break;
          }
        }
      }
    });

    this.time += timeDelta;
  }

  collision(infector, infectee) {
    if (infectee.immune)
      return false;

    const a = infector.gridX;
    const b = infector.gridY;
    const c = infectee.gridX;
    const d = infectee.gridY;
    const distance = (a - c) * (a - c) + (b - d) * (b - d);

    if (distance <= this.infectionDistanceSquared) {
      infector.numberInfected += 1;
      infectee.infected = true;
      return true;
    }
    return false;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  draw() {
    this.clear();
    const heightRatio = this.canvasHeight / this.sideLength;
    const widthRatio = this.canvasWidth / this.sideLength;

    for (var i = 0; i < this.people.length; i++) {
      const person = this.people[i];
      this.ctx.beginPath();
      this.ctx.arc((person.x % this.sideLength) * widthRatio, (person.y % this.sideLength) * heightRatio, this.infectionDistance * widthRatio, 0, 2 * Math.PI);
      this.ctx.fillStyle = person.fillStyle();
      this.ctx.fill();
    }
  }

  drawStats() {
    const time = this.time / SECONDS_IN_DAY;
    this.timeTotal.innerHTML = time.toFixed(3);
    const grouped = groupByFunc(this.people, 'fillStyle');
    const stats = [
      (grouped[NON_VULNERABLE_COLOR] || []).length,
      (grouped[VULNERABLE_COLOR] || []).length,
      (grouped[ASYMPTOMATIC_COLOR] || []).length,
      (grouped[SYMPTOMATIC_COLOR] || []).length,
      (grouped[RECOVERED_COLOR] || []).length,
      (grouped[DEAD_COLOR] || []).length,
      (grouped[IMMUNE_COLOR] || []).length,
    ];

    const haveBeenInfected = this.people.filter(person => person.infected || person.recovered);
    const avgNumberOfInfections = haveBeenInfected.length === 0 ? 0 : haveBeenInfected.reduce((memo, person) => memo + person.numberInfected, 0) / haveBeenInfected.length;

    this.nonVulnerableTotal.innerHTML = stats[0];
    this.vulnerableTotal.innerHTML = stats[1];
    this.asymptomaticTotal.innerHTML = stats[2];
    this.symptomaticTotal.innerHTML = stats[3];
    this.recoveredTotal.innerHTML = stats[4];
    this.deadTotal.innerHTML = stats[5];
    this.immuneTotal.innerHTML = stats[6];
    this.rTotal.innerHTML = avgNumberOfInfections.toFixed(3);

    this.graph.data.datasets.forEach((dataset, i) => {
      dataset.data.push({x: time, y: stats[i]});
    });

    this.graph.update(0);
  }

  setupGraph() {
    const graphConfig = {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Non-Vulnerable',
            borderColor: NON_VULNERABLE_COLOR,
            backgroundColor: NON_VULNERABLE_COLOR,
            data: [],
            showLine: true,
            fill: false,
            pointRadius: 0,
          },
          {
            label: 'Vulnerable',
            borderColor: VULNERABLE_COLOR,
            backgroundColor: VULNERABLE_COLOR,
            data: [],
            showLine: true,
            fill: false,
            pointRadius: 0,
          },
          {
            label: 'Asymptomatic',
            borderColor: ASYMPTOMATIC_COLOR,
            backgroundColor: ASYMPTOMATIC_COLOR,
            data: [],
            showLine: true,
            fill: false,
            pointRadius: 0,
          },
          {
            label: 'Symptomatic',
            borderColor: SYMPTOMATIC_COLOR,
            backgroundColor: SYMPTOMATIC_COLOR,
            data: [],
            showLine: true,
            fill: false,
            pointRadius: 0,
          },
          {
            label: 'Recovered',
            borderColor: RECOVERED_COLOR,
            backgroundColor: RECOVERED_COLOR,
            data: [],
            showLine: true,
            fill: false,
            pointRadius: 0,
          },
          {
            label: 'Dead',
            borderColor: DEAD_COLOR,
            backgroundColor: DEAD_COLOR,
            data: [],
            showLine: true,
            fill: false,
            pointRadius: 0,
          },
          {
            label: 'Immune',
            borderColor: IMMUNE_COLOR,
            backgroundColor: IMMUNE_COLOR,
            data: [],
            showLine: true,
            fill: false,
            pointRadius: 0,
          },
        ]
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

  isDone() {
    const grouped = groupByFunc(this.people, 'fillStyle');
    return (grouped[ASYMPTOMATIC_COLOR] || []).length === 0 && (grouped[SYMPTOMATIC_COLOR] || []).length === 0;
  }
}

class CovidPerson {
  constructor(x, y, sideLength, vulnerable, immune, moving, infected, incubationPeriod, symptomaticPeriod, infectionDay=0, recovered=false, dead=false, walking=false, walkTarget=[0, 0]) {
    // x and y can be out of bounds, use .gridX or .gridY for inbounds
    this.x = x;
    this.y = y;
    this.sideLength = sideLength;
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

  walk(timeDelta) {
    // walk towards target using straight line
    if (!this.walking) return;
    const totalVector = [
      (this.walkTarget[0] - this.x),
      (this.walkTarget[1] - this.y),
    ];

    const magnitude = Math.sqrt(Math.pow(totalVector[0], 2) + Math.pow(totalVector[1], 2));
    // This stops the person from walking when they reach their target
    if (magnitude <= WALK_TARGET_THRESHOLD) {
      this.walking = false;
      return;
    }

    const unitVector = [
      totalVector[0] / magnitude,
      totalVector[1] / magnitude,
    ];
    const deltaVector = [
      unitVector[0] * PERSON_SPEED * timeDelta,
      unitVector[1] * PERSON_SPEED * timeDelta,
    ];

    if (Math.abs(deltaVector[0]) > Math.abs(totalVector[0])) {
      deltaVector[0] = totalVector[0];
    }

    if (Math.abs(deltaVector[1]) > Math.abs(totalVector[1])) {
      deltaVector[1] = totalVector[1];
    }

    this.x += deltaVector[0];
    this.y += deltaVector[1];
  }

  get gridX() {
    return Math.abs(this.x % this.sideLength);
  }

  get gridY() {
    return Math.abs(this.y % this.sideLength);
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
  window.sim.draw();
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
  window.playInterval = setInterval(() => {
    for (var i = 0; i < speed; i++) {
      window.sim.step(STEP_DELTA);
    }
    window.sim.draw();

    if (window.sim.isDone()) {
      covidStop(event);
    }
  }, 0);
  window.statInterval = setInterval(() => {
    window.sim.drawStats();
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
