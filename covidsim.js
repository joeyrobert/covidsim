const DEAD_COLOR = '#000000';
const ASYMPTOMATIC_COLOR = '#FF0000';
const SYMPTOMATIC_COLOR = '#8B0000';
const RECOVERED_COLOR = '#4B0082';
const NON_VULNERABLE_COLOR = '#00FF00';
const VULNERABLE_COLOR = '#006400';

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

class CovidSimulator {
  constructor(population, outingsPerDay, outingDistance, infectionDistance, areaPerPerson, initialInfected, vulnerableDeathRate, nonVulnerableDeathRate, vulnerablePopulation, incubationPeriod, symptomaticPeriod) {
    this.time = 0;
    this.population = population;
    this.outingsPerDay = outingsPerDay;
    this.outingDistance = outingDistance;
    this.infectionDistance = infectionDistance;
    this.areaPerPerson = areaPerPerson;
    this.initialInfected = initialInfected;
    this.vulnerableDeathRate = vulnerableDeathRate;
    this.nonVulnerableDeathRate = nonVulnerableDeathRate;
    this.vulnerablePopulation = vulnerablePopulation;
    this.incubationPeriod = incubationPeriod;
    this.symptomaticPeriod = symptomaticPeriod;
    this.generateSimulation();
    this.canvas = document.getElementById('covidsim');
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    this.ctx = this.canvas.getContext('2d');

    // Stats elements
    this.timeTotal = document.getElementById('time-total');
    this.nonVulnerableTotal = document.getElementById('non-vulnerable-total');
    this.vulnerableTotal = document.getElementById('vulnerable-total');
    this.asymptomaticTotal = document.getElementById('asymptomatic-total');
    this.symptomaticTotal = document.getElementById('symptomatic-total');
    this.deadTotal = document.getElementById('dead-total');
  }

  generateSimulation() {
    this.people = [];
    this.area = this.population * this.areaPerPerson;
    this.sideLength = Math.sqrt(this.area);
    const nonInfected = this.population - this.initialInfected;

    for(var i = 0; i < nonInfected; i++) {
      this.people.push(new CovidPerson(
        getRandomArbitrary(0, this.sideLength),
        getRandomArbitrary(0, this.sideLength),
        getRandomCoinFlip(this.vulnerablePopulation),
        false,
        this.incubationPeriod,
        this.symptomaticPeriod,
      ));
    }

    for(var i = 0; i < this.initialInfected; i++) {
      this.people.push(new CovidPerson(
        getRandomArbitrary(0, this.sideLength),
        getRandomArbitrary(0, this.sideLength),
        getRandomCoinFlip(this.vulnerablePopulation),
        true,
        this.incubationPeriod,
        this.symptomaticPeriod,
      ));
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  step() {
    // hardcoded assumptions
    // time delta = 1 hour
    // speed = 10 / hour
    // do infected people walk? => eventual boolean
    // people die in their symptomatic state


    // Get people to walk
    const outingsPerDelta = this.outingsPerDay / 24;

    for(var i = 0; i < this.people.length; i++) {
      const person = this.people[i];

      if (!person.walking) {

      }
    }


    // Detect all collisions and new infections!
  }

  draw() {
    this.clear();
    const heightRatio = this.canvasHeight / this.sideLength;
    const widthRatio = this.canvasWidth / this.sideLength;

    for(var i = 0; i < this.people.length; i++) {
      const person = this.people[i];
      this.ctx.beginPath();
      this.ctx.arc(person.x * widthRatio, person.y * heightRatio, this.infectionDistance * widthRatio, 0, 2 * Math.PI);
      this.ctx.fillStyle = person.fillStyle();
      this.ctx.fill();
    }

    this.drawStats();
  }

  drawStats() {
    this.timeTotal.innerHTML = this.time;
    const grouped = groupByFunc(this.people, 'fillStyle');
    this.nonVulnerableTotal.innerHTML = (grouped[NON_VULNERABLE_COLOR] || []).length;
    this.vulnerableTotal.innerHTML = (grouped[VULNERABLE_COLOR] || []).length;
    this.asymptomaticTotal.innerHTML = (grouped[ASYMPTOMATIC_COLOR] || []).length;
    this.symptomaticTotal.innerHTML = (grouped[SYMPTOMATIC_COLOR] || []).length;
    this.deadTotal.innerHTML = (grouped[DEAD_COLOR] || []).length;
  }
}

class CovidPerson {
  constructor(x, y, vulnerable, infected, incubationPeriod, symptomaticPeriod, infectionDay=0, recovered=false, dead=false, walking=false, walkTarget=[0, 0]) {
    this.x = x;
    this.y = y;
    this.vulnerable = vulnerable;
    this.infected = infected;
    this.incubationPeriod = incubationPeriod;
    this.symptomaticPeriod = symptomaticPeriod;
    this.infectionDay = infectionDay;
    this.recovered = recovered;
    this.dead = dead;
    this.walking = walking;
    this.walkTarget = walkTarget;
  }

  fillStyle() {
    if (this.dead)
      return DEAD_COLOR;

    if (this.infected) {
      if (this.infectionDay <= this.incubationPeriod)
        return ASYMPTOMATIC_COLOR;
      if (this.infectionDay <= (this.incubationPeriod + this.symptomaticPeriod))
        return SYMPTOMATIC_COLOR;
      return RECOVERED_COLOR;
    }

    if (this.vulnerable) {
      return VULNERABLE_COLOR;
    }

    return NON_VULNERABLE_COLOR;
  }
}

function covidSetup(event) {
  const population = parseInt(document.getElementById('population').value, 10);
  const outingsPerDay = parseFloat(document.getElementById('outings-per-day').value);
  const outingDistance = parseFloat(document.getElementById('outing-distance').value);
  const infectionDistance = parseFloat(document.getElementById('infection-distance').value);
  const areaPerPerson = parseFloat(document.getElementById('area-per-person').value);
  const initialInfected = parseInt(document.getElementById('initial-infected').value, 10);
  const vulnerableDeathRate = parseFloat(document.getElementById('vulnerable-death-rate').value);
  const nonVulnerableDeathRate = parseFloat(document.getElementById('non-vulnerable-death-rate').value);
  const vulnerablePopulation = parseFloat(document.getElementById('vulnerable-population').value);
  const incubationPeriod = parseInt(document.getElementById('incubation-period').value);
  const symptomaticPeriod = parseInt(document.getElementById('symptomatic-period').value);
  window.sim = new CovidSimulator(population, outingsPerDay, outingDistance, infectionDistance, areaPerPerson, initialInfected, vulnerableDeathRate, nonVulnerableDeathRate, vulnerablePopulation, incubationPeriod, symptomaticPeriod);
  window.sim.draw();
  event.preventDefault();
  return false;
}

function covidStep() {
  window.sim.step();
  window.sim.draw();
  event.preventDefault();
  return false;
}


function groupByKey(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

function groupByFunc(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]()] = rv[x[key]()] || []).push(x);
    return rv;
  }, {});
}
