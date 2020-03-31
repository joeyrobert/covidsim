class CovidSimulator {
  constructor(population, outingsPerDay, outingDistance, infectionDistance, areaPerPerson, initialInfected, vulnerableDeathRate, nonVulnerableDeathRate, vulnerablePopulation, incubationPeriod, symptomaticPeriod) {
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
      ));
    }

    for(var i = 0; i < this.initialInfected; i++) {
      this.people.push(new CovidPerson(
        getRandomArbitrary(0, this.sideLength),
        getRandomArbitrary(0, this.sideLength),
        getRandomCoinFlip(this.vulnerablePopulation),
        true,
      ));
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  draw() {
    this.clear();
    const heightRatio = this.canvasHeight / this.sideLength;
    const widthRatio = this.canvasWidth / this.sideLength;

    for(var i = 0; i < this.people.length; i++) {
      const person = this.people[i];
      this.ctx.beginPath();
      this.ctx.arc(person.x * widthRatio, person.y * heightRatio, this.infectionDistance * widthRatio, 0, 2 * Math.PI);
      this.ctx.fillStyle = person.fillStyle(this.incubationPeriod, this.symptomaticPeriod);
      this.ctx.fill();
    }
  }
}

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

class CovidPerson {
  constructor(x, y, vulnerable, infected, infectionDay=0, recovered=false, dead=false) {
    this.x = x;
    this.y = y;
    this.vulnerable = vulnerable;
    this.infected = infected;
    this.infectionDay = infectionDay;
    this.recovered = recovered;
    this.dead = dead;
  }

  fillStyle(incubationPeriod, symptomaticPeriod) {
    if (this.dead)
      return DEAD_COLOR;

    if (this.infected) {
      if (this.infectionDay <= incubationPeriod)
        return ASYMPTOMATIC_COLOR;
      if (this.infectionDay <= (incubationPeriod + symptomaticPeriod))
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
  window.sim.draw();
  event.preventDefault();
  return false;
}
