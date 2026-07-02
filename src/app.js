const SESSION_DATA_URL = "/api/sessions";
// Toggle tabs here. Set enabled: false to hide a tab without editing markup.
const TAB_CONFIG = [
  { id: "overview-tab", label: "Overview", sectionId: "overview", enabled: true },
  {
    id: "survey-tab",
    label: "Speaker Survey",
    sectionId: "survey",
    enabled: true,
    featured: true
  },
  { id: "faqs-tab", label: "Frequently Asked Questions (FAQs)", sectionId: "faqs", enabled: true },
  { id: "session-lookup-tab", label: "Session Information Lookup", sectionId: "session-lookup", enabled: true },
  {
    id: "speaker-resource-guide",
    label: "Speaker Resource Guide (PDF)",
    url: "REPLACE_WITH_2026_SPEAKER_RESOURCE_GUIDE_URL",
    enabled: false,
    external: true
  },
  {
    id: "attendee-hub-video",
    label: "Informational Video on Attendee Hub",
    url: "REPLACE_WITH_2026_ATTENDEE_HUB_VIDEO_URL",
    enabled: false,
    external: true
  },
];

let SESSIONS_AS_OF = "";
let sessions = [];
const SPEAKER_INDEX = [];
let selectedSurveySession = null;

document.addEventListener("DOMContentLoaded", () => {
  renderTabs();
  bindOverviewSurveyCta();
  bindLookup();
  bindSurvey();
  bindClickTracking();
  bindIframeHeight();
  loadSessions();
});

function renderTabs() {
  const tabsEl = document.getElementById("primary-tabs");
  const enabledTabs = TAB_CONFIG.filter(tab => tab.enabled);
  const firstInternalTab = enabledTabs.find(tab => !tab.external);

  tabsEl.innerHTML = "";
  enabledTabs.forEach(tab => {
    const button = document.createElement("button");
    button.id = tab.id;
    button.type = "button";
    button.className = [
      "tab-btn",
      tab.featured ? "tab-featured" : "",
      tab.external ? "tab-external tab-inactive" : tab.sectionId === firstInternalTab?.sectionId ? "tab-active" : "tab-inactive",
      "px-6",
      "py-3",
      "font-medium",
      "text-sm"
    ].join(" ");

    if (tab.mobileLabel) {
      button.innerHTML = `<span class="desktop-label">${tab.label}</span><span class="mobile-label">${tab.mobileLabel}</span>`;
    } else {
      button.textContent = tab.label;
    }

    if (tab.external) {
      button.addEventListener("click", () => window.open(tab.url, "_blank", "noopener,noreferrer"));
    } else {
      button.dataset.tab = tab.sectionId;
      button.addEventListener("click", () => activateTab(tab.sectionId));
    }

    tabsEl.appendChild(button);
  });

  document.querySelectorAll(".content-section").forEach(section => {
    section.classList.toggle("active", section.id === firstInternalTab?.sectionId);
  });
}

function activateTab(sectionId) {
  TAB_CONFIG.filter(tab => tab.enabled && !tab.external).forEach(tab => {
    const button = document.getElementById(tab.id);
    if (!button) return;
    button.classList.toggle("tab-active", tab.sectionId === sectionId);
    button.classList.toggle("tab-inactive", tab.sectionId !== sectionId);
  });

  document.querySelectorAll(".content-section").forEach(section => {
    section.classList.toggle("active", section.id === sectionId);
  });
}

function bindOverviewSurveyCta() {
  const cta = document.getElementById("overview-survey-cta");
  if (!cta) return;
  cta.addEventListener("click", () => activateTab("survey"));
}

function formatSessionDateTime(session) {
  const start = session.start || "";
  const end = session.end || "";
  if (!start && !end) return "Not listed";
  const [date, time] = start.split("|");
  const dateLabel = formatSessionDate(date);
  const timeLabel = formatSessionTimeRange(time, end);
  return [dateLabel, timeLabel].filter(Boolean).join(", ") || "Not listed";
}

function formatSessionDate(dateValue) {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return dateValue;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function parseTimeParts(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function formatClockTime(parts, includePeriod) {
  if (!parts) return "";
  const period = parts.hour >= 12 ? "pm" : "am";
  const hour = parts.hour % 12 || 12;
  const minute = String(parts.minute).padStart(2, "0");
  return `${hour}:${minute}${includePeriod ? period : ""}`;
}

function formatSessionTimeRange(startValue, endValue) {
  const start = parseTimeParts(startValue);
  const end = parseTimeParts(endValue);
  if (!start && !end) return "";
  if (start && !end) return `${formatClockTime(start, true)} MDT`;
  if (!start && end) return `${formatClockTime(end, true)} MDT`;

  const samePeriod = (start.hour >= 12) === (end.hour >= 12);
  const startText = formatClockTime(start, !samePeriod);
  const endText = formatClockTime(end, true);
  return `${startText}-${endText} MDT`;
}

function isCeuEligible(session) {
  return normalize(session?.ceuEligibility || "") === "ceu eligible";
}

function isKeynote(session) {
  return normalize(session?.presentationType || "").includes("keynote");
}

function hasPreRecordInterest(session) {
  return normalize(session?.preRecordInterest || "") === "yes";
}

function radioGroup(name, options, required = true) {
  return options.map((option, index) => `
    <label class="flex items-start gap-2 text-sm text-gray-800">
      <input type="radio" name="${name}" value="${escapeHtml(option)}" ${required && index === 0 ? "required" : ""} class="mt-1" />
      <span>${escapeHtml(option)}</span>
    </label>
  `).join("");
}

function renderSurveyForSession(session) {
  selectedSurveySession = session;
  document.getElementById("survey-session-id").value = session.id || "";

  const summary = document.getElementById("survey-session-summary");
  summary.innerHTML = `
    <h3 class="font-bold text-[#162A53] mb-2">Selected session</h3>
    <p class="font-semibold text-sm text-gray-900 mb-2">${escapeHtml(session.title || "Not listed")}</p>
    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">Date/time:</dt><dd>${escapeHtml(formatSessionDateTime(session))}</dd></div>
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">Session code:</dt><dd>${escapeHtml(session.code || "Not listed")}</dd></div>
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">CEU:</dt><dd>${escapeHtml(session.ceuEligibility || "Not listed")}</dd></div>
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">Recording:</dt><dd>${escapeHtml(session.recordingStatus || "Not listed")}</dd></div>
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">Format:</dt><dd>${escapeHtml(session.videoFormat || "Not listed")}</dd></div>
      ${session.preRecordInterest ? `<div class="flex gap-1"><dt class="font-semibold text-gray-600">Pre-recording interest:</dt><dd>${escapeHtml(session.preRecordInterest)}</dd></div>` : ""}
    </dl>
  `;
  summary.classList.remove("hidden");

  const conditional = document.getElementById("survey-conditional-fields");
  conditional.classList.remove("hidden");

  const ceuSection = document.getElementById("survey-ceu-section");
  ceuSection.classList.toggle("hidden", !isCeuEligible(session));
  document.getElementById("survey-ceu-objectives").required = isCeuEligible(session);
  document.getElementById("survey-ceu-questions").required = isCeuEligible(session);

  const formatSection = document.getElementById("survey-format-section");
  const feature = (session.videoFormat || "").trim();
  const showFormat = !isKeynote(session) && ["zoom", "embedded"].includes(normalize(feature));
  formatSection.classList.toggle("hidden", !showFormat);
  if (showFormat) {
    const explanation = normalize(feature) === "zoom"
      ? "This session is listed as using the standard Zoom-based format connected to the virtual event experience. Please confirm whether this format works for your session."
      : "This session is listed as Embedded in Attendee Hub / the virtual event experience rather than only as a standard external Zoom room. Please confirm whether this format works for your session.";
    formatSection.innerHTML = `
      <h3 class="font-bold text-[#162A53]">Session format confirmation</h3>
      <p class="text-sm text-gray-800">${escapeHtml(explanation)}</p>
      ${radioGroup("format-confirmation", ["Yes, this works for my session.", "I have a question or concern about this format."])}
    `;
  } else {
    formatSection.innerHTML = "";
  }

  const recordingText = normalize(session.recordingStatus || "").includes("not")
    ? "Our records show this session is currently marked as not recorded."
    : "Our records show this session is currently marked to be recorded.";
  document.getElementById("survey-recording-section").innerHTML = `
    <h3 class="font-bold text-[#162A53]">Recording confirmation</h3>
    <p class="text-sm text-gray-800">${escapeHtml(recordingText)}</p>
    ${radioGroup("recording-confirmation", ["This looks correct.", "I have a question or this does not look correct."])}
  `;

  const prerecordSection = document.getElementById("survey-prerecord-section");
  prerecordSection.classList.toggle("hidden", !hasPreRecordInterest(session));
  prerecordSection.innerHTML = hasPreRecordInterest(session) ? `
    <h3 class="font-bold text-[#162A53]">Pre-recording confirmation</h3>
    <p class="text-sm text-gray-800">You expressed interest in pre-recording your session. Please indicate here if you formally plan on pre-recording your session. If we do not receive a response, we will assume you will present your session live.</p>
    ${radioGroup("prerecord-confirmation", [
      "Yes, I formally plan to pre-record this session.",
      "No, I plan to present this session live.",
      "I have a question or need to discuss this with the Global Gathering Team."
    ])}
  ` : "";
}

function selectedRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function parseCeuDraft(output) {
  const text = String(output || "").trim();
  const questionsHeader = /Suggested Knowledge-Check Questions:/i;
  const objectivesHeader = /Suggested Measurable Objectives:/i;
  const questionsMatch = text.match(questionsHeader);
  const objectivesMatch = text.match(objectivesHeader);

  if (!questionsMatch || !objectivesMatch) {
    return { questions: "", objectives: "" };
  }

  const questionsStart = questionsMatch.index + questionsMatch[0].length;
  const objectivesStart = objectivesMatch.index + objectivesMatch[0].length;

  if (questionsMatch.index < objectivesMatch.index) {
    return {
      questions: text.slice(questionsStart, objectivesMatch.index).trim(),
      objectives: text.slice(objectivesStart).trim()
    };
  }

  return {
    objectives: text.slice(objectivesStart, questionsMatch.index).trim(),
    questions: text.slice(questionsStart).trim()
  };
}

async function loadSessions() {
  try {
    const res = await fetch(SESSION_DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch sessions JSON");

    const data = await res.json();
    SESSIONS_AS_OF = data.SESSIONS_AS_OF || "";
    sessions = data.sessions || [];
    SPEAKER_INDEX.splice(0, SPEAKER_INDEX.length, ...buildSpeakerIndex());
  } catch (err) {
    console.error("Error loading sessions:", err);
    const status = document.getElementById("lookup-status");
    if (status) status.textContent = "Session data could not be loaded. Please refresh the page or contact the Global Gathering Team if the problem continues.";
  }
}

function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-'']/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(a, b) {
  const A = new Set(normalize(a).split(" ").filter(Boolean));
  const B = new Set(normalize(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  A.forEach(t => {
    if (B.has(t)) inter++;
  });
  const union = A.size + B.size - inter;
  const jaccard = inter / union;
  const subsetBoost = [...A].every(t => B.has(t)) || [...B].every(t => A.has(t)) ? 0.15 : 0;
  return Math.min(1, jaccard + subsetBoost);
}

function levenshtein(a, b) {
  a = normalize(a);
  b = normalize(b);
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;

  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

function scoreTitle(query, title) {
  const ts = tokenSimilarity(query, title);
  if (query.length <= 20 || title.length <= 20) {
    const maxLen = Math.max(normalize(query).length, normalize(title).length) || 1;
    const levScore = 1 - levenshtein(query, title) / maxLen;
    return ts * 0.7 + levScore * 0.3;
  }
  return ts;
}

function buildSpeakerIndex() {
  const rows = [];
  for (const s of sessions) {
    (s.speakers || []).forEach(sp => {
      const display = sp.name || "";
      const n = normalize(display);
      const n2 = n.replace(/\s+/g, "");
      rows.push([s, display, n, n2]);
    });
  }
  return rows;
}

function searchBySpeaker(first, last) {
  const qFull = normalize(`${first} ${last}`);
  const qTight = qFull.replace(/\s+/g, "");
  const results = [];

  for (const [sess, display, n, n2] of SPEAKER_INDEX) {
    const sim = Math.max(tokenSimilarity(qFull, n), tokenSimilarity(qTight, n2));
    if (sim >= 0.45) {
      results.push({
        session: sess,
        similarity: sim,
        speakerMatched: display
      });
    }
  }

  const bestById = new Map();
  results.forEach(r => {
    const id = r.session.id;
    if (!bestById.has(id) || r.similarity > bestById.get(id).similarity) bestById.set(id, r);
  });
  return [...bestById.values()].sort((a, b) => b.similarity - a.similarity);
}

function searchByTitle(query) {
  const out = [];
  for (const s of sessions) {
    const sc = scoreTitle(query, s.title || "");
    if (sc >= 0.35) out.push({ session: s, similarity: sc });
  }
  return out.sort((a, b) => b.similarity - a.similarity);
}

function renderResults(rows, statusEl, containerEl, mode) {
  if (!rows.length) {
    containerEl.innerHTML = "";
    statusEl.textContent = "No matches found. Try a shorter search term or contact the Global Gathering Team if you need help.";
    return;
  }

  containerEl.innerHTML = `
    <table class="min-w-full text-sm">
      <thead>
        <tr class="border-b">
          <th class="text-left py-2 pr-4 font-semibold">Title</th>
          ${mode === "speaker" ? '<th class="text-left py-2 pr-4 font-semibold">Speaker</th>' : ""}
          <th class="text-left py-2 pr-4 font-semibold">Recording</th>
          <th class="text-left py-2 pr-4 font-semibold">CEU</th>
          <th class="text-left py-2 pr-4 font-semibold">Video Format</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => {
          const s = row.session;
          return `
            <tr class="border-b align-top">
              <td class="py-2 pr-4">${escapeHtml(s.title || "")}</td>
              ${mode === "speaker" ? `<td class="py-2 pr-4">${escapeHtml(row.speakerMatched || "")}</td>` : ""}
              <td class="py-2 pr-4">${escapeHtml(s.recordingStatus || "")}</td>
              <td class="py-2 pr-4">${escapeHtml(s.ceuEligibility || "")}</td>
              <td class="py-2 pr-4">${escapeHtml(s.videoFormat || "")}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
  statusEl.textContent = `${rows.length} match${rows.length === 1 ? "" : "es"} found - Session data as of ${SESSIONS_AS_OF}.`;
}

function bindLookup() {
  const tabSpeakerBtn = document.getElementById("lookup-tab-speaker");
  const tabSessionBtn = document.getElementById("lookup-tab-session");
  const speakerForm = document.getElementById("speaker-form");
  const sessionForm = document.getElementById("session-form");
  const resultsEl = document.getElementById("lookup-results");
  const statusEl = document.getElementById("lookup-status");
  const tipsEl = document.getElementById("lookup-tips");

  function updateTips(mode) {
    if (mode === "speaker") {
      tipsEl.innerHTML = `
        <p>Tips for Speaker search:</p>
        <ul class="list-disc list-inside">
          <li>If the search is not returning any results, try using only your first name or only your last name.</li>
          <li>Double check the <b>Speaker</b> column to confirm that the listed session belongs to you.</li>
          <li>If you still cannot identify yourself, please contact the Global Gathering Team.</li>
        </ul>
      `;
      return;
    }

    tipsEl.innerHTML = `
      <p>Tips for Session search:</p>
      <ul class="list-disc list-inside">
        <li>Start typing a few consecutive words from your session title and select the correct title from the drop-down if it appears.</li>
        <li>If your title does not appear, try a shorter keyword or phrase from the session title.</li>
      </ul>
    `;
  }

  function setTab(which) {
    const isSpeaker = which === "speaker";
    tabSpeakerBtn.classList.toggle("tab-active", isSpeaker);
    tabSpeakerBtn.classList.toggle("tab-inactive", !isSpeaker);
    tabSpeakerBtn.classList.toggle("bg-[#162A53]", isSpeaker);
    tabSpeakerBtn.classList.toggle("text-white", isSpeaker);
    tabSessionBtn.classList.toggle("tab-active", !isSpeaker);
    tabSessionBtn.classList.toggle("tab-inactive", isSpeaker);
    tabSessionBtn.classList.toggle("bg-[#162A53]", !isSpeaker);
    tabSessionBtn.classList.toggle("text-white", !isSpeaker);
    speakerForm.classList.toggle("hidden", !isSpeaker);
    sessionForm.classList.toggle("hidden", isSpeaker);
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
    updateTips(which);
  }

  tabSpeakerBtn.addEventListener("click", () => setTab("speaker"));
  tabSessionBtn.addEventListener("click", () => setTab("session"));
  updateTips("speaker");

  speakerForm.addEventListener("submit", e => {
    e.preventDefault();
    const first = document.getElementById("speaker-first").value || "";
    const last = document.getElementById("speaker-last").value || "";
    if (!first && !last) {
      statusEl.textContent = "Enter at least a first or last name to search for speaker records.";
      resultsEl.innerHTML = "";
      return;
    }
    if (!sessions.length) {
      statusEl.textContent = "Session data is still loading. Please try again in a moment.";
      resultsEl.innerHTML = "";
      return;
    }
    renderResults(searchBySpeaker(first, last), statusEl, resultsEl, "speaker");
  });

  document.getElementById("speaker-clear").addEventListener("click", () => {
    document.getElementById("speaker-first").value = "";
    document.getElementById("speaker-last").value = "";
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
  });

  sessionForm.addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("session-title").value || "";
    if (!q.trim()) {
      statusEl.textContent = "Type a few words from the session title to search for session records.";
      resultsEl.innerHTML = "";
      return;
    }
    if (!sessions.length) {
      statusEl.textContent = "Session data is still loading. Please try again in a moment.";
      resultsEl.innerHTML = "";
      return;
    }
    renderResults(searchByTitle(q), statusEl, resultsEl, "session");
  });

  document.getElementById("session-clear").addEventListener("click", () => {
    document.getElementById("session-title").value = "";
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
  });

  const sessionInput = document.getElementById("session-title");
  const suggestionsBox = document.getElementById("session-suggestions");

  sessionInput.addEventListener("input", () => {
    const q = sessionInput.value.toLowerCase().trim();
    suggestionsBox.innerHTML = "";
    if (!q) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    const matches = sessions.filter(s => (s.title || "").toLowerCase().includes(q));
    if (!matches.length) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    matches.forEach(s => {
      const div = document.createElement("div");
      div.textContent = s.title;
      div.className = "px-3 py-2 hover:bg-gray-100 cursor-pointer";
      div.addEventListener("click", () => {
        sessionInput.value = s.title;
        suggestionsBox.classList.add("hidden");
        renderResults(searchByTitle(s.title), statusEl, resultsEl, "session");
      });
      suggestionsBox.appendChild(div);
    });
    suggestionsBox.classList.remove("hidden");
  });

  document.addEventListener("click", e => {
    if (!suggestionsBox.contains(e.target) && e.target !== sessionInput) suggestionsBox.classList.add("hidden");
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Click tracking (once per session)
var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxq8HofSFbnFxS7HeKQKZVhyuPIqpu_7NAWhvOzAXBzyxfatdeJu8hfGCRCahOINshA/exec";
var TRACK_KEY = "ggSpeakerPortalTracked";

async function trackClick() {
  if (sessionStorage.getItem(TRACK_KEY)) return;
  sessionStorage.setItem(TRACK_KEY, "1");

  var params = new URLSearchParams({
    sheet: "2026Registration",
    button: "SpeakerPortal"
  });

  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 3000);
    var geo = await fetch("https://ipapi.co/json/", { signal: ctrl.signal }).then(function (r) { return r.json(); });
    clearTimeout(timer);
    if (geo.ip) params.set("ip", geo.ip);
    if (geo.country_name) params.set("country", geo.country_name);
    if (geo.region) params.set("state", geo.region);
    if (geo.city) params.set("city", geo.city);
  } catch (_) {}

  fetch(SCRIPT_URL + "?" + params.toString(), { mode: "no-cors" }).catch(function () {});
}

function bindClickTracking() {
  document.getElementById("speakerPortalShell").addEventListener("pointerdown", trackClick, { once: true });
}

function bindSurvey() {
  const form = document.getElementById("survey-form");
  if (!form) return;

  const sessionInput = document.getElementById("survey-session-search");
  const suggestionsBox = document.getElementById("survey-session-suggestions");
  const generateBtn = document.getElementById("survey-generate-ceu");
  const submitBtn = document.getElementById("survey-submit");
  const statusEl = document.getElementById("survey-status");

  sessionInput.addEventListener("input", () => {
    const q = sessionInput.value.toLowerCase().trim();
    selectedSurveySession = null;
    document.getElementById("survey-session-id").value = "";
    document.getElementById("survey-session-summary").classList.add("hidden");
    document.getElementById("survey-conditional-fields").classList.add("hidden");
    suggestionsBox.innerHTML = "";

    if (!q) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    const matches = sessions
      .filter(s => `${s.title || ""} ${s.code || ""}`.toLowerCase().includes(q))
      .slice(0, 12);

    if (!matches.length) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    matches.forEach(session => {
      const div = document.createElement("div");
      div.className = "px-3 py-2 hover:bg-gray-100 cursor-pointer";
      div.innerHTML = `
        <div class="font-semibold">${escapeHtml(session.title || "")}</div>
        <div class="text-xs font-semibold text-[#162A53]">${escapeHtml(formatSessionDateTime(session))}</div>
      `;
      div.addEventListener("click", () => {
        sessionInput.value = session.title || "";
        suggestionsBox.classList.add("hidden");
        renderSurveyForSession(session);
      });
      suggestionsBox.appendChild(div);
    });
    suggestionsBox.classList.remove("hidden");
  });

  document.addEventListener("click", e => {
    if (!suggestionsBox.contains(e.target) && e.target !== sessionInput) suggestionsBox.classList.add("hidden");
  });

  generateBtn.addEventListener("click", async () => {
    if (!selectedSurveySession) return;
    const draftEl = document.getElementById("survey-ceu-draft");
    draftEl.textContent = "Generating draft...";
    draftEl.classList.remove("hidden");
    generateBtn.disabled = true;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedSurveySession.title || "",
          description: selectedSurveySession.description || "",
          extra: ""
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ? `${data.error}\n${data.details}` : data.error);
      const parsed = parseCeuDraft(data.output);
      const objectivesEl = document.getElementById("survey-ceu-objectives");
      const questionsEl = document.getElementById("survey-ceu-questions");

      if (parsed.objectives) objectivesEl.value = parsed.objectives;
      if (parsed.questions) questionsEl.value = parsed.questions;

      if (parsed.objectives && parsed.questions) {
        draftEl.textContent = "Draft CEU content has been added to the boxes above. Please review and edit before submitting.";
      } else {
        draftEl.textContent = `${data.output}\n\nThe draft could not be split automatically. Please copy the relevant parts into the CEU boxes above before submitting.`;
      }
    } catch (err) {
      draftEl.textContent = `Unable to generate a draft right now: ${err.message}`;
    } finally {
      generateBtn.disabled = false;
    }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!selectedSurveySession) {
      statusEl.textContent = "Please select your session from the dropdown before submitting.";
      statusEl.className = "p-4 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    statusEl.className = "hidden p-4 rounded-lg text-sm font-medium";

    const body = {
      name: document.getElementById("survey-name").value,
      email: document.getElementById("survey-email").value,
      sessionId: selectedSurveySession.id || "",
      sessionCode: selectedSurveySession.code || "",
      sessionTitle: selectedSurveySession.title || "",
      ceuObjectives: isCeuEligible(selectedSurveySession) ? document.getElementById("survey-ceu-objectives").value : "",
      ceuQuestions: isCeuEligible(selectedSurveySession) ? document.getElementById("survey-ceu-questions").value : "",
      formatConfirmation: selectedRadioValue("format-confirmation"),
      recordingConfirmation: selectedRadioValue("recording-confirmation"),
      prerecordConfirmation: selectedRadioValue("prerecord-confirmation"),
      additionalNotes: document.getElementById("survey-additional-notes").value
    };

    try {
      const res = await fetch("/api/submit-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok) {
        form.reset();
        selectedSurveySession = null;
        document.getElementById("survey-session-summary").classList.add("hidden");
        document.getElementById("survey-conditional-fields").classList.add("hidden");
        document.getElementById("survey-ceu-draft").classList.add("hidden");
        statusEl.textContent = "Thank you! Your survey response has been submitted successfully.";
        statusEl.className = "p-4 rounded-lg text-sm font-medium bg-green-50 text-green-800 border border-green-200";
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Survey";
      } else {
        statusEl.textContent = data.error || "Something went wrong. Please try again.";
        statusEl.className = "p-4 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200";
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Survey";
      }
    } catch (err) {
      statusEl.textContent = "Network error. Please check your connection and try again.";
      statusEl.className = "p-4 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200";
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Survey";
    }
  });
}

function bindIframeHeight() {
  const shell = document.getElementById("speakerPortalShell");
  if (!shell || !window.parent || window.parent === window) return;

  function emitHeight() {
    const height = shell.scrollHeight + 32;
    window.parent.postMessage({ ggWidgetHeight: height }, "*");
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(emitHeight).observe(shell);
  }

  window.addEventListener("load", emitHeight);
  emitHeight();
}
