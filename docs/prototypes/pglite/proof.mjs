import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
const root = '/Users/user/.codex/worktrees/eff1/mairie';
const require = createRequire(`${root}/package.json`);
const { Pool } = require('pg');
const { startHttpServer } = await import(`${root}/packages/server/dist/server.js`);
const { PostgresSchemaBootstrap } = await import(`${root}/packages/postgres/dist/bootstrap.js`);
const { PostgresTransactionManager } = await import(`${root}/packages/postgres/dist/transaction.js`);
const { loadSchemaManifest } = await import(`${root}/packages/postgres/dist/schemaManifest.js`);
const watchdog = setTimeout(() => { console.error('PROBE TIMEOUT'); process.exit(2); }, 45000);
const directory = await mkdtemp('/tmp/hall-pglite-data-');
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const logs = [];
let db, bridge;
const pg = {
  async initialise() {},
  async createDatabase() {},
  async start() {
    db = await PGlite.create(`${directory}/data`);
    bridge = new PGLiteSocketServer({ db, host: '127.0.0.1', port, maxConnections: 20 });
    await bridge.start();
  },
  async stop() {
    if (bridge) { await bridge.stop(); bridge = null; }
    if (db) { await db.close(); db = null; }
  }
};
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
const evidence = { os: process.platform, arch: process.arch, directory, port, checks: [] };
let server, pool;
function pass(name, value = true) { evidence.checks.push({ name, value }); console.log('PASS', name, JSON.stringify(value)); }
async function connect() { pool = new Pool({ connectionString: url, max: 4 }); pool.on('error', () => {}); }
async function startHall() { server = await startHttpServer({ host: '127.0.0.1', port: 0, database: { kind: 'postgres', url }, environment: 'test', devAutoLogin: false }); }
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hall_probe');
  await connect();
  pass('pglite-version', (await pool.query('SELECT version() version')).rows[0].version);
  const manifest = await loadSchemaManifest();
  const beforeFingerprint = manifest.fingerprint;
  await new PostgresSchemaBootstrap(pool).install();
  await new PostgresSchemaBootstrap(pool).verify();
  pass('unchanged-manifest-installed', { entries: manifest.entries.length, fingerprint: manifest.fingerprint });
  const tx = new PostgresTransactionManager(pool);
  let entered = 0, release;
  const barrier = new Promise(resolve => release = resolve);
  const results = await Promise.all(['first', 'second'].map(requestId => tx.run({ role: 'hall_api_authenticated', context: { requestId, actorId: requestId, action: 'probe', councilMemberId: null }, audit: { targetType: 'probe', targetId: requestId, outcome: 'succeeded' } }, async client => {
    entered++;
    if (entered === 2) release();
    await client.query('SELECT pg_sleep(0.05)');
    return (await client.query("SELECT pg_backend_pid() pid, current_user role, current_setting('transaction_isolation') isolation, hall_api.call_context() context")).rows[0];
  })));

  assert.deepEqual(results.map(x => x.context.requestId), ['first', 'second']);
  assert(results.every(x => x.role === 'hall_api_authenticated' && x.isolation === 'serializable'));
  pass('concurrent-request-contexts', results);
  assert.deepEqual((await pool.query("SELECT request_id, actor_id, target_id FROM hall.audit_event WHERE target_type='probe' ORDER BY request_id")).rows, ['first','second'].map(id => ({request_id:id,actor_id:id,target_id:id})));
  pass('concurrent-transactions-both-committed-with-own-audit');
  const clients = await Promise.all([pool.connect(), pool.connect()]);
  for (const client of clients) {
    const row = (await client.query("SELECT current_user role, nullif(current_setting('hall.request_id', true), '') context")).rows[0];
    assert.deepEqual(row, { role: 'postgres', context: null });
  }
  clients.forEach(client => client.release());
  await assert.rejects(tx.run({ role: 'hall_api_authenticated', context: { requestId: 'forbidden', actorId: null, action: 'probe', councilMemberId: null } }, client => client.query('SELECT * FROM hall.audit_event')), error => error.sqlState === '42501');
  pass('roles-reset-and-direct-access-denied');
  await startHall();
  const auth = await fetch(`${server.url}/api/auth/bootstrap`, { method: 'POST', headers: { origin: server.url, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'probe@example.fr', displayName: 'Probe', password: 'Native-probe-password-2026!' }) });
  assert.equal(auth.status, 201, await auth.text());
  const cookie = auth.headers.get('set-cookie').split(';', 1)[0];
  const businessResponse = await fetch(`${server.url}/api/council-business`, { method: 'POST', headers: { cookie, origin: server.url, 'content-type': 'application/json' }, body: JSON.stringify({ path: 'seed', name: 'Native proof', reportName: 'Report', reportContent: 'Persistent report' }) });
  const business = await businessResponse.json();
  assert.equal(businessResponse.status, 201, JSON.stringify(business));
  const businessId = business.properties.id;
  const form = new FormData();
  form.set('file', new Blob(['Native binary evidence']), 'proof.txt');
  form.set('path', 'seed');
  form.set('councilBusinessId', businessId);
  const uploaded = await fetch(`${server.url}/api/resources/documents`, { method: 'POST', headers: { cookie, origin: server.url }, body: form });
  const document = await uploaded.json();
  assert.equal(uploaded.status, 201, JSON.stringify(document));
  const resourceId = document.properties.id;
  const concurrentHttp = await Promise.all(['A','B'].map(name => fetch(`${server.url}/api/resources`, {method:'POST', headers:{cookie,origin:server.url,'content-type':'application/json'},body:JSON.stringify({kind:'text',path:'seed',name:`Concurrent ${name}`,content:`Body ${name}`,councilBusinessId:businessId})}).then(async response => ({status:response.status, body:await response.json()}))));
  assert(concurrentHttp.every(result => result.status === 201), JSON.stringify(concurrentHttp));
  assert.notEqual(concurrentHttp[0].body.properties.id, concurrentHttp[1].body.properties.id);
  assert.equal((await pool.query('SELECT count(*)::int n FROM hall.council_business_resource WHERE council_business=$1',[businessId])).rows[0].n,3);
  pass('overlapping-http-resource-creations-both-associated');
  const snapshot = async () => ({ resources: (await pool.query("SELECT row_to_json(r) payload FROM hall.resource r WHERE id=$1", [resourceId])).rows, binaries: (await pool.query("SELECT id, encode(content, 'hex') bytes, content_sha256 FROM hall.binary_object ORDER BY id")).rows });
  const initial = await snapshot();
  assert.equal(initial.resources.length, 1);
  assert(initial.binaries.some(row => row.bytes === Buffer.from('Native binary evidence').toString('hex')));
  await assert.rejects(pool.query("UPDATE hall.binary_object SET content='corrupt'::bytea WHERE id=$1",[initial.binaries[0].id]), error => error.code === 'HV605');
  assert.deepEqual(await snapshot(), initial);
  pass('binary-integrity-constraint-still-enforced');
  pass('http-business-and-binary-created', { businessId, resourceId });
  await server.close(); server = null;
  await pool.end(); pool = null;
  await pg.stop();
  await pg.start();
  await connect();
  assert.deepEqual(await snapshot(), initial);
  await startHall();
  const read = await fetch(`${server.url}/api/council-business/${businessId}`, { headers: { cookie } });
  assert.equal(read.status, 200);
  pass('normal-restart-persistent-resource-and-http-session');
  await server.close(); server = null;
  await assert.rejects(new PostgresTransactionManager(pool).run({role: 'hall_api_authenticated', context: {requestId: 'rollback', actorId: null, action: 'probe', councilMemberId: null}}, async client => {
    await client.query("SELECT set_config('hall.request_id', 'must-rollback', true)");
    await client.query("SELECT hall_api.record_audit_event('probe', 'rollback', 'succeeded', '{}'::jsonb)");
    throw new Error('deliberate rollback');
  }), /deliberate rollback/);
  assert.deepEqual(await snapshot(), initial);
  assert.equal((await pool.query("SELECT count(*)::int n FROM hall.audit_event WHERE target_id='rollback'")).rows[0].n,0);
  await new PostgresSchemaBootstrap(pool).verify();
  pass('rollback-and-manifest-verified');
  assert.equal((await loadSchemaManifest()).fingerprint, beforeFingerprint);
  pass('source-manifest-still-identical');
} catch (error) {
  evidence.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  if (pool) await pool.end();
  await pg.stop();
  await writeFile(`${directory}/postgres.log`, logs.join('\n'));
  await writeFile('/tmp/hall-pglite-proof-20260910/result.json', JSON.stringify(evidence, null, 2));
  console.log('EVIDENCE', directory);
  clearTimeout(watchdog);
}
