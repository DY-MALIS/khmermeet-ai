# Integration readiness audit

The local application now has connection UI and provider routes. None of the
four external services has been verified with a provider test account, and no
provider credentials were supplied. Production integrations must remain
disabled until credentials, OAuth redirect URIs, scopes, and live tests are set.

| Integration | Implemented workflow | Live verification needed |
| --- | --- | --- |
| Google Calendar | Separate OAuth consent, encrypted token, refresh, create one primary-calendar event per meeting | Google OAuth app, `calendar.events` scope, redirect URI, test account and event creation |
| Telegram | Private bot linking, signed webhook, daily due-task reminder, disconnect | Bot token/name, webhook secret and registration, delivery from a test bot |
| Slack | Workspace OAuth, public channel list, summary post, disconnect | Slack app, `chat:write` and `channels:read` scopes, workspace install and test post |
| Zoom | OAuth, list cloud recordings, import available VTT transcript into a meeting, disconnect | Zoom app, recording read scope, licensed test account and cloud transcript |

Set `APP_URL`, `INTEGRATION_ENCRYPTION_KEY` (32 random bytes in base64), and the
provider client IDs and secrets from `.env.example` in the server environment.
Register these redirect URLs with each provider:

```text
<APP_URL>/api/integrations/google/callback
<APP_URL>/api/integrations/slack/callback
<APP_URL>/api/integrations/zoom/callback
```

Telegram reminders run once per unfinished task due today at 09:00 Cambodia
time after a user links a private chat. No automated messages were sent during
this work. The public Telegram support contact is separate from this bot.

OAuth and integration endpoints require an authenticated app user. Provider
tokens are encrypted with AES-256-GCM at rest. App table access remains through
server-side Prisma; Supabase anon and authenticated roles have no table grants.

Sources: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Google Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert),
[Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/),
[Slack message API](https://docs.slack.dev/reference/methods/chat.postMessage),
[Zoom OAuth](https://developers.zoom.us/docs/integrations/oauth/),
[Telegram Bot API](https://core.telegram.org/bots/api).
