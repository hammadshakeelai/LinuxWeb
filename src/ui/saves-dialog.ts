import { UnreadableSaveError, type MachineSaves } from "../saves.ts";
import { askText, showDialog, showMessage } from "./dialogs.ts";

function download(filename: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/gzip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface Choice {
  action: string;
  id: string;
  name: string;
}

export async function openSavesDialog(saves: MachineSaves, onRestored: () => void): Promise<void> {
  for (;;) {
    const list = await saves.list();
    const body = document.createElement("div");
    if (list.length === 0) {
      body.textContent = "No saves yet. Save machine keeps everything, including open programs.";
      await showDialog("Saves", body, [{ label: "Close", value: "close", primary: true }]);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "saves-list";
    let picked: Choice | null = null;
    const closeWith = (choice: Choice) => {
      picked = choice;
      body.closest("dialog")?.querySelector<HTMLButtonElement>(".dialog-actions button")?.click();
    };
    for (const save of list) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "name";
      const older = saves.isOlder(save);
      name.textContent = `${save.name}${older ? " (older LinuxWeb)" : ""} (${(save.bytes / 1e6).toFixed(1)} MB)`;
      li.append(name);
      const actions = older ? ["Download", "Delete"] : ["Restore", "Rename", "Delete", "Download"];
      for (const action of actions) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "bevel-button";
        node.textContent = action;
        node.addEventListener("click", () => closeWith({ action, id: save.id, name: save.name }));
        li.append(node);
      }
      ul.append(li);
    }
    body.append(ul);
    await showDialog("Saves", body, [{ label: "Close", value: "close", primary: true }]);
    const choice = picked as Choice | null;
    if (!choice) return;

    try {
      if (choice.action === "Restore") {
        const confirm = await showDialog("Restore", "This replaces your current home folder with the one in this save.", [
          { label: "Cancel", value: "cancel" },
          { label: "Restore", value: "restore", primary: true },
        ]);
        if (confirm === "restore") {
          await saves.restore(choice.id);
          onRestored();
          return;
        }
      } else if (choice.action === "Rename") {
        const name = await askText("Rename", "New name", choice.name);
        if (name) await saves.rename(choice.id, name);
      } else if (choice.action === "Delete") {
        const confirm = await showDialog("Delete", `Delete "${choice.name}"? This can't be undone.`, [
          { label: "Cancel", value: "cancel", primary: true },
          { label: "Delete", value: "delete" },
        ]);
        if (confirm === "delete") await saves.delete(choice.id);
      } else if (choice.action === "Download") {
        const file = await saves.exportFile(choice.id);
        download(file.filename, file.data);
      }
    } catch (error) {
      if (error instanceof UnreadableSaveError) {
        const next = await showDialog("Saves", error.message, [
          { label: "Cancel", value: "cancel", primary: true },
          { label: "Delete", value: "delete" },
        ]);
        if (next === "delete") await saves.delete(choice.id);
      } else {
        await showMessage("Saves", error instanceof Error ? error.message : String(error));
      }
    }
  }
}
