import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const script = resolve("scripts/distribution/release-publication.mjs");
const directories = [];
const fakeGh = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const stateFile = process.env.HALL_GH_FIXTURE;
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
state.calls.push(args);
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const option = (name) => args[args.indexOf(name) + 1];
const save = (result) => { fs.writeFileSync(stateFile, JSON.stringify(state)); if (result !== undefined) process.stdout.write(JSON.stringify(result)); };
const metadata = () => state.release ? {...state.release, assets:state.release.assets.map(({bytesBase64,...asset})=>asset)} : null;
let value;
if (args[0] === 'api') {
  const endpoint = args[1];
  if (state.denied) { save(); process.stderr.write('HTTP 403 denied'); process.exit(1); }
  if (endpoint.includes('/commits/')) {
    state.tagQueries = (state.tagQueries || 0) + 1;
    value = {sha: state.tagSwitchAt && state.tagQueries >= state.tagSwitchAt ? state.other : state.sha};
  } else if (endpoint.includes('/contents/')) {
    value = {encoding:'base64',content:Buffer.from(JSON.stringify({version:'9.9.9'})).toString('base64')};
  } else if (endpoint.includes('/workflows/ci.yml/runs')) {
    state.ciQueries = (state.ciQueries || 0) + 1;
    const mode = state.flipAt && state.ciQueries >= state.flipAt ? 'red' : state.mode;
    const run = {id:200,head_sha:mode==='other' ? state.other : state.sha,repository:{full_name:'ng-galien/hall'},head_repository:{full_name:'ng-galien/hall'},path:'.github/workflows/ci.yml',event:'push',created_at:'2026-11-01T10:00:00Z',run_started_at:'2026-11-01T10:00:00Z',status:mode==='pending'?'in_progress':'completed',conclusion:mode==='red'?'failure':mode==='pending'?null:'success'};
    value = {workflow_runs:mode==='absent'?[]:[run]};
    if (mode==='older-green') value.workflow_runs=[{...run,id:199}, {...run,id:201,run_started_at:'2026-11-01T11:00:00Z',conclusion:'failure'}];
  } else if (endpoint.includes('/runs/200/jobs') || endpoint.includes('/runs/201/jobs')) {
    let jobs = ['build','verification','browser (1)','browser (2)','distribution-build','distribution-install (ubuntu-24.04)','distribution-install (windows-2025)','test'].map((name,index)=>({id:index+1,name,status:'completed',conclusion:state.mode==='skipped' && name==='verification'?'skipped':'success'}));
    if (state.mode==='missing-job') jobs=jobs.filter((job)=>job.name!=='test');
    if (state.mode==='missing-lane') jobs=jobs.filter((job)=>job.name!=='browser (2)');
    value={total_count:state.mode==='truncated'?99:jobs.length,jobs};
  } else if (endpoint.includes('/runs/400/jobs')) {
    const jobs=['Build the macOS arm64 demonstration','Build the macOS x64 demonstration','Build the Windows x64 demonstration','Build the Linux x64 demonstration'].map((name,index)=>({id:index+20,name,status:'completed',conclusion:'success'}));
    value={total_count:jobs.length,jobs};
  } else if (endpoint.includes('/runs/400/artifacts')) {
    value={artifacts:state.platforms.map((name,index)=>({id:index+40,name:'hall-demonstration-'+name,expired:false,digest:'sha256:'+hash(name),workflow_run:{head_sha:state.sha}}))};
  } else if (endpoint.endsWith('/runs/400')) {
    value={id:400,head_sha:state.buildOther?state.other:state.sha,head_branch:'v9.9.9',repository:{full_name:'ng-galien/hall'},path:'.github/workflows/release.yml',event:'push'};
  } else if (endpoint.includes('/releases?')) {
    value=state.release?[metadata()]:[];
  } else { save(); process.stderr.write('Unexpected fixture API: '+endpoint); process.exit(2); }
  save(args.includes('--slurp')?[value]:value);
} else if (args[0]==='run' && args[1]==='download') {
  const directory=option('--dir');
  for (const platform of state.platforms) {
    const target=path.join(directory,'hall-demonstration-'+platform);fs.mkdirSync(target,{recursive:true});
    let files=platform==='macos-arm64'?{'Hall-9.9.9-arm64.dmg':'arm'}:platform==='macos-x64'?{'Hall-9.9.9-x64.dmg':'intel'}:platform==='windows-x64'?{'Hall-9.9.9 Setup.exe':'setup','hall-9.9.9-full.nupkg':'package','RELEASES':'update'}:{'hall-desktop_9.9.9_amd64.deb':'deb','hall-desktop-9.9.9-1.x86_64.rpm':'rpm','ng-galien-hall-9.9.9.tgz':'server'};
    if(platform==='linux-x64')files['ng-galien-hall-9.9.9.tgz.sha256']=hash('server')+'  ng-galien-hall-9.9.9.tgz\n';
    for(const [name,data]of Object.entries(files))fs.writeFileSync(path.join(target,name),data);
  }
  save();
} else if(args[0]==='release' && ['create','upload'].includes(args[1])) {
  if(!state.release)state.release={id:1,tag_name:'v9.9.9',draft:true,prerelease:false,assets:[]};
  const files=args.slice(3,args.findIndex((arg,index)=>index>=3&&arg.startsWith('--')));
  for(const file of files){const bytes=fs.readFileSync(file);const name=path.basename(file).replaceAll(' ','.');state.release.assets=state.release.assets.filter((asset)=>asset.name!==name);state.release.assets.push({name,size:bytes.length,digest:'sha256:'+hash(bytes),bytesBase64:bytes.toString('base64')});}
  save();
} else if(args[0]==='release' && args[1]==='download') {
  const asset=state.release.assets.find((entry)=>entry.name===option('--pattern'));
  if(!asset){save();process.exit(1);}const directory=option('--dir');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,asset.name),Buffer.from(asset.bytesBase64,'base64'));save();
} else if(args[0]==='release' && args[1]==='edit') {
  if(args.includes('--draft=false'))state.release.draft=false;save();
} else {save();process.stderr.write('Unexpected fixture command');process.exit(2);}
`;

function fixture(mode = "green") {
  const root = mkdtempSync(join(tmpdir(), "hall-publisher-test-"));
  directories.push(root);
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin/gh"), fakeGh, { mode: 0o755 });
  const stateFile = join(root, "state.json");
  const notes = join(root, "notes.md");
  writeFileSync(notes, "Fixture release notice");
  const state = {
    mode,
    sha: "a".repeat(40),
    other: "b".repeat(40),
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    calls: [],
  };
  writeFileSync(stateFile, JSON.stringify(state));
  const env = {
    ...process.env,
    PATH: `${join(root, "bin")}${delimiter}${process.env.PATH}`,
    HALL_GH_FIXTURE: stateFile,
    GH_REPO: "ng-galien/hall",
  };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return {
    read: () => JSON.parse(readFileSync(stateFile, "utf8")),
    change: (update) =>
      writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(readFileSync(stateFile, "utf8")), ...update })),
    run: (operation) =>
      spawnSync(
        process.execPath,
        [
          script,
          operation,
          "--tag",
          "v9.9.9",
          ...(operation === "check" ? [] : ["--build-run", "400"]),
          ...(operation === "prepare" ? ["--notes-file", notes] : []),
        ],
        { env, encoding: "utf8" },
      ),
  };
}

function mutations(state) {
  return state.calls.filter((args) => args[0] === "release" && ["create", "upload", "edit"].includes(args[1]));
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// @verifies-requirement HALL-TR-DST-030
it.each(["red", "pending", "absent", "other", "skipped", "missing-job", "missing-lane", "truncated", "older-green"])(
  "blocks draft/publication mutations when complete exact CI is %s",
  (mode) => {
    const test = fixture(mode);
    const result = test.run("prepare");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Publication blocked");
    expect(mutations(test.read())).toEqual([]);
  },
);

it("fails closed on an unavailable authorization API", () => {
  const test = fixture();
  test.change({ denied: true });
  expect(test.run("prepare").status).toBe(1);
  expect(mutations(test.read())).toEqual([]);
});

it("rejects a maker run for another source even when CI is green", () => {
  const test = fixture();
  test.change({ buildOther: true });
  expect(test.run("prepare").status).toBe(1);
  expect(mutations(test.read())).toEqual([]);
});

it("prepares verified artifact provenance and only promotes exact complete green CI", () => {
  const test = fixture();
  const prepared = test.run("prepare");
  expect(prepared.status, prepared.stderr).toBe(0);
  expect(test.read().release.draft).toBe(true);
  expect(test.read().release.assets.some((asset) => asset.name === "windows-x64-Hall-9.9.9-Setup.exe")).toBe(true);
  const published = test.run("publish");
  expect(published.status, published.stderr).toBe(0);
  expect(test.read().release.draft).toBe(false);
  expect(test.read().calls.filter((args) => args.includes("--draft=false"))).toHaveLength(1);
}, 15_000);

it("rechecks CI immediately before promotion and rejects a new red result", () => {
  const test = fixture();
  expect(test.run("prepare").status).toBe(0);
  test.change({ flipAt: test.read().ciQueries + 2 });
  expect(test.run("publish").status).toBe(1);
  expect(test.read().release.draft).toBe(true);
  expect(test.read().calls.some((args) => args.includes("--draft=false"))).toBe(false);
});

it("rejects draft bytes that differ from the official artifact inventory", () => {
  const test = fixture();
  expect(test.run("prepare").status).toBe(0);
  const release = test.read().release;
  release.assets.find((asset) => asset.name.endsWith(".exe")).digest = `sha256:${"0".repeat(64)}`;
  test.change({ release });
  expect(test.run("publish").status).toBe(1);
  expect(test.read().calls.some((args) => args.includes("--draft=false"))).toBe(false);
});

it("does not replace a release already public", () => {
  const test = fixture();
  expect(test.run("prepare").status).toBe(0);
  expect(test.run("publish").status).toBe(0);
  const count = mutations(test.read()).length;
  expect(test.run("prepare").status).toBe(1);
  expect(test.run("publish").status).toBe(1);
  expect(mutations(test.read())).toHaveLength(count);
}, 15_000);

// @verifies-requirement HALL-TR-DST-030
it.each(["red", "pending", "absent", "other", "skipped", "missing-job", "missing-lane", "truncated", "older-green"])(
  "never promotes an existing draft when the latest exact gate is %s",
  (mode) => {
    const test = fixture();
    expect(test.run("prepare").status).toBe(0);
    const count = mutations(test.read()).length;
    test.change({ mode });
    expect(test.run("publish").status).toBe(1);
    expect(test.read().release.draft).toBe(true);
    expect(mutations(test.read())).toHaveLength(count);
  },
  15_000,
);

// @verifies-requirement HALL-TR-DST-030
it("routes workflow and operator publication through the shared executable guard", () => {
  const workflow = readFileSync(".github/workflows/release.yml", "utf8");
  const operator = readFileSync("docs/distribution.md", "utf8");
  expect(workflow).toContain("node scripts/distribution/release-publication.mjs prepare");
  expect(workflow).toContain("actions: read");
  expect(workflow).toContain("contents: write");
  expect(workflow).not.toMatch(/gh release (?:create|upload|edit)/);
  expect(workflow).not.toContain("workflow_dispatch");
  expect(operator).toContain("node scripts/distribution/release-publication.mjs publish");
  expect(operator).toContain("not technically intercepted");
});
