declare module "virtual:public-file-versions" {
  /** Empreinte courte du contenu de chaque fichier de public/, par chemin relatif. */
  const versions: Record<string, string>;
  export default versions;
}

declare module "virtual:hall-release" {
  /** Dernière version publiée de Hall et ses fichiers, lue à la construction ; null sur le serveur de développement hors ligne. */
  const release: import("./downloads").Release | null;
  export default release;
}

/** Vrai sur le serveur de développement et dans une construction du studio ; faux dans le site publié. */
declare const __HALL_STUDIO__: boolean;
