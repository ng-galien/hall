import { readFile, realpath } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
const [mode, input = ""] = process.argv.slice(2);
const root = await realpath(process.cwd());
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function local(path) {
  const full = await realpath(resolve(root, path));
  if (relative(root, full).startsWith("..")) throw new Error("Source outside Hall");
  return readFile(full, "utf8");
}
function run(exe,args,trim=true) {
  const r=spawnSync(exe,args,{cwd:root,encoding:"utf8",timeout:10000});
  if(r.status!==0) throw new Error("Technical observation unavailable: "+exe);
  return trim?r.stdout.trim():r.stdout;
}
async function maket(name,args,allowMissing=false) {
  const response=await fetch("http://127.0.0.1:24843/mcp",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}}),signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error("Maket HTTP "+response.status);
  const raw=await response.text();const events=raw.split(/\r?\n/).filter(l=>l.startsWith("data:"));
  const p=events.length?JSON.parse(events.at(-1).slice(5).trim()):JSON.parse(raw);
  const text=p.result?.content?.filter(c=>c.type==="text").map(c=>c.text).join("\n");
  if(allowMissing && p.result?.isError && /has no state|not found|does not exist/i.test(text??"")) return null;
  if(p.error||p.result?.isError||typeof text!=="string") throw new Error("Maket refused "+name);
  return text;
}
function validateFraming(f) {
  if(!f || typeof f.documentName!=="string" || !f.documentName.trim()) throw new Error("Document name missing");
  for(const field of ["request","initialScope"]) {
    if(typeof f[field]?.text!=="string"||!f[field].text.trim()||typeof f[field].sourceRef!=="string"||!f[field].sourceRef.trim()) throw new Error("Sourced "+field+" missing");
  }
  if(!Array.isArray(f.decisions)||!Array.isArray(f.proposals)||!Array.isArray(f.unknowns)) throw new Error("Decisions, proposals and unknowns must be explicit arrays");
  for(const d of f.decisions) if(d.author!=="the user"||!d.text?.trim()||!d.sourceRef?.trim()) throw new Error("Decision must cite the user");
  for(const p of f.proposals) if(!p.text?.trim()||!p.sourceRef?.trim()) throw new Error("Proposal must have separate provenance");
  for(const u of f.unknowns) if(typeof u!=="string"||!u.trim()) throw new Error("Empty unknown");
  for(const key of ["ui","sirenRights","postgresql","schemaChange"]) {
    const d=f.domains?.[key];
    if(!d||!["concerned","uncertain","outside"].includes(d.assessment)||!d.consequences?.trim()) throw new Error("Missing broad domain "+key);
  }
}
async function devIdentity() {
  // No process environment, runtime config, credentials or business rows are read.
  const pane=Number(run("tmux",["-L","hall-mairie","display-message","-p","-t","hall-dev:0.0","#{pane_pid}"]));
  const pids=run("lsof",["-nP","-iTCP:3100","-sTCP:LISTEN","-t"]).split(/\s+/);
  if(pids.length!==1) throw new Error("Ambiguous API PID");
  const pid=Number(pids[0]);let ancestor=pid;
  for(let i=0;i<20&&ancestor!==pane&&ancestor>1;i++) ancestor=Number(run("ps",["-o","ppid=","-p",String(ancestor)]));
  if(ancestor!==pane) throw new Error("API is not attached to the shared Hall session");
  const cwd=run("lsof",["-a","-p",String(pid),"-d","cwd","-Fn"]).split("\n").find(l=>l.startsWith("n"))?.slice(1);
  if(!cwd || (cwd!==root&&!cwd.startsWith(root+"/"))) throw new Error("API checkout not identified");
  const published=run("docker",["compose","port","postgres","5432"]);
  if(published!=="127.0.0.1:54329") throw new Error("Development PostgreSQL endpoint not identified");
  const sockets=run("lsof",["-nP","-a","-p",String(pid),"-iTCP","-sTCP:ESTABLISHED","-Fn"]);
  const ports=[...sockets.matchAll(/n127\.0\.0\.1:(\d+)->127\.0\.0\.1:54329/g)].map(m=>Number(m[1]));
  if(!ports.length) throw new Error("No observed API connection to development PostgreSQL");
  const rows=run("docker",["compose","exec","-T","postgres","psql","-X","-A","-t","-U","hall","-d","hall","-c","SELECT json_build_object('database',current_database(),'ports',coalesce(json_agg(client_port) FILTER (WHERE client_port IS NOT NULL),'[]'::json)) FROM pg_stat_activity WHERE datname=current_database();"]);
  const db=JSON.parse(rows);
  if(db.database!=="hall"||!ports.some(p=>db.ports.includes(p))) throw new Error("API socket cannot be linked to development database hall; do not infer identity from HTTP health");
  return {environment:"development",session:"hall-dev",apiPid:pid,checkout:cwd,database:"hall",endpoint:"127.0.0.1:54329",matchedPorts:ports.filter(p=>db.ports.includes(p)),startCommand:"npm run dev:session",statusCommand:"npm run dev:status"};
}
try {
  if(mode==="git") {
    const status=run("git",["--no-optional-locks","status","--porcelain=v1","-z","--untracked-files=all"],false);
    const records=status.split("\0").filter(Boolean);const changes=[];
    for(let i=0;i<records.length;i++){const r=records[i];const change={index:r[0],workingTree:r[1],path:r.slice(3)};if(/[RC]/.test(r.slice(0,2))) change.previousPath=records[++i];changes.push(change);}
    console.log(JSON.stringify({state:status?"dirty":"clean",changes,next:status?"Present pending changes to the user, ask what to do, and stop dependent work without automatic commit, stash or cleanup":"Continue the bootstrap"}));
    if(status) process.exitCode=1;
  } else if(mode==="target") console.log(JSON.stringify(await devIdentity()));
  else if(mode==="ready") {
    const target=await devIdentity();
    const status=run("npm",["run","dev:status"]);
    if(!status.includes("tmux=active health=ready")) throw new Error("Shared runtime is not operational");
    console.log(JSON.stringify({target,status:"tmux=active health=ready",meaning:"API and client ready; no application test or PDF capability certified"}));
  } else if(mode==="framing") {
    const f=JSON.parse(await local(input));validateFraming(f);
    console.log(JSON.stringify({framing:f,framingDigest:digest(f),source:input}));
  } else if(mode==="project") {
    const snapshot=JSON.parse(input);validateFraming(snapshot.framing);
    const f=snapshot.framing;if(digest(f)!==snapshot.framingDigest) throw new Error("Framing snapshot mismatch");
    const doc=f.documentName;
    // Never adopt or overwrite an unrelated document.
    const priorRaw=await maket("maket_state",{action:"get",doc},true);
    const before=priorRaw?JSON.parse(priorRaw).current:null;
    if(before && before.data.bootstrapKind!=="hall-coordination") throw new Error("Existing document is not this bootstrap support");
    if(!before) await maket("maket_doc",{action:"new",doc,format:"DESKTOP",orientation:"landscape",category:"Hall/Coordination"});
    const string={type:"string"};
    const schema={type:"object",required:["bootstrapKind","framingDigest","request","scope","decisions","proposals","unknowns","domains","decision"],properties:{
      bootstrapKind:string,framingDigest:string,request:{type:"object",properties:{text:string,sourceRef:string},required:["text","sourceRef"]},scope:{type:"object",properties:{text:string,sourceRef:string},required:["text","sourceRef"]},
      decisions:{type:"array",items:{type:"object",properties:{text:string,sourceRef:string},required:["text","sourceRef"]}},proposals:{type:"array",items:{type:"object",properties:{text:string,sourceRef:string},required:["text","sourceRef"]}},unknowns:{type:"array",items:string},
      domains:{type:"array",items:{type:"object",properties:{name:string,assessment:string,consequences:string},required:["name","assessment","consequences"]}},
      decision:{type:"object",properties:{choice:{type:"string",enum:["pending","yes","no"]},framingDigest:string},required:["choice","framingDigest"]}
    }};
    const projected={bootstrapKind:"hall-coordination",framingDigest:snapshot.framingDigest,request:f.request,scope:f.initialScope,decisions:f.decisions,proposals:f.proposals,unknowns:f.unknowns,domains:Object.entries(f.domains).map(([name,d])=>({name,...d}))};
    const same=before?.data.framingDigest===snapshot.framingDigest;
    const decision=same?before.data.decision:{choice:"pending",framingDigest:snapshot.framingDigest};
    const data={...projected,decision};
    if(before) await maket("maket_state",{action:"patch",doc,expected_revision:before.revision,patch:Object.entries(data).map(([key,value])=>({op:"add",path:"/"+key,value}))});
    else await maket("maket_state",{action:"init",doc,schema,data});
    const template=await local(".trust/drafts/hall-bootstrap/framing.html");
    await maket("maket_html",{action:"set",doc,page:1,html:template});
    const after=JSON.parse(await maket("maket_state",{action:"get",doc})).current;
    for(const [key,value] of Object.entries(data)) if(!isDeepStrictEqual(after.data[key],value)) throw new Error("Saved projection mismatch");
    if(after.revision!==(before?.revision??0)+1) throw new Error("Saved revision mismatch");
    const layout=await maket("maket_html",{action:"check",doc,page:1});
    if(!layout.includes("Layout OK")) throw new Error("Framing layout requires review");
    console.log(JSON.stringify({documentName:doc,framingDigest:snapshot.framingDigest,revision:after.revision,projected,meaning:"First framing structurally present and reread; not an exhaustive feature definition"}));
  } else if(mode==="gate") {
    const expected=JSON.parse(input);
    const current=JSON.parse(await maket("maket_state",{action:"get",doc:expected.documentName})).current;
    for(const [key,value] of Object.entries(expected.projected)) if(!isDeepStrictEqual(current.data[key],value)) throw new Error("Presented framing changed; reproject and review");
    if(current.revision<expected.revision || current.data.decision.framingDigest!==expected.framingDigest) throw new Error("Decision is not associated with this framing");
    const decision=current.data.decision.choice;
    if(decision!=="yes") throw new Error(decision==="no"?"the user declined feature start":"Await the user's feature-start decision");
    const target=await devIdentity();
    if(!run("npm",["run","dev:status"]).includes("tmux=active health=ready")) throw new Error("Development runtime no longer ready");
    console.log(JSON.stringify({decision:"yes",documentName:expected.documentName,framingDigest:expected.framingDigest,revision:current.revision,target,permission:"Start feature procedure within reviewed initial framing only; no unspecified model change, migration, implementation, commit or production authority"}));
  } else throw new Error("Unknown bootstrap action");
} catch(error) { console.log(JSON.stringify({reason:String(error)}));process.exitCode=1; }
