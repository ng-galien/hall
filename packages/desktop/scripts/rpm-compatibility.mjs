import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Keeps the install source independent of the working directory introduced by RPM 6. */
export async function prepareRpmTemplate() {
  const template = require.resolve("electron-installer-redhat/resources/spec.ejs");
  const source = await readFile(template, "utf8");
  const relativeSource = " usr/* %{buildroot}/usr/";
  const absoluteSource = ' "%{_topdir}/BUILD/usr/"* %{buildroot}/usr/';
  if (source.includes(absoluteSource)) return;
  if (source.split(relativeSource).length !== 2)
    throw new Error("Unexpected electron-installer-redhat install template");
  await writeFile(template, source.replace(relativeSource, absoluteSource));
}
