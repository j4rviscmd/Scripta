/**
 * @file WebdriverIO configuration for Scripta Tauri E2E tests.
 *
 * Manages the lifecycle of a Vite dev server and `tauri-webdriver` process,
 * providing readiness polling (HTTP and TCP) before test execution begins.
 */

import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Directory path of the current module (ESM equivalent of `__dirname`). */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the Scripta project root. */
const projectRoot = path.resolve(__dirname, "..");

/** Directory where test-failure screenshots are stored. Created on startup if absent. */
const screenshotDir = path.resolve(__dirname, "screenshots");
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

/** Handle to the `tauri-webdriver` child process; set during {@link config.onPrepare}. */
let tauriWebdriverProcess: ChildProcess | null = null;

/** Handle to the Vite dev-server child process; set during {@link config.onPrepare}. */
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
 * Polls an HTTP endpoint until it responds with a 2xx status code.
 * Throws if the endpoint doesn't become ready within the timeout.
 *
 * @param url     - The URL to poll.
 * @param label   - A label for log messages.
 * @param timeout - Maximum time in ms to wait (default: 30000).
 * @param interval - Polling interval in ms (default: 500).
 */
async function waitForReady(
  url: string,
  label: string,
  timeout = 30_000,
  interval = 500
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        http
          .get(url, (res) => {
            res.resume();
            resolve(res.statusCode! >= 200 && res.statusCode! < 400);
          })
          .on("error", () => resolve(false));
      });
      if (ok) {
        console.log(`[${label}] Ready (${Date.now() - start}ms)`);
        return;
      }
    } catch {
      // ignore, retry
    }
    await wait(interval);
  }
  throw new Error(`[${label}] Not ready after ${timeout}ms (${url})`);
}

/**
 * Polls a TCP port until a connection can be established.
 * Useful for processes that listen on TCP but don't serve HTTP (e.g. tauri-webdriver).
 *
 * @param host    - Hostname to connect to.
 * @param port    - TCP port number.
 * @param label   - A label for log messages.
 * @param timeout - Maximum time in ms to wait (default: 15000).
 * @param interval - Polling interval in ms (default: 500).
 */
async function waitForTcpReady(
  host: string,
  port: number,
  label: string,
  timeout = 15_000,
  interval = 500
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(interval);
      socket
        .connect(port, host, () => {
          socket.destroy();
          resolve(true);
        })
        .on("error", () => {
          socket.destroy();
          resolve(false);
        })
        .on("timeout", () => {
          socket.destroy();
          resolve(false);
        });
    });
    if (connected) {
      console.log(`[${label}] Ready (${Date.now() - start}ms)`);
      return;
    }
    await wait(interval);
  }
  throw new Error(`[${label}] Not ready after ${timeout}ms (${host}:${port})`);
}

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

  /**
   * Starts the Vite dev server and `tauri-webdriver` before tests run.
   *
   * The Vite server is required because the debug Tauri build loads the
   * frontend from a dev URL. Both processes are polled for readiness —
   * Vite via HTTP, `tauri-webdriver` via TCP — before control is returned.
   */
  async onPrepare() {
    // Vite dev server起動（debugビルドはdevUrlから読み込むため必須）
    console.log("Starting Vite dev server...");
    viteDevServerProcess = spawnWithLogging(
      "npm",
      ["run", "dev"],
      "vite",
      { cwd: projectRoot }
    );
    await waitForReady("http://localhost:1420", "vite", 30_000);

    // tauri-webdriver起動
    console.log("Starting tauri-webdriver on port 4444...");
    tauriWebdriverProcess = spawnWithLogging(
      "tauri-webdriver",
      ["--port", "4444"],
      "tauri-webdriver",
      { cwd: projectRoot }
    );
    await waitForTcpReady("localhost", 4444, "tauri-webdriver", 15_000);
  },

  /**
   * Gracefully terminates the `tauri-webdriver` and Vite dev server
   * child processes after all tests have finished.
   */
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
