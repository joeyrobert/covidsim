# COVIDSIM

An agent based epidemic in the browser. Every person is a circle on a map. When a
sick person's circle overlaps a healthy person's circle, the disease can spread.
There is no build step and no local dependencies.

## Running it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

Bootstrap and Chart.js load from CDNs, so the page needs network access.

## Using it

| Control | What it does |
| --- | --- |
| Setup | Builds a population from the current settings and draws it |
| Step | Advances one step, which is 2 simulation seconds |
| Play 1x / 25x / 100x / 500x | Runs steps continuously. The number is steps per timer tick, not calendar time |
| Stop | Stops the play loop |

The form on the right sets the model: population, how often people take walks, walk
distance, infection distance, area per person, initial infected, death rates, the
vulnerable share of the population, incubation and symptomatic periods, the immune
share, and the share of people who take walks. Each field explains itself in the page.

The stats bar reports the count in each state, `R₀` (the average number of other
people an infected person infected), and the current step rate.

## How the model works

- The map is a square with side `sqrt(population × area per person)`. Positions wrap
  around the edges, and `gridX` / `gridY` are the in bounds form of a person's `x` / `y`.
- People are indexed in a grid of `ceil(sqrt(population))²` cells. A collision check
  looks at one person's 3×3 block of cells instead of the whole population.
- Walking is a Poisson process. Each person holds the simulation time of their next
  walk, drawn from an exponential distribution with mean `1 / walks per day` days, and
  schedules the next one when they reach their target.
- A symptomatic person carries a constant death hazard of `death rate / symptomatic
  period` per day, which is why the share who die during the symptomatic period is
  `1 - e^(-death rate)`.
- Two people are in range when the squared distance between them is within
  `infection distance²`. Immune and recovered people cannot be infected. Immune and
  dead people are kept out of the collision grid because they can never take part in
  an infection.
- States are non-vulnerable, vulnerable, immune, asymptomatic, symptomatic, recovered
  and dead. The colours are defined in `covidsim.js` and mirrored in `covidsim.css`.

## Benchmarks

`bench/sim.js` runs the simulation headlessly with a stubbed canvas, form, and
Chart.js. It checks the invariants and rates below and prints throughput. The exit
code is 1 if any check fails.

```sh
node bench/sim.js
node bench/sim.js --steps 500000 --check-every 25000
node bench/sim.js --population 5000 --initial-infected 25
```

Rates, measured on their own runs where nothing else is happening:

- Walks started in a day match `walks per day` for the population.
- Deaths among a fully infected population match `1 - e^(-death rate)` for the
  vulnerable and non-vulnerable rates.
- Everyone infected ends up recovered or dead, and `isDone()` reports that.

Invariants, checked repeatedly through a run:

- No cell holds the same person twice, an immune person, or a dead person.
- Every living person is in exactly one cell, and that cell is the one their position
  falls in.
- `gridX` / `gridY` always match `x` / `y`.
- Nobody is both dead and infected, both dead and recovered, or both recovered and
  infected. Nobody walks without being able to move.
- `isDone()` agrees with counting the infected people directly.
- Stats account for exactly the population.
- The graph history stays bounded and stays ordered by time.
- A frame fills one path per colour, never one per person.

Throughput on the shipped defaults, 1000 people, on a laptop with Node 25. Each row
is a different point of the same run, measured headlessly with the same kind of
stubs `bench/sim.js` uses, because the cost depends on how far the epidemic has
spread:

| Point in a run | Before, steps/s | After, steps/s |
| --- | --- | --- |
| Day 0.5, about 11 infected | 7,700 | 44,000 |
| Day 2.4, about 96 infected | 6,300 | 46,300 |
| Day 5.2, about 560 infected | 5,100 | 57,100 |
| Day 8.0, about 860 infected | 5,400 | 48,000 |

Per call, at the busiest point of that run:

| Call | Before | After |
| --- | --- | --- |
| `step` | 0.195 ms | 0.018 ms |
| `draw` | 0.086 ms | 0.036 ms |
| `drawStats` | 0.035 ms | 0.017 ms |
| `isDone` | 0.021 ms | 0.00007 ms |

The canvas is stubbed, so `draw` understates the change: a frame used to make about
3,000 canvas calls including 1,000 separate fills, and now makes about 2,000 calls
with at most one fill per colour. In the app a 500x tick is 500 steps plus one
frame, which is the reason the step rate matters more than anything else here.

## Model equivalence

The walk and death decisions used to be coin flips rolled for every person on every
step, and are now scheduled events. Two runs of each version, over 3 days with
nothing but walking going on, started 14,872 walks in the old version and 14,938 in
the new one, against the 15,000 that 5 walks per day for 1000 people implies. Over a
fully infected population, the old version killed 30 of 1000 and the new one 27,
against the 27 or so those death rates imply. Both versions also ended with all 1000
people recovered or dead. Epidemic outcomes on the shipped defaults, such as the final
number of people who were ever infected, overlap between the two versions: 799 ± 35
before and 775 ± 26 after across 12 runs, which is inside the run to run spread of
either one.

The coin flip versions also had a side effect worth knowing about: a dead person
could still be infected by a passing walker, and after long enough they were counted
as recovered, so the dead count faded into the recovered count. Dead people are now
finished.

## Notes

- The play loop is still interval based. Only drawing is aligned to animation frames,
  so a background tab no longer pays for canvas work it cannot show.
- Graph history is capped by `MAX_GRAPH_POINTS`. Once a series reaches it, the
  sampling stride doubles and the history is halved, which keeps long 500x runs from
  redrawing an ever growing set of points.
