import { isValidRelayUrl, type NetworkState } from "../network.ts";
import { RELAY_INVALID_MESSAGE, RELAY_PRIVACY_NOTE, networkStatusText } from "./network-text.ts";

export interface NetworkDialogOptions {
  state: NetworkState;
  relay: string | null;
  saved: string | null;
  save(url: string | null): Promise<void>;
}

function button(label: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "bevel-button";
  node.textContent = label;
  return node;
}

export function openNetworkDialog(options: NetworkDialogOptions): Promise<void> {
  const dialog = document.createElement("dialog");
  const titleBar = document.createElement("div");
  titleBar.className = "title-bar";
  titleBar.textContent = "Network";

  const body = document.createElement("div");
  body.className = "dialog-body";
  const status = document.createElement("p");
  status.className = "network-status";
  status.textContent = networkStatusText(options.state, options.relay);

  const label = document.createElement("label");
  label.textContent = "Relay address";
  const input = document.createElement("input");
  input.className = "text-input";
  input.placeholder = "wisps://relay.example.com/";
  input.value = options.saved ?? options.relay ?? "";
  label.append(document.createElement("br"), input);

  const error = document.createElement("p");
  error.className = "field-error";
  error.setAttribute("role", "alert");
  error.textContent = RELAY_INVALID_MESSAGE;
  error.hidden = !(options.saved !== null && !isValidRelayUrl(options.saved));

  const note = document.createElement("p");
  note.className = "dialog-note";
  note.textContent = RELAY_PRIVACY_NOTE;
  body.append(status, label, error, note);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = button("Cancel");
  const clear = button("Clear");
  const save = button("Save and reload");
  actions.append(cancel, clear, save);
  dialog.append(titleBar, body, actions);

  return new Promise((resolve) => {
    const close = () => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    const busy = () => {
      for (const node of [cancel, clear, save]) node.disabled = true;
    };
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    clear.addEventListener("click", () => {
      busy();
      void options.save(null);
    });
    save.addEventListener("click", () => {
      const url = input.value.trim();
      if (!isValidRelayUrl(url)) {
        error.hidden = false;
        input.focus();
        return;
      }
      busy();
      void options.save(url);
    });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
