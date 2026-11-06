declare module "virtual:public-file-versions" {
  /** Empreinte courte du contenu de chaque fichier de public/, par chemin relatif. */
  const versions: Record<string, string>;
  export default versions;
}
