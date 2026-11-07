/** Checks the published HTML version without depending on a cached JavaScript bundle. */
export function refreshPublishedPage(): void {
  const current = document.documentElement.dataset.hallBuild;
  if (!current) return;
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const root = new URL(document.documentElement.dataset.siteRoot ?? "./", location.href);
      const manifest = new URL("publication.json", root);
      manifest.searchParams.set("check", `${current}.${Date.now()}`);
      const response = await fetch(manifest, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!response.ok) return;
      const publication: unknown = await response.json();
      if (
        typeof publication !== "object" ||
        publication === null ||
        !("version" in publication) ||
        typeof publication.version !== "string" ||
        !/^[a-f0-9]{16}$/.test(publication.version) ||
        publication.version === current
      )
        return;
      const target = new URL(location.href);
      if (target.searchParams.get("_hall") === publication.version) return;
      target.searchParams.set("_hall", publication.version);
      location.replace(target.href);
    } catch {
      return;
    } finally {
      checking = false;
    }
  };
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void check();
  });
  void check();
}
