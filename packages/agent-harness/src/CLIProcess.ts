import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

export type CLIProcessStatus = "idle" | "starting" | "running" | "exited" | "error";

export interface CLIProcessOptions {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface CLIProcessEvents {
  stdout: [chunk: string];
  stderr: [chunk: string];
  exit: [code: number | null, signal: NodeJS.Signals | null];
  error: [error: Error];
}

export class CLIProcess extends EventEmitter<CLIProcessEvents> {
  readonly #options: CLIProcessOptions;
  #child: ChildProcessWithoutNullStreams | null = null;
  #status: CLIProcessStatus = "idle";

  constructor(options: CLIProcessOptions) {
    super();
    this.#options = options;
  }

  get status(): CLIProcessStatus {
    return this.#status;
  }

  start(): void {
    if (this.#child !== null) {
      return;
    }
    this.#status = "starting";
    const child = spawn(this.#options.command, this.#options.args ?? [], {
      cwd: this.#options.cwd,
      env: {
        ...process.env,
        ...this.#options.env,
      },
      stdio: "pipe",
      windowsHide: true,
    });
    this.#child = child;
    this.#status = "running";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.emit("stdout", chunk));
    child.stderr.on("data", (chunk: string) => this.emit("stderr", chunk));
    child.on("error", (error) => {
      this.#status = "error";
      this.emit("error", error);
    });
    child.on("exit", (code, signal) => {
      this.#status = code === 0 ? "exited" : "error";
      this.#child = null;
      this.emit("exit", code, signal);
    });
  }

  write(input: string): void {
    if (this.#child === null || this.#child.stdin.destroyed) {
      throw new Error("Cannot write to a CLI process that is not running.");
    }
    this.#child.stdin.write(input);
  }

  endInput(): void {
    if (this.#child === null || this.#child.stdin.destroyed) {
      return;
    }
    this.#child.stdin.end();
  }

  stop(signal: NodeJS.Signals = "SIGTERM"): void {
    if (this.#child === null) {
      return;
    }
    this.#child.kill(signal);
  }

  waitForExit(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    if (this.#child === null) {
      return Promise.resolve({ code: 0, signal: null });
    }
    return new Promise((resolve, reject) => {
      this.once("exit", (code, signal) => resolve({ code, signal }));
      this.once("error", reject);
    });
  }
}
