import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { stripeClient, syncStripeSubscription } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const baseUrl = process.env.NEXTAUTH_URL || new URL(request.url).origin;
  const settingsUrl = new URL("/settings", baseUrl);
  try {
    const user = await requireUser();
    const sessionId = new URL(request.url).searchParams.get("session_id");
    if (!sessionId) throw new Error("Missing checkout session.");

    const session = await stripeClient().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"]
    });
    if (session.mode !== "subscription" || session.client_reference_id !== user.id) {
      throw new Error("Checkout session belongs to another account.");
    }
    const subscription = typeof session.subscription === "string"
      ? await stripeClient().subscriptions.retrieve(session.subscription)
      : session.subscription;
    if (!subscription) throw new Error("Stripe did not return a subscription.");

    await syncStripeSubscription(subscription, user.id);
    settingsUrl.searchParams.set("checkout", "success");
  } catch (error) {
    console.error("Stripe checkout completion failed", error);
    settingsUrl.searchParams.set("checkout", "error");
  }
  return NextResponse.redirect(settingsUrl);
}

