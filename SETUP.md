# Face Logger v2 — Setup Guide
### Advanced PWA · 75-Day Rolling Archive · GitHub Pages

---

## What You're Building

A Progressive Web App (PWA) that:
- Runs on any Android/iPhone/PC browser — no app store needed
- Detects and logs faces at lift and staircase entrances
- Syncs data to your Google Drive automatically
- Keeps up to **75 days** of history across up to 5 Google accounts
- Works offline and syncs when internet is restored

---

## What You Need

| Item | Required | Notes |
|------|----------|-------|
| Google Account(s) | 1–5 | One per slot (Alpha through Epsilon) |
| GitHub Account | Yes | Free — to host the app |
| Android Phone(s) | For cameras | Any modern Android/iPhone |
| Internet connection | Yes | For initial setup |

---

## STEP 1 — Upload to GitHub Pages

1. Go to **https://github.com** and sign in (or create a free account)
2. Click **+** → **New repository**
3. Name it: `face-logger` (or any name you like)
4. Set it to **Public**
5. Click **Create repository**
6. Click **uploading an existing file** (on the new repo page)
7. **Drag and drop** all files from the `face-logger-v2` folder:
   ```
   camera.html
   admin.html
   dashboard.html
   manifest.json
   sw.js
   icons/icon.svg
   js/config.js
   Code.gs       ← (keep this for reference, not served)
   ```
8. Click **Commit changes**
9. Go to **Settings** → **Pages** (left sidebar)
10. Under "Source", select **main** branch, folder **/ (root)**
11. Click **Save**
12. Wait ~1 minute. Your app URL will be:
    ```
    https://YOUR-USERNAME.github.io/face-logger/
    ```
    **Save this URL** — you'll need it.

---

## STEP 2 — Set Up Google Apps Script (Alpha Slot)

Do this for each slot you want active (Alpha is required; Beta–Epsilon are optional).

### A. Create the Apps Script

1. Go to **https://drive.google.com** (sign in as your Alpha Google account)
2. Click **+ New** → **More** → **Google Apps Script**
3. Delete all existing code in the editor
4. Open `Code.gs` from your face-logger-v2 folder and **paste the entire contents**
5. Click the floppy disk icon (Save) — name it **FaceLogger Alpha**

### B. Run First-Time Setup

1. In the script editor, click the function dropdown (top bar, shows `myFunction`)
2. Select **`setupSlot`** from the dropdown
3. Click **▶ Run**
4. A permissions popup will appear — click **Review permissions**
5. Choose your Google account → Click **Advanced** → **Go to FaceLogger Alpha (unsafe)**
6. Click **Allow**
7. After it runs, click **Execution log** at the bottom
8. You'll see a line like:
   ```
   === SLOT SETUP COMPLETE ===
   Slot Name: Alpha
   API Secret: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
9. **Copy the API Secret** — you'll need this in Step 4

### C. Deploy as Web App

1. Click **Deploy** (top right) → **New deployment**
2. Click the gear icon ⚙ → Select **Web app**
3. Set:
   - Description: `FaceLogger Alpha v2`
   - Execute as: **Me**
   - Who has access: **Anyone** *(this is safe — your API secret protects it)*
4. Click **Deploy**
5. Copy the **Web app URL** (looks like: `https://script.google.com/macros/s/ABC.../exec`)
   **Save this URL** — you'll need it in Step 4

### D. Create Daily Trigger (Auto-cleanup)

1. In the script editor, select function **`setupTrigger`**
2. Click **▶ Run**
3. This creates a midnight trigger that auto-archives data older than 15 days

---

## STEP 3 — Repeat for More Slots (Optional)

Repeat Step 2 for each additional slot using different Google accounts:
- **Beta** account → run `setupSlot` → note URL and secret
- **Gamma** account → same
- **Delta** account → same
- **Epsilon** account → same

Each slot doubles your history window (+15 days per slot).

---

## STEP 4 — Configure the App

### Edit `js/config.js`

Open `js/config.js` in a text editor and fill in your details:

```javascript
window.FL_CONFIG = {
  slots: [
    {
      name: 'Alpha',
      label: 'α Alpha',
      url: 'PASTE_YOUR_ALPHA_WEB_APP_URL_HERE',   // ← from Step 2C
      token: 'PASTE_YOUR_ALPHA_API_SECRET_HERE',  // ← from Step 2B
      email: 'your-alpha@gmail.com',
      active: true,   // ← set true to enable this slot
    },
    {
      name: 'Beta',
      label: 'β Beta',
      url: 'PASTE_YOUR_BETA_WEB_APP_URL_HERE',
      token: 'PASTE_YOUR_BETA_API_SECRET_HERE',
      email: 'your-beta@gmail.com',
      active: false,  // ← set true when Beta account is set up
    },
    // ... Gamma, Delta, Epsilon same pattern
  ],
  // Other settings — usually leave as-is:
  rotationDays: 15,
  detectIntervalMs: 2500,   // detect every 2.5 seconds
  cooldownMs: 30000,        // 30 second cooldown per person
  matchThreshold: 0.50,     // face match sensitivity (lower = stricter)
  thumbSize: 64,            // thumbnail size in pixels
  locations: ['Lift', 'Staircase'],
};
```

**Key rules:**
- Only set `active: true` for slots you've set up in Step 2
- With 1 slot = 15-day window
- With 2 slots = 30-day window
- With 5 slots = 75-day window

### Upload the updated config.js to GitHub

1. Go to your GitHub repository
2. Click on `js/config.js`
3. Click the pencil icon (Edit)
4. Replace the content with your updated version
5. Click **Commit changes**

---

## STEP 5 — Set Up Camera Phone(s)

### On each Android/iPhone used as camera:

1. Open **Chrome** (Android) or **Safari** (iPhone)
2. Go to your GitHub Pages URL:
   ```
   https://YOUR-USERNAME.github.io/face-logger/camera.html
   ```
3. When prompted, tap **Allow** for camera access
4. Enter:
   - **Script URL**: Your Alpha Web App URL
   - **API Token**: Your Alpha API Secret
   - **Location**: Lift or Staircase
5. Tap **Save & Start Camera**
6. The camera will start detecting faces immediately

### Install as PWA (Recommended for 24/7 use):

**Android (Chrome):**
- Tap the three-dot menu → **Add to Home screen** → **Install**

**iPhone (Safari):**
- Tap the Share button → **Add to Home Screen**

This keeps the camera running like a native app, and the phone won't dim the screen (Wake Lock is active).

---

## STEP 6 — Register Faces

1. Go to: `https://YOUR-USERNAME.github.io/face-logger/admin.html`
2. Enter your Alpha Script URL and API Token, select **Alpha** slot
3. Click **Connect**
4. In "Register New Face":
   - Type the person's name
   - Position their face in the guide box
   - Click **Auto (5)** to capture 5 samples automatically
   - Click **Save Face to Slot**
5. The person is now recognized by all cameras pointing to Alpha

---

## STEP 7 — View the Dashboard

1. Go to: `https://YOUR-USERNAME.github.io/face-logger/dashboard.html`
2. Click **⚙️ Settings** tab
3. Enter your Alpha URL and Token → Click **Save Alpha**
4. Click **🕐 Today** tab to see live entries
5. Click **🔄 Rotation** tab to manage the 75-day archive

---

## HOW ROTATION WORKS

Every 15 days, you (or the system) triggers a **rotation**:

```
Before:  Alpha[Day 15] | Beta[Day 15] | Gamma[Day 15] | Delta[Day 15] | Epsilon[Day 15]
After:   Alpha[Fresh]  | Beta←Alpha   | Gamma←Beta    | Delta←Gamma   | Epsilon←Delta
         (Epsilon's old data is replaced and lost)
```

- **Alpha** always captures live
- After rotation, Alpha's 15-day data moves to Beta
- Beta's old data moves to Gamma, etc.
- Epsilon's oldest data is replaced

**To trigger rotation manually:**
1. Open Dashboard → Rotation tab
2. Click **Check All Slots**
3. When Alpha shows Day 15+, click **Rotate Now**

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| Camera shows blank | Check camera permission; try Chrome on Android |
| "Failed to load" in dashboard | Check Script URL and Token in Settings |
| Face not recognized | Register more samples (5–8 ideal); adjust lighting |
| Offline queue building up | Check internet; queued entries auto-sync when online |
| Apps Script "Unauthorized" | Re-copy token from execution log exactly |
| GitHub Pages not loading | Wait 2–3 minutes after pushing; check Pages settings |

---

## SECURITY NOTES

- Your API secrets are stored only **on your devices** (browser localStorage)
- Communication is HTTPS-only (GitHub Pages + Google Apps Script)
- Rate limiting: 120 requests/minute per IP (built into Code.gs)
- Tokens use constant-time comparison (prevents timing attacks)
- The app cannot be accessed without valid API tokens

---

## FILE STRUCTURE

```
face-logger-v2/
├── camera.html      ← Camera kiosk (mount on phones)
├── admin.html       ← Face registration
├── dashboard.html   ← View logs, search, manage rotation
├── manifest.json    ← PWA manifest
├── sw.js            ← Service worker (offline support)
├── js/
│   └── config.js   ← Your slot URLs & tokens (edit this)
├── icons/
│   └── icon.svg    ← App icon
└── Code.gs          ← Google Apps Script backend (deploy separately)
```

---

## QUICK REFERENCE

| Page | URL path | Purpose |
|------|----------|---------|
| Camera | `/camera.html` | Face detection & logging |
| Admin | `/admin.html` | Register/delete faces |
| Dashboard | `/dashboard.html` | View logs, search, rotate |

**Support:** All pages work on Android, iPhone, Mac, Windows, and Linux.
