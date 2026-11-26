import assert from "node:assert/strict";
import { test } from "node:test";
import { planFor } from "./usage-quota";

const account = {
  id: "user-1",
  billing: {
    unlimitedAccess: false,
    stripeStatus: "active",
    stripeSubscriptionId: "sub-1",
    stripePlan: "starter",
    stripePeriodStart: new Date("2026-11-10T00:00:00.000Z"),
    stripePeriodEnd: new Date("2026-12-10T00:00:00.000Z"),
    manualPaymentId: null,
    manualPlan: "starter",
    manualPeriodStart: null,
    manualPeriodEnd: null
  }
};

test("paid audio allowance follows the Stripe billing period", () => {
  const current = planFor(account, new Date("2026-11-30T23:59:59.000Z"));
  assert.equal(current.name, "pro");
  assert.equal(current.limitSeconds, 10 * 60 * 60);
  assert.equal(current.liveLimitSeconds, 2 * 60 * 60);
  assert.equal(current.periodEnd.toISOString(), "2026-12-10T00:00:00.000Z");
});

test("an approved manual QR payment grants ten hours for one month", () => {
  const manualAccount = {
    ...account,
    billing: {
      ...account.billing,
      stripeStatus: "inactive",
      stripeSubscriptionId: null,
      stripePeriodStart: null,
      stripePeriodEnd: null,
      manualPaymentId: "payment-1",
      manualPeriodStart: new Date("2026-11-19T00:00:00.000Z"),
      manualPeriodEnd: new Date("2026-12-19T00:00:00.000Z")
    }
  };
  const current = planFor(manualAccount, new Date("2026-11-30T00:00:00.000Z"));
  assert.equal(current.name, "pro");
  assert.equal(current.limitSeconds, 10 * 60 * 60);
  assert.equal(current.liveLimitSeconds, 2 * 60 * 60);
  assert.match(current.periodKey, /^manual:payment-1:/);
});

test("paid tiers have separate upload and LiveKit allowances", () => {
  for (const [plan, upload, live] of [["starter", 10, 2], ["plus", 15, 6], ["premium", 20, 10]] as const) {
    const current = planFor({ ...account, billing: { ...account.billing, stripePlan: plan } }, new Date("2026-11-30T00:00:00.000Z"));
    assert.equal(current.planId, plan);
    assert.equal(current.limitSeconds, upload * 3600);
    assert.equal(current.liveLimitSeconds, live * 3600);
  }
});

test("expired or unpaid subscriptions use the free UTC calendar month", () => {
  for (const candidate of [account, { ...account, billing: { ...account.billing, stripeStatus: "past_due" } }]) {
    const date = candidate.billing.stripeStatus === "past_due"
      ? new Date("2026-11-20T00:00:00.000Z")
      : new Date("2026-12-10T00:00:00.000Z");
    const current = planFor(candidate, date);
    assert.equal(current.name, "free");
    assert.equal(current.limitSeconds, 20 * 60);
    assert.equal(current.periodKey, `free:${date.toISOString().slice(0, 7)}`);
  }
});

test("free allowance resets at the UTC month boundary", () => {
  const unpaid = { ...account, billing: { ...account.billing, stripeStatus: "inactive" } };
  const before = planFor(unpaid, new Date("2026-11-30T23:59:59.999Z"));
  const after = planFor(unpaid, new Date("2026-12-01T00:00:00.000Z"));
  assert.equal(before.periodKey, "free:2026-11");
  assert.equal(after.periodKey, "free:2026-12");
  assert.equal(after.limitSeconds, 20 * 60);
});

test("a plan change in the same Stripe period retains the usage period key", () => {
  const now = new Date("2026-11-20T00:00:00.000Z");
  const starter = planFor(account, now);
  const plus = planFor({ ...account, billing: { ...account.billing, stripePlan: "plus" } }, now);
  assert.equal(starter.periodKey, plus.periodKey);
  assert.equal(plus.limitSeconds, 15 * 3600);
  assert.equal(plus.liveLimitSeconds, 6 * 3600);
});
