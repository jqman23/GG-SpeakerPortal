const SESSION_DATA_URL = "https://gist.githubusercontent.com/jqman23/8f66cc78cbe2f6e05ed2cafce3776942/raw/session-speaker-index.json";
const MAX_GENERATE_CLICKS = 5;

// Toggle tabs here. Set enabled: false to hide a tab without editing markup.
const TAB_CONFIG = [
  { id: "overview-tab", label: "Overview", sectionId: "overview", enabled: true },
  { id: "faqs-tab", label: "Frequently Asked Questions (FAQs)", sectionId: "faqs", enabled: true },
  { id: "session-lookup-tab", label: "Session Information Lookup", sectionId: "session-lookup", enabled: true },
  {
    id: "ceu-tab",
    label: "CEU Information and Question Generator",
    mobileLabel: "CEU Information",
    sectionId: "ceu",
    enabled: true
  },
  {
    id: "speaker-resource-guide",
    label: "Speaker Resource Guide (PDF)",
    url: "https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/6e39e63ddecc460ba1e0481e3ecf2d04/cbf0f7896c9e45018217c1d9f9df0386.pdf",
    enabled: false,
    external: true
  },
  {
    id: "attendee-hub-video",
    label: "Informational Video on Attendee Hub",
    url: "https://youtu.be/WQYB2zQsYaM",
    enabled: false,
    external: true
  },
  {
    id: "speaker-resource-center",
    label: "Speaker Portal & Questionnaire",
    url: "https://cvent.me/YRmVVA",
    enabled: true,
    external: true
  }
];

let SESSIONS_AS_OF = "";
let sessions = [];
const SPEAKER_INDEX = [];
let selectedVersion = null;

document.addEventListener("DOMContentLoaded", () => {
  renderTabs();
  bindGenerator();
  bindLookup();
  loadSessions();
  initializeGenerateLimit();
  loadSavedVersions();
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

function bindGenerator() {
  const btn = document.getElementById("generate-btn");
  const copyBtn = document.getElementById("copy-btn");
  const editBtn = document.getElementById("edit-btn");
  const out = document.getElementById("output");

  btn.addEventListener("click", () => {
    const today = new Date().toISOString().split("T")[0];
    const generateData = JSON.parse(localStorage.getItem("generateData")) || { date: "", count: 0 };

    if (generateData.date !== today) {
      generateData.date = today;
      generateData.count = 0;
    }

    const remainingClicks = MAX_GENERATE_CLICKS - generateData.count;
    if (remainingClicks <= 0) {
      out.textContent = `You have reached the maximum number of generations (${MAX_GENERATE_CLICKS}) for today. This limit resets each day. Your saved knowledge-check questions and measurable objectives will remain available for you to copy and paste so long as you do not clear your browser's local storage.`;
      return;
    }

    const title = document.getElementById("title");
    const desc = document.getElementById("description");
    if (!title.value.trim() || !desc.value.trim()) {
      selectedVersion = null;
      out.textContent = "Please fill in at least the title and description.";
      return;
    }

    generateCEU().then(generated => {
      if (!generated) return;
      generateData.count += 1;
      localStorage.setItem("generateData", JSON.stringify(generateData));
      btn.textContent = `Re-Generate (${MAX_GENERATE_CLICKS - generateData.count} Remaining)`;
    });
  });

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(out.textContent);
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = "Copy Output";
    }, 2000);
  });

  editBtn.addEventListener("click", () => {
    const currentOutput = out.textContent.trim();
    if (editBtn.textContent === "Edit Output") {
      out.contentEditable = "true";
      out.focus();
      editBtn.textContent = "Save Output";
      editBtn.style.background = "var(--green)";
      return;
    }

    out.contentEditable = "false";
    editBtn.textContent = "Edit Output";
    editBtn.style.background = "var(--blue)";

    if (selectedVersion) {
      selectedVersion.dataset.content = currentOutput;
      saveToLocalStorage();
    }
  });

  const titleInput = document.getElementById("title");
  const descInput = document.getElementById("description");
  const suggestionsDiv = document.getElementById("suggestions");

  titleInput.addEventListener("input", () => {
    const query = titleInput.value.toLowerCase().trim();
    suggestionsDiv.innerHTML = "";
    if (!query) {
      suggestionsDiv.classList.add("hidden");
      return;
    }

    const matches = sessions.filter(session => (session.title || "").toLowerCase().includes(query));
    if (!matches.length) {
      suggestionsDiv.classList.add("hidden");
      return;
    }

    matches.forEach(session => {
      const suggestion = document.createElement("div");
      suggestion.textContent = session.title;
      suggestion.addEventListener("click", () => {
        titleInput.value = session.title;
        descInput.value = session.description || "";
        suggestionsDiv.classList.add("hidden");
      });
      suggestionsDiv.appendChild(suggestion);
    });
    suggestionsDiv.classList.remove("hidden");
  });

  titleInput.addEventListener("blur", () => {
    setTimeout(() => suggestionsDiv.classList.add("hidden"), 200);
  });

  titleInput.addEventListener("change", () => {
    const exactMatch = sessions.find(session => (session.title || "").toLowerCase() === titleInput.value.toLowerCase().trim());
    if (exactMatch) descInput.value = exactMatch.description || "";
  });
}

function initializeGenerateLimit() {
  const btn = document.getElementById("generate-btn");
  const today = new Date().toISOString().split("T")[0];
  let generateData = JSON.parse(localStorage.getItem("generateData"));

  if (!generateData || generateData.date !== today) {
    generateData = { date: today, count: 0 };
    localStorage.setItem("generateData", JSON.stringify(generateData));
  }

  btn.textContent = `Generate (${MAX_GENERATE_CLICKS - generateData.count} Remaining)`;
}

async function generateCEU() {
  const title = document.getElementById("title");
  const desc = document.getElementById("description");
  const extra = document.getElementById("extra");
  const out = document.getElementById("output");
  const copyBtn = document.getElementById("copy-btn");
  const editBtn = document.getElementById("edit-btn");
  const savedVersionsDiv = document.getElementById("saved-versions");

  out.innerHTML = '<p class="loading">Generating...</p>';

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.value.trim(),
        description: desc.value.trim(),
        extra: extra.value.trim()
      })
    });

    const data = await res.json();
    if (!res.ok) {
      out.textContent = data.details ? `${data.error}\n${data.details}` : data.error;
      return false;
    }

    out.textContent = data.output;
    saveVersion(data.output, savedVersionsDiv);
    copyBtn.classList.add("visible");
    editBtn.classList.add("visible");
    selectedVersion = null;
    return true;
  } catch (error) {
    out.textContent = `Network error: ${error.message}`;
    return false;
  }
}

function saveToLocalStorage() {
  const savedVersionsDiv = document.getElementById("saved-versions");
  const versions = Array.from(savedVersionsDiv.children).map(div => ({
    content: div.dataset.content,
    label: div.textContent
  }));
  localStorage.setItem("savedVersions", JSON.stringify(versions));
}

function loadSavedVersions() {
  const savedVersionsDiv = document.getElementById("saved-versions");
  const savedVersions = JSON.parse(localStorage.getItem("savedVersions")) || [];

  savedVersions.forEach(version => {
    const versionDiv = createVersionElement(version.label, version.content, savedVersionsDiv);
    savedVersionsDiv.appendChild(versionDiv);
  });
}

function saveVersion(content, savedVersionsDiv) {
  const versionCount = savedVersionsDiv.children.length + 1;
  const versionDiv = createVersionElement(`Saved Output, Version ${versionCount}`, content, savedVersionsDiv);
  savedVersionsDiv.appendChild(versionDiv);
  saveToLocalStorage();
}

function createVersionElement(label, content, savedVersionsDiv) {
  const versionDiv = document.createElement("div");
  versionDiv.className = "version";
  versionDiv.textContent = label;
  versionDiv.dataset.content = content;
  versionDiv.addEventListener("click", () => {
    const out = document.getElementById("output");
    const copyBtn = document.getElementById("copy-btn");
    const editBtn = document.getElementById("edit-btn");
    const currentOutput = out.textContent.trim();

    if (selectedVersion && selectedVersion.dataset.content !== currentOutput) {
      selectedVersion.dataset.content = currentOutput;
      saveToLocalStorage();
    }

    if (currentOutput && !selectedVersion) {
      const isDuplicate = Array.from(savedVersionsDiv.children).some(div => div.dataset.content === currentOutput);
      if (!isDuplicate) saveVersion(currentOutput, savedVersionsDiv);
    }

    selectedVersion = versionDiv;
    out.textContent = versionDiv.dataset.content;
    copyBtn.classList.add("visible");
    editBtn.classList.add("visible");
  });
  return versionDiv;
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
    if (status) status.textContent = "Error loading session data.";
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
      const reg = (sp.registration || "").trim();
      rows.push([s, display, n, n2, reg]);
    });
  }
  return rows;
}

function searchBySpeaker(first, last) {
  const qFull = normalize(`${first} ${last}`);
  const qTight = qFull.replace(/\s+/g, "");
  const results = [];

  for (const [sess, display, n, n2, reg] of SPEAKER_INDEX) {
    const sim = Math.max(tokenSimilarity(qFull, n), tokenSimilarity(qTight, n2));
    if (sim >= 0.45) {
      results.push({
        session: sess,
        similarity: sim,
        speakerMatched: display,
        registration: reg || "Unknown"
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
    statusEl.textContent = "No matches found.";
    return;
  }

  containerEl.innerHTML = `
    <table class="min-w-full text-sm">
      <thead>
        <tr class="border-b">
          <th class="text-left py-2 pr-4 font-semibold">Title</th>
          ${mode === "speaker" ? '<th class="text-left py-2 pr-4 font-semibold">Speaker</th>' : ""}
          ${mode === "speaker" ? '<th class="text-left py-2 pr-4 font-semibold">Registered</th>' : ""}
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
              ${mode === "speaker" ? `<td class="py-2 pr-4">${escapeHtml(row.registration || "Unknown")}</td>` : ""}
              <td class="py-2 pr-4">${escapeHtml(s.recordingStatus || "")}</td>
              <td class="py-2 pr-4">${escapeHtml(s.ceuEligibility || "")}</td>
              <td class="py-2 pr-4">${escapeHtml(s.videoFormat || "")}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
  statusEl.textContent = `${rows.length} match${rows.length === 1 ? "" : "es"} found - Registration status as of ${SESSIONS_AS_OF}.`;
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
          <li>If the search is not returning any results, try just using your first or last name.</li>
          <li>If you still can't identify yourself, please contact the CTA Conference Team.</li>
          <li>Double check the <b>Speaker</b> column to confirm the outputted sessions belong to you.</li>
          <li>The <b>Registered</b> column indicates whether or not a speaker is registered for the conference as of the date and time listed below.</li>
        </ul>
      `;
      return;
    }

    tipsEl.innerHTML = `
      <p>Tips for Session search:</p>
      <ul class="list-disc list-inside">
        <li>Start typing a few consecutive words from your session title and then select the proper title from the drop-down.</li>
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
      statusEl.textContent = "Enter at least a first or last name.";
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
      statusEl.textContent = "Type a few words from the session title.";
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
