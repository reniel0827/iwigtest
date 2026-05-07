# iWIG Wholesale Portal

A B2B wholesale portal powered by **GoHighLevel** as the backend. Built with plain HTML/CSS/JS frontend + a few Vercel serverless functions for the API layer.

## What it does

- **Public homepage** — anyone can see the brand, story, and "Apply" CTA. No products visible.
- **Application form** — visitors apply for wholesale access. Creates a contact in GHL with a `wholesale-pending` tag.
- **Admin dashboard** (`/admin`) — password-protected. Approve, deny, or revoke access. Lists pending and approved members.
- **Login** — approved users sign in with email. The backend checks their tag in GHL.
- **Product catalog** — only shown to users with the `wholesale-approved` tag. Pulled live from GHL Products.
- **Cart** — minimum order $5,500 enforced both client-side and server-side.
- **Checkout** — embeds your GHL checkout form (iframe) with email pre-filled. Payment is handled inside GHL's secure environment.

## Architecture

```
Browser (index.html / admin.html)
   ↓
Vercel Serverless Functions (/api/*)
   ↓ (Bearer token, never exposed to browser)
GoHighLevel API
```

## File map

```
ghl-portal/
├── public/
│   ├── index.html       Main public site (single-page, all routes inside)
│   ├── admin.html       Admin dashboard
│   ├── styles.css       All styles
│   ├── app.js           Public-site logic
│   └── admin.js         Admin logic
├── api/
│   ├── _ghl.js          Shared GHL helper
│   ├── signup.js        POST  — create contact w/ pending tag
│   ├── login.js         POST  — check status by email
│   ├── products.js      GET   — products (approved users only)
│   ├── checkout.js      POST  — generate checkout URL
│   └── admin/
│       ├── _auth.js         Token verifier
│       ├── login.js         POST — admin password login
│       ├── applications.js  GET  — list applicants by tag
│       ├── decision.js      POST — approve/deny/revoke
│       └── products.js      GET  — admin product view
├── .env.example
├── vercel.json
├── package.json
└── README.md
```

## Setup — 5 steps

### 1. Get your GoHighLevel credentials

**Private Integration Token:**
- Go to GHL → **Settings → Private Integrations → Create New Integration**
- Enable scopes:
  - `contacts.write`
  - `contacts.readonly`
  - `products.readonly`
- Copy the token (starts with `pit-`).

**Location ID:**
- GHL → Settings → Business Profile, or copy from the URL when you're inside your sub-account.

### 2. Create the wholesale checkout form in GHL

- GHL → **Sites → Forms → New Form**
- Add fields you want on checkout (shipping address, billing, etc.)
- Connect a payment processor if you want to take payment inline (or set it up to follow up manually)
- Publish the form, copy its **public URL**. Looks like `https://api.leadconnectorhq.com/widget/form/XXXXX`

### 3. (Optional) Create custom fields for application data

In GHL → Settings → Custom Fields, create text fields for:
- Business Type
- Reseller ID
- Notes

Copy each field's ID. Without these, the extra application data won't be saved per-contact.

### 4. Set environment variables

Copy `.env.example` → `.env` (or set them in your Vercel dashboard):

```
GHL_PRIVATE_TOKEN=pit-...
GHL_LOCATION_ID=...
GHL_CHECKOUT_FORM_URL=https://api.leadconnectorhq.com/widget/form/...
ADMIN_PASSWORD=pick-a-strong-one
ADMIN_SECRET=any-random-32-chars
CF_BUSINESS_TYPE=
CF_RESELLER_ID=
CF_NOTES=
```

### 5. Deploy

**Easiest — Vercel:**
```bash
npm install -g vercel
cd ghl-portal
vercel
# follow prompts; add env vars in the dashboard
vercel --prod
```

**Local dev:**
```bash
vercel dev
# open http://localhost:3000
```

## How approval works

The system uses **GHL contact tags** as the access control flag:

| Tag | Meaning |
|---|---|
| `wholesale-applicant` | Submitted application |
| `wholesale-pending`   | Awaiting admin review |
| `wholesale-approved`  | Can log in & see products |
| `wholesale-denied`    | Cannot access portal |

**Flow:**
1. User submits form → backend creates contact with `wholesale-pending` + `wholesale-applicant`
2. Admin opens `/admin`, sees pending list, clicks **Approve**
3. Backend swaps `pending` → `approved` tag
4. (Optional) Set up a GHL workflow: trigger on `wholesale-approved` tag added → send "You're in" email
5. User logs in → backend reads tags → grants portal access

You can manage everything from inside GHL too — anyone you tag `wholesale-approved` directly in GHL will be able to log in. The dashboard is just a convenient web UI for that.

## Security notes

- The `GHL_PRIVATE_TOKEN` only lives in Vercel env vars and the serverless functions. It's **never** sent to the browser.
- Products endpoint verifies the caller's email has `wholesale-approved` tag before returning anything.
- Admin endpoints require a signed token (HMAC of timestamp). Token expires after 8 hours.
- The "login" is intentionally simple — email-only — because GHL is your source of truth and approval is gated by admin. If you want passwords too, swap the login endpoint for a magic-link flow (send via GHL workflow on email click).
- Checkout payment **never touches your server** — it happens inside GHL's iframe.

## Customization tips

- **Brand colors / fonts:** edit the CSS variables at the top of `styles.css`.
- **Min order:** change `MIN_ORDER` in both `app.js` and `api/checkout.js`.
- **Add a custom domain:** add it in Vercel dashboard, point your DNS.
- **Email notifications:** create a GHL workflow that triggers on the `wholesale-pending` tag → notifies you.
- **Welcome email on approval:** GHL workflow triggered by `wholesale-approved` tag.

## API endpoints reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/signup` | none | Create contact, tag as pending |
| POST | `/api/login` | none | Look up tag status by email |
| GET  | `/api/products` | `x-iwig-email` header | List products (approved only) |
| POST | `/api/checkout` | none (verified by email) | Generate prefilled GHL form URL |
| POST | `/api/admin/login` | none | Admin password login |
| GET  | `/api/admin/applications?status=pending` | `x-iwig-admin` token | List applicants |
| POST | `/api/admin/decision` | `x-iwig-admin` token | Approve / deny / revoke |
| GET  | `/api/admin/products` | `x-iwig-admin` token | Admin product view |

## Troubleshooting

- **"GHL 401" errors:** token missing scopes. Re-check `contacts.write`, `contacts.readonly`, `products.readonly`.
- **Products not showing for approved users:** make sure your `wholesale-approved` tag is spelled exactly (lowercase, hyphens). Tags are case-insensitive in our checker, but spelling matters.
- **Checkout iframe blocked:** GHL blocks embedding in some configurations. As a fallback, change `app.js` to redirect to the URL instead of embedding it in an iframe.

---

Built for iWIG · drop a thumbs-down on any Claude response if something's off.
