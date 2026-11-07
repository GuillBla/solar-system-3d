// Comets: display metadata. Orbits come from data/comets.json (SBDB + Horizons).
export const COMETS = [
  {
    id: 'halley', name: 'Halley', designation: '1P/Halley', kind: 'comet', type: 'Comète périodique (76 ans)',
    radiusKm: 5.5, tailScale: 1, color: '#9fd4ff',
    description: "La plus célèbre des comètes. Edmond Halley a prédit son retour de 1758 en comprenant qu'elle était la même que celles de 1531, 1607 et 1682. Elle tourne à l'envers des planètes. La sonde Giotto a photographié son noyau en 1986 ; prochain passage en juillet 2061.",
  },
  {
    id: 'encke', name: 'Encke', designation: '2P/Encke', kind: 'comet', type: 'Comète à courte période (3,3 ans)',
    radiusKm: 2.4, tailScale: 0.35, color: '#b3ffe1',
    description: "La comète à la période la plus courte connue parmi les grandes comètes : 3,3 ans. Elle s'approche à 0,34 UA du Soleil, plus près que Mercure. Ses débris donnent les étoiles filantes des Taurides.",
  },
  {
    id: 'cg67p', name: 'Tchourioumov-Guérassimenko', shortName: '67P', designation: '67P/Churyumov–Gerasimenko', kind: 'comet', type: 'Comète de la famille de Jupiter (6,4 ans)',
    radiusKm: 2.0, tailScale: 0.25, color: '#ffd9a8',
    description: "Le « canard » en forme de deux lobes visité par la sonde européenne Rosetta (2014–2016). Le petit atterrisseur Philae s'y est posé le 12 novembre 2014 : une première dans l'histoire.",
  },
  {
    id: 'halebopp', name: 'Hale-Bopp', designation: 'C/1995 O1 (Hale–Bopp)', kind: 'comet', type: 'Grande comète (≈ 2 500 ans)',
    radiusKm: 30, tailScale: 2.5, color: '#fff1c2',
    description: "La « grande comète de 1997 », visible à l'œil nu pendant 18 mois, un record. Son noyau d'environ 60 km est l'un des plus gros connus. Son passage près de Jupiter en 1996 a raccourci sa période de 4 200 à environ 2 500 ans.",
  },
  {
    id: 'swifttuttle', name: 'Swift-Tuttle', designation: '109P/Swift–Tuttle', kind: 'comet', type: 'Comète périodique (133 ans)',
    radiusKm: 13, tailScale: 1.2, color: '#c9b8ff',
    description: "La source des Perséides, les étoiles filantes du mois d'août. Avec 26 km de diamètre, c'est le plus gros objet qui croise régulièrement l'orbite de la Terre. Dernier passage en 1992, prochain en 2126.",
  },
];
