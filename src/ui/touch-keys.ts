export const TOUCH_KEYS: ReadonlyArray<{ label: string; sequence: string }> = [
  { label: "Esc", sequence: "\x1b" },
  { label: "Tab", sequence: "\t" },
  { label: "Ctrl", sequence: "" },
  { label: "←", sequence: "\x1b[D" },
  { label: "↑", sequence: "\x1b[A" },
  { label: "↓", sequence: "\x1b[B" },
  { label: "→", sequence: "\x1b[C" },
];

export function applyCtrl(data: string): string {
  return /^[a-z]$/i.test(data) ? String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64) : data;
}

// The returned row sends key sequences; "Ctrl" arms a one-shot modifier that
// transformInput() applies to the next typed character.
export function createTouchKeys(send: (data: string) => void): HTMLElement & { transformInput(data: string): string } {
  const row = document.createElement("div") as HTMLDivElement & { transformInput(data: string): string };
  row.className = "touch-keys";
  let ctrlArmed = false;
  for (const key of TOUCH_KEYS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bevel-button";
    button.textContent = key.label;
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (key.label === "Ctrl") {
        ctrlArmed = !ctrlArmed;
        button.classList.toggle("is-pressed", ctrlArmed);
        return;
      }
      send(key.sequence);
    });
    row.append(button);
  }
  row.transformInput = (data) => {
    if (!ctrlArmed) return data;
    ctrlArmed = false;
    row.querySelector(".is-pressed")?.classList.remove("is-pressed");
    return applyCtrl(data);
  };
  return row;
}
