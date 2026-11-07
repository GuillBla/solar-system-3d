// Spacecraft: display metadata. Trajectories come from data/spacecraft.json (JPL Horizons).
export const SPACECRAFT = [
  {
    id: 'voyager1', name: 'Voyager 1', kind: 'probe', model: 'voyager', type: 'Sonde interstellaire (NASA)',
    launch: '1977-09-05T12:56Z', radiusKm: 0.0025, color: '#ffe08a',
    encounters: [['jupiter', '1979-03-05T12:05Z', 'Jupiter'], ['saturn', '1980-11-12T23:46Z', 'Saturne']],
    description: "L'objet humain le plus lointain. Après Jupiter et Saturne (et un survol rapproché de Titan), elle a quitté le plan des planètes. En 1990, elle a pris le « Pale Blue Dot », la Terre vue de 6 milliards de km. Elle est entrée dans l'espace interstellaire en août 2012 et transmet encore avec 22 W.",
  },
  {
    id: 'voyager2', name: 'Voyager 2', kind: 'probe', model: 'voyager', type: 'Sonde interstellaire (NASA)',
    launch: '1977-08-20T14:29Z', radiusKm: 0.0025, color: '#ffb36b',
    encounters: [['jupiter', '1979-07-09T22:29Z', 'Jupiter'], ['saturn', '1981-08-26T03:24Z', 'Saturne'], ['uranus', '1986-01-24T17:59Z', 'Uranus'], ['neptune', '1989-08-25T03:56Z', 'Neptune']],
    description: "La seule sonde à avoir visité Uranus et Neptune, grâce à un alignement des planètes géantes qui ne se produit que tous les 175 ans. Elle a frôlé le pôle nord de Neptune à moins de 5 000 km des nuages. Interstellaire depuis novembre 2018.",
  },
  {
    id: 'pioneer10', name: 'Pioneer 10', kind: 'probe', model: 'pioneer', type: 'Sonde (NASA)',
    launch: '1972-03-03T01:49Z', radiusKm: 0.0014, color: '#9fe0a8',
    encounters: [['jupiter', '1973-12-04T02:26Z', 'Jupiter']],
    description: "La première sonde à traverser la ceinture d'astéroïdes et à survoler Jupiter (1973). Elle porte une plaque gravée destinée à d'éventuels extraterrestres. Son dernier signal a été reçu en janvier 2003.",
  },
  {
    id: 'pioneer11', name: 'Pioneer 11', kind: 'probe', model: 'pioneer', type: 'Sonde (NASA)',
    launch: '1973-04-06T02:11Z', radiusKm: 0.0014, color: '#8fd4ff',
    encounters: [['jupiter', '1974-12-03T05:22Z', 'Jupiter'], ['saturn', '1979-09-01T16:31Z', 'Saturne']],
    description: "Elle a utilisé la gravité de Jupiter pour rejoindre Saturne, qu'elle a été la première à survoler (1979), ouvrant la voie aux Voyager. Contact perdu en 1995.",
  },
  {
    id: 'newhorizons', name: 'New Horizons', kind: 'probe', model: 'newhorizons', type: 'Sonde (NASA)',
    launch: '2006-01-19T19:00Z', radiusKm: 0.0013, color: '#ff9ad5',
    encounters: [['jupiter', '2007-02-28T05:43Z', 'Jupiter'], ['pluto', '2015-07-14T11:49Z', 'Pluton']],
    description: "Lancée à 16 km/s, le record au départ de la Terre. Après une assistance gravitationnelle de Jupiter, elle a survolé Pluton le 14 juillet 2015 à 12 500 km et révélé son cœur de glace d'azote, puis l'objet de Kuiper Arrokoth le 1er janvier 2019.",
  },
];
