import { LanguageSwitcher } from "@/components/language-switcher";
import { getServerUiText } from "@/lib/server-ui-text";
import { requireUser } from "@/lib/session";
import { getUsageQuota } from "@/lib/usage-quota";
import { BillingPanel } from "@/components/billing-panel";
import { ManualPaymentAdmin } from "@/components/manual-payment-admin";
import { prisma } from "@/lib/prisma";
import { TelegramRemindersPanel } from "@/components/telegram-reminders-panel";
import { IntegrationsPanel } from "@/components/integrations-panel";

export default async function SettingsPage() {
  const user = await requireUser();
  const { text } = await getServerUiText();
  const [quota, registeredUsers, telegram, providerConnections] = await Promise.all([
    getUsageQuota(user.id),
    user.isAdmin
      ? prisma.user.findMany({ select: { id: true, name: true, email: true, billing: { select: { unlimitedAccess: true } } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    prisma.telegramConnection.findUnique({ where: { userId: user.id } }).catch(() => null),
    prisma.integrationConnection.findMany({ where: { userId: user.id }, select: { provider: true } }).catch(() => [])
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="kh-page-hero">
        <p className="text-sm font-semibold text-leaf">{text.accountAndLanguage}</p>
        <h1 className="text-3xl font-bold text-ink">{text.settingsTitle}</h1>
      </div>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">{text.displayLanguage}</h2>
        <LanguageSwitcher />
        <p className="mt-3 text-sm text-slate-500">
          {text.languageHelp}
        </p>
      </section>
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">{text.accountInfo}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-sm text-slate-500">{text.name}</p><p className="font-semibold">{user.name}</p></div>
          <div><p className="text-sm text-slate-500">{text.email}</p><p className="font-semibold">{user.email}</p></div>
        </div>
      </section>
      <BillingPanel quota={{
        plan: quota.plan,
        planId: quota.planId,
        billingMethod: quota.billingMethod,
        usedSeconds: quota.usedSeconds,
        limitSeconds: quota.limitSeconds,
        remainingSeconds: quota.remainingSeconds,
        liveUsedSeconds: quota.liveUsedSeconds,
        liveLimitSeconds: quota.liveLimitSeconds,
        liveRemainingSeconds: quota.liveRemainingSeconds,
        periodEnd: quota.periodEnd.toISOString()
      }} isAdmin={user.isAdmin} unlimitedUsers={user.isAdmin ? registeredUsers.filter((account) => account.billing?.unlimitedAccess).map((account) => ({ id: account.id, name: account.name, email: account.email })) : []} />
      {user.isAdmin && <div id="manual-payments"><ManualPaymentAdmin registeredUsers={registeredUsers.map((account) => ({ id: account.id, name: account.name, email: account.email }))} /></div>}
      <section className="kh-card p-5">
        <h2 className="mb-4 text-lg font-bold">{text.integrations}</h2>
        <TelegramRemindersPanel connected={Boolean(telegram?.enabled)} lastError={telegram?.lastError ?? null} />
        <IntegrationsPanel
          connected={providerConnections.map((connection) => connection.provider).filter((provider): provider is "google" | "slack" | "zoom" => ["google", "slack", "zoom"].includes(provider))}
          configured={(["google", "slack", "zoom"] as const).filter((provider) => Boolean(process.env.APP_URL && process.env.INTEGRATION_ENCRYPTION_KEY && process.env[`${provider.toUpperCase()}_CLIENT_ID`] && process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]))}
        />
      </section>
    </div>
  );
}
