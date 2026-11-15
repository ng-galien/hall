import { fullName } from "./names.mjs";

export const presentationNote = `## Hall à la mairie de Foncine-le-Bas

**Ce que Hall sert à faire.** Préparer les affaires du conseil et leurs pièces, établir l’ordre du jour, envoyer la convocation et le dossier de séance, conduire la séance (appel, pouvoirs, quorum, votes), produire le procès-verbal et les délibérations.

**Coût.** Hall est un logiciel libre diffusé sous la licence publique de l’Union européenne (EUPL 1.2) : la licence ne coûte rien. Il est installé sur l’équipement informatique de la mairie.

**Temps de formation.** Une séance de prise en main de deux heures pour les élus, une séance complémentaire d’une heure et demie sur le téléphone ; une demi-journée de secrétariat pour créer les comptes et remettre les accès.

**Convocations.** Elles sont transmises de manière dématérialisée à l’adresse électronique de chaque conseiller (CGCT, L2121-10). Un élu qui le demande par écrit les reçoit à son domicile.`;

export const guide = `## Guide de prise en main remis aux élus

### 1. Se connecter

Ouvrir Hall avec l’adresse électronique et le mot de passe reçus. À la première connexion, choisir son propre mot de passe.

### 2. Lire l’Accueil

L’**Accueil** montre la séance en cours ou la prochaine séance, **Mon espace** et les derniers documents.

### 3. Trouver son chemin

Le menu donne accès au **Conseil municipal**, aux **Documents** et à l’**Agenda**. Pour chercher une affaire ou un document, taper **Ctrl+K** (ou **Cmd+K** sur Mac).

### 4. Écrire une note, ajouter une photo

Dans **Mon espace**, créer une note ou déposer une photo. Le secrétariat reprend un document avant de le joindre à une affaire.

### 5. Changer son mot de passe

Dans **Paramètres**.

### 6. Sur le téléphone

La barre du bas donne **Accueil**, **Documents**, **Agenda**, **Séances** et **Plus**. Dans Chrome, **Installer l’application** place Hall sur l’écran d’accueil.

### 7. Avant la séance

Ouvrir la page de la séance : la convocation et le dossier de séance y sont joints.`;

/** One row per person: 11 members and 2 agents; the five accounts of the dataset are created. */
export function accountsTracker() {
  const rows = [
    ["marchand", "Administratrice", "Invitation par courriel", "Créé", "Oui", "Oui", "Non"],
    ["garnier", "Conseiller", "Invitation par courriel", "Créé", "Oui", "Oui", "Non"],
    ["renaud", "Conseillère", "Phrase de passe remise en main propre", "À créer", "Oui", "Non", "Non"],
    ["robert", "Conseillère", "Invitation par courriel", "À créer", "Oui", "Non", "Non"],
    ["lefort", "Conseiller", "Invitation par courriel", "À créer", "Non", "Non", "Non"],
    ["durand", "Conseillère", "Invitation par courriel", "À créer", "Oui", "Non", "Non"],
    ["roussel", "Conseiller", "Phrase de passe remise en main propre", "À créer", "Oui", "Non", "Oui"],
    ["morin", "Conseillère", "Invitation par courriel", "Créé", "Oui", "Oui", "Non"],
    ["carre", "Conseiller", "Invitation par courriel", "À créer", "Non", "Non", "Non"],
    ["fontaine", "Conseillère", "Invitation par courriel", "À créer", "Oui", "Non", "Non"],
    ["mathieu", "Conseiller", "Phrase de passe remise en main propre", "À créer", "Oui", "Non", "Non"],
    ["colin", "Secrétariat", "Invitation par courriel", "Créé", "Oui", "Oui", "Non"],
    ["leroy", "Contributeur", "Phrase de passe remise en main propre", "Créé", "Non", "Oui", "Non"],
  ];
  const header = { bl: 1, bg: { rgb: "#e2e8f0" } };
  const titles = [
    "Personne",
    "Rôle dans Hall",
    "Remise de l’accès",
    "Compte",
    "Prise en main suivie",
    "Séance téléphone suivie",
    "Envoi papier des convocations demandé",
  ];
  const cellData = { 0: Object.fromEntries(titles.map((title, index) => [index, { v: title, s: header }])) };
  rows.forEach(([key, ...values], index) => {
    cellData[index + 1] = Object.fromEntries([fullName(key), ...values].map((value, column) => [column, { v: value }]));
  });
  return {
    schemaVersion: 2,
    workbook: {
      id: "foncine-hall-accounts",
      name: "Suivi des comptes et de la formation",
      appVersion: "0.25.1",
      locale: "frFR",
      styles: {},
      sheetOrder: ["comptes"],
      sheets: {
        comptes: {
          id: "comptes",
          name: "Comptes",
          rowCount: 30,
          columnCount: 9,
          cellData,
          rowData: { 0: { h: 30 } },
          columnData: Object.fromEntries(titles.map((_, index) => [index, { w: index === 2 ? 260 : 170 }])),
          mergeData: [],
          showGridlines: 1,
        },
      },
    },
  };
}
