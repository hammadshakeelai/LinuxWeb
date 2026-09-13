import type { HomeStatus } from "../home.ts";

export function statusText(status: HomeStatus, now: number): string {
  switch (status.kind) {
    case "starting":
      return "";
    case "saving":
      return "Saving…";
    case "saved": {
      const seconds = Math.max(0, Math.round((now - status.savedAt) / 1000));
      if (seconds < 60) return `Home folder saved ${seconds}s ago`;
      if (seconds < 3600) return `Home folder saved ${Math.floor(seconds / 60)} min ago`;
      return `Home folder saved ${Math.floor(seconds / 3600)} h ago`;
    }
    case "too-big":
      return "Home folder too big to save (over 50 MB)";
    case "off":
      return "Saving is off in this browser";
    case "paused-other-tab":
      return "Saving paused: LinuxWeb is open in another tab";
  }
}
