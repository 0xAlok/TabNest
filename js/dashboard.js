// dashboard.js

// DOM Elements
const saveCurrentTabsBtn = document.getElementById("saveCurrentTabsBtn");
const createFirstSessionBtn = document.getElementById("createFirstSessionBtn");
const saveSessionForm = document.getElementById("saveSessionForm");
const sessionNameInput = document.getElementById("sessionName");
const confirmSaveBtn = document.getElementById("confirmSaveBtn");
const cancelSaveBtn = document.getElementById("cancelSaveBtn");
const sessionsContainer = document.getElementById("sessionsContainer");
const searchInput = document.getElementById("searchInput");
const sortFilter = document.getElementById("sortFilter");
const dateFilter = document.getElementById("dateFilter");
const gridViewBtn = document.getElementById("gridViewBtn");
const listViewBtn = document.getElementById("listViewBtn");
const sessionDetailModal = document.getElementById("sessionDetailModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalSessionTitle = document.getElementById("modalSessionTitle");
const modalSessionDate = document.getElementById("modalSessionDate");
const modalSessionStats = document.getElementById("modalSessionStats");
const tabsList = document.getElementById("tabsList");
const sessionNotes = document.getElementById("sessionNotes");
const saveNotesBtn = document.getElementById("saveNotesBtn");
const restoreSessionBtn = document.getElementById("restoreSessionBtn");
const restoreNewWindowBtn = document.getElementById("restoreNewWindowBtn");
const deleteSessionBtn = document.getElementById("deleteSessionBtn");
const exportDataBtn = document.getElementById("exportDataBtn");
const importDataBtn = document.getElementById("importDataBtn");
const settingsBtn = document.getElementById("settingsBtn");

// State
let currentSessions = [];
let currentSessionId = null;
let viewMode = "grid";

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  loadSavedSessions();

  saveCurrentTabsBtn.addEventListener("click", showSaveForm);
  // createFirstSessionBtn is dynamically added, listener attached in renderSessions
  confirmSaveBtn.addEventListener("click", saveCurrentSession);
  cancelSaveBtn.addEventListener("click", hideSaveForm);

  searchInput.addEventListener("input", filterSessions);
  sortFilter.addEventListener("change", sortSessions);
  dateFilter.addEventListener("change", filterSessions);

  gridViewBtn.addEventListener("click", () => setViewMode("grid"));
  listViewBtn.addEventListener("click", () => setViewMode("list"));

  closeModalBtn.addEventListener("click", hideSessionModal);

  saveNotesBtn.addEventListener("click", saveSessionNotes);

  restoreSessionBtn.addEventListener("click", () => {
    if (currentSessionId) {
      chrome.runtime.sendMessage(
        {
          action: "restoreSession",
          sessionId: currentSessionId,
          inNewWindow: false,
        },
        (response) => {
          handleRestoreResponse(response);
        }
      );
    }
  });

  restoreNewWindowBtn.addEventListener("click", () => {
    if (currentSessionId) {
      chrome.runtime.sendMessage(
        {
          action: "restoreSession",
          sessionId: currentSessionId,
          inNewWindow: true,
        },
        (response) => {
          handleRestoreResponse(response);
        }
      );
    }
  });

  deleteSessionBtn.addEventListener("click", () => {
    if (currentSessionId) {
      deleteSession(currentSessionId);
      hideSessionModal();
    }
  });

  exportDataBtn.addEventListener("click", exportData);
  importDataBtn.addEventListener("click", importData);
  settingsBtn.addEventListener("click", openSettings);
});

function handleRestoreResponse(response) {
  if (response?.success) {
    showNotification("Session restoration initiated successfully!");
    // Optionally, close the modal or provide other UI feedback
    // hideSessionModal(); // If you want to close modal after initiating restore
  } else {
    showNotification(
      `Failed to restore session: ${response?.error || "Unknown error"}`,
      true
    );
  }
}

// Functions
function showSaveForm() {
  const now = new Date();
  const defaultName = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  sessionNameInput.value = defaultName;
  saveSessionForm.classList.remove("hidden");
  saveCurrentTabsBtn.classList.add("hidden");
  sessionNameInput.focus();
  sessionNameInput.select();
}

function hideSaveForm() {
  saveSessionForm.classList.add("hidden");
  saveCurrentTabsBtn.classList.remove("hidden");
}

async function saveCurrentSession() {
  const sessionName =
    sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;

  try {
    confirmSaveBtn.textContent = "Saving...";
    confirmSaveBtn.disabled = true;

    const tabs = await chrome.tabs.query({ currentWindow: true });
    let tabGroups = [];
    if (chrome.tabGroups) {
      try {
        // Check if the current window ID is valid. Sometimes it can be -1 if the window is not focused.
        const currentWindow = await chrome.windows.getCurrent();
        if (
          currentWindow &&
          currentWindow.id !== chrome.windows.WINDOW_ID_NONE
        ) {
          tabGroups = await chrome.tabGroups.query({
            windowId: currentWindow.id,
          });
        } else {
          console.warn(
            "Could not get current window ID for tab groups, saving without group info."
          );
        }
      } catch (e) {
        console.warn(
          "Error querying tab groups, possibly not supported or no groups exist:",
          e
        );
      }
    }

    const session = {
      id: Date.now().toString(),
      name: sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: "",
      tabs: tabs.map((tab) => ({
        id: tab.id.toString(), // Store original tab ID for reference, but it won't be the same on restore
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned, // Save pinned state
        active: tab.active, // Save active state (though usually one tab is active on restore)
        favicon: tab.favIconUrl,
        groupId:
          tab.groupId && tab.groupId !== chrome.tabs.TAB_ID_NONE
            ? tab.groupId.toString()
            : null,
      })),
      tabGroups: tabGroups.map((group) => ({
        id: group.id.toString(), // Store original group ID for reference
        title: group.title || "", // Use 'title' as per API
        color: group.color || "grey",
        collapsed: group.collapsed, // Save collapsed state
        // 'tabs' array in tabGroups is not needed here as we link tabs to groups via tab.groupId
      })),
    };

    await saveSessionToStorage(session); // Renamed to avoid conflict
    hideSaveForm();
    loadSavedSessions();
    showNotification("Session saved successfully!");
  } catch (error) {
    console.error("Error saving session:", error);
    showNotification("Error saving session: " + error.message, true);
  } finally {
    confirmSaveBtn.textContent = "Save";
    confirmSaveBtn.disabled = false;
  }
}

async function loadSavedSessions() {
  try {
    const sessions = await getSessionsFromStorage(); // Renamed
    currentSessions = sessions;
    renderSessions();
  } catch (error) {
    console.error("Error loading sessions:", error);
    showNotification("Error loading sessions", true);
  }
}

function renderSessions() {
  if (!sessionsContainer) {
    console.error("sessionsContainer is not found!");
    return;
  }
  if (currentSessions.length === 0) {
    sessionsContainer.innerHTML = `
      <div class="empty-state">
        <p>No saved sessions yet</p>
        <button id="createFirstSessionBtnDynamic" class="btn primary">Save Your First Session</button>
      </div>
    `;
    // Ensure the dynamically added button gets an event listener
    const createFirstBtnDynamic = document.getElementById(
      "createFirstSessionBtnDynamic"
    );
    if (createFirstBtnDynamic) {
      createFirstBtnDynamic.addEventListener("click", showSaveForm);
    } else if (createFirstSessionBtn) {
      // Fallback for the static one if it exists
      createFirstSessionBtn.addEventListener("click", showSaveForm);
    }
    return;
  }

  let filteredSessions = filterSessionsBySearch(
    currentSessions,
    searchInput.value
  );
  filteredSessions = filterSessionsByDate(filteredSessions, dateFilter.value);
  filteredSessions = sortSessionsBy(filteredSessions, sortFilter.value);

  if (viewMode === "grid") {
    sessionsContainer.className = "sessions-grid";
    sessionsContainer.innerHTML = filteredSessions
      .map((session) => createSessionCard(session))
      .join("");
  } else {
    sessionsContainer.className = "sessions-list";
    sessionsContainer.innerHTML = filteredSessions
      .map((session) => createSessionListItem(session))
      .join("");
  }

  document
    .querySelectorAll(".session-card, .session-list-item")
    .forEach((element) => {
      element.addEventListener("click", (e) => {
        // Prevent triggering if a button inside was clicked
        if (e.target.closest("button")) return;
        showSessionDetail(element.dataset.id);
      });
    });

  document.querySelectorAll(".restore-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sessionId = e.target.dataset.id;
      chrome.runtime.sendMessage(
        {
          action: "restoreSession",
          sessionId: sessionId,
        },
        (response) => {
          handleRestoreResponse(response);
        }
      );
    });
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(e.target.dataset.id);
    });
  });
}

function createSessionCard(session) {
  const date = new Date(session.createdAt).toLocaleString();
  const tabCount = session.tabs.length;
  const groupCount = session.tabGroups?.length || 0; // Ensure tabGroups exists

  let previewContent = "";

  if (groupCount > 0) {
    const tabsByGroup = {};
    session.tabs.forEach((tab) => {
      if (tab.groupId) {
        if (!tabsByGroup[tab.groupId]) {
          tabsByGroup[tab.groupId] = [];
        }
        tabsByGroup[tab.groupId].push(tab);
      }
    });

    session.tabGroups.forEach((group) => {
      const groupTabs = tabsByGroup[group.id] || [];
      if (groupTabs.length > 0) {
        const groupFavicons = groupTabs
          .filter((tab) => tab.favicon)
          .slice(0, 4)
          .map(
            (tab) => `
            <div class="tab-preview">
              <img src="${tab.favicon}" alt="" onerror="this.src='icons/icon32.png'">
            </div>
          `
          )
          .join("");

        previewContent += `
          <div class="group-preview" style="border-left: 3px solid ${
            group.color
          }">
            <div class="group-preview-header">
              <span class="group-preview-name">${
                group.title || "Unnamed group" // Use 'title'
              }</span>
              <span class="group-preview-count">${groupTabs.length} tab${
          groupTabs.length !== 1 ? "s" : ""
        }</span>
            </div>
            <div class="group-preview-favicons">
              ${groupFavicons}
              ${
                groupTabs.length > 4
                  ? `<div class="tab-preview more-indicator">+${
                      groupTabs.length - 4
                    }</div>`
                  : ""
              }
            </div>
          </div>
        `;
      }
    });
  }

  const ungroupedTabs = session.tabs.filter((tab) => !tab.groupId);
  if (ungroupedTabs.length > 0) {
    const ungroupedFavicons = ungroupedTabs
      .filter((tab) => tab.favicon)
      .slice(0, 4)
      .map(
        (tab) => `
        <div class="tab-preview">
          <img src="${tab.favicon}" alt="" onerror="this.src='icons/icon32.png'">
        </div>
      `
      )
      .join("");

    previewContent += `
      <div class="ungrouped-preview">
        <div class="ungrouped-preview-header">
          <span class="ungrouped-preview-name">Ungrouped tabs</span>
          <span class="ungrouped-preview-count">${ungroupedTabs.length} tab${
      ungroupedTabs.length !== 1 ? "s" : ""
    }</span>
        </div>
        <div class="ungrouped-preview-favicons">
          ${ungroupedFavicons}
          ${
            ungroupedTabs.length > 4
              ? `<div class="tab-preview more-indicator">+${
                  ungroupedTabs.length - 4
                }</div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  if (!previewContent) {
    previewContent =
      '<div class="empty-preview">No tab preview available</div>';
  }

  return `
    <div class="session-card" data-id="${session.id}">
      <div class="card-header">
        <h3 class="card-title">${session.name}</h3>
        <div class="card-date">${date}</div>
      </div>
      <div class="card-body">
        <div class="card-stats">
          <span>${tabCount} tab${tabCount !== 1 ? "s" : ""}</span>
          ${
            groupCount > 0
              ? `<span>${groupCount} group${groupCount !== 1 ? "s" : ""}</span>`
              : ""
          }
        </div>
        <div class="card-preview">
          ${previewContent}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn primary restore-btn" data-id="${
          session.id
        }">Restore</button>
        <button class="btn secondary delete-btn" data-id="${
          session.id
        }">Delete</button>
      </div>
    </div>
  `;
}

function createSessionListItem(session) {
  const date = new Date(session.createdAt).toLocaleString();
  const tabCount = session.tabs.length;
  const groupCount = session.tabGroups?.length || 0; // Ensure tabGroups exists

  let groupIndicators = "";

  if (groupCount > 0) {
    groupIndicators = session.tabGroups
      .map((group) => {
        const groupTabCount = session.tabs.filter(
          (tab) => tab.groupId === group.id
        ).length;
        return `
        <div class="list-group-indicator" style="background-color: ${
          group.color
        }">
          <span class="group-name">${group.title || "Unnamed"}</span> 
          <span class="group-count">${groupTabCount}</span>
        </div>
      `;
      })
      .join("");
  }

  const ungroupedCount = session.tabs.filter((tab) => !tab.groupId).length;
  if (ungroupedCount > 0) {
    groupIndicators += `
      <div class="list-group-indicator ungrouped">
        <span class="group-name">Ungrouped</span>
        <span class="group-count">${ungroupedCount}</span>
      </div>
    `;
  }

  return `
    <div class="session-list-item" data-id="${session.id}">
      <div class="list-item-content">
        <div class="list-item-title">${session.name}</div>
        <div class="list-item-meta">
          <span class="list-item-date">${date}</span>
          <span class="list-item-stats">
            ${tabCount} tab${tabCount !== 1 ? "s" : ""}
            ${
              groupCount > 0
                ? `, ${groupCount} group${groupCount !== 1 ? "s" : ""}`
                : ""
            }
          </span>
        </div>
        ${
          groupCount > 0 || ungroupedCount > 0
            ? `
        <div class="list-item-groups">
          ${groupIndicators}
        </div>
        `
            : ""
        }
      </div>
      <div class="list-item-actions">
        <button class="btn primary restore-btn" data-id="${
          session.id
        }">Restore</button>
        <button class="btn secondary delete-btn" data-id="${
          session.id
        }">Delete</button>
      </div>
    </div>
  `;
}

function showSessionDetail(sessionId) {
  const session = currentSessions.find((s) => s.id === sessionId);
  if (!session) return;

  currentSessionId = sessionId;

  modalSessionTitle.textContent = session.name;
  modalSessionDate.textContent = `Date: ${new Date(
    session.createdAt
  ).toLocaleString()}`;

  const tabCount = session.tabs.length;
  const groupCount = session.tabGroups?.length || 0; // Ensure tabGroups exists
  modalSessionStats.textContent = `Tabs: ${tabCount} ${
    groupCount > 0 ? `, Groups: ${groupCount}` : ""
  }`;

  sessionNotes.value = session.notes || "";
  tabsList.innerHTML = "";

  const groupedTabs = {};
  const ungroupedTabs = [];

  session.tabs.forEach((tab) => {
    if (tab.groupId) {
      if (!groupedTabs[tab.groupId]) {
        groupedTabs[tab.groupId] = [];
      }
      groupedTabs[tab.groupId].push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  });

  if (session.tabGroups) {
    // Check if tabGroups exists
    session.tabGroups.forEach((group) => {
      const groupTabs = groupedTabs[group.id] || [];
      const groupElement = document.createElement("div");
      groupElement.className = "tab-group";
      groupElement.innerHTML = `
        <div class="group-header" style="background-color: ${
          group.color
        }20; border-left: 4px solid ${group.color}">
          <div class="group-header-content">
            <span class="group-name">${group.title || "Unnamed group"}</span>
            <span class="group-count">${groupTabs.length} tab${
        groupTabs.length !== 1 ? "s" : ""
      }</span>
          </div>
          <div class="group-actions">
            <button class="group-expand-btn" title="Expand/Collapse Group">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>
      `;
      const tabsContainer = document.createElement("div");
      tabsContainer.className = "group-tabs";
      groupTabs.forEach((tab) => {
        tabsContainer.innerHTML += createTabItem(tab);
      });
      groupElement.appendChild(tabsContainer);
      tabsList.appendChild(groupElement);
      const expandBtn = groupElement.querySelector(".group-expand-btn");
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        tabsContainer.classList.toggle("collapsed");
        expandBtn.classList.toggle("collapsed");
      });
    });
  }

  if (ungroupedTabs.length > 0) {
    const ungroupedElement = document.createElement("div");
    ungroupedElement.className = "tab-group ungrouped";
    ungroupedElement.innerHTML = `
      <div class="group-header ungrouped">
        <div class="group-header-content">
          <span class="group-name">Ungrouped tabs</span>
          <span class="group-count">${ungroupedTabs.length} tab${
      ungroupedTabs.length !== 1 ? "s" : ""
    }</span>
        </div>
        <div class="group-actions">
          <button class="group-expand-btn" title="Expand/Collapse Group">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>
    `;
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "group-tabs";
    ungroupedTabs.forEach((tab) => {
      tabsContainer.innerHTML += createTabItem(tab);
    });
    ungroupedElement.appendChild(tabsContainer);
    tabsList.appendChild(ungroupedElement);
    const expandBtn = ungroupedElement.querySelector(".group-expand-btn");
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      tabsContainer.classList.toggle("collapsed");
      expandBtn.classList.toggle("collapsed");
    });
  }
  sessionDetailModal.classList.remove("hidden");
}

function createTabItem(tab) {
  let domain = "";
  try {
    const url = new URL(tab.url);
    domain = url.hostname;
  } catch (e) {
    domain = tab.url; // Fallback for invalid URLs like about:blank
  }
  return `
    <div class="tab-item">
      <img class="tab-favicon" src="${
        tab.favicon || "icons/icon32.png"
      }" onerror="this.src='icons/icon32.png'">
      <div class="tab-info">
        <span class="tab-title">${tab.title || "Untitled"}</span>
        <span class="tab-url">${domain}</span>
      </div>
      <a href="${
        tab.url
      }" class="tab-open-link" title="Open tab in new window" target="_blank" rel="noopener noreferrer">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </a>
    </div>
  `;
}

function hideSessionModal() {
  sessionDetailModal.classList.add("hidden");
  currentSessionId = null;
}

// ** REMOVE restoreSession function from dashboard.js **
// The restoreSession logic will now live in background.js

async function deleteSession(sessionId) {
  try {
    // Fetch current sessions first to ensure we have the latest
    let sessions = await getSessionsFromStorage();
    sessions = sessions.filter((session) => session.id !== sessionId);
    await chrome.storage.local.set({ sessions: sessions });

    // Update local state and re-render
    currentSessions = sessions;
    renderSessions();
    showNotification("Session deleted");
  } catch (error) {
    console.error("Error deleting session:", error);
    showNotification("Error deleting session", true);
  }
}

function setViewMode(mode) {
  viewMode = mode;
  if (mode === "grid") {
    gridViewBtn.classList.add("active");
    listViewBtn.classList.remove("active");
  } else {
    gridViewBtn.classList.remove("active");
    listViewBtn.classList.add("active");
  }
  renderSessions();
}

function filterSessions() {
  renderSessions();
}

function sortSessions() {
  renderSessions();
}

function filterSessionsBySearch(sessions, searchTerm) {
  if (!searchTerm) return sessions;
  searchTerm = searchTerm.toLowerCase();
  return sessions.filter((session) => {
    if (session.name.toLowerCase().includes(searchTerm)) return true;
    return session.tabs.some(
      (tab) =>
        (tab.title && tab.title.toLowerCase().includes(searchTerm)) ||
        (tab.url && tab.url.toLowerCase().includes(searchTerm))
    );
  });
}

function filterSessionsByDate(sessions, dateFilterValue) {
  if (dateFilterValue === "all") return sessions;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(
    today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)
  ); // Adjust for week start (Mon)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return sessions.filter((session) => {
    const sessionDate = new Date(session.createdAt);
    switch (dateFilterValue) {
      case "today":
        return sessionDate >= today;
      case "week":
        return sessionDate >= weekStart;
      case "month":
        return sessionDate >= monthStart;
      default:
        return true;
    }
  });
}

function sortSessionsBy(sessions, sortBy) {
  switch (sortBy) {
    case "newest":
      return [...sessions].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    case "oldest":
      return [...sessions].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
    case "name":
      return [...sessions].sort((a, b) => a.name.localeCompare(b.name));
    case "tabs":
      return [...sessions].sort(
        (a, b) => (b.tabs?.length || 0) - (a.tabs?.length || 0)
      );
    default:
      return sessions;
  }
}

function exportData() {
  try {
    chrome.storage.local.get("sessions", (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error fetching sessions for export:",
          chrome.runtime.lastError
        );
        showNotification("Error fetching sessions for export", true);
        return;
      }
      if (!data.sessions || data.sessions.length === 0) {
        showNotification("No sessions to export");
        return;
      }
      const exportObject = {
        type: "TabNestSessionExport",
        version: "1.1", // Increment version if format changes
        exportDate: new Date().toISOString(),
        sessions: data.sessions,
      };
      const jsonString = JSON.stringify(exportObject, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = `tabnest-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      setTimeout(() => {
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
      }, 100);
      showNotification("Sessions exported successfully");
    });
  } catch (error) {
    console.error("Error exporting data:", error);
    showNotification("Error exporting data", true);
  }
}

function importData() {
  try {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          if (
            importedData.type !== "TabNestSessionExport" ||
            !importedData.sessions ||
            !Array.isArray(importedData.sessions)
          ) {
            throw new Error("Invalid import file format or type.");
          }

          // Validate sessions structure (basic check)
          importedData.sessions.forEach((s) => {
            if (!s.id || !s.name || !s.tabs)
              throw new Error("Imported session missing required fields.");
          });

          const data = await chrome.storage.local.get("sessions");
          let existingSessions = data.sessions || [];

          let newSessions;
          const importedSessionCount = importedData.sessions.length;

          if (existingSessions.length > 0) {
            if (
              confirm(
                `You have ${existingSessions.length} existing session(s). \n\nOK to MERGE (add ${importedSessionCount} new sessions, skipping duplicates by ID)? \nCancel to REPLACE all existing sessions with the imported ones?`
              )
            ) {
              // Merge: Add new, skip existing by ID
              const existingIds = new Set(existingSessions.map((s) => s.id));
              const sessionsToAdd = importedData.sessions.filter(
                (s) => !existingIds.has(s.id)
              );
              newSessions = [...existingSessions, ...sessionsToAdd];
              showNotification(
                `Merged sessions. Added ${sessionsToAdd.length} new session(s).`,
                false
              );
            } else {
              // Replace
              newSessions = importedData.sessions;
              showNotification(
                `Replaced all sessions with ${importedSessionCount} imported session(s).`,
                false
              );
            }
          } else {
            // No existing sessions, just import
            newSessions = importedData.sessions;
            showNotification(
              `Successfully imported ${importedSessionCount} session(s).`,
              false
            );
          }

          await chrome.storage.local.set({ sessions: newSessions });
          loadSavedSessions(); // Reload and render
        } catch (error) {
          console.error("Error parsing or processing import file:", error);
          showNotification(`Error importing: ${error.message}`, true);
        }
      };
      reader.onerror = () => {
        showNotification("Error reading import file", true);
      };
      reader.readAsText(file);
    });
    document.body.appendChild(fileInput);
    fileInput.click();
    setTimeout(() => {
      document.body.removeChild(fileInput);
    }, 100);
  } catch (error) {
    console.error("Error initiating import:", error);
    showNotification("Error initiating import", true);
  }
}

async function saveSessionNotes() {
  if (!currentSessionId) return;
  try {
    const sessionIndex = currentSessions.findIndex(
      (s) => s.id === currentSessionId
    );
    if (sessionIndex === -1) throw new Error("Session not found");
    const notes = sessionNotes.value; // Don't trim, user might want leading/trailing spaces
    currentSessions[sessionIndex].notes = notes;
    currentSessions[sessionIndex].updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ sessions: currentSessions });
    showNotification("Notes saved successfully!");
  } catch (error) {
    console.error("Error saving notes:", error);
    showNotification("Error saving notes", true);
  }
}

function openSettings() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
}

// Storage helpers (renamed to avoid conflict if background.js has same names)
async function getSessionsFromStorage() {
  const data = await chrome.storage.local.get("sessions");
  return data.sessions || [];
}

async function saveSessionToStorage(session) {
  // Renamed
  const sessions = await getSessionsFromStorage();
  // Check for duplicate ID, though unlikely with Date.now()
  if (sessions.find((s) => s.id === session.id)) {
    console.warn("Attempted to save session with duplicate ID:", session.id);
    session.id = Date.now().toString() + "_dup"; // Simple fix
  }
  sessions.push(session);
  await chrome.storage.local.set({ sessions });
}

// UI helpers
function showNotification(message, isError = false) {
  const notification = document.createElement("div");
  notification.className = `notification ${isError ? "error" : "success"}`;
  notification.textContent = message;
  // Simple styling, ideally use CSS classes defined in your stylesheet
  notification.style.position = "fixed";
  notification.style.bottom = "20px";
  notification.style.right = "20px";
  notification.style.padding = "12px 20px";
  notification.style.borderRadius = "5px";
  notification.style.backgroundColor = isError ? "#f44336" : "#4CAF50"; // Red for error, Green for success
  notification.style.color = "white";
  notification.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
  notification.style.zIndex = "10000";
  notification.style.opacity = "0";
  notification.style.transition = "opacity 0.3s ease-in-out";

  document.body.appendChild(notification);

  // Fade in
  requestAnimationFrame(() => {
    notification.style.opacity = "1";
  });

  setTimeout(
    () => {
      notification.style.opacity = "0";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300); // Wait for fade out transition
    },
    isError ? 5000 : 3000
  ); // Longer display for errors
}
