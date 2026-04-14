# Ice Cream Tracker NZ — Architecture Documentation

## Project Overview
A SaaS platform for NZ ice cream van operators to list their van on a live map, manage events, and handle subscriptions. Vendors pay a monthly fee to be visible on a customer-facing map.

**Live URL:** https://app.icecreamtracker.co.nz  
**GitHub Repo:** https://github.com/onepostnz/ice-cream-tracker  
**Firebase Project:** icecreamtracker-9625b  
**Owner:** sam@onepost.co.nz

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Plain HTML/CSS/JS (no framework) |
| Hosting | GitHub Pages via Cloudflare |
| Auth | Firebase Authentication |
| Database | Firebase Firestore |
| Backend | Firebase Cloud Functions v2 (Node.js 24) |
| Payments | Stripe (test mode) |
| Email | SMTP2GO via Nodemailer |
| CDN/DNS | Cloudflare |

---

## GitHub Repo Structure

```
ice-cream-tracker/
├── functions/
│   ├── index.js          ← All Cloud Functions
│   └── package.json      ← Dependencies
├── admin.html            ← Admin dashboard
├── billing.html          ← Subscription/billing page
├── index.html            ← Customer-facing map
├── signup.html           ← Vendor signup/login page
└── vendor.html           ← Vendor dashboard
```

---

## Firebase Cloud Functions

All functions are **v2 (2nd Gen)** deployed to `us-central1`.

### Function URLs

| Function | Cloud Run URL | Purpose |
|----------|--------------|---------|
| createCheckoutSession | https://createcheckoutsession-wazu3t3hrq-uc.a.run.app | Creates Stripe checkout session |
| createPortalSession | https://createportalsession-wazu3t3hrq-uc.a.run.app | Opens Stripe billing portal |
| cancelSubscription | https://cancelsubscription-wazu3t3hrq-uc.a.run.app | Cancels a subscription |
| stripeWebhook | https://stripewebhook-wazu3t3hrq-uc.a.run.app | Handles Stripe webhook events |
| onUserCreate | https://onusercreate-wazu3t3hrq-uc.a.run.app | Called on new user signup |
| checkExpiredTrials | Scheduled (midnight NZ daily) | Expires trial accounts |
| sendTrialReminders | Scheduled (9am NZ daily) | Sends 7/3/1 day trial reminder emails |

**Also accessible via:**  
`https://us-central1-icecreamtracker-9625b.cloudfunctions.net/<functionName>`

> ⚠️ CORS NOTE: billing.html uses the direct Cloud Run URLs above, NOT the cloudfunctions.net URLs, to avoid CORS issues.

### Secrets (stored in Firebase Secret Manager)
- `STRIPE_SECRET_KEY` — Stripe secret key (test: sk_test_51TLXRn...)
- `STRIPE_WEBHOOK_SECRET` — whsec_4tce3Ed1Vx5xZf7NLJQnHv1OdEH7vsCm
- `SMTP_USERNAME` — onepost.co.nz
- `SMTP_PASSWORD` — (SMTP2GO password)

### Local Development Setup
```bash
# Functions are in ~/ice-cream-tracker/functions/
cd ~/ice-cream-tracker/functions

# Deploy all functions
firebase deploy --only functions

# Deploy single function
firebase deploy --only functions:createCheckoutSession

# Update a secret
firebase functions:secrets:set STRIPE_SECRET_KEY
```

---

## Firestore Data Structure

### Collection: `vendors`
Document ID = Firebase Auth UID (critical — must match!)

```json
{
  "uid": "string (Firebase Auth UID)",
  "email": "string",
  "businessName": "string",
  "subscriptionStatus": "trial | active | expired | cancelled",
  "subscriptionPlan": "starter | professional | enterprise",
  "trialStartedAt": "timestamp",
  "trialEndsAt": "timestamp",
  "stripeCustomerId": "string (cus_...)",
  "stripeSubscriptionId": "string (sub_...)",
  "stripePriceId": "string",
  "currentPeriodEnd": "timestamp",
  "truckCount": "number",
  "eventCount": "number",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

> ⚠️ IMPORTANT: Old vendor documents created before Cloud Functions were set up have random document IDs and wrong field names (e.g. `subscription` instead of `subscriptionStatus`). These need to be manually fixed or recreated with the correct UID as the document ID.

### Collection: `events`
(Structure TBD — used for ice cream van events/appearances)

---

## Firebase Authentication

Users (vendors) authenticate via:
- Email/Password
- Google OAuth

**Firebase Auth Users:**
| Email | Role | Notes |
|-------|------|-------|
| sam@onepost.co.nz | Owner | Main account, vendor doc manually created |
| demo@icecreamtracker.co.nz | Demo | Test account |
| admin@icecreamtrack... | Admin | Admin account |
| sam@getsecureaz.com | Test | Test vendor account, working correctly |

---

## Stripe Configuration

**Mode:** Test (sandbox)  
**Account:** Ice Cream Tracker sandbox

### Price IDs
| Plan | Price ID | Monthly Cost |
|------|---------|-------------|
| Starter | price_1TLbF1ENy8glkcQKz2MXuU5K | $29/month |
| Professional | price_1TLbFSENy8glkcQKmfcCVJbe | $49/month |
| Enterprise | price_1TLbFqENy8glkcQKkiDAajyB | $99/month |

### Publishable Key
`pk_test_51TLXRnENy8glkcQKX712IpOPzV6OJ7T00LCobBV3chXGj8X1ZShQCORbaxuqHC2sHsN4dwMh3NrW4o8f7GMQtnmx00j0HnwXSv`

### Webhook Events Listened To
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

---

## Email System (SMTP2GO)

**Host:** mail.smtp2go.com  
**Port:** 2525  
**From:** noreply@icecreamtracker.co.nz  
**Username:** onepost.co.nz

### Automated Emails
- Welcome email on signup (45-day trial start)
- Trial expiring reminders (7 days, 3 days, 1 day before)
- Trial expired notification
- Subscription activated confirmation
- Payment failed alert

---

## User Flow

### New Vendor Signup
1. Vendor visits `signup.html`
2. Creates account (email/password or Google)
3. `signup.html` creates Firestore vendor document with UID as doc ID
4. Vendor redirected to `vendor.html`
5. Welcome email sent via Cloud Function

### Subscription Flow
1. Vendor visits `billing.html` (must be logged in)
2. Billing page loads vendor doc from Firestore by UID
3. Vendor clicks plan → `createCheckoutSession` Cloud Function called
4. Redirected to Stripe Checkout
5. On success → Stripe webhook fires → `handleSubscriptionUpdate` updates Firestore
6. Vendor redirected back to `billing.html?success=true`

### Trial Management
- 45-day free trial on signup
- Daily cron at midnight NZ checks for expired trials
- Daily cron at 9am NZ sends reminder emails at 7/3/1 days before expiry

---

## Known Issues & Fixes Applied

### CORS Issues
- Firebase v2 functions need `cors: true` in `onRequest` options AND direct Cloud Run URLs
- billing.html uses direct `.a.run.app` URLs to avoid CORS problems
- `cors` package set to `origin: '*'`

### functions.config() Removed
- Firebase Functions v7 removed `functions.config()` and `functions.runWith()`
- Migrated to `defineSecret()` from `firebase-functions/params`
- Secrets accessed via `SECRET_NAME.value()` inside function handlers

### Vendor Document Structure
- Document ID MUST be the Firebase Auth UID
- Old documents created with random IDs need manual recreation
- Field is `subscriptionStatus` (not `subscription`)

### Cloudflare Caching
- Cloudflare aggressively caches HTML files
- After any HTML update, purge Cloudflare cache: Caching → Configuration → Purge Everything
- Hard refresh with Cmd+Shift+R after purging

---

## Deployment Checklist

When deploying function changes:
```bash
cd ~/ice-cream-tracker/functions
open -e index.js        # Edit the file
firebase deploy --only functions
```

When deploying HTML changes:
1. Update file in GitHub
2. Purge Cloudflare cache
3. Hard refresh browser (Cmd+Shift+R)

---

## Firebase Blaze Plan
Project is on Blaze (pay-as-you-go) plan — required for Cloud Functions.  
Container image cleanup policy: 1 day retention.

---

## Environment
- **Node.js:** v24.14.1 (local Mac)
- **Firebase CLI:** installed globally via `sudo npm install -g firebase-tools`
- **Local functions folder:** `/Users/sam/ice-cream-tracker/functions/`
- **Firebase project:** icecreamtracker-9625b (project number: 446719902540)
