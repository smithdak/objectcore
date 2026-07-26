import { test, expect } from "bun:test";
import { scanSecrets } from "../src/secrets";

// Fake secret-shaped fixtures, built by concatenation so no real-looking token
// ever appears as a contiguous literal in this source file.
const fakeAwsKey = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const fakeGithubPat = ["github_pat_", "a".repeat(30)].join("");
const fakeCredentialLine = ["api", "_key", ": ", '"', "not-a-real-", "secret-value", '"'].join("");
const fakePrivateKeyHeader = ["-----BEGIN ", "RSA ", "PRIVATE KEY", "-----"].join("");

test("scanSecrets flags AWS keys, GitHub PATs, and hardcoded credentials", () => {
  expect(scanSecrets("no secrets here", "ctx")).toEqual([]);
  expect(scanSecrets(fakeAwsKey, "ctx")).toHaveLength(1);
  expect(scanSecrets(fakeGithubPat, "ctx")).toHaveLength(1);
  expect(scanSecrets(fakeCredentialLine, "ctx")).toHaveLength(1);
  expect(scanSecrets(fakePrivateKeyHeader, "ctx")).toHaveLength(1);
});
