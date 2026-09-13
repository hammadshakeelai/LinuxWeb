function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);

function button(label: string): HTMLButtonElement {
  const node = el("button", "bevel-button", label);
  node.type = "button";
  return node;
}

export interface WindowView {
  root: HTMLElement;
  terminalHost: HTMLElement;
  status: HTMLElement;
  buttons: Record<"save" | "saves" | "reset" | "fullscreen" | "network" | "help" | "exitFullscreen", HTMLButtonElement>;
  showBoot(message: string): void;
  setProgress(loadedBytes: number, totalBytes: number): void;
  hideBoot(): void;
  appendTouchKeys(row: HTMLElement): void;
}

export function createWindow(app: HTMLElement): WindowView {
  const root = el("main", "window");
  const titleBar = el("div", "title-bar", "LinuxWeb: Alpine Linux 3.21");
  const toolbar = el("div", "toolbar");
  const buttons = {
    save: button("Save machine"),
    saves: button("Saves"),
    reset: button("Reset"),
    fullscreen: button("Full screen"),
    network: button("Network: Offline"),
    help: button("Help"),
    exitFullscreen: button("Exit full screen"),
  };
  buttons.exitFullscreen.classList.add("exit-fullscreen");
  const status = el("span", "status");
  status.dataset.testid = "status";
  status.setAttribute("role", "status");
  toolbar.append(buttons.save, buttons.saves, buttons.reset, buttons.fullscreen, buttons.network, buttons.help, status);

  const screen = el("div", "screen");
  const terminalHost = el("div", "terminal");
  const boot = el("div", "boot");
  const bootMessage = el("div");
  const progress = el("div", "progress");
  const bar = el("div");
  const bootDetail = el("div");
  progress.append(bar);
  boot.append(bootMessage, progress, bootDetail);
  screen.append(terminalHost, boot, buttons.exitFullscreen);

  root.append(titleBar, toolbar, screen);
  app.replaceChildren(root);

  return {
    root,
    terminalHost,
    status,
    buttons,
    showBoot(message) {
      bootMessage.textContent = message;
      bar.style.width = "0";
      bootDetail.textContent = "";
      boot.hidden = false;
    },
    setProgress(loadedBytes, totalBytes) {
      bar.style.width = totalBytes > 0 ? `${Math.min(100, (loadedBytes / totalBytes) * 100)}%` : "0";
      bootDetail.textContent = `${megabytes(loadedBytes)} MB of ${megabytes(totalBytes)} MB`;
    },
    hideBoot() {
      boot.hidden = true;
    },
    appendTouchKeys(row) {
      root.append(row);
    },
  };
}
