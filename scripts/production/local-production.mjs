import { cp, mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

// Production commands never reset or seed the database. Private data stays outside Git.
const root = fileURLToPath(new URL("../../", import.meta.url));
const home = join(root, "local-imports/production/private");
const configPath = join(home, "config.json");
const command = process.argv[2];
const stamp = () => new Date().toISOString().replaceAll(/[:.]/g, "-");
process.umask(0o077);
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed (${result.status})`);
}
async function configuration() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const url = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error("A local PostgreSQL database is required.");
  }
  if (url.pathname !== '/hall_private_prod') throw new Error("Expected the dedicated hall_private_prod database.");
  return { ...config, url };
}
function postgresEnvironment(url) {
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1) };
}
async function prepare() {
  await configuration();
  const packages = ['contracts', 'api-contract', 'mcp', 'domain', 'templating', 'postgres', 'server', 'client'];
  for (const name of packages) run('npm', ['run', 'build', '-w', `@hall/${name}`]);
  const release = join(home, 'releases', stamp());
  await mkdir(release, { recursive: true });
  await cp(join(root, 'node_modules'), join(release, 'node_modules'), { recursive: true, verbatimSymlinks: true });
  await cp(join(root, 'package.json'), join(release, 'package.json'));
  await cp(join(root, 'package-lock.json'), join(release, 'package-lock.json'));
  for (const name of packages) {
    const source = join(root, 'packages', name), destination = join(release, 'packages', name);
    await mkdir(destination, { recursive: true });
    for (const part of ['package.json', 'dist', 'node_modules', ...(name === 'postgres' ? ['sql'] : [])]) {
      try { await stat(join(source, part)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      await cp(join(source, part), join(destination, part), { recursive: true, verbatimSymlinks: true });
    }
  }
  await writeFile(join(home, 'release.json'), JSON.stringify({ release, preparedAt: new Date().toISOString() }, null, 2));
  console.log(`Production build prepared: ${release}`);
}
async function start() {
  process.env.NODE_ENV = 'production';
  const config = await configuration();
  const { release } = JSON.parse(await readFile(join(home, 'release.json'), 'utf8'));
  const { chromium } = await import(pathToFileURL(join(release, 'node_modules/playwright/index.mjs')).href);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<p>Hall production PDF check</p>');
    if (!(await page.pdf()).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('PDF check failed');
  } finally { await browser.close(); }
  const { startHttpServer } = await import(pathToFileURL(join(release, 'packages/server/dist/index.js')).href);
  const handle = await startHttpServer({
    host: '127.0.0.1', port: config.port ?? 3200, database: { kind: 'postgres', url: config.databaseUrl },
    environment: 'production', devAutoLogin: false, clientDirectory: join(release, 'packages/client/dist'),
    allowedOrigins: [`http://localhost:${config.port ?? 3200}`, `http://127.0.0.1:${config.port ?? 3200}`],
  });
  console.log(`Hall production ready: ${handle.url}/app/; PDF verified. Ctrl+C to stop.`);
  const stop = async () => { await handle.close(); process.exit(0); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
async function backup() {
  const config = await configuration();
  const directory = resolve(config.backupDirectory ?? join(home, 'backups'));
  await mkdir(directory, { recursive: true });
  const file = join(directory, `hall-production-${stamp()}.dump`);
  run('pg_dump', ['--format=custom', '--file', `${file}.partial`], { env: postgresEnvironment(config.url) });
  run('pg_restore', ['--list', `${file}.partial`], { stdio: ['ignore', 'ignore', 'inherit'] });
  const sha256 = createHash('sha256').update(await readFile(`${file}.partial`)).digest('hex');
  await rename(`${file}.partial`, file);
  await writeFile(`${file}.json`, JSON.stringify({ sha256, createdAt: new Date().toISOString(),
    release: JSON.parse(await readFile(join(home, 'release.json'), 'utf8')), database: 'hall_private_prod' }, null, 2));
  console.log(`Backup complete: ${file}`);
  return file;
}
async function verifyBackup() {
  const config = await configuration();
  const file = await backup();
  const database = `hall_restore_check_${Date.now()}`;
  const env = postgresEnvironment(config.url);
  run('createdb', [database], { env });
  try {
    run('pg_restore', ['--exit-on-error', '--dbname', database, file], { env });
    run('psql', ['--dbname', database, '-v', 'ON_ERROR_STOP=1', '-c',
      'SELECT count(*) AS meetings FROM hall.council_meetings; SELECT count(*) AS documents FROM hall.binary_object;'], { env });
    console.log('Backup restored successfully in an isolated database.');
  } finally { run('dropdb', [database], { env }); }
}
const actions = { prepare, start, backup, 'verify-backup': verifyBackup };
if (!Object.hasOwn(actions, command)) throw new Error('Usage: local-production.mjs prepare|start|backup|verify-backup');
await actions[command]();
