import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} ${args.join(" ")} failed: ${code}`)),
    );
  });
}

/**
 * Electron Forge maker that builds a macOS disk image with hdiutil: the application next to a link to
 * the Applications folder, so that it is installed by dragging it there.
 */
export default class MakerDmg {
  name = "dmg";
  defaultPlatforms = ["darwin"];
  requiredExternalBinaries = ["hdiutil", "ditto"];

  constructor(configOrConfigFetcher = {}, platformsToMakeOn) {
    this.configOrConfigFetcher = configOrConfigFetcher;
    this.platformsToMakeOn = platformsToMakeOn;
    Object.defineProperty(this, "__isElectronForgeMaker", { value: true, enumerable: false, configurable: false });
  }

  get platforms() {
    return this.platformsToMakeOn ?? this.defaultPlatforms;
  }

  isSupportedOnCurrentPlatform() {
    return process.platform === "darwin";
  }

  ensureExternalBinariesExist() {
    if (process.platform !== "darwin") throw new Error(`Cannot make for ${this.name}: hdiutil requires macOS`);
  }

  clone() {
    return new MakerDmg(this.configOrConfigFetcher, this.platformsToMakeOn);
  }

  async prepareConfig(targetArch) {
    this.config =
      typeof this.configOrConfigFetcher === "function"
        ? await this.configOrConfigFetcher(targetArch)
        : this.configOrConfigFetcher;
  }

  async make({ dir, makeDir, appName, packageJSON, targetArch, targetPlatform }) {
    const volumeName = this.config?.volumeName ?? appName;
    const imagePath = resolve(
      makeDir,
      "dmg",
      targetPlatform,
      targetArch,
      `${appName}-${packageJSON.version}-${targetArch}.dmg`,
    );
    await rm(imagePath, { force: true });
    await mkdir(resolve(imagePath, ".."), { recursive: true });
    const staging = await mkdtemp(join(tmpdir(), "hall-dmg-"));
    try {
      await run("ditto", [join(dir, `${appName}.app`), join(staging, `${appName}.app`)]);
      await symlink("/Applications", join(staging, "Applications"));
      await run("hdiutil", [
        "create",
        "-volname",
        volumeName,
        "-srcfolder",
        staging,
        "-fs",
        "HFS+",
        "-format",
        "UDZO",
        "-ov",
        imagePath,
      ]);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return [imagePath];
  }
}
