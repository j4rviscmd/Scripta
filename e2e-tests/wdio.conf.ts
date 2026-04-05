import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const screenshotDir = path.resolve(__dirname, "screenshots");
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

let tauriWebdriverProcess: ChildProcess | null = null;
let viteDevServerProcess: ChildProcess | null = null;

/**
 * Spawns a child process with stdout/stderr pipes and logs all output with a label prefix.
 *
 * @param command - The command to execute.
 * @param args    - Arguments passed to the command.
 * @param label   - A short label used as a log prefix to identify the process.
 * @param options - Spawn options. Currently only `cwd` is supported.
 * @param options.cwd - The working directory for the spawned process.
 * @returns The spawned {@link ChildProcess}.
 */
function spawnWithLogging(
  command: string,
  args: string[],
  label: string,
  options: { cwd: string }
): ChildProcess {
  const proc = spawn(command, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", (data: Buffer) => {
    console.log(`[${label}] ${data.toString().trim()}`);
  });
  proc.stderr?.on("data", (data: Buffer) => {
    console.error(`[${label}] ${data.toString().trim()}`);
  });
  return proc;
}

/**
 * Returns a promise that resolves after the specified delay.
 *
 * @param ms - Duration in milliseconds to wait.
 */
const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * WebdriverIO configuration for Scripta Tauri E2E tests.
 *
 * Launches a Vite dev server and `tauri-webdriver` during the `onPrepare` hook,
 * then runs Mocha BDD specs against the debug Tauri application binary.
 * Both child processes are torn down in `onComplete`.
 */
export const config = {
  runner: "local" as const,
  specs: ["./test/**/*.e2e.ts"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: path.resolve(
          __dirname,
          "../src-tauri/target/debug/scripta"
        ),
      },
    },
  ],

  hostname: "localhost",
  port: 4444,
  path: "/",

  logLevel: "info" as const,
  framework: "mocha",
  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  async onPrepare() {
    // Vite dev server起動（debugビルドはdevUrlから読み込むため必須）
    console.log("Starting Vite dev server...");
    viteDevServerProcess = spawnWithLogging(
      "npm",
      ["run", "dev"],
      "vite",
      { cwd: projectRoot }
    );
    await wait(5000);

    // tauri-webdriver起動
    console.log("Starting tauri-webdriver on port 4444...");
    tauriWebdriverProcess = spawnWithLogging(
      "tauri-webdriver",
      ["--port", "4444"],
      "tauri-webdriver",
      { cwd: projectRoot }
    );
    await wait(2000);
  },

  async onComplete() {
    if (tauriWebdriverProcess) {
      console.log("Stopping tauri-webdriver...");
      tauriWebdriverProcess.kill("SIGTERM");
      tauriWebdriverProcess = null;
    }
    if (viteDevServerProcess) {
      console.log("Stopping Vite dev server...");
      viteDevServerProcess.kill("SIGTERM");
      viteDevServerProcess = null;
    }
  },
};
