import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TERMINAL_SIZE } from "./protocol.ts";
import { SizeReporter } from "./terminal.ts";

describe("SizeReporter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes the last size after the delay and skips repeats", async () => {
    const write = vi.fn(async () => {});
    const reporter = new SizeReporter(write, 300);
    reporter.report(24, 80);
    reporter.report(30, 100);
    await vi.advanceTimersByTimeAsync(300);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(TERMINAL_SIZE, new TextEncoder().encode("30 100"));
    reporter.report(30, 100);
    await vi.advanceTimersByTimeAsync(300);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
