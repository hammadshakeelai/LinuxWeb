import helpText from "../image/rootfs/usr/local/share/linuxweb/help.txt?raw";
import { browserVmOptions, startVm, type Vm } from "./emulator.ts";
import { HomeSync, type HomeStatus } from "./home.ts";
import { MachineSaves } from "./saves.ts";
import { Store } from "./storage.ts";
import { acquireSaveLock } from "./tab-lock.ts";
import { SizeReporter, createTerminal } from "./terminal.ts";
import { showDialog, showMessage } from "./ui/dialogs.ts";
import { openSavesDialog } from "./ui/saves-dialog.ts";
import { statusText } from "./ui/status.ts";
import "./ui/theme.css";
import { createTouchKeys } from "./ui/touch-keys.ts";
import { createWindow, type WindowView } from "./ui/window.ts";
import { welcomeText } from "./welcome.ts";

const savingOff = () => showMessage("LinuxWeb", "Saving is off in this browser");

async function boot(view: WindowView): Promise<Vm> {
  for (;;) {
    view.showBoot("Starting Linux…");
    try {
      const vm = await startVm(browserVmOptions(import.meta.env.BASE_URL), {
        onProgress: (loaded, total) => view.setProgress(loaded, total),
      });
      view.hideBoot();
      return vm;
    } catch {
      view.hideBoot();
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

  let homeStatus: HomeStatus = { kind: "starting" };
  const renderStatus = () => {
    view.status.textContent = statusText(homeStatus, Date.now());
  };
  const setStatus = (status: HomeStatus) => {
    homeStatus = status;
    renderStatus();
  };
  setInterval(renderStatus, 1000);

  let store: Store | undefined;
  try {
    store = await Store.open();
  } catch {
    setStatus({ kind: "off" });
  }

  vm = await boot(view);
  const running = vm;

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

  terminal.writeText(welcomeText(restored, "offline"));
  running.sendSerial("\n");

  const reporter = new SizeReporter((path, data) => running.createFile(path, data));
  const refit = () => {
    const { rows, cols } = terminal.fit();
    reporter.report(rows, cols);
  };
  new ResizeObserver(refit).observe(view.terminalHost);
  refit();
  terminal.focus();

  const saves = store ? new MachineSaves({ vm: running, store }) : undefined;

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
