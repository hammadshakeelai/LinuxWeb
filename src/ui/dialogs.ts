export interface DialogButton {
  label: string;
  value: string;
  primary?: boolean;
}

export function showDialog(title: string, body: string | HTMLElement, buttons: DialogButton[]): Promise<string> {
  const dialog = document.createElement("dialog");
  const titleBar = document.createElement("div");
  titleBar.className = "title-bar";
  titleBar.textContent = title;
  const content = document.createElement("div");
  content.className = "dialog-body";
  if (typeof body === "string") content.textContent = body;
  else content.append(body);
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  dialog.append(titleBar, content, actions);

  return new Promise((resolve) => {
    const finish = (value: string) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    for (const spec of buttons) {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "bevel-button";
      node.textContent = spec.label;
      node.addEventListener("click", () => finish(spec.value));
      actions.append(node);
      if (spec.primary) queueMicrotask(() => node.focus());
    }
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish("");
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export async function showMessage(title: string, message: string): Promise<void> {
  await showDialog(title, message, [{ label: "OK", value: "ok", primary: true }]);
}

export async function askText(title: string, label: string, initial: string): Promise<string | null> {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.className = "text-input";
  input.value = initial;
  wrapper.append(document.createElement("br"), input);
  queueMicrotask(() => input.select());
  const choice = await showDialog(title, wrapper, [
    { label: "Cancel", value: "cancel" },
    { label: "OK", value: "ok", primary: false },
  ]);
  return choice === "ok" && input.value.trim() ? input.value.trim() : null;
}
