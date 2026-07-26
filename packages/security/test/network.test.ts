import { test, expect } from "bun:test";
import { detectNetworkCalls } from "../src/network";

test("detectNetworkCalls finds every matching pattern", () => {
  expect(detectNetworkCalls("plain script, no network")).toEqual([]);
  expect(detectNetworkCalls("curl https://example.com")).toEqual(["curl"]);
  expect(detectNetworkCalls("await fetch('https://x')")).toEqual(["fetch("]);
  expect(detectNetworkCalls("Invoke-WebRequest -Uri https://x")).toEqual(["Invoke-WebRequest"]);
});
