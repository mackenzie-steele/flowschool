# Mux setup — what Mackenzie does in the dashboard

Everything here is done by hand in Mux and Vercel. None of it is in code, and
none of the values below ever get committed.

Do steps 1–4 now. Step 5 (the webhook) has to wait until the endpoint is
deployed, because Mux validates the URL when you save it.

---

## 1. Account and environment

Sign up at <https://dashboard.mux.com>.

A new account gives you an environment. **Access tokens and signing keys are
scoped to an environment** — a key made in one will not work against another,
and the failure is a bare 401 with no explanation.

Flow School only needs one environment for now. If Mux has created both a
Production and a Development/Sandbox environment, **use Production** and note
which one you are in at the top of the dashboard. Every value below must come
from that same environment.

> Sandbox environments watermark video and cap resolution. If test uploads
> come back looking wrong, this is the first thing to check.

---

## 2. API access token

**Settings → Access Tokens → Generate new token**
(<https://dashboard.mux.com/settings/access-tokens>)

Permissions offered are Read, Read and Write, and System Write.

Tick **Read and Write** — needed to create direct uploads and assets.

Also tick **System Write** — this is the one that is easy to miss. It is
required to create the signing key used for secure playback. Without it,
step 3 fails and the error does not say why.

You will be shown two values **once**:

| Shown as           | Becomes                |
| ------------------ | ---------------------- |
| Access Token ID    | `MUX_TOKEN_ID`         |
| Secret Key         | `MUX_TOKEN_SECRET`     |

Mux stores only a hash of the secret. **If you lose it, it cannot be
recovered** — you delete the token and make a new one. Copy both somewhere
safe before closing the dialog.

---

## 3. Signing key

This is what makes videos playable only to signed-in members. Without it,
anyone who obtains a playback ID can watch.

**Settings → Signing Keys → Generate new key**

You receive:

| Shown as        | Becomes                     |
| --------------- | --------------------------- |
| Signing Key ID  | `MUX_SIGNING_KEY_ID`        |
| Private Key     | `MUX_SIGNING_PRIVATE_KEY`   |

The private key comes as a **base64-encoded PEM**. Keep it exactly as given —
do not decode it, reformat it, or strip line breaks. The server decodes it.

Same rule as the Apple `.p8`: this key can mint playback tokens as Flow
School. It goes into a Vercel environment variable and nowhere else. Never in
the repo, never in a message, never in a log.

---

## 4. Put the values in Vercel

Five variables. Run each and paste the value at the prompt:

```
vercel env add MUX_TOKEN_ID production
vercel env add MUX_TOKEN_SECRET production
vercel env add MUX_SIGNING_KEY_ID production
vercel env add MUX_SIGNING_PRIVATE_KEY production
```

(`MUX_WEBHOOK_SECRET` comes from step 5.)

Or paste them in the dashboard: **Project → Settings → Environment Variables**.

Two things worth knowing, both learned the hard way on the MusicKit key:

- `vercel env pull` returns **empty** for values marked sensitive. Your local
  `.env` will not mirror production, and that is not a bug.
- Environment variables are read at cold start. After adding them, redeploy
  or the functions will not see them.

---

## 5. Webhook — after the endpoint is deployed

Mux checks the URL when you save it, so this cannot be done first.

Once `/api/mux/webhook` is live:

**Settings → Webhooks → Create new webhook**

- URL: `https://flowschool.io/api/mux/webhook`
- Environment: the same one as steps 2 and 3

Mux shows a **signing secret** — that becomes `MUX_WEBHOOK_SECRET`:

```
vercel env add MUX_WEBHOOK_SECRET production
```

Then redeploy.

Events the endpoint will handle:

```
video.upload.asset_created
video.upload.errored
video.upload.cancelled
video.asset.created
video.asset.ready
video.asset.errored
video.asset.deleted
```

Every request is verified against the secret before anything is read from it.
An unverified request is rejected without being parsed.

---

## What each value actually does

| Variable                    | Used for                                        | If it leaks                                    |
| --------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| `MUX_TOKEN_ID` / `_SECRET`  | creating uploads and assets                      | someone can upload and delete your video        |
| `MUX_SIGNING_KEY_ID`        | names the key in the token header                | harmless alone                                  |
| `MUX_SIGNING_PRIVATE_KEY`   | signing playback tokens                          | **anyone can watch any video, forever**         |
| `MUX_WEBHOOK_SECRET`        | proving a webhook really came from Mux           | someone can forge "asset ready" and publish junk |

All five are server-only. None is ever sent to a browser.

---

## Checking it worked

Once the code exists there will be a health check at
`/api/mux/health?verify=1` — the same idea as `/api/musickit-token?verify=1`.
It asks Mux rather than assuming, so "are the credentials still good" is one
request instead of an investigation.

Until then, the credentials cannot be tested. Do not worry if they feel
unverified — that is expected at this stage.

---

## Costs, so there are no surprises

Mux bills for encoding, storage and delivery. There is a free trial credit.
Storage accrues per asset per month whether or not anyone watches, so test
uploads left in the account do cost a little. Delete test assets from the Mux
dashboard when finished with them.

Worth checking current pricing at <https://www.mux.com/pricing> before
uploading the real library.
