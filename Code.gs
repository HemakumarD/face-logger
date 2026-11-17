/**
 * ═══════════════════════════════════════════════════════════════════
 * FACE LOGGER v2 – Google Apps Script Backend
 * Deploy one copy of this per slot (Alpha, Beta, Gamma, Delta, Epsilon)
 *
 * FIRST-TIME SETUP:
 *   1. Paste this whole file into a new script.google.com project
 *   2. Run setupSlot('Alpha')  ← change name per slot
 *      ➜ Logs will show your API Secret — copy it to config.js
 *   3. Deploy → Web App → Execute as: Me → Anyone
 *   4. Copy the Web App URL to config.js
 *   5. Run setupTrigger() to enable auto-rotation check at midnight
 * ═══════════════════════════════════════════════════════════════════
 */

// ── CONSTANTS ──────────────────────────────────────────────────
const CFG = {
  ROOT_FOLDER:    'FaceLogger',
  ACTIVE_FOLDER:  'Active',
  ARCHIVE_FOLDER: 'Archive',
  FACES_FOLDER:   'Faces',
  LOG_SHEET_NAME: 'AccessLog',
  TIMEZONE:       'Asia/Kolkata',
  RATE_LIMIT_RPM: 120   // max requests per minute per IP
};

// Sheet column layout
const COL = {
  ID:         1,  // A
  TIMESTAMP:  2,  // B
  DATE:       3,  // C
  TIME:       4,  // D
  CAMERA:     5,  // E
  NAME:       6,  // F
  KNOWN:      7,  // G
  CONFIDENCE: 8,  // H
  THUMBNAIL:  9,  // I – base64 mini-thumb, travels through rotation
  IMAGE_ID:   10  // J – Drive file ID (valid only in this slot's drive)
};
const NUM_COLS = 10;

// ═══════════════════════════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const clientIp = e.parameter.ip || 'unknown';

    if (!rateLimit(clientIp)) {
      return jsonResp({ error: 'Rate limit exceeded. Please wait.' }, 429);
    }

    switch (body.action) {
      case 'log':           return jsonResp(logEntry(body.token, body.entry));
      case 'registerFace':  return jsonResp(registerFace(body.token, body));
      case 'deleteFace':    return jsonResp(deleteFace(body.token, body.name));
      case 'archiveNow':    return jsonResp(archiveActiveData(body.token));
      case 'wipeActive':    return jsonResp(wipeActiveData(body.token));
      case 'setCleanupMode':return jsonResp(setCleanupMode(body.token, body.mode));
      // Rotation actions
      case 'exportAll':     return jsonResp(exportAll(body.token));
      case 'receiveBackup': return jsonResp(receiveBackup(body.token, body.payload));
      case 'clearActive':   return jsonResp(clearActive(body.token));
      case 'saveVideo':     return jsonResp(saveVideoClip(body.token, body));
      default:              return jsonResp({ error: 'Unknown action: ' + body.action }, 400);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return jsonResp({ error: 'Internal error', msg: err.message }, 500);
  }
}

function doGet(e) {
  try {
    const token = e.parameter.token;
    const clientIp = e.parameter.ip || 'unknown';

    if (!rateLimit(clientIp)) {
      return jsonResp({ error: 'Rate limit exceeded.' }, 429);
    }

    switch (e.parameter.action) {
      case 'getLogs':      return jsonResp(getLogs(token, e.parameter));
      case 'getFaces':     return jsonResp(getRegisteredFaces(token));
      case 'getStats':     return jsonResp(getStats(token));
      case 'getArchives':  return jsonResp(getArchives(token));
      case 'getSlotStatus':return jsonResp(getSlotStatus(token));
      case 'getBatchLogs': return jsonResp(getBatchLogs(token, e.parameter.batch));
      case 'ping':         return jsonResp({ ok: true, slot: getSlotName(), ts: new Date().toISOString() });
      default:             return jsonResp({ ok: true, slot: getSlotName(), version: '2.0.0' });
    }
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return jsonResp({ error: err.message }, 500);
  }
}

function jsonResp(obj, code) {
  // Apps Script doesn't support HTTP status codes via ContentService,
  // so we embed a 'httpStatus' field for the client to check.
  if (code && code !== 200) obj.httpStatus = code;
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
// SECURITY – TOKEN & RATE LIMIT
// ═══════════════════════════════════════════════════════════════
function getApiSecret() {
  return PropertiesService.getScriptProperties().getProperty('API_SECRET') || '';
}

function validateToken(provided) {
  const secret = getApiSecret();
  if (!secret || !provided) return false;
  if (secret.length !== provided.length) return false;
  // Constant-time comparison (prevents timing attacks)
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

function auth(token) {
  if (!validateToken(token)) throw new Error('Unauthorized: invalid or missing API token');
}

function rateLimit(identifier) {
  try {
    const cache = CacheService.getScriptCache();
    const key   = 'rl_' + Utilities.base64Encode(identifier).substring(0, 20);
    const count = parseInt(cache.get(key) || '0');
    if (count >= CFG.RATE_LIMIT_RPM) return false;
    cache.put(key, String(count + 1), 60); // 60-second rolling window
    return true;
  } catch (e) {
    return true; // fail open if cache unavailable
  }
}

function sanitizeString(s, maxLen) {
  if (typeof s !== 'string') return '';
  return s.replace(/[<>"'`]/g, '').substring(0, maxLen || 200);
}

// ═══════════════════════════════════════════════════════════════
// DRIVE FOLDER HELPERS
// ═══════════════════════════════════════════════════════════════
function getRootFolder() {
  const it = DriveApp.getFoldersByName(CFG.ROOT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CFG.ROOT_FOLDER);
}
function getSub(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function getActiveFolder()  { return getSub(getRootFolder(), CFG.ACTIVE_FOLDER);  }
function getArchiveFolder() { return getSub(getRootFolder(), CFG.ARCHIVE_FOLDER); }
function getFacesFolder()   { return getSub(getRootFolder(), CFG.FACES_FOLDER);   }

// ═══════════════════════════════════════════════════════════════
// SHEET HELPER
// ═══════════════════════════════════════════════════════════════
function getLogSheet() {
  const root  = getRootFolder();
  const files = root.getFilesByName(CFG.LOG_SHEET_NAME);
  if (files.hasNext()) {
    const ss = SpreadsheetApp.open(files.next());
    return ss.getSheetByName('Log') || ss.getActiveSheet();
  }
  const ss    = SpreadsheetApp.create(CFG.LOG_SHEET_NAME);
  const sheet = ss.getActiveSheet();
  sheet.setName('Log');
  const hdr = ['ID','Timestamp','Date','Time','Camera','Name','Known','Confidence','Thumbnail','ImageFileID'];
  sheet.getRange(1, 1, 1, NUM_COLS).setValues([hdr])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  [120,180,100,80,100,180,70,100,80,120].forEach((w,i) => sheet.setColumnWidth(i+1, w));
  DriveApp.getFileById(ss.getId()).moveTo(root);
  return sheet;
}

function getSlotName() {
  return PropertiesService.getScriptProperties().getProperty('SLOT_NAME') || 'Unknown';
}

// ═══════════════════════════════════════════════════════════════
// LOG ENTRY
// ═══════════════════════════════════════════════════════════════
function logEntry(token, entry) {
  auth(token);
  if (!entry || !entry.timestamp) return { error: 'Invalid entry: timestamp required' };

  const sheet      = getLogSheet();
  const dateStr    = entry.timestamp.substring(0, 10);
  const timeStr    = entry.timestamp.substring(11, 19);
  const dateFolder = getSub(getActiveFolder(), dateStr);
  let   imageFileId = '';

  // Save full snapshot to Drive
  if (entry.imageDataUrl) {
    try {
      const b64   = entry.imageDataUrl.replace(/^data:image\/(jpeg|jpg|png);base64,/, '');
      const bytes = Utilities.base64Decode(b64);
      const fname = `${dateStr.replace(/-/g,'')}_${timeStr.replace(/:/g,'')}_${sanitizeString(entry.camera||'',10)}_${sanitizeString(entry.name||'Unknown',30)}.jpg`;
      const file  = dateFolder.createFile(Utilities.newBlob(bytes, 'image/jpeg', fname));
      imageFileId = file.getId();
    } catch (imgErr) { Logger.log('Image save: ' + imgErr.message); }
  }

  // thumb comes pre-encoded from camera.html (60×60 base64 JPEG, ~1–2 KB)
  const thumb = (entry.thumb || '').substring(0, 10000); // hard cap

  sheet.appendRow([
    sanitizeString(entry.id || Utilities.getUuid(), 36),
    entry.timestamp,
    dateStr,
    timeStr,
    sanitizeString(entry.camera  || '', 20),
    sanitizeString(entry.name    || 'Unknown', 100),
    entry.isKnown ? 'Yes' : 'No',
    entry.confidence ? String(entry.confidence).substring(0, 6) : '',
    thumb,
    imageFileId
  ]);

  return { success: true, imageFileId };
}

// ═══════════════════════════════════════════════════════════════
// REGISTERED FACES
// ═══════════════════════════════════════════════════════════════
function getRegisteredFaces(token) {
  auth(token);
  const folder = getFacesFolder();
  const files  = folder.getFilesByName('registered_faces.json');
  if (!files.hasNext()) return { faces: [] };
  try { return JSON.parse(files.next().getBlob().getDataAsString()); }
  catch (e) { return { faces: [] }; }
}

function saveRegisteredFaces(data) {
  const folder  = getFacesFolder();
  const content = JSON.stringify(data);
  const files   = folder.getFilesByName('registered_faces.json');
  if (files.hasNext()) files.next().setContent(content);
  else folder.createFile('registered_faces.json', content, 'application/json');
}

function registerFace(token, body) {
  auth(token);
  const name       = sanitizeString(body.name || '', 100);
  const unit       = sanitizeString(body.unit || '', 50);
  const descriptor = body.descriptor;
  if (!name || !descriptor) return { error: 'name and descriptor required' };
  if (!Array.isArray(descriptor) || descriptor.length !== 128) return { error: 'Invalid descriptor (need 128 floats)' };

  const data  = getRegisteredFaces(token);
  const faces = data.faces || [];
  const idx   = faces.findIndex(f => f.name === name);
  if (idx >= 0) {
    faces[idx].descriptors.push(descriptor);
    faces[idx].updatedAt = new Date().toISOString();
  } else {
    faces.push({ name, unit, descriptors: [descriptor], createdAt: new Date().toISOString() });
  }
  saveRegisteredFaces({ faces });
  return { success: true, name, totalDescriptors: idx >= 0 ? faces[idx].descriptors.length : 1 };
}

function deleteFace(token, name) {
  auth(token);
  if (!name) return { error: 'name required' };
  const data  = getRegisteredFaces(token);
  const faces = (data.faces || []).filter(f => f.name !== sanitizeString(name, 100));
  saveRegisteredFaces({ faces });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// LOGS QUERY
// ═══════════════════════════════════════════════════════════════
function sheetToLogs(sheet) {
  const all = sheet.getDataRange().getValues();
  if (all.length <= 1) return [];
  const headers = all[0];
  return all.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[String(h)] = row[i] instanceof Date ? row[i].toISOString() : String(row[i] || ''));
    return obj;
  });
}

function applyFilters(rows, params) {
  if (params.date)   rows = rows.filter(r => r.Date   === params.date);
  if (params.from)   rows = rows.filter(r => r.Date   >= params.from);
  if (params.to)     rows = rows.filter(r => r.Date   <= params.to);
  if (params.camera) rows = rows.filter(r => r.Camera === params.camera);
  if (params.name)   rows = rows.filter(r => (r.Name||'').toLowerCase().includes(params.name.toLowerCase()));
  return rows;
}

function getLogs(token, params) {
  auth(token);
  let rows  = sheetToLogs(getLogSheet());
  rows      = applyFilters(rows, params);
  const total = rows.length;
  rows.reverse(); // newest first
  const limit = Math.min(parseInt(params.limit) || 100, 500);
  return { logs: rows.slice(0, limit), total, slot: getSlotName() };
}

function getBatchLogs(token, batchName) {
  auth(token);
  if (!batchName) return { error: 'batch name required' };
  const ss    = SpreadsheetApp.openById(DriveApp.getFilesByName(CFG.LOG_SHEET_NAME).hasNext()
    ? DriveApp.getFilesByName(CFG.LOG_SHEET_NAME).next().getId() : '');
  if (!ss) return { logs: [], total: 0 };
  const sheet = ss.getSheetByName(batchName);
  if (!sheet) return { logs: [], total: 0, error: 'Batch not found' };
  const rows = sheetToLogs(sheet).reverse();
  return { logs: rows, total: rows.length, batchName, slot: getSlotName() };
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════
function getStats(token) {
  auth(token);
  const rows  = sheetToLogs(getLogSheet());
  const today = Utilities.formatDate(new Date(), CFG.TIMEZONE, 'yyyy-MM-dd');
  return {
    total:     rows.length,
    today:     rows.filter(r => r.Date === today).length,
    known:     rows.filter(r => r.Known === 'Yes').length,
    unknown:   rows.filter(r => r.Known !== 'Yes').length,
    byCamera: {
      Lift:      rows.filter(r => r.Camera === 'Lift').length,
      Staircase: rows.filter(r => r.Camera === 'Staircase').length
    },
    slot: getSlotName(),
    rotationStart: PropertiesService.getScriptProperties().getProperty('ROTATION_START') || null
  };
}

// ═══════════════════════════════════════════════════════════════
// ARCHIVE & CLEANUP
// ═══════════════════════════════════════════════════════════════
function archiveActiveData(token) {
  auth(token);
  const archiveDir = getArchiveFolder();
  const now        = new Date();
  const batchName  = 'Batch_' + Utilities.formatDate(now, CFG.TIMEZONE, 'yyyyMMdd_HHmm');
  const batchDir   = getSub(archiveDir, batchName);
  let   moved      = 0;
  const it         = getActiveFolder().getFolders();
  while (it.hasNext()) { it.next().moveTo(batchDir); moved++; }

  // Export log to CSV in batch folder
  const sheet = getLogSheet();
  if (sheet.getLastRow() > 1) {
    const csv = sheet.getDataRange().getValues().map(r =>
      r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')
    ).join('\n');
    batchDir.createFile('log_export.csv', csv, 'text/csv');
  }
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);

  return { success: true, batchName, movedFolders: moved, url: batchDir.getUrl() };
}

function wipeActiveData(token) {
  auth(token);
  const sheet = getLogSheet();
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  const it = getActiveFolder().getFolders();
  let wiped = 0;
  while (it.hasNext()) { it.next().setTrashed(true); wiped++; }
  return { success: true, wipedFolders: wiped };
}

function getArchives(token) {
  auth(token);
  const it = getArchiveFolder().getFolders();
  const result = [];
  while (it.hasNext()) {
    const f = it.next();
    result.push({ name: f.getName(), id: f.getId(), createdAt: f.getDateCreated().toISOString(), url: f.getUrl() });
  }
  result.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  return { archives: result, slot: getSlotName() };
}

function getCleanupMode() {
  return PropertiesService.getScriptProperties().getProperty('CLEANUP_MODE') || 'archive';
}

function setCleanupMode(token, mode) {
  auth(token);
  if (!['archive','wipe'].includes(mode)) return { error: 'Invalid mode' };
  PropertiesService.getScriptProperties().setProperty('CLEANUP_MODE', mode);
  return { success: true, mode };
}

// ═══════════════════════════════════════════════════════════════
// SLOT STATUS
// ═══════════════════════════════════════════════════════════════
function getSlotStatus(token) {
  auth(token);
  const props       = PropertiesService.getScriptProperties();
  const sheet       = getLogSheet();
  const slotName    = getSlotName();
  const rotStart    = props.getProperty('ROTATION_START') || new Date().toISOString();
  const lastRecv    = props.getProperty('LAST_RECEIVED_META');
  const activeCount = Math.max(0, sheet.getLastRow() - 1);
  const daysSince   = Math.floor((Date.now() - new Date(rotStart).getTime()) / 86400000);

  // List batch sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const batches = ss ? ss.getSheets()
    .filter(s => s.getName().startsWith('Batch_'))
    .map(s => ({ name: s.getName(), rows: Math.max(0, s.getLastRow() - 1) })) : [];

  return {
    success: true,
    slot: slotName,
    activeLogCount: activeCount,
    rotationStartDate: rotStart,
    daysSinceRotation: daysSince,
    batches,
    lastReceived: lastRecv ? JSON.parse(lastRecv) : null
  };
}

// ═══════════════════════════════════════════════════════════════
// ROTATION – EXPORT / RECEIVE / CLEAR
// ═══════════════════════════════════════════════════════════════
function exportAll(token) {
  auth(token);
  const rows = sheetToLogs(getLogSheet());
  return {
    success:    true,
    slotName:   getSlotName(),
    exportDate: new Date().toISOString(),
    logCount:   rows.length,
    logs:       rows,
    rotationId: Utilities.getUuid()
  };
}

function receiveBackup(token, payload) {
  auth(token);
  if (!payload || !payload.logs) return { error: 'Invalid payload: logs required' };

  const { logs, slotName, exportDate, rotationId } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Remove all previous batch sheets
  ss.getSheets()
    .filter(s => s.getName().startsWith('Batch_'))
    .forEach(s => { try { ss.deleteSheet(s); } catch (e) {} });

  // Create new batch sheet
  const batchName  = 'Batch_' + new Date().toISOString().substring(0,10).replace(/-/g,'');
  const batchSheet = ss.insertSheet(batchName);
  const hdr = ['ID','Timestamp','Date','Time','Camera','Name','Known','Confidence','Thumbnail','SourceSlot'];
  batchSheet.getRange(1, 1, 1, 10).setValues([hdr])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');

  if (logs.length > 0) {
    const rows = logs.map(l => [
      l.ID||'', l.Timestamp||'', l.Date||'', l.Time||'',
      l.Camera||'', l.Name||'Unknown', l.Known||'No', l.Confidence||'',
      (l.Thumbnail||'').substring(0, 10000),
      sanitizeString(slotName||'', 20)
    ]);
    // Write in chunks of 500 to avoid Sheets API limits
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      batchSheet.getRange(i + 2, 1, chunk.length, 10).setValues(chunk);
    }
  }

  // Record metadata
  PropertiesService.getScriptProperties().setProperty('LAST_RECEIVED_META', JSON.stringify({
    from: sanitizeString(slotName||'',20),
    date: exportDate || new Date().toISOString(),
    count: logs.length,
    rotationId: rotationId || ''
  }));

  return { success: true, received: logs.length, batchName };
}

function clearActive(token) {
  auth(token);
  const sheet = getLogSheet();
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  // Trash old date folders in Active
  const it = getActiveFolder().getFolders();
  while (it.hasNext()) it.next().setTrashed(true);
  // Reset rotation clock
  PropertiesService.getScriptProperties().setProperty('ROTATION_START', new Date().toISOString());
  return { success: true, clearedAt: new Date().toISOString(), slot: getSlotName() };
}

// ═══════════════════════════════════════════════════════════════
// VIDEO CLIP SAVING
// ═══════════════════════════════════════════════════════════════
function saveVideoClip(token, body) {
  auth(token);
  const { camera, filename, videoBase64, mimeType } = body;
  if (!videoBase64 || !filename) return { error: 'filename and videoBase64 required' };

  try {
    const root    = getRootFolder();
    const vidRoot = getSub(root, 'Videos');
    const dateStr = Utilities.formatDate(new Date(), CFG.TIMEZONE, 'yyyy-MM-dd');
    const dateDir = getSub(vidRoot, dateStr);
    const camDir  = getSub(dateDir, sanitizeString(camera || 'Unknown', 20));

    const bytes  = Utilities.base64Decode(videoBase64.replace(/^data:[^;]+;base64,/, ''));
    const mime   = (mimeType || 'video/webm').split(';')[0];
    const safe   = sanitizeString(filename, 100);
    const blob   = Utilities.newBlob(bytes, mime, safe);
    const file   = camDir.createFile(blob);

    Logger.log('Video saved: ' + safe + ' (' + bytes.length + ' bytes) → ' + file.getId());
    return { success: true, fileId: file.getId(), filename: safe, bytes: bytes.length };
  } catch (err) {
    Logger.log('saveVideoClip error: ' + err.message);
    return { error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULED MIDNIGHT CHECK (every 15 days)
// ═══════════════════════════════════════════════════════════════
function scheduledCleanup() {
  const props    = PropertiesService.getScriptProperties();
  const rotStart = props.getProperty('ROTATION_START') || new Date().toISOString();
  const days     = Math.floor((Date.now() - new Date(rotStart).getTime()) / 86400000);
  const retDays  = parseInt(props.getProperty('RETENTION_DAYS') || '15');
  if (days < retDays) return;
  if (getCleanupMode() === 'archive') archiveActiveData(getApiSecret());
  else wipeActiveData(getApiSecret());
}

// ═══════════════════════════════════════════════════════════════
// ONE-TIME SETUP (run from editor: Extensions → Run → setupSlot)
// ═══════════════════════════════════════════════════════════════
function setupSlot(slotName) {
  const props = PropertiesService.getScriptProperties();

  // Generate API secret if not set
  if (!props.getProperty('API_SECRET')) {
    props.setProperty('API_SECRET', Utilities.getUuid());
  }

  if (slotName) props.setProperty('SLOT_NAME', slotName);
  if (!props.getProperty('ROTATION_START')) {
    props.setProperty('ROTATION_START', new Date().toISOString());
  }
  props.setProperty('RETENTION_DAYS', '15');

  // Create folder structure
  getRootFolder(); getActiveFolder(); getArchiveFolder(); getFacesFolder(); getLogSheet();

  const secret = props.getProperty('API_SECRET');
  Logger.log('══════════════════════════════════════════');
  Logger.log('✓ Slot name  : ' + props.getProperty('SLOT_NAME'));
  Logger.log('✓ API Secret : ' + secret);
  Logger.log('  ← COPY THIS to config.js token field');
  Logger.log('══════════════════════════════════════════');
  Logger.log('Drive folder: ' + getRootFolder().getUrl());
  Logger.log('Next step: Deploy as Web App and copy the URL to config.js');

  return 'Setup complete for slot: ' + props.getProperty('SLOT_NAME');
}

function setupTrigger() {
  // Remove existing cleanup triggers
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'scheduledCleanup')
    .forEach(t => ScriptApp.deleteTrigger(t));

  // Daily at midnight IST
  ScriptApp.newTrigger('scheduledCleanup')
    .timeBased().atHour(0).everyDays(1).inTimezone(CFG.TIMEZONE).create();

  Logger.log('✓ Daily cleanup trigger created (midnight IST)');
}

// Quick test: run this to verify token from the editor
function testToken() {
  const t = getApiSecret();
  Logger.log('API Secret: ' + t);
  Logger.log('validateToken test: ' + validateToken(t));
}
