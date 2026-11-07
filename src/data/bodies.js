// Physical and orbital data of the simulated bodies.
//
// Orbital elements (planets): JPL Standish, Table 1 (1800–2050 AD), ecliptic J2000:
//   elements = [a (AU), e, I (deg), L mean longitude (deg), ϖ long. of perihelion (deg), Ω long. of node (deg)]
//   rates    = same quantities per Julian century
// Earth uses the Earth–Moon barycenter elements.
//
// Orientation: IAU WGCCRE 2015 pole (RA, Dec, deg, ICRF) and prime meridian
// W = W0 + Wd * d (deg, d = days since J2000).

export const SUN_MASS_KG = 1.98847e30;

export const SUN = {
  id: 'sun',
  name: 'Soleil',
  type: 'Étoile (naine jaune G2V)',
  radiusKm: 695700,
  massKg: 1.98847e30,
  rotationDays: 25.38,
  pole: { ra: 286.13, dec: 63.87, W0: 84.176, Wd: 14.1844 },
  texture: '2k_sun.jpg',
  color: '#ffcc66',
  description:
    "Une boule de plasma de 1,4 million de km de diamètre qui concentre 99,86 % de la masse du Système solaire. En son cœur, à 15 millions de degrés, 600 millions de tonnes d'hydrogène fusionnent chaque seconde en hélium.",
};

export const PLANETS = [
  {
    id: 'mercury',
    name: 'Mercure',
    type: 'Planète tellurique',
    radiusKm: 2439.7,
    massKg: 3.3011e23,
    rotationDays: 58.646,
    elements: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rates: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    pole: { ra: 281.0103, dec: 61.4155, W0: 329.5988, Wd: 6.1385108 },
    texture: '2k_mercury.jpg',
    color: '#b3a59a',
    description:
      "La plus petite planète et la plus proche du Soleil. Sans atmosphère pour retenir la chaleur, sa surface passe de 430 °C le jour à −180 °C la nuit. Elle tourne 3 fois sur elle-même pendant 2 de ses années (résonance 3:2).",
  },
  {
    id: 'venus',
    name: 'Vénus',
    type: 'Planète tellurique',
    radiusKm: 6051.8,
    massKg: 4.8675e24,
    rotationDays: -243.025,
    elements: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rates: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    pole: { ra: 272.76, dec: 67.16, W0: 160.2, Wd: -1.4813688 },
    texture: '2k_venus_atmosphere.jpg',
    color: '#e8c27a',
    description:
      "Jumelle de la Terre par la taille, mais un enfer : atmosphère de CO₂ 90 fois plus dense que la nôtre, effet de serre emballé et 465 °C en surface. Elle tourne à l'envers, et si lentement que son jour dure plus que son année.",
  },
  {
    id: 'earth',
    name: 'Terre',
    type: 'Planète tellurique',
    radiusKm: 6371.0,
    massKg: 5.97237e24,
    rotationDays: 0.99726968,
    elements: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rates: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    pole: { ra: 0, dec: 90, W0: 190.147, Wd: 360.9856235 },
    texture: '2k_earth_daymap.jpg',
    color: '#4f9dff',
    description:
      "La seule planète connue à abriter la vie. Son axe incliné de 23,4° crée les saisons, et la Lune stabilise cette inclinaison. 71 % de sa surface est couverte d'océans.",
  },
  {
    id: 'mars',
    name: 'Mars',
    type: 'Planète tellurique',
    radiusKm: 3389.5,
    massKg: 6.4171e23,
    rotationDays: 1.02595676,
    elements: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rates: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    pole: { ra: 317.269202, dec: 54.432516, W0: 176.049863, Wd: 350.891982443297 },
    texture: '2k_mars.jpg',
    color: '#e0704a',
    description:
      "La planète rouge doit sa couleur à l'oxyde de fer. Elle abrite Olympus Mons, le plus haut volcan du Système solaire (22 km), et Valles Marineris, un canyon long comme les États-Unis.",
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    type: 'Géante gazeuse',
    radiusKm: 69911,
    massKg: 1.8982e27,
    rotationDays: 0.41354,
    elements: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rates: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    pole: { ra: 268.056595, dec: 64.495303, W0: 284.95, Wd: 870.536 },
    texture: '2k_jupiter.jpg',
    color: '#d8b48a',
    description:
      "Plus massive que toutes les autres planètes réunies (2,5 fois). Sa Grande Tache rouge est une tempête plus large que la Terre, active depuis au moins 350 ans. Sa gravité façonne la ceinture d'astéroïdes.",
  },
  {
    id: 'saturn',
    name: 'Saturne',
    type: 'Géante gazeuse',
    radiusKm: 58232,
    massKg: 5.6834e26,
    rotationDays: 0.44401,
    elements: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rates: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    pole: { ra: 40.589, dec: 83.537, W0: 38.9, Wd: 810.7939024 },
    texture: '2k_saturn.jpg',
    rings: { inner: 74500, outer: 140220, texture: '2k_saturn_ring_alpha.png' },
    color: '#e6cf8f',
    description:
      "Moins dense que l'eau. Ses anneaux, faits de glace et de roche, s'étendent sur 280 000 km mais ne font souvent qu'une dizaine de mètres d'épaisseur. Titan, sa plus grande lune, a une atmosphère épaisse et des lacs de méthane.",
  },
  {
    id: 'uranus',
    name: 'Uranus',
    type: 'Géante de glace',
    radiusKm: 25362,
    massKg: 8.681e25,
    rotationDays: -0.71833,
    elements: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rates: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    pole: { ra: 257.311, dec: -15.175, W0: 203.81, Wd: -501.1600928 },
    texture: '2k_uranus.jpg',
    color: '#9fe3ea',
    description:
      "Elle roule sur son orbite, couchée sur le côté (axe incliné de 98°), probablement à la suite d'une collision géante. Chaque pôle connaît 42 ans de jour puis 42 ans de nuit.",
  },
  {
    id: 'neptune',
    name: 'Neptune',
    type: 'Géante de glace',
    radiusKm: 24622,
    massKg: 1.02413e26,
    rotationDays: 0.6713,
    elements: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rates: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    pole: { ra: 299.36, dec: 43.46, W0: 249.978, Wd: 541.1397757 },
    texture: '2k_neptune.jpg',
    color: '#5b7cff',
    description:
      "Découverte par le calcul (Le Verrier, 1846) avant d'être observée ! Ses vents sont les plus rapides du Système solaire : plus de 2 000 km/h. Une année neptunienne dure 165 ans.",
  },
  {
    id: 'pluto',
    name: 'Pluton',
    type: 'Planète naine',
    radiusKm: 1188.3,
    massKg: 1.303e22,
    rotationDays: -6.3872,
    elements: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rates: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
    pole: { ra: 132.993, dec: -6.163, W0: 302.695, Wd: 56.3625225 },
    procedural: { base: '#c9a98a', dark: '#6d5040', light: '#f1e4d0', seed: 9 },
    color: '#c9a98a',
    description:
      "Rétrogradée au rang de planète naine en 2006. New Horizons y a découvert en 2015 un immense glacier d'azote en forme de cœur (Spoutnik Planitia). Son orbite très excentrique la rapproche parfois plus du Soleil que Neptune.",
  },
];

// Moons. Positions are computed kinematically relative to their parent:
//  - the Moon with the truncated ELP-2000 theory (physics/moon.js);
//  - the others with mean elements fitted to JPL Horizons (data/moons.json,
//    attached at startup as `orbit`, see data/loader.js).
// distanceKm / periodDays are nominal values used for display and info.
export const MOONS = [
  {
    id: 'moon',
    name: 'Lune',
    parent: 'earth',
    type: 'Satellite naturel de la Terre',
    radiusKm: 1737.4,
    massKg: 7.342e22,
    distanceKm: 384400,
    periodDays: 27.321661,
    pole: { ra: 269.9949, dec: 66.5392, W0: 38.3213, Wd: 13.17635815 },
    texture: '2k_moon.jpg',
    color: '#cfcfcf',
    description:
      "Formée il y a 4,5 milliards d'années après l'impact d'un corps de la taille de Mars sur la jeune Terre. En rotation synchrone, elle nous montre toujours la même face, et s'éloigne de 3,8 cm par an.",
  },
  {
    id: 'io', name: 'Io', parent: 'jupiter', type: 'Lune galiléenne de Jupiter',
    radiusKm: 1821.6, massKg: 8.932e22, distanceKm: 421700, periodDays: 1.769138,
    procedural: { base: '#e8d36a', dark: '#a8662c', light: '#fff4b8', seed: 3 },
    color: '#f0d860',
    description: "Le corps le plus volcanique du Système solaire : plus de 400 volcans actifs, chauffés par les marées gravitationnelles de Jupiter.",
  },
  {
    id: 'europa', name: 'Europe', parent: 'jupiter', type: 'Lune galiléenne de Jupiter',
    radiusKm: 1560.8, massKg: 4.7998e22, distanceKm: 671034, periodDays: 3.551181,
    procedural: { base: '#d9cbb3', dark: '#8b5a3c', light: '#f6f1e6', seed: 5, cracks: true },
    color: '#e7dcc4',
    description: "Sous sa croûte de glace se cache un océan d'eau liquide plus vaste que tous ceux de la Terre : l'un des meilleurs candidats pour la vie extraterrestre.",
  },
  {
    id: 'ganymede', name: 'Ganymède', parent: 'jupiter', type: 'Lune galiléenne de Jupiter',
    radiusKm: 2634.1, massKg: 1.4819e23, distanceKm: 1070412, periodDays: 7.154553,
    procedural: { base: '#8c8073', dark: '#4e463e', light: '#cfc6ba', seed: 7 },
    color: '#a99e90',
    description: "La plus grande lune du Système solaire, plus grande que Mercure. C'est la seule lune connue à posséder son propre champ magnétique.",
  },
  {
    id: 'callisto', name: 'Callisto', parent: 'jupiter', type: 'Lune galiléenne de Jupiter',
    radiusKm: 2410.3, massKg: 1.0759e23, distanceKm: 1882709, periodDays: 16.689017,
    procedural: { base: '#5d5348', dark: '#2e2822', light: '#b5aa9b', seed: 11 },
    color: '#8a7f72',
    description: "La surface la plus cratérisée du Système solaire : un paysage quasi inchangé depuis 4 milliards d'années.",
  },
  {
    id: 'titan', name: 'Titan', parent: 'saturn', type: 'Lune de Saturne',
    radiusKm: 2574.7, massKg: 1.3452e23, distanceKm: 1221870, periodDays: 15.945,
    procedural: { base: '#d8a24a', dark: '#9a6a2a', light: '#f0c878', seed: 13, hazy: true },
    color: '#e0a850',
    description: "Seul satellite doté d'une atmosphère épaisse (1,5 fois la pression terrestre). Il y pleut du méthane, qui forme des rivières et des lacs. La sonde Huygens s'y est posée en 2005.",
  },
  {
    id: 'triton', name: 'Triton', parent: 'neptune', type: 'Lune de Neptune',
    radiusKm: 1353.4, massKg: 2.139e22, distanceKm: 354759, periodDays: -5.876854,
    procedural: { base: '#d8c9c0', dark: '#9b8a80', light: '#f5ece6', seed: 17 },
    color: '#e0d2c8',
    description: "Elle tourne autour de Neptune à l'envers (orbite rétrograde) : c'est probablement un objet de la ceinture de Kuiper capturé. Des geysers d'azote jaillissent de sa surface.",
  },
  {
    id: 'charon', name: 'Charon', parent: 'pluto', type: 'Lune de Pluton',
    radiusKm: 606, massKg: 1.586e21, distanceKm: 19591, periodDays: 6.3872,
    procedural: { base: '#8e8a86', dark: '#4a4440', light: '#c9c4bf', seed: 19 },
    color: '#a8a39e',
    description: "Si grosse par rapport à Pluton (la moitié de son diamètre) que les deux tournent autour d'un point situé hors de Pluton. Les deux astres se montrent toujours la même face.",
  },
];

export const ALL_BODIES = [SUN, ...PLANETS, ...MOONS];
export const BODY_BY_ID = Object.fromEntries(ALL_BODIES.map((b) => [b.id, b]));
