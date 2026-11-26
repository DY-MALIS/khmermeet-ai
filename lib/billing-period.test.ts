import assert from "node:assert/strict";
import { test } from "node:test";
import { manualPeriodEnd } from "./billing-period";

test("manual billing month preserves the UTC time and clamps month-end days", () => {
  assert.equal(manualPeriodEnd(new Date("2026-11-20T08:55:52.123Z")).toISOString(), "2026-12-20T08:55:52.123Z");
  assert.equal(manualPeriodEnd(new Date("2027-01-31T23:59:59.000Z")).toISOString(), "2027-02-28T23:59:59.000Z");
  assert.equal(manualPeriodEnd(new Date("2028-01-31T00:00:00.000Z")).toISOString(), "2028-02-29T00:00:00.000Z");
  assert.equal(manualPeriodEnd(new Date("2026-12-31T00:00:00.000Z")).toISOString(), "2027-01-31T00:00:00.000Z");
});
