import { createRequire } from "node:module";
import type { OutlookApplication, OutlookComBinding } from "./outlookCom.js";

type Command = { operation: string; handle?: number; member?: string; arguments?: unknown[] };
type Invoke = (command: Command, synchronous: true) => unknown;

// All COM references stay on one STA thread, including account selection and release.
// The .NET Framework supplied by Windows is used in-process; there is no C# service.
export const outlookBridgeSource = `
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
public class Startup {
 class Work { public IDictionary<string,object> Input; public object Result; public Exception Error; public ManualResetEvent Done = new ManualResetEvent(false); }
 readonly BlockingCollection<Work> queue = new BlockingCollection<Work>();
 readonly Dictionary<int,object> objects = new Dictionary<int,object>();
 int nextId = 0;
 public Startup() {
  var thread = new Thread(() => {
   foreach(var work in queue.GetConsumingEnumerable()) {
    try { work.Result = Execute(work.Input); } catch(Exception error) { work.Error = error; }
    finally { work.Done.Set(); }
   }
  });
  thread.IsBackground = true; thread.SetApartmentState(ApartmentState.STA); thread.Start();
 }
 object Decode(object value) {
  var reference = value as IDictionary<string,object>;
  return reference != null && reference.ContainsKey("comHandle") ? objects[Convert.ToInt32(reference["comHandle"])] : value;
 }
 object Encode(object value) {
  if(value == null || !Marshal.IsComObject(value)) return value;
  var id = ++nextId; objects.Add(id,value); return new {comHandle=id};
 }
 object Execute(IDictionary<string,object> input) {
  var operation = (string)input["operation"];
  if(operation == "connect") {
   if(System.Diagnostics.Process.GetCurrentProcess().SessionId == 0) throw new InvalidOperationException("outlook_interactive_session_required");
   return Encode(Activator.CreateInstance(Type.GetTypeFromProgID("Outlook.Application",true)));
  }
  int handle = Convert.ToInt32(input["handle"]);
  var target = objects[handle];
  if(operation == "release") { objects.Remove(handle); Marshal.ReleaseComObject(target); return null; }
  var member = (string)input["member"];
  var arguments = input.ContainsKey("arguments") ? (object[])input["arguments"] : new object[0];
  for(int i=0;i<arguments.Length;i++) arguments[i]=Decode(arguments[i]);
  BindingFlags flags;
  switch(operation) {
   case "get": flags=BindingFlags.GetProperty; break;
   case "set": flags=BindingFlags.SetProperty; break;
   case "call": flags=BindingFlags.InvokeMethod | BindingFlags.OptionalParamBinding; break;
   default: throw new InvalidOperationException("Unknown COM operation");
  }
  return Encode(target.GetType().InvokeMember(member,flags,null,target,arguments));
 }
 public Task<object> Invoke(object input) {
  var work = new Work {Input=(IDictionary<string,object>)input}; queue.Add(work); work.Done.WaitOne(); work.Done.Dispose();
  if(work.Error != null) throw work.Error;
  return Task.FromResult(work.Result);
 }
}`;

const methods = new Set(["Item", "CreateItem", "Add", "ResolveAll", "Send"]);

/** Adapts the narrow Outlook binding; recipients and message policy remain in outlookCom.ts. */
export function createEdgeComBinding(invoke: Invoke): OutlookComBinding {
  const handles = new WeakMap<object, number>();
  const encode = (value: unknown) => {
    const handle = value !== null && typeof value === "object" ? handles.get(value) : undefined;
    return handle === undefined ? value : { comHandle: handle };
  };
  const decode = (value: unknown): unknown => {
    if (value === null || typeof value !== "object" || !("comHandle" in value)) return value;
    const handle = value.comHandle;
    if (typeof handle !== "number" || !Number.isSafeInteger(handle) || handle <= 0)
      throw new Error("Invalid COM reference");
    const reference = new Proxy(
      {},
      {
        get(_target, member) {
          if (typeof member !== "string") return undefined;
          if (methods.has(member))
            return (...args: unknown[]) =>
              decode(invoke({ operation: "call", handle, member, arguments: args.map(encode) }, true));
          return decode(invoke({ operation: "get", handle, member }, true));
        },
        set(_target, member, input) {
          if (typeof member !== "string") return false;
          invoke({ operation: "set", handle, member, arguments: [encode(input)] }, true);
          return true;
        },
      },
    );
    handles.set(reference, handle);
    return reference;
  };
  return {
    connect: () => decode(invoke({ operation: "connect" }, true)) as OutlookApplication,
    release(...references) {
      for (const reference of references) {
        const handle = handles.get(reference);
        if (handle !== undefined) {
          handles.delete(reference);
          invoke({ operation: "release", handle }, true);
        }
      }
    },
  };
}

export function loadOutlookBinding(): OutlookComBinding {
  const require = createRequire(import.meta.url);
  const edge: { func(options: { source: string }): Invoke } = require("edge-js");
  return createEdgeComBinding(edge.func({ source: outlookBridgeSource }));
}
