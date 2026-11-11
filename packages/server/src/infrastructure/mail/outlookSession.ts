import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  type EmailPayload,
  type EmailTransportResult,
  emailTransportResultSchema,
} from "../../services/emailTransport.js";

const execute = promisify(execFile);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const encodeScript = (script: string) => Buffer.from(script, "utf16le").toString("base64");

export function outlookWorkerPath(moduleUrl: string): string {
  const extension = moduleUrl.endsWith(".ts") ? "ts" : moduleUrl.endsWith(".mjs") ? "mjs" : "js";
  return fileURLToPath(new URL(`./outlookWorker.${extension}`, moduleUrl));
}

export function outlookTaskCleanup(taskName: string): string {
  return `$task = Get-ScheduledTask -TaskName ${literal(taskName)} -ErrorAction SilentlyContinue
if ($task) { Stop-ScheduledTask -TaskName ${literal(taskName)} -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName ${literal(taskName)} -Confirm:$false }`;
}

/** Windows starts only this request in the logged-on session of Hall's Windows account. */
export function outlookSessionScript(
  directory: string,
  taskName: string,
  workerPath: string,
  nodePath: string,
  timeoutMs: number,
): string {
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
$directory = ${literal(directory)}
$taskName = ${literal(taskName)}
$started = $false
try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($identity.User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $directory -AclObject $acl
  [IO.File]::WriteAllText((Join-Path $directory 'request.json'), [Console]::In.ReadToEnd(), (New-Object Text.UTF8Encoding($false)))
  $arguments = ${literal(`${workerPath.endsWith(".ts") ? "--import tsx " : ""}"${workerPath}" "${join(directory, "request.json")}"`)}
  $action = New-ScheduledTaskAction -Execute ${literal(nodePath)} -Argument $arguments -WorkingDirectory $directory
  $principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds ${Math.ceil(timeoutMs / 1000) + 5}) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings | Out-Null
  $started = $true
  Start-ScheduledTask -TaskName $taskName
  $deadline = (Get-Date).AddMilliseconds(${timeoutMs})
  $result = Join-Path $directory 'result.json'
  while ((Get-Date) -lt $deadline -and -not (Test-Path -LiteralPath $result)) {
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    if ($info.LastTaskResult -eq 2147943712) { throw 'outlook_interactive_session_unavailable' }
    Start-Sleep -Milliseconds 100
  }
  if (Test-Path -LiteralPath $result) { [IO.File]::ReadAllText($result, [Text.Encoding]::UTF8) }
  else { '{"status":"unknown","code":"outlook_worker_interrupted"}' }
} catch {
  if ($_.Exception.Message -eq 'outlook_interactive_session_unavailable') { '{"status":"failed","code":"outlook_interactive_session_unavailable"}' }
  elseif ($started) { '{"status":"unknown","code":"outlook_worker_interrupted"}' }
  else { '{"status":"failed","code":"outlook_session_unavailable"}' }
} finally {
  ${outlookTaskCleanup(taskName)}
}`;
}

// @implements-requirement HALL-FR-EML-070
export async function submitInOutlookSession(payload: EmailPayload, timeoutMs: number): Promise<EmailTransportResult> {
  let directory: string;
  try {
    directory = await mkdtemp(join(tmpdir(), "hall-outlook-request-"));
  } catch {
    return { status: "failed", code: "outlook_unavailable" };
  }
  const taskName = `Hall-Outlook-${directory.split(/[\\/]/).at(-1)}`;
  let launched = false;
  try {
    const request = JSON.stringify({
      deadline: Date.now() + timeoutMs,
      payload: {
        ...payload,
        attachments: payload.attachments.map((file) => ({
          fileName: file.fileName,
          content: Buffer.from(file.content).toString("base64"),
        })),
      },
    });
    const script = outlookSessionScript(
      directory,
      taskName,
      outlookWorkerPath(import.meta.url),
      process.execPath,
      timeoutMs,
    );
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodeScript(script)],
      { windowsHide: true, timeout: timeoutMs + 15_000, maxBuffer: 1_048_576 },
    );
    launched = true;
    const outcome = new Promise<EmailTransportResult>((resolve) => {
      let stdout = "";
      child.stdout?.on("data", (chunk: string | Buffer) => {
        stdout += chunk.toString();
      });
      child.once("error", () => resolve({ status: "unknown", code: "outlook_worker_interrupted" }));
      child.once("close", () => {
        try {
          const result = emailTransportResultSchema.safeParse(JSON.parse(stdout.trim()));
          resolve(result.success ? result.data : { status: "unknown", code: "outlook_worker_interrupted" });
        } catch {
          resolve({ status: "unknown", code: "outlook_worker_interrupted" });
        }
      });
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(request);
    return await outcome;
  } catch {
    return launched
      ? { status: "unknown", code: "outlook_worker_interrupted" }
      : { status: "failed", code: "outlook_unavailable" };
  } finally {
    await execute(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodeScript(outlookTaskCleanup(taskName))],
      { windowsHide: true, timeout: 10_000 },
    ).catch(() => undefined);
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
