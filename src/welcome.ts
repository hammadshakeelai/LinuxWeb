const FIRST_LINE = "Welcome to LinuxWeb: Alpine Linux, running in your browser.";

export function welcomeText(restoredCount: number | null): string {
  const lines =
    restoredCount === null
      ? [FIRST_LINE, "Files in /root are saved in this browser automatically.", "New here? Type help for a two-minute tour."]
      : [FIRST_LINE, `Welcome back. Restored ${restoredCount} ${restoredCount === 1 ? "file" : "files"} in your home folder.`];
  return lines.map((line) => `${line}\r\n`).join("");
}
