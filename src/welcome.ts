const FIRST_LINE = "Welcome to LinuxWeb: Alpine Linux, running in your browser.";
const NETWORK_LINES = {
  online: "Network is online: try apk add, git clone, or curl.",
  offline: "Network is offline: set a relay with the Network button to install software.",
};

export function welcomeText(restoredCount: number | null, network: "online" | "offline"): string {
  const lines =
    restoredCount === null
      ? [FIRST_LINE, "Files in /root are saved in this browser automatically.", "New here? Type help for a two-minute tour."]
      : [FIRST_LINE, `Welcome back. Restored ${restoredCount} ${restoredCount === 1 ? "file" : "files"} in your home folder.`];
  return [...lines, NETWORK_LINES[network]].map((line) => `${line}\r\n`).join("");
}
