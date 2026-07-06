const SESSION_DATA_URL = "/api/sessions";
const SURVEY_SUBMISSION_KEY = "ggSpeakerSurveyLastSubmission";
const SURVEY_DRAFT_KEY = "ggSpeakerSurveyDraft";
const SURVEY_SESSION_DRAFTS_KEY = "ggSpeakerSurveySessionDrafts";
const CEU_GENERATE_LIMIT_KEY = "ggCeuGenerateLimit";
const CEU_DAILY_SESSION_LIMIT = 2;
const CEU_OPT_OUT_MESSAGE = "Are you sure you want to opt out from offering CEU credit for your session? Sessions that are CEU eligible tend to draw a greater number of participants. To offer CEU credit for your session, simply generate three knowledge check questions and objectives.";
const PRERECORD_YES_OPTION = "Yes, I plan to pre-record my session";
const SHARE_IMAGE_URL = "https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/01bdd5da709e4b7dba3d34b65e40694a.png";
const SHARE_CANVA_URL = "https://canva.link/mkoom2inq4f7xuv";
const EVENT_URL = "https://www.futureofchildwelfare.org";
const SESSION_FOLLOWUPS = [
  {
    matchTitle: "centering parents caregiver voice in child welfare evaluation",
    heading: "Interpretation planning",
    copy: "You noted that this session may include parent/caregiver guest speakers from the Advisory Group cohort who may be Spanish speakers. Please share anything else we should know about interpretation needs for the guest speakers and audience. We will plan to follow up with you to talk through the best approach, though please feel free to initiate the conversation by emailing us at globalgathering@cuanschutz.edu.",
    placeholder: "Share interpretation details, questions, or anything else the Global Gathering Team should know."
  },
  {
    matchTitle: "dealing with distress a worldwide universal challenge",
    heading: "Language and interpretation confirmation",
    copy: "You indicated that this session may need to be interpreted into English. We want to confirm that the session itself will be presented in English. If that is not correct, or if there are any language or interpretation details we should know, please share them below.",
    placeholder: "Confirm the session language or share any interpretation details."
  }
];
// Toggle tabs here. Set enabled: false to hide a tab without editing markup.
const TAB_CONFIG = [
  { id: "overview-tab", label: "Overview", sectionId: "overview", enabled: true },
  {
    id: "survey-tab",
    label: "Speaker Questionnaire",
    sectionId: "survey",
    enabled: true,
    featured: true
  },
  { id: "faqs-tab", label: "Frequently Asked Questions (FAQs)", sectionId: "faqs", enabled: true },
  { id: "session-lookup-tab", label: "Session Information Lookup", sectionId: "session-lookup", enabled: true },
  { id: "share-tab", label: "✨ Share your participation", sectionId: "share", enabled: true, standout: true },
  { id: "attendee-hub-tab", label: "Attendee Hub", sectionId: "attendee-hub", enabled: true },
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
let latestSurveyResponse = null;
let pendingOverviewSurveyLoad = false;
let isResubmittingQuestionnaire = false;
let ceuDraftGeneratedSessionId = null;
let selectedShareSession = null;

document.addEventListener("DOMContentLoaded", () => {
  const modalRoot = document.getElementById("format-comparison-modal-root");
  if (modalRoot) modalRoot.innerHTML = buildFormatComparisonModal();
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeFormatComparisonModal();
  });
  document.addEventListener("click", event => {
    if (event.target?.matches?.("[data-close-format-modal]")) {
      closeFormatComparisonModal();
    }
    const gotoSurveyLink = event.target.closest?.("[data-goto-survey]");
    if (gotoSurveyLink) {
      event.preventDefault();
      activateTab("survey");
      loadRememberedSurveyResponse();
    }
    const gotoLookupLink = event.target.closest?.("[data-goto-lookup]");
    if (gotoLookupLink) {
      event.preventDefault();
      activateTab("session-lookup");
    }
    const gotoShareLink = event.target.closest?.("[data-goto-share]");
    if (gotoShareLink) {
      event.preventDefault();
      activateTab("share");
    }
    const openComparisonLink = event.target.closest?.("[data-open-comparison]");
    if (openComparisonLink) {
      event.preventDefault();
      openFormatComparisonModal("zoom", openComparisonLink);
    }
    const expandAllFaqs = event.target.closest?.("[data-faq-expand-all]");
    if (expandAllFaqs) {
      document.querySelectorAll("#faqs details").forEach(details => { details.open = true; });
    }
    const collapseAllFaqs = event.target.closest?.("[data-faq-collapse-all]");
    if (collapseAllFaqs) {
      document.querySelectorAll("#faqs details").forEach(details => { details.open = false; });
    }
    const modeButton = event.target.closest?.("[data-format-mode]");
    if (modeButton) {
      const modal = document.getElementById("format-comparison-modal");
      if (!modal) return;
      const mode = modeButton.dataset.formatMode === "embedded" ? "embedded" : "zoom";
      modal.dataset.mode = mode;
      renderFormatComparisonRows(mode);
      modal.querySelectorAll("[data-format-mode]").forEach(btn => {
        const isActive = btn.dataset.formatMode === mode;
        btn.classList.toggle("bg-white", isActive);
        btn.classList.toggle("shadow-sm", isActive);
        btn.classList.toggle("text-[#122345]", isActive);
        btn.classList.toggle("text-gray-600", !isActive);
      });
      positionFormatComparisonModal();
    }
  });
  document.addEventListener("mouseover", event => {
    const infoButton = event.target.closest?.(".format-info-button");
    if (infoButton) showFormatComparisonTooltip(infoButton);
  });
  document.addEventListener("focusin", event => {
    const infoButton = event.target.closest?.(".format-info-button");
    if (infoButton) showFormatComparisonTooltip(infoButton);
  });
  document.addEventListener("mouseout", event => {
    const infoButton = event.target.closest?.(".format-info-button");
    if (infoButton && !infoButton.contains(event.relatedTarget)) hideFormatComparisonTooltip();
  });
  document.addEventListener("focusout", event => {
    const infoButton = event.target.closest?.(".format-info-button");
    if (infoButton) hideFormatComparisonTooltip();
  });
  window.addEventListener("message", event => {
    if (event.data && event.data.ggVisibleRange) {
      const normalizedRange = normalizeVisibleRange(event.data.ggVisibleRange);
      if (normalizedRange) {
        parentVisibleRange = normalizedRange;
        positionFormatComparisonModal();
      }
    }
  });
  window.addEventListener("resize", () => positionFormatComparisonModal());
  renderTabs();
  bindOverviewSurveyCta();
  bindLookup();
  bindSurvey();
  bindShare();
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
      tab.standout ? "tab-standout" : "",
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

  if (sectionId !== "survey") {
    clearSurveyStatusMessage();
  }
}

function bindOverviewSurveyCta() {
  const cta = document.getElementById("overview-survey-cta");
  if (cta) {
    cta.addEventListener("click", () => {
      activateTab("survey");
      loadRememberedSurveyResponse();
    });
  }

  const newCta = document.getElementById("overview-survey-new");
  if (newCta) {
    newCta.addEventListener("click", () => {
      resetSurveyForm();
      activateTab("survey");
    });
  }
}

function getRememberedSurveySubmission() {
  try {
    return JSON.parse(localStorage.getItem(SURVEY_SUBMISSION_KEY)) || null;
  } catch (_) {
    return null;
  }
}

function rememberSurveySubmission(session) {
  if (!session?.id) return;
  localStorage.setItem(SURVEY_SUBMISSION_KEY, JSON.stringify({
    sessionId: session.id,
    sessionTitle: session.title || "",
    submittedAt: new Date().toISOString()
  }));
}

function getSavedSurveyDraft() {
  try {
    return JSON.parse(localStorage.getItem(SURVEY_DRAFT_KEY)) || null;
  } catch (_) {
    return null;
  }
}

function clearSavedSurveyDraft() {
  localStorage.removeItem(SURVEY_DRAFT_KEY);
}

function getSavedSurveySessionDrafts() {
  try {
    return JSON.parse(localStorage.getItem(SURVEY_SESSION_DRAFTS_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function saveSurveySessionDraft(sessionId, draft) {
  if (!sessionId || !draft) return;
  const drafts = getSavedSurveySessionDrafts();
  drafts[sessionId] = draft;
  localStorage.setItem(SURVEY_SESSION_DRAFTS_KEY, JSON.stringify(drafts));
}

function getSavedSurveySessionDraft(sessionId) {
  if (!sessionId) return null;
  return getSavedSurveySessionDrafts()[sessionId] || null;
}

function clearSavedSurveySessionDraft(sessionId) {
  if (!sessionId) return;
  const drafts = getSavedSurveySessionDrafts();
  delete drafts[sessionId];
  localStorage.setItem(SURVEY_SESSION_DRAFTS_KEY, JSON.stringify(drafts));
}

function buildSurveyDraft() {
  return {
    firstName: document.getElementById("survey-first-name")?.value || "",
    lastName: document.getElementById("survey-last-name")?.value || "",
    email: document.getElementById("survey-email")?.value || "",
    copyOthers: document.getElementById("survey-copy-others")?.checked || false,
    ccEmails: getSurveyCcEmails(),
    sessionId: selectedSurveySession?.id || "",
    sessionSearch: document.getElementById("survey-session-search")?.value || "",
    ceuObjectives: document.getElementById("survey-ceu-objectives")?.value || "",
    ceuQuestions: document.getElementById("survey-ceu-questions")?.value || "",
    ceuOptOut: document.getElementById("survey-ceu-opt-out")?.checked || false,
    sessionFollowupResponse: document.getElementById("survey-session-followup-response")?.value || "",
    prerecordLiveSupport: document.getElementById("survey-prerecord-live-support")?.value || "",
    formatConfirmation: selectedRadioValue("format-confirmation"),
    recordingConfirmation: selectedRadioValue("recording-confirmation"),
    prerecordConfirmation: selectedRadioValue("prerecord-confirmation"),
    sbiMaxParticipants: document.getElementById("survey-sbi-max-participants")?.value || "",
    additionalNotes: document.getElementById("survey-additional-notes")?.value || "",
    isResubmitting: isResubmittingQuestionnaire,
    updatedAt: new Date().toISOString()
  };
}

function saveSurveyDraft() {
  const draft = buildSurveyDraft();
  const hasDraftContent = [
    draft.firstName,
    draft.lastName,
    draft.email,
    draft.copyOthers ? "yes" : "",
    ...(draft.ccEmails || []),
    draft.sessionId,
    draft.sessionSearch,
    draft.ceuObjectives,
    draft.ceuQuestions,
    draft.ceuOptOut ? "yes" : "",
    draft.sessionFollowupResponse,
    draft.prerecordLiveSupport,
    draft.formatConfirmation,
    draft.recordingConfirmation,
    draft.prerecordConfirmation,
    draft.sbiMaxParticipants,
    draft.additionalNotes
  ].some(value => String(value || "").trim());

  if (!hasDraftContent) {
    clearSavedSurveyDraft();
    return;
  }

  localStorage.setItem(SURVEY_DRAFT_KEY, JSON.stringify(draft));
  if (draft.sessionId) {
    saveSurveySessionDraft(draft.sessionId, draft);
  }
}

function applySurveyDraftFields(draft) {
  if (!draft) return;
  document.getElementById("survey-first-name").value = draft.firstName || "";
  document.getElementById("survey-last-name").value = draft.lastName || "";
  document.getElementById("survey-email").value = draft.email || "";
  document.getElementById("survey-copy-others").checked = !!draft.copyOthers;
  renderSurveyCcFields(draft.copyOthers ? (draft.ccEmails || [""]) : []);
  document.getElementById("survey-ceu-objectives").value = draft.ceuObjectives || "";
  document.getElementById("survey-ceu-questions").value = draft.ceuQuestions || "";
  document.getElementById("survey-ceu-opt-out").checked = !!draft.ceuOptOut;
  document.getElementById("survey-session-followup-response").value = draft.sessionFollowupResponse || "";
  document.getElementById("survey-prerecord-live-support").value = draft.prerecordLiveSupport || "";
  document.getElementById("survey-additional-notes").value = draft.additionalNotes || "";
  document.getElementById("survey-sbi-max-participants").value = draft.sbiMaxParticipants || "";
  setRadioValue("format-confirmation", draft.formatConfirmation);
  setRadioValue("recording-confirmation", draft.recordingConfirmation);
  setRadioValue("prerecord-confirmation", draft.prerecordConfirmation);
  isResubmittingQuestionnaire = !!draft.isResubmitting;
  updateQuestionnaireSubmitButton();
  updateCeuOptOutState();
  updatePrerecordLiveSupportState();
}

function getSurveyCcEmails() {
  const copyOthers = document.getElementById("survey-copy-others")?.checked || false;
  if (!copyOthers) return [];
  return Array.from(document.querySelectorAll(".survey-cc-email"))
    .map(input => input.value.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function renderSurveyCcFields(values = [""]) {
  const container = document.getElementById("survey-cc-fields");
  const addButton = document.getElementById("survey-add-cc");
  const copyOthers = document.getElementById("survey-copy-others")?.checked || false;
  if (!container || !addButton) return;

  const fieldValues = copyOthers
    ? (values.length ? values.slice(0, 5) : [""])
    : [];

  container.innerHTML = fieldValues.map((value, index) => `
    <div class="flex items-center gap-2">
      <input type="email" class="survey-cc-email w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--survey-primary)] focus:ring-0" placeholder="copy@example.com" value="${escapeHtml(value)}" />
      ${fieldValues.length > 1 ? `<button type="button" class="survey-remove-cc flex-none text-xs font-semibold text-gray-500 hover:text-red-700" data-remove-cc="${index}">Remove</button>` : ""}
    </div>
  `).join("");

  container.classList.toggle("hidden", !copyOthers);
  addButton.classList.toggle("hidden", !copyOthers || fieldValues.length >= 5);
}

async function restoreSavedSurveyDraft() {
  const draft = getSavedSurveyDraft();
  if (!draft) return;

  const sessionInput = document.getElementById("survey-session-search");
  if (sessionInput) sessionInput.value = draft.sessionSearch || "";

  const session = draft.sessionId ? sessions.find(s => s.id === draft.sessionId) : null;
  if (session) {
    if (sessionInput) sessionInput.value = session.title || draft.sessionSearch || "";
    await renderSurveyForSession(session, { skipFieldClear: true });
  }

  applySurveyDraftFields(draft);
  clearSurveyStatusMessage();
}

function updateOverviewSurveyCta() {
  const remembered = getRememberedSurveySubmission();
  const heading = document.getElementById("overview-survey-cta-heading");
  const copy = document.getElementById("overview-survey-cta-copy");
  const button = document.getElementById("overview-survey-cta");
  const icon = document.getElementById("overview-survey-complete-icon");
  if (!remembered?.sessionId || !heading || !copy || !button) return;

  if (icon) icon.classList.remove("hidden");
  if (icon) icon.classList.add("flex");
  heading.textContent = "Speaker Questionnaire received";
  const sessionTitle = remembered.sessionTitle || "your session";
  copy.innerHTML = `Thank you. We have a response on file for <em>${escapeHtml(sessionTitle)}</em>. You have until August 7, 2026 to review or submit changes. If you are presenting on another session, you may submit a new response.`;
  button.textContent = "Review or update your Speaker Questionnaire";

  const newButton = document.getElementById("overview-survey-new");
  if (newButton) newButton.classList.remove("hidden");
}

function splitSpeakerName(fullName) {
  const clean = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

async function loadRememberedSurveyResponse() {
  const remembered = getRememberedSurveySubmission();
  if (!remembered?.sessionId) return;
  const session = sessions.find(s => s.id === remembered.sessionId);
  if (!session) {
    pendingOverviewSurveyLoad = true;
    return;
  }

  const input = document.getElementById("survey-session-search");
  if (input) input.value = session.title || "";
  const status = document.getElementById("survey-status");
  if (status) {
    status.textContent = "";
    status.className = "hidden p-4 rounded-lg text-sm font-medium";
  }
  await renderSurveyForSession(session, { loadLatestResponse: true });
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

function formatSessionDuration(session) {
  const startValue = (session.start || "").split("|")[1];
  const endValue = session.end || "";
  const start = parseTimeParts(startValue);
  const end = parseTimeParts(endValue);
  if (!start || !end) return "";
  const diff = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
  if (diff <= 0) return "";
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  return `${minutes} min`;
}

function formatPresentationType(rawType) {
  const labels = {
    "workshop": "Workshop",
    "strategy": "Strategy Session",
    "creative": "Creative Space",
    "keynote": "Keynote",
    "skill": "Skill Building Institute",
    "skill-building-institutes": "Skill Building Institute",
    "intl": "International Exchange",
  };
  const key = (rawType || "").toLowerCase().trim();
  return labels[key] || rawType || "";
}

function isCeuEligible(session) {
  return normalize(session?.ceuEligibility || "") === "ceu eligible";
}

function getSessionFollowup(session) {
  const title = normalize(session?.title || "");
  return SESSION_FOLLOWUPS.find(followup => title.includes(followup.matchTitle)) || null;
}

function isCeuOptedOut() {
  return !!document.getElementById("survey-ceu-opt-out")?.checked;
}

function updateCeuOptOutState() {
  const optedOut = isCeuOptedOut();
  const objectivesEl = document.getElementById("survey-ceu-objectives");
  const questionsEl = document.getElementById("survey-ceu-questions");
  const generateBtn = document.getElementById("survey-generate-ceu");
  const draftEl = document.getElementById("survey-ceu-draft");
  const shouldRequireCeu = isCeuEligible(selectedSurveySession) && !optedOut;

  if (objectivesEl) {
    objectivesEl.required = shouldRequireCeu;
    objectivesEl.disabled = optedOut;
    objectivesEl.classList.toggle("bg-gray-100", optedOut);
  }
  if (questionsEl) {
    questionsEl.required = shouldRequireCeu;
    questionsEl.disabled = optedOut;
    questionsEl.classList.toggle("bg-gray-100", optedOut);
  }
  if (generateBtn) {
    generateBtn.disabled = optedOut;
    generateBtn.classList.toggle("opacity-50", optedOut);
    generateBtn.classList.toggle("cursor-not-allowed", optedOut);
  }
  if (draftEl && optedOut) {
    draftEl.classList.add("hidden");
  }
}

function showCeuOptOutConfirmation() {
  const section = document.getElementById("survey-ceu-section");
  const existing = document.getElementById("survey-ceu-opt-out-confirmation");
  if (!section || existing) return;

  const box = document.createElement("div");
  box.id = "survey-ceu-opt-out-confirmation";
  box.className = "rounded-lg border border-[var(--survey-primary)] bg-white p-4 text-sm text-gray-800 shadow-sm";
  box.innerHTML = `
    <p class="mb-3">${escapeHtml(CEU_OPT_OUT_MESSAGE)}</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" id="survey-confirm-ceu-opt-out" class="px-4 py-2 bg-white text-[var(--survey-primary)] font-semibold rounded-lg border-2 border-[var(--survey-primary)] hover:bg-[var(--survey-primary-soft)] transition-colors">I would like to continue opting out of offering CEU credit for my session.</button>
      <button type="button" id="survey-auto-generate-after-opt-out" class="px-4 py-2 bg-[var(--survey-primary)] text-white font-semibold rounded-lg hover:bg-[var(--survey-primary-dark)] transition-colors">Auto-generate objectives and knowledge check questions</button>
    </div>
  `;

  section.insertBefore(box, section.children[2] || null);

  document.getElementById("survey-confirm-ceu-opt-out")?.addEventListener("click", () => {
    box.remove();
  });

  document.getElementById("survey-auto-generate-after-opt-out")?.addEventListener("click", () => {
    const optOut = document.getElementById("survey-ceu-opt-out");
    if (optOut) optOut.checked = false;
    updateCeuOptOutState();
    saveSurveyDraft();
    box.remove();
    document.getElementById("survey-generate-ceu")?.click();
  });
}

function isKeynote(session) {
  return normalize(session?.presentationType || "").includes("keynote");
}

function isSkillBuildingInstitute(session) {
  return normalize(session?.presentationType || "").includes("skill building institute");
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

function getFormatPreferenceOptions(currentMode) {
  return currentMode === "embedded"
    ? ["Yes, I want my session to be Embedded.", "I would prefer that my session use Zoom."]
    : ["Yes, I want my session to use Zoom.", "I would prefer that my session is Embedded."];
}

function getRecordingPreferenceOptions(recordingStatus) {
  return normalize(recordingStatus || "").includes("not")
    ? ["That is correct. Do not record my session.", "I would prefer that my session be recorded and made available to participants afterwards."]
    : ["Yes, I want my session recorded and made available to participants afterwards.", "I would prefer that my session not be recorded."];
}

function buildFormatComparisonRows() {
  return [
    { label: "Breakout rooms", zoom: "Supported", embedded: "Not supported" },
    { label: "Polls", zoom: "External tool", zoomNote: "Zoom would rely on an external tool such as Mentimeter.", embedded: "Supported", embeddedNote: "Polling is a native Embedded feature." },
    { label: "Chat", zoom: "Supported", embedded: "Supported" },
    { label: "Q&A", zoom: "Via chat", zoomNote: "The Q&A feature is not available for Zoom; however, Zoom chat can be used for soliciting questions instead.", embedded: "Supported", embeddedNote: "Q&A is a native Embedded feature." },
    { label: "Screen sharing", zoom: "Supported", zoomNote: "Zoom has more advanced screen sharing options.", embedded: "Supported", embeddedNote: "Screen sharing features are less robust for Embedded." },
    { label: "Virtual backgrounds", zoom: "Supported", zoomNote: "Various virtual backgrounds are supported for Zoom.", embedded: "Blurred only", embeddedNote: "Only a blurred background is available." },
    { label: "Waiting rooms", zoom: "Supported", embedded: "Not supported" },
    { label: "Captions", zoom: "Supported", embedded: "Supported" },
    { label: "Transcripts", zoom: "Supported", zoomNote: "One of the presenters must manually start the transcript at the beginning of their session and download it to their computer at the end.", embedded: "Not supported" },
    { label: "Share video or audio", zoom: "Supported", embedded: "Supported" },
    { label: "Participant management", zoom: "Full control", embedded: "Limited control" },
    { label: "Participants showing video / coming off mute", zoom: "Supported", embedded: "Requires permission", embeddedNote: "Participants must request permission to unmute or turn on video." }
  ];
}

function buildFormatComparisonModal() {
  return `
    <div id="format-comparison-modal" class="absolute left-0 right-0 z-50 hidden">
      <div class="absolute inset-0 bg-black/40" data-close-format-modal></div>
      <div id="format-comparison-panel" class="absolute left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-200">
        <div class="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <p class="text-xs font-bold tracking-[0.08em] text-[var(--survey-primary)] uppercase">Compare formats</p>
            <h4 class="text-lg font-bold text-[#122345]">Zoom vs Embedded</h4>
            <p class="text-sm text-gray-600">Use the buttons to compare the two session formats before confirming.</p>
          </div>
          <button type="button" class="text-gray-500 hover:text-gray-900" aria-label="Close comparison" data-close-format-modal>✕</button>
        </div>
        <div class="px-5 pt-4">
          <div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Format comparison mode">
            <button type="button" class="format-toggle inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[#122345] bg-white shadow-sm" data-format-mode="zoom">
              <img src="https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/bd24b84857c14ef4b86468396df75280.png" alt="" class="h-5 w-5" />
              Zoom
            </button>
            <button type="button" class="format-toggle inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-gray-600" data-format-mode="embedded">
              <img src="https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/affeaea0d0264febbb47bca747a38e4d.png" alt="" class="h-5 w-5" />
              Embedded
            </button>
          </div>
        </div>
        <div class="px-5 pb-5 pt-4">
          <div class="rounded-lg border border-gray-200">
            <table class="w-full border-collapse text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="rounded-tl-lg px-4 py-3 text-left font-semibold text-[#122345]">Feature</th>
                  <th class="px-4 py-3 text-left font-semibold text-[#122345]">
                    <span class="inline-flex items-center gap-2">
                      <img src="https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/bd24b84857c14ef4b86468396df75280.png" alt="" class="h-5 w-5" />
                      Zoom
                    </span>
                  </th>
                  <th class="rounded-tr-lg px-4 py-3 text-left font-semibold text-[#122345]">
                    <span class="inline-flex items-center gap-2">
                      <img src="https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/affeaea0d0264febbb47bca747a38e4d.png" alt="" class="h-5 w-5" />
                      Embedded
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody id="format-comparison-rows"></tbody>
            </table>
          </div>
          <p class="mt-3 text-xs text-gray-600">The highlighted side shows the selected comparison view. Your questionnaire answer still confirms whether the currently listed format works for your session.</p>
        </div>
      </div>
      <div id="format-comparison-tooltip" class="pointer-events-none fixed z-[70] hidden max-w-xs rounded-md bg-[#122345] px-3 py-2 text-left text-[13px] font-normal leading-5 text-white shadow-lg"></div>
    </div>
  `;
}

function formatComparisonCellValue(label, value, note) {
  const detailLabel = note ? `${label} details: ${note}` : "";
  return `
    <span class="inline-flex items-center gap-1">
      ${escapeHtml(value)}
      ${note ? `
      <button type="button" class="format-info-button inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-700 leading-none hover:bg-[#122345] hover:text-white focus:bg-[#122345] focus:text-white focus:outline-none focus:ring-2 focus:ring-[var(--survey-primary)]" aria-label="${escapeHtml(detailLabel)}" data-tooltip="${escapeHtml(note)}">
        i
      </button>
      ` : ""}
    </span>
  `;
}

function hideFormatComparisonTooltip() {
  const tooltip = document.getElementById("format-comparison-tooltip");
  if (!tooltip) return;
  tooltip.classList.add("hidden");
  tooltip.textContent = "";
}

function showFormatComparisonTooltip(button) {
  const tooltip = document.getElementById("format-comparison-tooltip");
  const panel = document.getElementById("format-comparison-panel");
  const note = button?.dataset?.tooltip || "";
  if (!tooltip || !panel || !note) return;

  tooltip.textContent = note;
  tooltip.classList.remove("hidden");

  const gap = 8;
  const buttonRect = button.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const minLeft = Math.max(8, panelRect.left + 8);
  const maxLeft = Math.min(window.innerWidth - tooltipRect.width - 8, panelRect.right - tooltipRect.width - 8);
  const preferredLeft = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
  const left = Math.max(minLeft, Math.min(preferredLeft, maxLeft));
  const belowTop = buttonRect.bottom + gap;
  const aboveTop = buttonRect.top - tooltipRect.height - gap;
  const maxBottom = Math.min(window.innerHeight - 8, panelRect.bottom - 8);
  const top = belowTop + tooltipRect.height <= maxBottom ? belowTop : Math.max(8, aboveTop);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function renderFormatComparisonRows(mode) {
  const tbody = document.getElementById("format-comparison-rows");
  if (!tbody) return;
  tbody.innerHTML = buildFormatComparisonRows().map(row => {
    const zoomHighlighted = mode === "zoom";
    const embeddedHighlighted = mode === "embedded";
    return `
      <tr>
        <th class="border-t border-black/10 px-4 py-3 text-left font-semibold text-[#122345] align-top">${escapeHtml(row.label)}</th>
        <td class="border-t border-black/10 px-4 py-3 align-top ${zoomHighlighted ? "bg-[var(--survey-primary-soft)]" : ""}">${formatComparisonCellValue(row.label, row.zoom, row.zoomNote)}</td>
        <td class="border-t border-black/10 px-4 py-3 align-top ${embeddedHighlighted ? "bg-[var(--survey-primary-soft)]" : ""}">${formatComparisonCellValue(row.label, row.embedded, row.embeddedNote)}</td>
      </tr>
    `;
  }).join("");
}

let parentVisibleRange = null;
let fallbackVisibleRange = null;
let formatModalAnchor = null;
let formatModalPositionFrame = 0;
let formatModalPositionTick = 0;

function isEmbeddedInParent() {
  try {
    return !!window.parent && window.parent !== window;
  } catch (_) {
    return false;
  }
}

function requestParentVisibleRange() {
  if (!isEmbeddedInParent()) return;
  window.parent.postMessage({ ggRequestVisibleRange: true }, "*");
}

function notifyParentFormatModalState(isOpen) {
  if (!isEmbeddedInParent()) return;
  window.parent.postMessage({ ggFormatModalOpen: isOpen }, "*");
}

function normalizeVisibleRange(range) {
  const top = Number(range?.top);
  const bottom = Number(range?.bottom);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  const normalizedTop = Math.max(0, top);
  const normalizedBottom = Math.max(normalizedTop, bottom);
  if (normalizedBottom - normalizedTop < 20) return null;
  return { top: normalizedTop, bottom: normalizedBottom };
}

function buildFallbackVisibleRange(anchorEl) {
  const anchorRect = anchorEl?.getBoundingClientRect?.();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 900;
  const estimatedHeight = Math.min(900, Math.max(520, viewportHeight * 0.75));

  if (!anchorRect) return { top: 0, bottom: Math.min(viewportHeight, estimatedHeight) };

  const anchorCenter = anchorRect.top + anchorRect.height / 2;
  const top = Math.max(0, anchorCenter - estimatedHeight / 2);
  return {
    top,
    bottom: Math.min(viewportHeight, top + estimatedHeight)
  };
}

function getAnchorCenterY(anchorEl) {
  const anchorRect = anchorEl?.getBoundingClientRect?.();
  if (!anchorRect) return null;
  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  return scrollTop + anchorRect.top + anchorRect.height / 2;
}

function getVisibleRange() {
  if (isEmbeddedInParent() && parentVisibleRange) {
    return parentVisibleRange;
  }
  if (isEmbeddedInParent() && fallbackVisibleRange) {
    return fallbackVisibleRange;
  }
  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  return { top: scrollTop, bottom: scrollTop + window.innerHeight };
}

function getDocumentHeight() {
  const body = document.body;
  const html = document.documentElement;
  return Math.max(
    body?.scrollHeight || 0,
    body?.offsetHeight || 0,
    html?.clientHeight || 0,
    html?.scrollHeight || 0,
    html?.offsetHeight || 0
  );
}

function positionFormatComparisonModal() {
  const modal = document.getElementById("format-comparison-modal");
  const panel = document.getElementById("format-comparison-panel");
  if (!modal || !panel || modal.classList.contains("hidden")) return;

  const margin = 16;
  const range = getVisibleRange();
  const rangeTop = Math.max(0, range.top);
  const rangeHeight = Math.max(200, range.bottom - rangeTop);
  const documentHeight = Math.max(getDocumentHeight(), rangeTop + rangeHeight);
  const anchorCenterY = getAnchorCenterY(formatModalAnchor);

  modal.style.top = "0px";
  modal.style.height = `${documentHeight}px`;
  panel.style.maxHeight = `${Math.max(200, rangeHeight - margin * 2)}px`;

  const panelHeight = panel.offsetHeight;
  let top = anchorCenterY == null
    ? rangeTop + Math.max(margin, (rangeHeight - panelHeight) / 2)
    : anchorCenterY - panelHeight / 2;
  top = Math.min(top, rangeTop + rangeHeight - panelHeight - margin);
  top = Math.max(top, rangeTop + margin);
  panel.style.top = `${top}px`;
}

function startFormatModalPositionTracking() {
  if (formatModalPositionFrame) return;

  const tick = () => {
    const modal = document.getElementById("format-comparison-modal");
    if (!modal || modal.classList.contains("hidden")) {
      formatModalPositionFrame = 0;
      formatModalPositionTick = 0;
      return;
    }

    if (formatModalPositionTick % 6 === 0) {
      requestParentVisibleRange();
    }
    positionFormatComparisonModal();
    formatModalPositionTick += 1;
    formatModalPositionFrame = window.requestAnimationFrame(tick);
  };

  formatModalPositionFrame = window.requestAnimationFrame(tick);
}

function stopFormatModalPositionTracking() {
  if (!formatModalPositionFrame) return;
  window.cancelAnimationFrame(formatModalPositionFrame);
  formatModalPositionFrame = 0;
  formatModalPositionTick = 0;
}

function openFormatComparisonModal(initialMode, anchorEl = null) {
  const modal = document.getElementById("format-comparison-modal");
  if (!modal) return;
  const activeMode = initialMode === "embedded" ? "embedded" : "zoom";
  formatModalAnchor = anchorEl;
  fallbackVisibleRange = buildFallbackVisibleRange(anchorEl);
  modal.classList.remove("hidden");
  renderFormatComparisonRows(activeMode);
  modal.dataset.mode = activeMode;

  modal.querySelectorAll("[data-format-mode]").forEach(btn => {
    btn.classList.toggle("bg-white", btn.dataset.formatMode === activeMode);
    btn.classList.toggle("shadow-sm", btn.dataset.formatMode === activeMode);
    btn.classList.toggle("text-[#122345]", btn.dataset.formatMode === activeMode);
    btn.classList.toggle("text-gray-600", btn.dataset.formatMode !== activeMode);
  });

  requestParentVisibleRange();
  notifyParentFormatModalState(true);
  positionFormatComparisonModal();
  startFormatModalPositionTracking();
}

function closeFormatComparisonModal() {
  const modal = document.getElementById("format-comparison-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  formatModalAnchor = null;
  hideFormatComparisonTooltip();
  stopFormatModalPositionTracking();
  notifyParentFormatModalState(false);
}

async function renderSurveyForSession(session, options = {}) {
  selectedSurveySession = session;
  latestSurveyResponse = null;
  isResubmittingQuestionnaire = false;
  updateQuestionnaireSubmitButton();
  updateCeuGenerateButtonLabel(document.getElementById("survey-generate-ceu"));
  document.getElementById("survey-session-id").value = session.id || "";
  if (!options.skipFieldClear) clearSurveyResponseFields();
  clearSurveyStatusMessage();

  const summary = document.getElementById("survey-session-summary");
  summary.innerHTML = `
    <h3 class="font-bold text-[#162A53] mb-2">Session selected</h3>
    <p class="font-semibold text-sm text-gray-900 mb-2"><em>${escapeHtml(session.title || "Not listed")}</em></p>
    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">Date/time:</dt><dd>${escapeHtml(formatSessionDateTime(session))}</dd></div>
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">CEU:</dt><dd>${escapeHtml(session.ceuEligibility || "Not listed")}</dd></div>
      ${formatPresentationType(session.presentationType) ? `<div class="flex gap-1"><dt class="font-semibold text-gray-600">Session type:</dt><dd>${escapeHtml(formatPresentationType(session.presentationType))}</dd></div>` : ""}
      ${formatSessionDuration(session) ? `<div class="flex gap-1"><dt class="font-semibold text-gray-600">Duration:</dt><dd>${escapeHtml(formatSessionDuration(session))}</dd></div>` : ""}
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
  updateCeuOptOutState();

  const formatSection = document.getElementById("survey-format-section");
  const feature = (session.videoFormat || "").trim();
  const showFormat = !isKeynote(session) && !isSkillBuildingInstitute(session) && ["zoom", "embedded"].includes(normalize(feature));
  formatSection.classList.toggle("hidden", !showFormat);
  if (showFormat) {
    const currentMode = normalize(feature) === "embedded" ? "embedded" : "zoom";
    const explanation = normalize(feature) === "zoom"
      ? "Your session is currently programmed as a Zoom session. Zoom supports breakout rooms, virtual backgrounds, transcript generation, and other Zoom-related features."
      : "Our records show this session is planned as Embedded. Embedded sessions live inside Attendee Hub, the online event center, and support native polling, Q&A, and Chat features. Only blurred backgrounds are available. Participants must request permission before coming on video and unmuting.";
    formatSection.innerHTML = `
      <h3 class="font-bold text-[#162A53]">Session format confirmation *</h3>
      <p class="text-sm text-gray-800">${escapeHtml(explanation)}</p>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" id="format-comparison-open" class="inline-flex items-center gap-2 text-sm font-semibold text-[var(--survey-primary)] hover:text-[var(--survey-primary-dark)]">
          <span aria-hidden="true">ⓘ</span>
          Compare Zoom and Embedded
        </button>
        <span class="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#122345] border border-gray-200">
          <img src="${currentMode === "zoom"
            ? "https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/bd24b84857c14ef4b86468396df75280.png"
            : "https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/affeaea0d0264febbb47bca747a38e4d.png"}" alt="" class="h-4 w-4" />
          ${currentMode === "zoom" ? "Zoom" : "Embedded"} recommended for your session
        </span>
      </div>
      ${radioGroup("format-confirmation", getFormatPreferenceOptions(currentMode))}
    `;
    const openFormatButton = document.getElementById("format-comparison-open");
    if (openFormatButton) {
      openFormatButton.addEventListener("click", () => openFormatComparisonModal(currentMode, openFormatButton));
    }
  } else {
    formatSection.innerHTML = "";
  }

  const recordingSection = document.getElementById("survey-recording-section");
  const showRecording = !isKeynote(session) && !isSkillBuildingInstitute(session);
  recordingSection.classList.toggle("hidden", !showRecording);
  if (showRecording) {
    const recordingText = normalize(session.recordingStatus || "").includes("not")
      ? "Our records show this session is currently set to not be recorded."
      : "Your session is set to be recorded. If you choose to have your session recorded, you can request a copy of the video file afterwards.";
    recordingSection.innerHTML = `
      <h3 class="font-bold text-[#162A53]">Recording confirmation *</h3>
      <p class="text-sm text-gray-800">${escapeHtml(recordingText)}</p>
      ${radioGroup("recording-confirmation", getRecordingPreferenceOptions(session.recordingStatus))}
    `;
  } else {
    recordingSection.innerHTML = "";
  }

  const prerecordSection = document.getElementById("survey-prerecord-section");
  prerecordSection.classList.toggle("hidden", !hasPreRecordInterest(session));
  prerecordSection.innerHTML = hasPreRecordInterest(session) ? `
    <h3 class="font-bold text-[#162A53]">Pre-recording *</h3>
    <p class="text-sm text-gray-800">You previously expressed interest in pre-recording your session and having it shown during the Global Gathering in a simulated live format. Please confirm whether you formally plan to pre-record your session and having it played automatically. If we do not receive a response, we will assume you plan to present live. If you plan to pre-record, please email us a copy of your presentation by September 4, 2026 to give us enough time to program it into the system.</p>
    ${radioGroup("prerecord-confirmation", [
      PRERECORD_YES_OPTION,
      "I would prefer to present live."
    ])}
  ` : "";
  updatePrerecordLiveSupportState();

  const sbiSection = document.getElementById("survey-sbi-section");
  const showSbi = isSkillBuildingInstitute(session);
  sbiSection.classList.toggle("hidden", !showSbi);
  document.getElementById("survey-sbi-max-participants").required = showSbi;
  if (!showSbi) {
    document.getElementById("survey-sbi-max-participants").value = "";
  }

  const followup = getSessionFollowup(session);
  const followupSection = document.getElementById("survey-session-followup-section");
  const followupHeading = document.getElementById("survey-session-followup-heading");
  const followupCopy = document.getElementById("survey-session-followup-copy");
  const followupResponse = document.getElementById("survey-session-followup-response");
  followupSection.classList.toggle("hidden", !followup);
  if (followup) {
    followupHeading.textContent = followup.heading;
    followupCopy.textContent = followup.copy;
    followupResponse.placeholder = followup.placeholder;
  } else {
    followupHeading.textContent = "";
    followupCopy.textContent = "";
    followupResponse.value = "";
    followupResponse.placeholder = "";
  }

  const response = await checkExistingSurveyResponse(session);
  if (options.loadLatestResponse && response) {
    populateSurveyResponseFields(response);
    const box = document.getElementById("survey-existing-response");
    box.classList.remove("hidden");
    box.innerHTML = `
      <p class="text-[#162A53] font-semibold mb-2">Latest response loaded. Review, edit, and submit again if needed. A new submission will be saved.</p>
      <p class="text-gray-800">You have until August 7, 2026 to make changes.</p>
    `;
  }
}

function selectedRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function setRadioValue(name, value) {
  if (!value) return;
  const radios = document.querySelectorAll(`input[name="${name}"]`);
  radios.forEach(radio => {
    radio.checked = radio.value === value;
  });
}

function updatePrerecordLiveSupportState() {
  const section = document.getElementById("survey-prerecord-live-support-section");
  const response = document.getElementById("survey-prerecord-live-support");
  if (!section || !response) return;
  const show = selectedRadioValue("prerecord-confirmation") === PRERECORD_YES_OPTION;
  section.classList.toggle("hidden", !show);
  if (!show) response.value = "";
}

function clearSurveyResponseFields() {
  document.getElementById("survey-ceu-objectives").value = "";
  document.getElementById("survey-ceu-questions").value = "";
  document.getElementById("survey-ceu-opt-out").checked = false;
  document.getElementById("survey-session-followup-response").value = "";
  document.getElementById("survey-prerecord-live-support").value = "";
  document.getElementById("survey-additional-notes").value = "";
  document.getElementById("survey-sbi-max-participants").value = "";
  document.querySelectorAll('input[name="format-confirmation"], input[name="recording-confirmation"], input[name="prerecord-confirmation"]').forEach(radio => {
    radio.checked = false;
  });
  updateCeuOptOutState();
  updatePrerecordLiveSupportState();
}

function clearSurveyStatusMessage() {
  const statusEl = document.getElementById("survey-status");
  if (!statusEl) return;
  statusEl.className = "hidden p-4 rounded-lg text-sm font-medium";
  statusEl.textContent = "";
}

function resetSurveyForm() {
  const form = document.getElementById("survey-form");
  if (form) form.reset();
  renderSurveyCcFields([]);
  clearSavedSurveyDraft();
  selectedSurveySession = null;
  latestSurveyResponse = null;
  isResubmittingQuestionnaire = false;
  document.getElementById("survey-session-id").value = "";
  document.getElementById("survey-session-summary").classList.add("hidden");
  document.getElementById("survey-existing-response").classList.add("hidden");
  document.getElementById("survey-conditional-fields").classList.add("hidden");
  document.getElementById("survey-ceu-draft").classList.add("hidden");
  clearSurveyStatusMessage();
  updateQuestionnaireSubmitButton();
}

function updateQuestionnaireSubmitButton() {
  const button = document.getElementById("survey-submit");
  if (!button) return;
  button.textContent = isResubmittingQuestionnaire ? "Resubmit Questionnaire" : "Submit Questionnaire";
}

function populateSurveyResponseFields(response) {
  if (!response) return;
  isResubmittingQuestionnaire = true;
  const speakerName = response.speakerName || "";
  const splitName = splitSpeakerName(speakerName);
  document.getElementById("survey-first-name").value = splitName.firstName || "";
  document.getElementById("survey-last-name").value = splitName.lastName || "";
  document.getElementById("survey-email").value = response.email || "";
  document.getElementById("survey-copy-others").checked = false;
  renderSurveyCcFields([]);
  document.getElementById("survey-ceu-objectives").value = response.ceuObjectives || "";
  document.getElementById("survey-ceu-questions").value = response.ceuQuestions || "";
  document.getElementById("survey-ceu-opt-out").checked = !!response.ceuOptOut;
  document.getElementById("survey-session-followup-response").value = response.sessionFollowupResponse || "";
  document.getElementById("survey-prerecord-live-support").value = response.prerecordLiveSupport || "";
  document.getElementById("survey-additional-notes").value = response.additionalNotes || "";
  document.getElementById("survey-sbi-max-participants").value = response.sbiMaxParticipants || "";
  setRadioValue("format-confirmation", response.formatConfirmation);
  setRadioValue("recording-confirmation", response.recordingConfirmation);
  setRadioValue("prerecord-confirmation", response.prerecordConfirmation);
  updateQuestionnaireSubmitButton();
  updateCeuOptOutState();
  updatePrerecordLiveSupportState();
  saveSurveyDraft();
}

function formatSubmittedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

async function checkExistingSurveyResponse(session) {
  latestSurveyResponse = null;
  const box = document.getElementById("survey-existing-response");
  box.classList.add("hidden");
  box.innerHTML = "";
  if (!session?.id) return;

  try {
    const res = await fetch(`/api/survey-responses?sessionId=${encodeURIComponent(session.id)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.latest) return null;

    latestSurveyResponse = data.latest;
    const submittedAt = formatSubmittedAt(data.latest.submittedAt);
    box.innerHTML = `
      <p class="text-[#162A53] font-semibold mb-2">A questionnaire response already exists for this session.</p>
      <p class="text-gray-800 mb-3">Latest submitted by: ${escapeHtml(data.latest.speakerName || "another presenter")}. Total submissions: ${escapeHtml(String(data.count))}.${submittedAt ? ` Latest submission: ${escapeHtml(submittedAt)}.` : ""}</p>
      <p class="text-gray-800 mb-3">Would you like to view and update that submission? If you resubmit, we will record your changes. You can make updates to this form until August 7, 2026.</p>
      <button id="load-existing-survey-response" type="button" class="px-4 py-2 bg-[var(--survey-primary)] text-white font-semibold rounded-lg hover:bg-[var(--survey-primary-dark)] transition-colors">Load latest response</button>
    `;
    box.classList.remove("hidden");
    document.getElementById("load-existing-survey-response").addEventListener("click", () => {
      populateSurveyResponseFields(latestSurveyResponse);
      box.querySelector("p").textContent = "Latest response loaded. Review, edit, and submit again if needed. A new submission will be saved.";
    });
    return data.latest;
  } catch (err) {
    console.error("Existing survey response lookup error:", err);
    return null;
  }
}

function parseCeuDraft(output) {
  const text = cleanCeuDraftText(output);
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
      questions: cleanCeuDraftText(text.slice(questionsStart, objectivesMatch.index)),
      objectives: cleanCeuDraftText(text.slice(objectivesStart))
    };
  }

  return {
    objectives: cleanCeuDraftText(text.slice(objectivesStart, questionsMatch.index)),
    questions: cleanCeuDraftText(text.slice(questionsStart))
  };
}

function cleanCeuDraftText(value) {
  return String(value || "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\n\s*#{1,6}\s*$/g, "")
    .replace(/\s*#{1,6}\s*$/g, "")
    .trim();
}

function buildCeuGenerationContext(session) {
  return [
    session.presentationType ? `Presentation Type: ${session.presentationType}` : "",
    (session.speakers || []).length ? `Presenter(s): ${session.speakers.map(speaker => speaker.name).filter(Boolean).join(", ")}` : "",
    session.ceuEligibility ? `CEU Eligibility: ${session.ceuEligibility}` : ""
  ].filter(Boolean).join("\n");
}

function getCeuGenerateState() {
  const sessionId = selectedSurveySession?.id || "unknown-session";
  const today = new Date().toISOString().slice(0, 10);
  let allState;
  try {
    allState = JSON.parse(localStorage.getItem(CEU_GENERATE_LIMIT_KEY)) || {};
  } catch (_) {
    allState = {};
  }

  const sessionState = allState[sessionId] || {};
  if (sessionState.date !== today) {
    return {
      sessionId,
      date: today,
      count: 0,
      allState
    };
  }

  return {
    sessionId,
    date: today,
    count: Number(sessionState.count) || 0,
    allState
  };
}

function saveCeuGenerateState(state) {
  const allState = state.allState || {};
  allState[state.sessionId] = {
    date: state.date,
    count: state.count
  };
  localStorage.setItem(CEU_GENERATE_LIMIT_KEY, JSON.stringify(allState));
}

function getCeuGenerateBlockMessage() {
  const state = getCeuGenerateState();
  if (state.count >= CEU_DAILY_SESSION_LIMIT) {
    return "You can auto-generate once and regenerate once per day for each session. Please review or edit the current draft, or try again tomorrow.";
  }

  return "";
}

function recordCeuGenerateUse() {
  const state = getCeuGenerateState();
  state.count += 1;
  saveCeuGenerateState(state);
  return state;
}

function updateCeuGenerateButtonLabel(button) {
  if (!button) return;
  const generatedForCurrentSession = !!selectedSurveySession && ceuDraftGeneratedSessionId === selectedSurveySession.id;
  button.textContent = generatedForCurrentSession ? "Regenerate objectives and questions" : "Auto-generate objectives and knowledge check questions";
}

async function loadSessions() {
  try {
    const res = await fetch(SESSION_DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch sessions JSON");

    const data = await res.json();
    SESSIONS_AS_OF = data.SESSIONS_AS_OF || "";
    sessions = data.sessions || [];
    SPEAKER_INDEX.splice(0, SPEAKER_INDEX.length, ...buildSpeakerIndex());
    updateOverviewSurveyCta();
    if (pendingOverviewSurveyLoad) {
      pendingOverviewSurveyLoad = false;
      await loadRememberedSurveyResponse();
    } else {
      await restoreSavedSurveyDraft();
    }
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
    .replace(/[^a-z0-9\s]/g, " ")
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
    statusEl.textContent = "No matches found. Try a shorter search or email globalgathering@cuanschutz.edu.";
    return;
  }

  containerEl.innerHTML = `
    <table class="min-w-full text-sm">
      <thead>
        <tr class="border-b">
          <th class="text-left py-2 pr-4 font-semibold">Title</th>
          ${mode === "speaker" ? '<th class="text-left py-2 pr-4 font-semibold">Speaker</th>' : ""}
          <th class="text-left py-2 pr-4 font-semibold">Session Type</th>
          <th class="text-left py-2 pr-4 font-semibold">Duration</th>
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
              <td class="py-2 pr-4">${escapeHtml(formatPresentationType(s.presentationType))}</td>
              <td class="py-2 pr-4">${escapeHtml(formatSessionDuration(s))}</td>
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

function buildShareMessage() {
  return [
    "I am excited to present at the 2026 Global Gathering for the Future of Child Welfare.",
    "",
    "I'm looking forward to joining colleagues and partners from around the world to learn, share ideas, and strengthen the future of child, youth, family, and community well-being.",
    "",
    `Learn more: ${EVENT_URL}`,
    "",
    "#GlobalGathering #FutureOfChildWelfare"
  ].join("\n");
}

function renderShareSession(session) {
  selectedShareSession = session;
  const summary = document.getElementById("share-session-summary");
  const message = document.getElementById("share-message");
  const status = document.getElementById("share-status");
  if (!summary || !message) return;

  summary.innerHTML = `
    <p class="font-semibold text-[#162A53] mb-1"><em>${escapeHtml(session.title || "Not listed")}</em></p>
    <dl class="grid gap-x-4 gap-y-1 sm:grid-cols-2 text-xs">
      <div class="flex gap-1"><dt class="font-semibold text-gray-600">Date/time:</dt><dd>${escapeHtml(formatSessionDateTime(session))}</dd></div>
      ${formatPresentationType(session.presentationType) ? `<div class="flex gap-1"><dt class="font-semibold text-gray-600">Session type:</dt><dd>${escapeHtml(formatPresentationType(session.presentationType))}</dd></div>` : ""}
    </dl>
  `;
  summary.classList.remove("hidden");
  message.value = buildShareMessage(session);
  if (status) status.textContent = "Caption drafted from the selected session. Edit it before posting if you would like.";
}

async function copyShareMessage() {
  const message = document.getElementById("share-message")?.value || "";
  const status = document.getElementById("share-status");
  if (!message.trim()) {
    if (status) status.textContent = "Select a session or write a caption before copying.";
    return false;
  }

  try {
    await navigator.clipboard.writeText(message);
  } catch (_) {
    const textarea = document.getElementById("share-message");
    textarea?.select();
    try { document.execCommand("copy"); } catch (_) {}
  }
  if (status) status.textContent = "Caption copied.";
  return true;
}

function triggerDownload(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadShareImage() {
  try {
    const res = await fetch(SHARE_IMAGE_URL, { mode: "cors" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    triggerDownload(url, "global-gathering-presenter.png");
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (_) {
    window.open(SHARE_IMAGE_URL, "_blank", "noopener,noreferrer");
  }
}

function bindShare() {
  const sessionInput = document.getElementById("share-session-search");
  const suggestionsBox = document.getElementById("share-session-suggestions");
  const generateButton = document.getElementById("share-generate-message");
  const copyButton = document.getElementById("share-copy-message");
  const linkedInButton = document.getElementById("share-open-linkedin");
  const downloadButton = document.getElementById("share-download-image");
  const canvaLink = document.getElementById("share-canva");
  const status = document.getElementById("share-status");
  const message = document.getElementById("share-message");
  if (!sessionInput || !suggestionsBox || !message) return;

  if (canvaLink) canvaLink.href = SHARE_CANVA_URL;
  message.value = buildShareMessage(null);

  sessionInput.addEventListener("input", () => {
    const q = sessionInput.value.toLowerCase().trim();
    selectedShareSession = null;
    suggestionsBox.innerHTML = "";
    if (!q) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    const matches = sessions
      .filter(s => `${s.title || ""} ${s.code || ""} ${(s.speakers || []).map(sp => sp.name).join(" ")}`.toLowerCase().includes(q))
      .slice(0, 12);

    if (!matches.length) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    matches.forEach(session => {
      const speakerNames = (session.speakers || []).map(sp => sp.name).filter(Boolean).join(", ");
      const div = document.createElement("div");
      div.className = "px-3 py-2 hover:bg-gray-100 cursor-pointer";
      div.innerHTML = `
        <div class="font-semibold">${escapeHtml(session.title || "")}</div>
        ${speakerNames ? `<div class="text-xs text-gray-600">${escapeHtml(speakerNames)}</div>` : ""}
      `;
      div.addEventListener("click", () => {
        sessionInput.value = session.title || "";
        suggestionsBox.classList.add("hidden");
        renderShareSession(session);
      });
      suggestionsBox.appendChild(div);
    });
    suggestionsBox.classList.remove("hidden");
  });

  document.addEventListener("click", e => {
    if (!suggestionsBox.contains(e.target) && e.target !== sessionInput) suggestionsBox.classList.add("hidden");
  });

  generateButton?.addEventListener("click", async () => {
    if (!selectedShareSession) {
      if (status) status.textContent = "Select your session before generating a session caption.";
      return;
    }

    generateButton.disabled = true;
    if (status) status.textContent = "Generating caption...";
    try {
      const res = await fetch("/api/generate-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedShareSession.title || "",
          description: selectedShareSession.description || "",
          sessionType: formatPresentationType(selectedShareSession.presentationType || ""),
          speakers: (selectedShareSession.speakers || []).map(speaker => speaker.name).filter(Boolean)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to generate caption.");
      message.value = data.message || buildShareMessage(selectedShareSession);
      if (status) status.textContent = "Caption generated. Please review and edit before posting.";
    } catch (err) {
      message.value = buildShareMessage(selectedShareSession);
      if (status) status.textContent = `Unable to generate with AI right now. A standard caption has been added instead. ${err.message}`;
    } finally {
      generateButton.disabled = false;
    }
  });

  copyButton?.addEventListener("click", copyShareMessage);
  linkedInButton?.addEventListener("click", async () => {
    await copyShareMessage();
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(EVENT_URL)}`, "_blank", "noopener,noreferrer");
  });
  downloadButton?.addEventListener("click", downloadShareImage);
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
          <li>Try first name, last name, or both.</li>
          <li>Check the Speaker column to confirm the right match.</li>
          <li>Email us if you cannot find your session.</li>
        </ul>
      `;
      return;
    }

    tipsEl.innerHTML = `
      <p>Tips for Session search:</p>
      <ul class="list-disc list-inside">
        <li>Search with a few distinctive words from your title.</li>
        <li>Try a shorter keyword if the full title does not appear.</li>
      </ul>
    `;
  }

  function setTab(which) {
    const isSpeaker = which === "speaker";
    tabSpeakerBtn.classList.toggle("tab-active", isSpeaker);
    tabSpeakerBtn.classList.toggle("tab-inactive", !isSpeaker);
    tabSpeakerBtn.classList.toggle("bg-[var(--survey-primary)]", isSpeaker);
    tabSpeakerBtn.classList.toggle("text-white", isSpeaker);
    tabSessionBtn.classList.toggle("tab-active", !isSpeaker);
    tabSessionBtn.classList.toggle("tab-inactive", isSpeaker);
    tabSessionBtn.classList.toggle("bg-[var(--survey-primary)]", !isSpeaker);
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
  const optOutCheckbox = document.getElementById("survey-ceu-opt-out");
  const copyOthersCheckbox = document.getElementById("survey-copy-others");
  const ccFields = document.getElementById("survey-cc-fields");
  const addCcButton = document.getElementById("survey-add-cc");
  const submitBtn = document.getElementById("survey-submit");
  const statusEl = document.getElementById("survey-status");
  updateCeuGenerateButtonLabel(generateBtn);
  renderSurveyCcFields([]);

  form.addEventListener("input", () => {
    saveSurveyDraft();
  });

  form.addEventListener("change", () => {
    updateCeuOptOutState();
    updatePrerecordLiveSupportState();
    saveSurveyDraft();
  });

  optOutCheckbox?.addEventListener("change", () => {
    if (optOutCheckbox.checked) {
      showCeuOptOutConfirmation();
    } else {
      document.getElementById("survey-ceu-opt-out-confirmation")?.remove();
    }
  });

  copyOthersCheckbox?.addEventListener("change", () => {
    renderSurveyCcFields(copyOthersCheckbox.checked ? getSurveyCcEmails().concat([""]).slice(0, 5) : []);
    saveSurveyDraft();
  });

  ccFields?.addEventListener("input", saveSurveyDraft);
  ccFields?.addEventListener("click", event => {
    const removeButton = event.target.closest?.("[data-remove-cc]");
    if (!removeButton) return;
    const index = Number(removeButton.dataset.removeCc);
    const values = Array.from(document.querySelectorAll(".survey-cc-email")).map(input => input.value.trim());
    values.splice(index, 1);
    renderSurveyCcFields(values.length ? values : [""]);
    saveSurveyDraft();
  });

  addCcButton?.addEventListener("click", () => {
    const values = Array.from(document.querySelectorAll(".survey-cc-email")).map(input => input.value.trim());
    if (values.length >= 5) return;
    renderSurveyCcFields(values.concat(""));
    saveSurveyDraft();
  });

  sessionInput.addEventListener("input", () => {
    const q = sessionInput.value.toLowerCase().trim();
    saveSurveyDraft();
    selectedSurveySession = null;
    latestSurveyResponse = null;
    isResubmittingQuestionnaire = false;
    updateQuestionnaireSubmitButton();
    document.getElementById("survey-session-id").value = "";
    document.getElementById("survey-session-summary").classList.add("hidden");
    document.getElementById("survey-existing-response").classList.add("hidden");
    document.getElementById("survey-conditional-fields").classList.add("hidden");
    clearSurveyResponseFields();
    suggestionsBox.innerHTML = "";

    if (!q) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    const matches = sessions
      .filter(s => `${s.title || ""} ${s.code || ""} ${(s.speakers || []).map(sp => sp.name).join(" ")}`.toLowerCase().includes(q))
      .slice(0, 12);

    if (!matches.length) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    matches.forEach(session => {
      const speakerNames = (session.speakers || []).map(sp => sp.name).filter(Boolean).join(", ");
      const div = document.createElement("div");
      div.className = "px-3 py-2 hover:bg-gray-100 cursor-pointer";
      div.innerHTML = `
        <div class="font-semibold">${escapeHtml(session.title || "")}</div>
        <div class="text-xs font-semibold text-[#162A53]">${escapeHtml(formatSessionDateTime(session))}</div>
        ${speakerNames ? `<div class="text-xs text-gray-600">${escapeHtml(speakerNames)}</div>` : ""}
      `;
      div.addEventListener("click", async () => {
        sessionInput.value = session.title || "";
        suggestionsBox.classList.add("hidden");
        await renderSurveyForSession(session);
        const sessionDraft = getSavedSurveySessionDraft(session.id);
        if (sessionDraft) applySurveyDraftFields(sessionDraft);
        saveSurveyDraft();
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
    if (isCeuOptedOut()) return;
    const draftEl = document.getElementById("survey-ceu-draft");
    const blockMessage = getCeuGenerateBlockMessage();
    if (blockMessage) {
      draftEl.textContent = blockMessage;
      draftEl.classList.remove("hidden");
      updateCeuGenerateButtonLabel(generateBtn);
      return;
    }

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
          extra: buildCeuGenerationContext(selectedSurveySession)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ? `${data.error}\n${data.details}` : data.error);
      const cleanedOutput = cleanCeuDraftText(data.output);
      const parsed = parseCeuDraft(cleanedOutput);
      const objectivesEl = document.getElementById("survey-ceu-objectives");
      const questionsEl = document.getElementById("survey-ceu-questions");

      if (parsed.objectives) objectivesEl.value = parsed.objectives;
      if (parsed.questions) questionsEl.value = parsed.questions;
      saveSurveyDraft();

      ceuDraftGeneratedSessionId = selectedSurveySession.id;

      if (parsed.objectives && parsed.questions) {
        draftEl.textContent = "Draft added. Please review and edit before submitting.";
      } else {
        draftEl.textContent = `${cleanedOutput}\n\nThe draft could not be placed automatically. Please copy the useful parts into the boxes above.`;
      }
      const state = recordCeuGenerateUse();
      if (state.count >= CEU_DAILY_SESSION_LIMIT) {
        draftEl.textContent += " You have used today's auto-generate and regenerate options for this session.";
      }
    } catch (err) {
      draftEl.textContent = `Unable to generate a draft right now: ${err.message}`;
    } finally {
      generateBtn.disabled = false;
      updateCeuGenerateButtonLabel(generateBtn);
    }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!selectedSurveySession) {
      statusEl.textContent = "Please select your session from the dropdown before submitting the questionnaire.";
      statusEl.className = "p-4 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200";
      return;
    }

    submitBtn.disabled = true;
    const wasResubmitting = isResubmittingQuestionnaire;
    submitBtn.textContent = wasResubmitting ? "Resubmitting..." : "Submitting...";
    statusEl.className = "hidden p-4 rounded-lg text-sm font-medium";

    const body = {
      firstName: document.getElementById("survey-first-name").value,
      lastName: document.getElementById("survey-last-name").value,
      email: document.getElementById("survey-email").value,
      ccEmails: getSurveyCcEmails(),
      sessionId: selectedSurveySession.id || "",
      sessionCode: selectedSurveySession.code || "",
      sessionTitle: selectedSurveySession.title || "",
      sessionVideoFormat: selectedSurveySession.videoFormat || "",
      sessionRecordingStatus: selectedSurveySession.recordingStatus || "",
      ceuObjectives: isCeuEligible(selectedSurveySession) && !isCeuOptedOut() ? document.getElementById("survey-ceu-objectives").value : "",
      ceuQuestions: isCeuEligible(selectedSurveySession) && !isCeuOptedOut() ? document.getElementById("survey-ceu-questions").value : "",
      ceuOptOut: isCeuEligible(selectedSurveySession) ? isCeuOptedOut() : false,
      sessionFollowupPrompt: getSessionFollowup(selectedSurveySession)?.heading || "",
      sessionFollowupResponse: getSessionFollowup(selectedSurveySession) ? document.getElementById("survey-session-followup-response").value : "",
      formatConfirmation: selectedRadioValue("format-confirmation"),
      recordingConfirmation: selectedRadioValue("recording-confirmation"),
      prerecordConfirmation: selectedRadioValue("prerecord-confirmation"),
      prerecordLiveSupport: selectedRadioValue("prerecord-confirmation") === PRERECORD_YES_OPTION ? document.getElementById("survey-prerecord-live-support").value : "",
      sbiMaxParticipants: isSkillBuildingInstitute(selectedSurveySession) ? document.getElementById("survey-sbi-max-participants").value : "",
      additionalNotes: document.getElementById("survey-additional-notes").value,
      isResubmission: wasResubmitting
    };

    try {
      const res = await fetch("/api/submit-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok) {
        rememberSurveySubmission(selectedSurveySession);
        clearSavedSurveySessionDraft(selectedSurveySession?.id);
        clearSavedSurveyDraft();
        updateOverviewSurveyCta();
        form.reset();
        renderSurveyCcFields([]);
        selectedSurveySession = null;
        latestSurveyResponse = null;
        document.getElementById("survey-session-summary").classList.add("hidden");
        document.getElementById("survey-existing-response").classList.add("hidden");
        document.getElementById("survey-conditional-fields").classList.add("hidden");
        document.getElementById("survey-ceu-draft").classList.add("hidden");
        if (data.warning) {
          statusEl.textContent = data.warning;
          statusEl.className = "p-4 rounded-lg text-sm font-medium bg-yellow-50 text-yellow-800 border border-yellow-200";
        } else {
          statusEl.innerHTML = `${wasResubmitting
            ? "Thank you &mdash; your updated Speaker Questionnaire response was submitted. A confirmation email has been sent."
            : "Thank you &mdash; your Speaker Questionnaire response was submitted. A confirmation email has been sent."} Take a moment to <a href="#" data-goto-share class="underline font-semibold">share your participation</a> in the Global Gathering.`;
          statusEl.className = "p-4 rounded-lg text-sm font-medium bg-green-50 text-[#235540] border border-[#235540]";
        }
        submitBtn.disabled = false;
        isResubmittingQuestionnaire = false;
        updateQuestionnaireSubmitButton();
      } else {
        statusEl.textContent = data.error || "Something went wrong. Please try again.";
        statusEl.className = "p-4 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200";
        submitBtn.disabled = false;
        updateQuestionnaireSubmitButton();
      }
    } catch (err) {
      statusEl.textContent = "Network error. Please check your connection and try again.";
      statusEl.className = "p-4 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200";
      submitBtn.disabled = false;
      updateQuestionnaireSubmitButton();
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
