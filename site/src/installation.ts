/** Une étape de l'installation : ce que la personne voit à l'écran et ce qu'elle fait. */
export interface InstallationStep {
  readonly sees: string;
  readonly does: string;
}

/** Une variante du parcours, par exemple pour une version précise du système. */
export interface InstallationPath {
  readonly title: string;
  readonly steps: readonly InstallationStep[];
}

/** Le guide d'installation de la démonstration pour un système. */
export interface InstallationGuide {
  readonly system: "windows" | "macos" | "linux";
  readonly title: string;
  readonly versions: string;
  readonly download: string;
  readonly paths: readonly InstallationPath[];
  readonly notes: readonly string[];
}

/** Ce que tout le monde doit savoir avant d'installer la démonstration. */
export const installationIntroduction: readonly string[] = [
  "À la première ouverture, votre ordinateur affiche un avertissement, parce que Hall n'est pas signé auprès d'Apple ni de Microsoft. C'est normal, et cela n'arrive qu'une fois : les étapes ci-dessous montrent quoi faire.",
  "Téléchargez Hall uniquement depuis sa page officielle des versions, sur GitHub.",
];

/** Le guide d'installation de la démonstration, système par système. */
export const installationGuides: readonly InstallationGuide[] = [
  {
    system: "windows",
    title: "Windows",
    versions: "Windows 10 et Windows 11",
    download: "Le fichier dont le nom commence par « windows-x64 » et se termine par « Setup.exe ».",
    paths: [
      {
        title: "Installer et ouvrir Hall",
        steps: [
          {
            sees: "La page de téléchargement de Hall.",
            does: "Cliquez sur le fichier qui se termine par « Setup.exe ». Le téléchargement commence.",
          },
          {
            sees: "Le navigateur peut dire que ce fichier est rarement téléchargé.",
            does: "Choisissez de conserver le fichier. Ce message vient du navigateur, pas de Hall.",
          },
          {
            sees: "Le fichier est dans le dossier « Téléchargements ».",
            does: "Double-cliquez sur le fichier.",
          },
          {
            sees: "Une fenêtre bleue : « Windows a protégé votre ordinateur ». Il n'y a qu'un bouton « Ne pas exécuter ».",
            does: "Ne cliquez pas sur « Ne pas exécuter ». Cliquez sur le lien « Informations complémentaires », sous le texte.",
          },
          {
            sees: "Le nom du fichier s'affiche, avec « Éditeur : Éditeur inconnu ». Un nouveau bouton apparaît en bas.",
            does: "Cliquez sur « Exécuter quand même ».",
          },
          {
            sees: "Hall s'installe tout seul, sans question. Cela prend quelques secondes.",
            does: "Attendez. Un raccourci « Hall » est ajouté sur le Bureau et dans le menu Démarrer, puis Hall s'ouvre.",
          },
          {
            sees: "Une carte de France s'anime, puis la commune d'Alésia et le bouton « Ouvrir Hall ».",
            does: "Attendez que le bouton « Ouvrir Hall » soit actif, puis cliquez dessus. La première fois, la préparation prend quelques minutes.",
          },
        ],
      },
    ],
    notes: [
      "Pour rouvrir Hall plus tard : double-cliquez sur le raccourci « Hall » du Bureau, ou ouvrez le menu Démarrer et tapez « Hall ».",
      "Si la fenêtre dit que le « Contrôle intelligent des applications » a bloqué Hall, il n'existe pas de bouton pour continuer. Windows 11 bloque alors toutes les applications non signées. Hall ne peut pas s'installer sur cet ordinateur tant que ce contrôle reste actif.",
      "Sur un ordinateur géré par une entreprise ou une collectivité, le bouton « Exécuter quand même » peut être absent. Demandez à la personne qui s'occupe de l'informatique.",
    ],
  },
  {
    system: "macos",
    title: "macOS",
    versions: "macOS 14 Sonoma, macOS 15 Sequoia et versions plus récentes",
    download:
      "Le fichier qui se termine par « .dmg ». Mac avec puce Apple (M1, M2, M3, M4…) : le fichier « macos-arm64 ». Mac avec processeur Intel : le fichier « macos-x64 ». Pour savoir lequel prendre : menu Pomme, « À propos de ce Mac ». La ligne « Puce » indique une puce Apple ; la ligne « Processeur » indique Intel.",
    paths: [
      {
        title: "Installer Hall",
        steps: [
          {
            sees: "La page de téléchargement de Hall.",
            does: "Cliquez sur le fichier qui se termine par « .dmg » et qui correspond à votre Mac.",
          },
          {
            sees: "Le fichier est dans le dossier « Téléchargements ».",
            does: "Double-cliquez sur le fichier. Une fenêtre s'ouvre avec l'icône de Hall et le dossier « Applications ».",
          },
          {
            sees: "La fenêtre avec Hall et « Applications ».",
            does: "Faites glisser l'icône de Hall sur le dossier « Applications ». Fermez ensuite cette fenêtre.",
          },
          {
            sees: "Le Finder.",
            does: "Ouvrez le dossier « Applications » et double-cliquez sur Hall.",
          },
          {
            sees: "Une fenêtre : « Apple ne peut pas vérifier que « Hall » ne contient pas de logiciel malveillant ». Le texte peut varier un peu selon la version.",
            does: "Cliquez sur « Terminé » ou « OK ». Ne cliquez pas sur « Placer dans la corbeille ».",
          },
        ],
      },
      {
        title: "Ouvrir Hall la première fois sur macOS 15 Sequoia et plus récent",
        steps: [
          {
            sees: "Le bureau du Mac.",
            does: "Ouvrez le menu Pomme, en haut à gauche, puis « Réglages Système ».",
          },
          {
            sees: "La fenêtre des Réglages Système.",
            does: "Dans la colonne de gauche, cliquez sur « Confidentialité et sécurité ». Faites défiler vers le bas jusqu'à la partie « Sécurité ».",
          },
          {
            sees: "Un message indique que « Hall » a été bloqué.",
            does: "Cliquez sur « Ouvrir quand même », à côté de ce message. Ce bouton reste affiché environ une heure après votre essai d'ouverture.",
          },
          {
            sees: "Une fenêtre demande encore si vous voulez ouvrir Hall.",
            does: "Cliquez sur « Ouvrir quand même » ou « Ouvrir ».",
          },
          {
            sees: "Le Mac demande votre mot de passe.",
            does: "Tapez le mot de passe que vous utilisez pour ouvrir votre session sur le Mac, puis cliquez sur « OK ».",
          },
        ],
      },
      {
        title: "Ouvrir Hall la première fois sur macOS 14 Sonoma",
        steps: [
          {
            sees: "Le dossier « Applications » dans le Finder.",
            does: "Cliquez sur Hall en maintenant la touche « control » enfoncée, ou faites un clic droit. Choisissez « Ouvrir » dans le menu.",
          },
          {
            sees: "Une fenêtre demande si vous voulez ouvrir Hall.",
            does: "Cliquez sur « Ouvrir ».",
          },
        ],
      },
      {
        title: "Ensuite, sur toutes les versions",
        steps: [
          {
            sees: "Une carte de France s'anime, puis la commune d'Alésia et le bouton « Ouvrir Hall ».",
            does: "Attendez que le bouton « Ouvrir Hall » soit actif, puis cliquez dessus. La première fois, la préparation prend quelques minutes.",
          },
        ],
      },
    ],
    notes: [
      "Les fois suivantes, Hall s'ouvre directement depuis le dossier « Applications » ou le Launchpad.",
      "Si le Mac dit que « Hall » est endommagé : ouvrez l'application « Terminal » (dans « Applications », puis « Utilitaires »). Copiez cette ligne, collez-la, puis appuyez sur la touche Entrée : xattr -dr com.apple.quarantine /Applications/Hall.app. Ouvrez ensuite Hall à nouveau.",
    ],
  },
  {
    system: "linux",
    title: "Linux",
    versions: "Ubuntu et Debian (fichier .deb), Fedora (fichier .rpm)",
    download:
      "Ubuntu ou Debian : le fichier qui se termine par « .deb ». Fedora : le fichier qui se termine par « .rpm ». Ces fichiers sont prévus pour les ordinateurs à processeur Intel ou AMD.",
    paths: [
      {
        title: "Ubuntu et Debian",
        steps: [
          {
            sees: "Le fichier « .deb » est dans le dossier « Téléchargements ».",
            does: "Double-cliquez sur le fichier. Sur Ubuntu, le Centre d'applications s'ouvre.",
          },
          {
            sees: "Le Centre d'applications prévient que ce paquet ne vient pas d'Ubuntu.",
            does: "Cliquez sur « Installer », puis tapez votre mot de passe.",
          },
          {
            sees: "Si le double-clic n'ouvre rien, ou affiche une erreur.",
            does: 'Ouvrez l\'application « Terminal » depuis la liste des applications. Copiez cette ligne, collez-la, appuyez sur Entrée, puis tapez votre mot de passe : sudo apt install "$(xdg-user-dir DOWNLOAD)"/linux-x64-*.deb',
          },
        ],
      },
      {
        title: "Fedora",
        steps: [
          {
            sees: "Le fichier « .rpm » est dans le dossier « Téléchargements ».",
            does: "Double-cliquez sur le fichier. L'application « Logiciels » s'ouvre.",
          },
          {
            sees: "La fiche de Hall dans « Logiciels ».",
            does: "Cliquez sur « Installer », puis tapez votre mot de passe.",
          },
          {
            sees: "Si le double-clic n'ouvre rien, ou affiche une erreur.",
            does: 'Ouvrez l\'application « Terminal » depuis la liste des applications. Copiez cette ligne, collez-la, appuyez sur Entrée, puis tapez votre mot de passe : sudo dnf install "$(xdg-user-dir DOWNLOAD)"/linux-x64-*.rpm',
          },
        ],
      },
      {
        title: "Ouvrir Hall",
        steps: [
          {
            sees: "La liste des applications de l'ordinateur.",
            does: "Cherchez « Hall » et cliquez dessus.",
          },
          {
            sees: "Une carte de France s'anime, puis la commune d'Alésia et le bouton « Ouvrir Hall ».",
            does: "Attendez que le bouton « Ouvrir Hall » soit actif, puis cliquez dessus. La première fois, la préparation prend quelques minutes.",
          },
        ],
      },
    ],
    notes: [
      "Linux n'affiche pas d'avertissement de signature. Le mot de passe sert seulement à installer l'application.",
    ],
  },
];
