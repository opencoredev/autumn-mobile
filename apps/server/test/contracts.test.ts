import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as contracts from "@autumn/shared";

/**
 * Fingerprint of every exported zod schema, recorded per CONTRACTS_REVISION.
 * When this fails: bump CONTRACTS_REVISION in packages/shared/src/contracts.ts
 * and record the new fingerprint below. That bump is what makes phones drop
 * their persisted cache instead of rendering data in an old shape.
 */
const FINGERPRINTS: Record<number, string> = {
  3: "7bbaf791776e542d",
};

function fingerprint(): string {
  const schemas = Object.entries(contracts)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([name, value]: [string, unknown]) =>
      value instanceof z.ZodType ? [[name, z.toJSONSchema(value, { unrepresentable: "any" })]] : [],
    );
  return createHash("sha256").update(JSON.stringify(schemas)).digest("hex").slice(0, 16);
}

describe("contracts", () => {
  it("bump CONTRACTS_REVISION when a schema changes", () => {
    expect(fingerprint()).toBe(FINGERPRINTS[contracts.CONTRACTS_REVISION]);
  });
});
