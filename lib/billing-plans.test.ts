import assert from "node:assert/strict";
import { test } from "node:test";
import { BILLING_PLANS, planForStripePrice } from "./billing-plans";

test("each monthly Stripe price grants its matching plan", () => {
  for (const [id, plan] of Object.entries(BILLING_PLANS)) {
    assert.equal(planForStripePrice({ quantity: 1, price: { unit_amount: plan.monthlyCents, currency: "usd", recurring: { interval: "month" } } }), id);
  }
});

test("unrecognized or non-monthly prices grant no paid plan", () => {
  for (const item of [
    { quantity: 1, price: { unit_amount: 100, currency: "usd", recurring: { interval: "month" } } },
    { quantity: 1, price: { unit_amount: 1500, currency: "eur", recurring: { interval: "month" } } },
    { quantity: 1, price: { unit_amount: 1500, currency: "usd", recurring: { interval: "year" } } },
    { quantity: 2, price: { unit_amount: 1500, currency: "usd", recurring: { interval: "month" } } }
  ]) assert.equal(planForStripePrice(item), null);
});
