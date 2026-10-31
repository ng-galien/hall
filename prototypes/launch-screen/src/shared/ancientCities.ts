/** Grande cité antique : nom gaulois ou romain, ville actuelle et position (longitude, latitude en degrés). */
export interface AncientCity {
  ancientName: string;
  modernName: string;
  position: [number, number];
}

/**
 * Grandes cités antiques, graphies françaises du cadrage documentaire du topic hall-alesia-jura-framing
 * (clé villes_antiques) ; l'ordre de la liste fixe la priorité d'affichage des étiquettes.
 */
export const ancientCities: readonly AncientCity[] = [
  { ancientName: "Lutèce", modernName: "Paris", position: [2.3488, 48.8534] },
  { ancientName: "Lugdunum", modernName: "Lyon", position: [4.8357, 45.764] },
  { ancientName: "Genava", modernName: "Genève", position: [6.1432, 46.2044] },
  { ancientName: "Massalie", modernName: "Marseille", position: [5.3698, 43.2965] },
  { ancientName: "Tolosa", modernName: "Toulouse", position: [1.4442, 43.6047] },
  { ancientName: "Burdigala", modernName: "Bordeaux", position: [-0.5792, 44.8378] },
  { ancientName: "Argentorate", modernName: "Strasbourg", position: [7.7521, 48.5734] },
  { ancientName: "Durocortorum", modernName: "Reims", position: [4.0317, 49.2583] },
  { ancientName: "Vesontio", modernName: "Besançon", position: [6.0241, 47.2378] },
  { ancientName: "Cenabum", modernName: "Orléans", position: [1.9093, 47.9029] },
  { ancientName: "Augustonemetum", modernName: "Clermont-Ferrand", position: [3.0863, 45.7772] },
  { ancientName: "Cularo", modernName: "Grenoble", position: [5.7245, 45.1885] },
  { ancientName: "Rotomagus", modernName: "Rouen", position: [1.0993, 49.4432] },
  { ancientName: "Divodurum", modernName: "Metz", position: [6.1757, 49.1193] },
  { ancientName: "Samarobriva", modernName: "Amiens", position: [2.2958, 49.8941] },
  { ancientName: "Nemausus", modernName: "Nîmes", position: [4.3601, 43.8367] },
  { ancientName: "Divio", modernName: "Dijon", position: [5.0415, 47.322] },
  { ancientName: "Condevincum", modernName: "Nantes", position: [-1.5536, 47.2184] },
];

/** Point focal du site d'Alésia, plateau de Cornu (longitude, latitude). */
export const alesiaFocus: [number, number] = [5.957, 46.6677];
