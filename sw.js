/**
 * ═══════════════════════════════════════════════════════
 * Face Logger v2 – Configuration
 * Edit this file after deploying your Apps Script slots.
 * Push the updated file to GitHub to apply changes.
 * ═══════════════════════════════════════════════════════
 *
 * SLOT ROTATION MODEL
 * ───────────────────
 * Alpha = live camera (always captures)
 * After every ROTATION_DAYS days:
 *   Epsilon's data → wiped (oldest, 60-75 days)
 *   Delta   ← Gamma's data
 *   Gamma   ← Beta's data
 *   Beta    ← Alpha's data
 *   Alpha   → starts fresh
 * This creates a rolling 75-day archive (5 × 15 days).
 * With fewer active slots, the archive window scales down:
 *   3 slots = 45 days, 2 slots = 30 days, 1 slot = 15 days
 */

window.FL_CONFIG = {

  // ── SLOT DEFINITIONS ─────────────────────────────────
  // Order matters: index 0 is always "Alpha" (live camera)
  // Set active:false for slots not yet deployed
  slots: [
    {
      name:   'Alpha',
      label:  'α Alpha',
      url:    'https://script.google.com/macros/s/AKfycbzbRS30ThWiJk3MIF6m5q3K1MQ70VUujnL0jQqgm-lzN2zRxIT8UKLlIH0NAaPt1jyz/exec',
      token:  '09caf87d-7341-400e-8332-d90e22097dc6',
      email:  'd.hemakumarr@gmail.com',
      active: true                           // ✓ deployed
    },
    {
      name:   'Beta',
      label:  'β Beta',
      url:    'YOUR_BETA_APPS_SCRIPT_URL_HERE',
      token:  'YOUR_BETA_API_SECRET_HERE',
      email:  'beta.user@gmail.com',
      active: false
    },
    {
      name:   'Gamma',
      label:  'γ Gamma',
      url:    'YOUR_GAMMA_APPS_SCRIPT_URL_HERE',
      token:  'YOUR_GAMMA_API_SECRET_HERE',
      email:  'gamma.user@gmail.com',
      active: false
    },
    {
      name:   'Delta',
      label:  'δ Delta',
      url:    'YOUR_DELTA_APPS_SCRIPT_URL_HERE',
      token:  'YOUR_DELTA_API_SECRET_HERE',
      email:  'delta.user@gmail.com',
      active: false
    },
    {
      name:   'Epsilon',
      label:  'ε Epsilon',
      url:    'YOUR_EPSILON_APPS_SCRIPT_URL_HERE',
      token:  'YOUR_EPSILON_API_SECRET_HERE',
      email:  'epsilon.user@gmail.com',
      active: false
    }
  ],

  // ── ROTATION SETTINGS ─────────────────────────────────
  rotationDays:      15,     // days per slot cycle
  autoRotateEnabled: true,   // show rotation reminder when due

  // ── DETECTION SETTINGS ────────────────────────────────
  detectIntervalMs:  2500,   // face scan every 2.5 seconds
  cooldownMs:        30000,  // min gap between same-person logs (30s)
  matchThreshold:    0.50,   // 0.0=strict … 1.0=loose (0.45–0.55 ideal)
  snapshotWidth:     640,    // JPEG snapshot width (px)
  thumbSize:         64,     // mini-thumbnail size stored in log (px)

  // ── CAMERA LOCATIONS ──────────────────────────────────
  locations: ['Lift', 'Staircase'],

  // ── GOOGLE SIGN-IN (optional) ─────────────────────────
  // Create OAuth client at console.cloud.google.com
  // Add your GitHub Pages URL as an authorized JavaScript origin
  // Leave empty '' to disable Google Sign-In (token-only auth)
  googleClientId: '',

  // ── APP META ──────────────────────────────────────────
  appVersion:  '2.0.0',
  appName:     'Face Logger',
  buildDate:   '2026-11-17'
};

// Convenience: get only active slots
window.FL_CONFIG.activeSlots = window.FL_CONFIG.slots.filter(s => s.active);

// Alpha slot is always index 0 of active slots
window.FL_CONFIG.alphaSlot = window.FL_CONFIG.activeSlots[0] || null;
