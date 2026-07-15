// Google Apps Script Web App: receives Speaker Questionnaire submissions
// from the Vercel API (api/submit-survey.js) and appends them as a row
// in this spreadsheet, in real time, one submission at a time.
//
// Setup:
// 1. Open the target Google Sheet > Extensions > Apps Script.
// 2. Replace the default Code.gs contents with this file.
// 3. Project Settings (gear icon) > Script Properties > add a property
//    named SHARED_SECRET with a long random value.
//    Set the same value as SHEET_SYNC_SECRET in Vercel's env vars.
// 4. Deploy > New deployment > type "Web app".
//      Execute as: Me
//      Who has access: Anyone
//    ("Anyone" is required so the Vercel function can call this without
//    a Google login; the SHARED_SECRET check below is what actually
//    gates access, since Apps Script web apps can't read custom HTTP
//    headers, so the secret has to travel inside the JSON body.)
// 5. Copy the deployment's web app URL into Vercel as SHEET_SYNC_URL.
// 6. Re-run "Deploy > Manage deployments > Edit > New version" any time
//    you change this script — editing the file alone does not update
//    the live URL's code.

const SHEET_NAME = 'Speaker Answers';

// [payload key, column header] — order here is the column order in the sheet.
const COLUMNS = [
  ['submittedAt', 'Submitted At'],
  ['isResubmission', 'Resubmission?'],
  ['firstName', 'First Name'],
  ['lastName', 'Last Name'],
  ['email', 'Email'],
  ['sessionCode', 'Session Code'],
  ['sessionTitle', 'Session Title'],
  ['sessionVideoFormat', 'Session Video Format'],
  ['formatConfirmation', 'Format Confirmation'],
  ['sessionRecordingStatus', 'Session Recording Status'],
  ['recordingConfirmation', 'Recording Confirmation'],
  ['prerecordConfirmation', 'Prerecord Confirmation'],
  ['prerecordLiveSupport', 'Prerecord Live Support'],
  ['sbiMaxParticipants', 'Max Participants'],
  ['ceuOptOut', 'CEU Opt Out'],
  ['ceuObjectives', 'CEU Objectives'],
  ['ceuQuestions', 'CEU Questions'],
  ['sessionFollowupPrompt', 'Follow-up Prompt'],
  ['sessionFollowupResponse', 'Follow-up Response'],
  ['sessionTitleFeedback', 'Session Title Feedback'],
  ['avRequirements', 'AV Requirements'],
  ['additionalNotes', 'Additional Notes'],
  ['id', 'DB Row ID']
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Missing request body' });
    }

    const data = JSON.parse(e.postData.contents);
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');

    if (!expectedSecret || data.sharedSecret !== expectedSecret) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    // Debug ping: reports what this deployment thinks is true, without
    // writing a row. Lets you confirm a redeploy actually took effect.
    if (data.debugPing === true) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      return jsonResponse({
        success: true,
        debug: true,
        configuredSheetName: SHEET_NAME,
        existingTabs: ss.getSheets().map(s => s.getName()),
        spreadsheetUrl: ss.getUrl()
      });
    }

    appendRow(getOrCreateSheet(), data);

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

// Lets you open the deployment URL in a browser to sanity-check it's live.
function doGet() {
  return jsonResponse({ success: true, message: 'survey-sheet-sync is running' });
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(([, header]) => header));
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendRow(sheet, data) {
  const row = COLUMNS.map(([key]) => formatValue(key, data[key]));
  sheet.appendRow(row);
}

function formatValue(key, value) {
  if (value === undefined || value === null) return '';
  if (key === 'submittedAt') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? String(value) : date;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value;
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
