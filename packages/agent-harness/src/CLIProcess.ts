import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

export interface CLIProcessOptions {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly label?: string;
}

export interface CLIProcessEvents {
  stdout: [chunk: string];
  stderr: [chunk: string];
  exit: [code: number | null, signal: NodeJS.Signals | null];
  error: [error: Error];
}

type Listener<K extends keyof CLIProcessEvents> = (...args: CLIProcessEvents[K]) => void;

export class CLIProcess {
  readonly #options: CLIProcessOptions;
  readonly #events = new EventEmitter();
  #child: ChildProcessWithoutNullStreams | null = null;

  constructor(options: CLIProcessOptions) {
    this.#options = options;
  }

  get label(): string {
    return this.#options.label ?? this.#options.command;
  }

  get running(): boolean {
    return this.#child !== null && this.#child.exitCode === null;
  }

  on<K extends keyof CLIProcessEvents>(event: K, listener: Listener<K>): () => void {
    this.#events.on(event, listener);
    return () => this.#events.off(event, listener);
  }

  start(): void {
    if (this.running) {
      return;
    }

    const child = spawn(this.#options.command, [...(this.#options.args ?? [])], {
      cwd: this.#options.cwd,
      env: { ...process.env, ...this.#options.env },
      stdio: "pipe",
      windowsHide: true,
    });
    this.#child = child;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.#events.emit("stdout", chunk));
    child.stderr.on("data", (chunk: string) => this.#events.emit("stderr", chunk));
    child.on("error", (error) => this.#events.emit("error", error));
    child.on("exit", (code, signal) => {
      this.#child = null;
      this.#events.emit("exit", code, signal);
    });
  }

  write(input: string): void {
    if (!this.running || this.#child === null) {
      throw new Error(`Cannot write to stopped CLI process '${this.label}'.`);
    }
    this.#child.stdin.write(input);
  }

  endInput(): void {
    if (this.#child && !this.#child.stdin.destroyed) {
      this.#child.stdin.end();
    }
  }

  stop(signal: NodeJS.Signals = "SIGTERM"): void {
    if (!this.running || this.#child === null) {
      return;
    }
    this.#child.kill(signal);
  }
}
