/** Grande cité antique : nom gaulois ou romain, ville actuelle et position (longitude, latitude en degrés). */
export interface AncientCity {
  ancientName: string;
  modernName: string;
  position: [number, number];
}

/**
 * Noms antiques courants des grandes cités de la Gaule ; liste provisoire en attendant les graphies et
 * les sources du cadrage documentaire du site d'Alésia du Jura.
 */
export const ancientCities: readonly AncientCity[] = [
  { ancientName: "Lutèce", modernName: "Paris", position: [2.3488, 48.8534] },
  { ancientName: "Lugdunum", modernName: "Lyon", position: [4.8357, 45.764] },
  { ancientName: "Genava", modernName: "Genève", position: [6.1432, 46.2044] },
  { ancientName: "Massalia", modernName: "Marseille", position: [5.3698, 43.2965] },
  { ancientName: "Burdigala", modernName: "Bordeaux", position: [-0.5792, 44.8378] },
  { ancientName: "Tolosa", modernName: "Toulouse", position: [1.4442, 43.6047] },
  { ancientName: "Narbo", modernName: "Narbonne", position: [3.0041, 43.1843] },
  { ancientName: "Vesontio", modernName: "Besançon", position: [6.0241, 47.2378] },
  { ancientName: "Durocortorum", modernName: "Reims", position: [4.0317, 49.2583] },
  { ancientName: "Rotomagus", modernName: "Rouen", position: [1.0993, 49.4432] },
  { ancientName: "Argentoratum", modernName: "Strasbourg", position: [7.7521, 48.5734] },
  { ancientName: "Nemausus", modernName: "Nîmes", position: [4.3601, 43.8367] },
  { ancientName: "Avaricum", modernName: "Bourges", position: [2.3987, 47.081] },
  { ancientName: "Cenabum", modernName: "Orléans", position: [1.9093, 47.9029] },
];
