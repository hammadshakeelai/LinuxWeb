import helpText from "../image/rootfs/usr/local/share/linuxweb/help.txt?raw";
import { MemoryError, browserVmOptions, startVm, type Vm } from "./emulator.ts";
import { HomeSync, type HomeStatus } from "./home.ts";
import { NetworkMonitor, readSavedRelay, relayUrl, writeSavedRelay } from "./network.ts";
import { PackagesWatcher } from "./packages-status.ts";
import { POLL_INTERVAL_MS } from "./protocol.ts";
import { MachineSaves } from "./saves.ts";
import { Store } from "./storage.ts";
import { acquireSaveLock } from "./tab-lock.ts";
import { SizeReporter, createTerminal } from "./terminal.ts";
import { showDialog, showMessage } from "./ui/dialogs.ts";
import { openNetworkDialog } from "./ui/network-dialog.ts";
import { networkButtonLabel } from "./ui/network-text.ts";
import { openSavesDialog } from "./ui/saves-dialog.ts";
import { statusLine } from "./ui/status.ts";
import "./ui/theme.css";
import { createTouchKeys } from "./ui/touch-keys.ts";
import { createWindow, type WindowView } from "./ui/window.ts";
import { welcomeText } from "./welcome.ts";

const savingOff = () => showMessage("LinuxWeb", "Saving is off in this browser");

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

async function loadImageVersion(base: string): Promise<string | null> {
  try {
    const response = await fetch(`${base}image/version.txt`);
    if (!response.ok) return null;
    return (await response.text()).trim() || null;
  } catch {
    return null;
  }
}

async function boot(view: WindowView, relay: string | null): Promise<Vm | null> {
  for (;;) {
    view.showBoot("Starting Linux…");
    try {
      const vm = await startVm(browserVmOptions(import.meta.env.BASE_URL, relay), {
        onProgress: (loaded, total) => view.setProgress(loaded, total),
      });
      view.hideBoot();
      return vm;
    } catch (error) {
      view.hideBoot();
      if (error instanceof MemoryError) {
        await showMessage("LinuxWeb", error.message);
        return null;
      }
      await showDialog("LinuxWeb", "Couldn't download Linux. Check your connection.", [
        { label: "Retry", value: "retry", primary: true },
      ]);
    }
  }
}

async function main() {
  const app = document.querySelector<HTMLElement>("#app")!;
  if (typeof WebAssembly !== "object") {
    app.textContent =
      "LinuxWeb needs WebAssembly, which this browser doesn't support. Try a current version of Chrome, Edge, Firefox, or Safari.";
    return;
  }

  const view = createWindow(app);
  const terminal = createTerminal(view.terminalHost);
  let vm: Vm | undefined;
  const touchKeys = createTouchKeys((data) => vm?.sendSerial(data));
  view.appendTouchKeys(touchKeys);

  const packages = new PackagesWatcher({
    readFile: (path) => (vm ? vm.readFile(path) : Promise.reject(new Error("Linux has not started"))),
  });
  let homeStatus: HomeStatus = { kind: "starting" };
  const renderStatus = () => {
    view.status.textContent = statusLine(packages.text(), homeStatus, Date.now());
  };
  const setStatus = (status: HomeStatus) => {
    homeStatus = status;
    renderStatus();
  };
  setInterval(renderStatus, 1000);

  const storage = browserStorage();
  const savedRelay = readSavedRelay(storage);
  const relay = relayUrl(savedRelay, import.meta.env.VITE_RELAY_URL);
  const imageVersion = loadImageVersion(import.meta.env.BASE_URL);

  let store: Store | undefined;
  try {
    store = await Store.open();
  } catch {
    setStatus({ kind: "off" });
  }

  const booted = await boot(view, relay);
  if (!booted) return;
  vm = booted;
  const running = booted;

  let pending: number[] = [];
  running.onSerialByte((byte) => {
    if (pending.length === 0) {
      requestAnimationFrame(() => {
        terminal.writeBytes(Uint8Array.from(pending));
        pending = [];
      });
    }
    pending.push(byte);
  });
  terminal.onInput((data) => running.sendSerial(touchKeys.transformInput(data)));

  const monitor = new NetworkMonitor({
    relay,
    writeGuest: (path, data) => running.createFile(path, data),
    onChange: (state) => {
      view.buttons.network.textContent = networkButtonLabel(state);
    },
  });
  // Probe while the home folder restores; tell the guest only after the restore.
  const firstCheck = monitor.check();

  let home: HomeSync | undefined;
  let restored: number | null = null;
  if (store && (await acquireSaveLock())) {
    home = new HomeSync({ vm: running, store, onStatus: setStatus });
    try {
      restored = await home.restore();
    } catch {
      restored = null;
    }
    home.start();
  } else if (store) {
    setStatus({ kind: "paused-other-tab" });
  }

  const network = await firstCheck;
  try {
    await monitor.publish(network);
  } catch {
    // The next check writes the state again.
  }
  monitor.start();

  terminal.writeText(welcomeText(restored, network === "online" ? "online" : "offline"));
  running.sendSerial("\n");

  setInterval(() => {
    packages.pollOnce().then(renderStatus, () => {});
  }, POLL_INTERVAL_MS);

  const reporter = new SizeReporter((path, data) => running.createFile(path, data));
  const refit = () => {
    const { rows, cols } = terminal.fit();
    reporter.report(rows, cols);
  };
  new ResizeObserver(refit).observe(view.terminalHost);
  refit();
  terminal.focus();

  const saves = store ? new MachineSaves({ vm: running, store, imageVersion: await imageVersion }) : undefined;

  view.buttons.save.addEventListener("click", async () => {
    if (!saves) return savingOff();
    view.buttons.save.disabled = true;
    try {
      const saved = await saves.save();
      await showMessage("Save machine", `Saved "${saved.name}".`);
    } catch (error) {
      await showMessage("Save machine", error instanceof Error ? error.message : String(error));
    } finally {
      view.buttons.save.disabled = false;
      terminal.focus();
    }
  });

  view.buttons.saves.addEventListener("click", async () => {
    if (!saves) return savingOff();
    await openSavesDialog(saves, () => {
      terminal.writeText("\r\nRestored the saved machine.\r\n");
      running.sendSerial("\n");
    });
    terminal.focus();
  });

  view.buttons.reset.addEventListener("click", async () => {
    const choice = await showDialog("Reset", "Start a fresh machine from the original snapshot?", [
      { label: "Cancel", value: "cancel" },
      { label: "Reset and clear home folder", value: "clear" },
      { label: "Reset, keep home folder", value: "keep", primary: true },
    ]);
    if (choice === "clear") {
      home?.stop();
      await store?.clearHome();
    }
    if (choice === "keep" || choice === "clear") location.reload();
    else terminal.focus();
  });

  view.buttons.network.addEventListener("click", async () => {
    const state = await monitor.refresh().catch(() => monitor.state);
    await openNetworkDialog({
      state,
      relay,
      saved: savedRelay,
      save: async (url) => {
        writeSavedRelay(storage, url);
        await home?.flush();
        location.reload();
      },
    });
    terminal.focus();
  });

  // iPhone Safari has no element full screen; hide the button instead of letting it do nothing.
  view.buttons.fullscreen.hidden = !document.fullscreenEnabled;
  view.buttons.fullscreen.addEventListener("click", () => {
    view.root.requestFullscreen().catch(() => showMessage("Full screen", "This browser didn't allow full screen."));
  });
  view.buttons.exitFullscreen.addEventListener("click", () => {
    document.exitFullscreen().catch(() => {});
  });

  view.buttons.help.addEventListener("click", async () => {
    const pre = document.createElement("pre");
    pre.className = "help-text";
    pre.textContent = helpText;
    await showDialog("Help", pre, [{ label: "OK", value: "ok", primary: true }]);
    terminal.focus();
  });
}

void main();
