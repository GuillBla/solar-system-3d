// Guided tour: famous events. Each one sets the date, the focused body, the
// camera, the speed and the scale.
//   camera.from : body whose direction the camera comes from (relative to the
//                 focus), 'anti:<body>' for the opposite side, 'top' for a
//                 view from ecliptic north
//   camera.az/el: extra rotation (deg) around the vertical / upwards
//   camera.dist : distance in radii of the focused body, or distAU: distance
//                 equivalent to that many AU through the current scale mapping
//   speed       : simulated days per second
export const EVENTS = [
  {
    id: 'voyager1-jupiter', date: '1979-03-05T10:30Z', title: 'Voyager 1 à Jupiter', when: '5 mars 1979',
    focus: 'jupiter', scale: 'real', speed: 1 / 24, show: ['probes'],
    camera: { from: 'sun', az: 40, el: 18, dist: 16 },
    caption: "Voyager 1 passe à 349 000 km du centre de Jupiter. Ses images révèlent les volcans actifs d'Io, une première hors de la Terre, et un fin anneau de poussières autour de la planète.",
  },
  {
    id: 'voyager1-saturn', date: '1980-11-12T22:15Z', title: 'Voyager 1 à Saturne', when: '12 novembre 1980',
    focus: 'saturn', scale: 'real', speed: 1 / 24, show: ['probes'],
    camera: { from: 'sun', az: 35, el: 22, dist: 13 },
    caption: "Après avoir frôlé Titan la veille (son atmosphère opaque cache la surface), Voyager 1 passe à 124 000 km de Saturne puis quitte le plan des planètes pour toujours.",
  },
  {
    id: 'voyager2-neptune', date: '1989-08-25T03:00Z', title: 'Voyager 2 à Neptune', when: '25 août 1989',
    focus: 'neptune', scale: 'real', speed: 1 / 144, show: ['probes'],
    camera: { from: 'sun', az: 70, el: 30, dist: 9 },
    caption: "Douze ans après son lancement, Voyager 2 frôle le pôle nord de Neptune, à moins de 5 000 km des nuages, puis passe près de Triton. Aucune sonde n'est retournée vers Uranus ou Neptune depuis.",
  },
  {
    id: 'halley-1986', date: '1986-02-01T00:00Z', title: 'La comète de Halley', when: '9 février 1986',
    focus: 'halley', scale: 'readable', speed: 1, show: ['comets'],
    camera: { from: 'sun', az: 80, el: 25, distAU: 0.16 },
    caption: "Halley passe au plus près du Soleil (0,59 UA). Ses deux queues se développent : la queue d'ions, bleue et rectiligne, fuit le Soleil ; la queue de poussières, jaunâtre, s'incurve le long de l'orbite. En mars, la sonde Giotto traverse sa chevelure.",
  },
  {
    id: 'halebopp-1997', date: '1997-03-20T00:00Z', title: 'La grande comète Hale-Bopp', when: 'printemps 1997',
    focus: 'halebopp', scale: 'readable', speed: 1, show: ['comets'],
    camera: { from: 'sun', az: 85, el: 20, distAU: 0.35 },
    caption: "Avec un noyau d'environ 60 km, Hale-Bopp est restée visible à l'œil nu pendant 18 mois, un record. Périhélie le 1er avril 1997 à 0,91 UA du Soleil.",
  },
  {
    id: 'mars-2003', date: '2003-08-27T10:00Z', title: 'Mars au plus près depuis 60 000 ans', when: '27 août 2003',
    focus: 'mars', scale: 'readable', speed: 1, show: [],
    camera: { from: 'earth', az: 28, el: 16, dist: 16 },
    caption: "Opposition exceptionnelle : la Terre passe entre le Soleil et Mars alors que Mars est près de son périhélie. Distance minimale : 55,76 millions de km, un record depuis 57 617 av. J.-C.",
  },
  {
    id: 'newhorizons-pluto', date: '2015-07-14T11:15Z', title: 'New Horizons à Pluton', when: '14 juillet 2015',
    focus: 'pluto', scale: 'real', speed: 1 / 144, show: ['probes'],
    camera: { from: 'sun', az: 55, el: 20, dist: 40 },
    caption: "Après 9 ans et demi de voyage, New Horizons passe à 12 500 km de Pluton à 14 km/s. Elle découvre un monde actif : glaciers d'azote, montagnes de glace d'eau et une atmosphère bleutée.",
  },
  {
    id: 'great-conjunction-2020', date: '2020-12-21T18:00Z', title: 'Grande conjonction Jupiter–Saturne', when: '21 décembre 2020',
    focus: 'sun', scale: 'readable', speed: 7, show: [],
    camera: { from: 'top', az: 0, el: 0, distAU: 18 },
    caption: "Vus de la Terre, Jupiter et Saturne ne sont séparés que de 0,1° : la Terre, Jupiter et Saturne sont presque alignés. Une conjonction aussi serrée n'avait pas été observable depuis 1226.",
  },
  {
    id: 'eclipse-2024', date: '2024-04-08T17:40Z', title: 'Éclipse totale de Soleil (Amérique du Nord)', when: '8 avril 2024',
    focus: 'earth', scale: 'readable', speed: 1 / 144, show: [],
    camera: { from: 'sun', az: -12, el: 12, dist: 3.4 },
    caption: "L'ombre de la Lune traverse le Mexique, les États-Unis et le Canada. La pénombre (éclipse partielle) couvre tout le continent ; l'ombre (totalité, jusqu'à 4 min 28 s) n'est qu'une petite tache sombre de 200 km.",
  },
  {
    id: 'lunar-eclipse-2025', date: '2025-03-14T06:25Z', title: 'Éclipse totale de Lune', when: '14 mars 2025',
    focus: 'moon', scale: 'readable', speed: 1 / 144, show: [],
    camera: { from: 'earth', az: 12, el: 6, dist: 4.5 },
    caption: "La Lune traverse l'ombre de la Terre. Elle ne disparaît pas : elle devient rouge, éclairée par la lumière que l'atmosphère terrestre réfracte, celle de tous les levers et couchers de Soleil de la planète.",
  },
  {
    id: 'eclipse-2026', date: '2026-08-12T17:15Z', title: 'Éclipse totale de Soleil (Islande, Espagne)', when: '12 août 2026',
    focus: 'earth', scale: 'readable', speed: 1 / 144, show: [],
    camera: { from: 'sun', az: 10, el: 22, dist: 3.4 },
    caption: "La première éclipse totale visible en Europe continentale depuis 1999. L'ombre passe au large de l'Islande puis traverse le nord de l'Espagne au coucher du Soleil.",
  },
  {
    id: 'halley-2061', date: '2061-07-20T00:00Z', title: 'Retour de Halley', when: '28 juillet 2061',
    focus: 'halley', scale: 'readable', speed: 1, show: ['comets'],
    camera: { from: 'sun', az: 70, el: 25, distAU: 0.16 },
    caption: "Halley revient au périhélie le 28 juillet 2061, du même côté du Soleil que la Terre cette fois : le spectacle sera bien meilleur qu'en 1986. Attention : après 2050, la position des planètes calculée ici perd en précision (badge « Précision réduite »).",
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
