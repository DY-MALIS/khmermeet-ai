import assert from "node:assert/strict";
import { test } from "node:test";
import { planFor } from "./usage-quota";

const account = {
  id: "user-1",
  billing: {
    unlimitedAccess: false,
    stripeStatus: "active",
    stripeSubscriptionId: "sub-1",
    stripePeriodStart: new Date("2026-11-10T00:00:00.000Z"),
    stripePeriodEnd: new Date("2026-12-10T00:00:00.000Z")
  }
};

test("paid audio allowance follows the Stripe billing period", () => {
  const current = planFor(account, new Date("2026-11-30T23:59:59.000Z"));
  assert.equal(current.name, "pro");
  assert.equal(current.limitSeconds, 10 * 60 * 60);
  assert.equal(current.periodEnd.toISOString(), "2026-12-10T00:00:00.000Z");
});

test("expired or unpaid subscriptions use the free UTC calendar month", () => {
  for (const candidate of [account, { ...account, billing: { ...account.billing, stripeStatus: "past_due" } }]) {
    const date = candidate.billing.stripeStatus === "past_due"
      ? new Date("2026-11-20T00:00:00.000Z")
      : new Date("2026-12-10T00:00:00.000Z");
    const current = planFor(candidate, date);
    assert.equal(current.name, "free");
    assert.equal(current.limitSeconds, 30 * 60);
    assert.equal(current.periodKey, `free:${date.toISOString().slice(0, 7)}`);
  }
});

