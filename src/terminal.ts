import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { TERMINAL_SIZE } from "./protocol.ts";

export interface TerminalView {
  fit(): { rows: number; cols: number };
  writeBytes(bytes: Uint8Array): void;
  writeText(text: string): void;
  onInput(listener: (data: string) => void): void;
  focus(): void;
}

export function createTerminal(container: HTMLElement): TerminalView {
  const term = new Terminal({
    fontFamily: '"Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace',
    fontSize: 15,
    cursorBlink: true,
    scrollback: 5000,
    theme: { background: "#101010", foreground: "#d6d6d6", cursor: "#d6d6d6" },
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);

  // Ctrl+Shift+C / Ctrl+Shift+V copy and paste; plain Ctrl+C still reaches Linux.
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown" || !event.ctrlKey || !event.shiftKey) return true;
    if (event.code === "KeyC") {
      const selection = term.getSelection();
      if (selection) void navigator.clipboard.writeText(selection);
      return false;
    }
    if (event.code === "KeyV") {
      void navigator.clipboard.readText().then((text) => term.paste(text));
      return false;
    }
    return true;
  });

  return {
    fit: () => {
      fitAddon.fit();
      return { rows: term.rows, cols: term.cols };
    },
    writeBytes: (bytes) => term.write(bytes),
    writeText: (text) => term.write(text),
    onInput: (listener) => {
      term.onData(listener);
    },
    focus: () => term.focus(),
  };
}

// Tells the LinuxWeb helper the terminal size, at most once per burst of resizes.
export class SizeReporter {
  private readonly write: (path: string, data: Uint8Array) => Promise<void>;
  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private last = "";

  constructor(write: (path: string, data: Uint8Array) => Promise<void>, delayMs = 300) {
    this.write = write;
    this.delayMs = delayMs;
  }

  report(rows: number, cols: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const value = `${rows} ${cols}`;
      if (value === this.last) return;
      this.last = value;
      this.write(TERMINAL_SIZE, new TextEncoder().encode(value)).catch(() => {
        this.last = "";
      });
    }, this.delayMs);
  }
}
