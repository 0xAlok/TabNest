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
  // Load saved sessions
  loadSavedSessions();

  // Set up event listeners
  saveCurrentTabsBtn.addEventListener("click", showSaveForm);
  createFirstSessionBtn.addEventListener("click", showSaveForm);
  confirmSaveBtn.addEventListener("click", saveCurrentSession);
  cancelSaveBtn.addEventListener("click", hideSaveForm);

  searchInput.addEventListener("input", filterSessions);
  sortFilter.addEventListener("change", sortSessions);
  dateFilter.addEventListener("change", filterSessions);

  gridViewBtn.addEventListener("click", () => setViewMode("grid"));
  listViewBtn.addEventListener("click", () => setViewMode("list"));

  closeModalBtn.addEventListener("click", hideSessionModal);

  restoreSessionBtn.addEventListener("click", () =>
    restoreSession(currentSessionId, false)
  );
  restoreNewWindowBtn.addEventListener("click", () =>
    restoreSession(currentSessionId, true)
  );
  deleteSessionBtn.addEventListener("click", () => {
    deleteSession(currentSessionId);
    hideSessionModal();
  });

  exportDataBtn.addEventListener("click", exportData);
  importDataBtn.addEventListener("click", importData);
  settingsBtn.addEventListener("click", openSettings);
});

// Functions
function showSaveForm() {
  // Generate default session name (current date and time)
  const now = new Date();
  const defaultName = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  // Set default name and show form
  sessionNameInput.value = defaultName;
  saveSessionForm.classList.remove("hidden");
  saveCurrentTabsBtn.classList.add("hidden");

  // Focus the input field
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
    // Show loading state
    confirmSaveBtn.textContent = "Saving...";
    confirmSaveBtn.disabled = true;

    // Get all tabs in current window
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Get tab groups if available
    let tabGroups = [];
    if (chrome.tabGroups) {
      tabGroups = await chrome.tabGroups.query({
        windowId: chrome.windows.WINDOW_ID_CURRENT,
      });
    }

    // Create session object
    const session = {
      id: Date.now().toString(),
      name: sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: tabs.map((tab) => ({
        id: tab.id.toString(),
        url: tab.url,
        title: tab.title,
        favicon: tab.favIconUrl,
        groupId:
          tab.groupId && tab.groupId !== -1 ? tab.groupId.toString() : null,
      })),
      tabGroups: tabGroups.map((group) => ({
        id: group.id.toString(),
        name: group.title || "",
        color: group.color || "grey",
        tabs: tabs
          .filter((tab) => tab.groupId === group.id)
          .map((tab) => tab.id.toString()),
      })),
    };

    // Save to storage
    await saveSession(session);

    // Reset UI
    hideSaveForm();
    loadSavedSessions();

    // Show success message
    showNotification("Session saved successfully!");
  } catch (error) {
    console.error("Error saving session:", error);
    showNotification("Error saving session", true);
  } finally {
    confirmSaveBtn.textContent = "Save";
    confirmSaveBtn.disabled = false;
  }
}

async function loadSavedSessions() {
  try {
    const sessions = await getSavedSessions();
    currentSessions = sessions;

    renderSessions();
  } catch (error) {
    console.error("Error loading sessions:", error);
    showNotification("Error loading sessions", true);
  }
}

function renderSessions() {
  if (currentSessions.length === 0) {
    sessionsContainer.innerHTML = `
      <div class="empty-state">
        <p>No saved sessions yet</p>
        <button id="createFirstSessionBtn" class="btn primary">Save Your First Session</button>
      </div>
    `;
    document
      .getElementById("createFirstSessionBtn")
      .addEventListener("click", showSaveForm);
    return;
  }

  // Apply filters and sorting
  let filteredSessions = filterSessionsBySearch(
    currentSessions,
    searchInput.value
  );
  filteredSessions = filterSessionsByDate(filteredSessions, dateFilter.value);
  filteredSessions = sortSessionsBy(filteredSessions, sortFilter.value);

  // Generate HTML based on view mode
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

  // Add event listeners to session cards/items
  document
    .querySelectorAll(".session-card, .session-list-item")
    .forEach((element) => {
      element.addEventListener("click", () =>
        showSessionDetail(element.dataset.id)
      );
    });

  // Add event listeners to action buttons
  document.querySelectorAll(".restore-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      restoreSession(e.target.dataset.id, false);
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
  const groupCount = session.tabGroups.length;

  // Get up to 8 favicons for preview
  const favicons = session.tabs
    .filter((tab) => tab.favicon)
    .slice(0, 8)
    .map(
      (tab) => `
      <div class="tab-preview">
        <img src="${tab.favicon}" alt="" onerror="this.src='icons/icon16.png'">
      </div>
    `
    )
    .join("");

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
          ${favicons || '<div class="tab-preview"></div>'}
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
  const groupCount = session.tabGroups.length;

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

  // Set modal content
  modalSessionTitle.textContent = session.name;
  modalSessionDate.textContent = `Date: ${new Date(
    session.createdAt
  ).toLocaleString()}`;

  const tabCount = session.tabs.length;
  const groupCount = session.tabGroups.length;
  modalSessionStats.textContent = `Tabs: ${tabCount} ${
    groupCount > 0 ? `, Groups: ${groupCount}` : ""
  }`;

  // Render tabs list
  tabsList.innerHTML = "";

  // Group tabs by their group
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

  // Add groups first
  session.tabGroups.forEach((group) => {
    const groupTabs = groupedTabs[group.id] || [];

    const groupElement = document.createElement("div");
    groupElement.className = "tab-group";
    groupElement.innerHTML = `
      <div class="group-header" style="color: ${group.color}">
        <span class="group-name">${group.name || "Unnamed group"}</span>
        <span class="group-count">${groupTabs.length} tab${
      groupTabs.length !== 1 ? "s" : ""
    }</span>
      </div>
    `;

    const tabsContainer = document.createElement("div");
    tabsContainer.className = "group-tabs";

    groupTabs.forEach((tab) => {
      tabsContainer.innerHTML += createTabItem(tab);
    });

    groupElement.appendChild(tabsContainer);
    tabsList.appendChild(groupElement);
  });

  // Add ungrouped tabs
  ungroupedTabs.forEach((tab) => {
    tabsList.innerHTML += createTabItem(tab);
  });

  // Show modal
  sessionDetailModal.classList.remove("hidden");
}

function createTabItem(tab) {
  return `
    <div class="tab-item">
      <img class="tab-favicon" src="${
        tab.favicon || "icons/icon16.png"
      }" onerror="this.src='icons/icon16.png'">
      <span class="tab-title">${tab.title || "Untitled"}</span>
      <span class="tab-url">${tab.url}</span>
    </div>
  `;
}

function hideSessionModal() {
  sessionDetailModal.classList.add("hidden");
  currentSessionId = null;
}

async function restoreSession(sessionId, inNewWindow = false) {
  try {
    const session = currentSessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    // Create a map to track new tab IDs
    const tabIdMap = {};

    if (inNewWindow) {
      // Create new window with first tab
      const firstTab = session.tabs[0];
      const newWindow = await chrome.windows.create({ url: firstTab.url });

      // Store the first tab's ID
      if (firstTab.id) {
        // Get the ID of the first tab in the new window
        const tabs = await chrome.tabs.query({ windowId: newWindow.id });
        if (tabs.length > 0) {
          tabIdMap[firstTab.id] = tabs[0].id;
        }
      }

      // Open remaining tabs in the new window
      for (let i = 1; i < session.tabs.length; i++) {
        const tab = session.tabs[i];
        const newTab = await chrome.tabs.create({
          windowId: newWindow.id,
          url: tab.url,
        });
        tabIdMap[tab.id] = newTab.id;
      }

      // Wait a moment for tabs to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Now create tab groups and add tabs to them
      if (
        chrome.tabGroups &&
        session.tabGroups &&
        session.tabGroups.length > 0
      ) {
        for (const group of session.tabGroups) {
          // Get the new tab IDs for this group
          const tabIds = group.tabs
            .map((oldTabId) => tabIdMap[oldTabId])
            .filter((id) => id !== undefined);

          if (tabIds.length > 0) {
            // Create a new group with these tabs
            const groupId = await chrome.tabs.group({
              tabIds,
              windowId: newWindow.id,
            });

            // Set the group's name and color
            if (groupId) {
              await chrome.tabGroups.update(groupId, {
                title: group.name,
                color: group.color,
              });
            }
          }
        }
      }
    } else {
      // Open in current window
      // First, open all tabs and store their new IDs
      for (const tab of session.tabs) {
        const newTab = await chrome.tabs.create({ url: tab.url });
        tabIdMap[tab.id] = newTab.id;
      }

      // Wait a moment for tabs to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Now create tab groups and add tabs to them
      if (
        chrome.tabGroups &&
        session.tabGroups &&
        session.tabGroups.length > 0
      ) {
        for (const group of session.tabGroups) {
          // Get the new tab IDs for this group
          const tabIds = group.tabs
            .map((oldTabId) => tabIdMap[oldTabId])
            .filter((id) => id !== undefined);

          if (tabIds.length > 0) {
            // Create a new group with these tabs
            const groupId = await chrome.tabs.group({ tabIds });

            // Set the group's name and color
            if (groupId) {
              await chrome.tabGroups.update(groupId, {
                title: group.name,
                color: group.color,
              });
            }
          }
        }
      }
    }

    showNotification("Session restored successfully!");
  } catch (error) {
    console.error("Error restoring session:", error);
    showNotification("Error restoring session", true);
  }
}

async function deleteSession(sessionId) {
  try {
    currentSessions = currentSessions.filter(
      (session) => session.id !== sessionId
    );
    await chrome.storage.local.set({ sessions: currentSessions });
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
    // Search in session name
    if (session.name.toLowerCase().includes(searchTerm)) return true;

    // Search in tab titles and URLs
    return session.tabs.some(
      (tab) =>
        (tab.title && tab.title.toLowerCase().includes(searchTerm)) ||
        (tab.url && tab.url.toLowerCase().includes(searchTerm))
    );
  });
}

function filterSessionsByDate(sessions, dateFilter) {
  if (dateFilter === "all") return sessions;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return sessions.filter((session) => {
    const sessionDate = new Date(session.createdAt);

    switch (dateFilter) {
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
      return [...sessions].sort((a, b) => b.tabs.length - a.tabs.length);
    default:
      return sessions;
  }
}

function exportData() {
  try {
    // Get all sessions
    chrome.storage.local.get("sessions", (data) => {
      if (!data.sessions || data.sessions.length === 0) {
        showNotification("No sessions to export", true);
        return;
      }

      // Create export object with metadata
      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        sessions: data.sessions,
      };

      // Convert to JSON string
      const jsonString = JSON.stringify(exportData, null, 2);

      // Create blob and download link
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = `tabnest-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

      // Trigger download
      document.body.appendChild(downloadLink);
      downloadLink.click();

      // Clean up
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
    // Create file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";

    // Handle file selection
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          // Parse JSON
          const importData = JSON.parse(e.target.result);

          // Validate import data
          if (!importData.sessions || !Array.isArray(importData.sessions)) {
            throw new Error("Invalid import file format");
          }

          // Get current sessions
          const data = await chrome.storage.local.get("sessions");
          const currentSessions = data.sessions || [];

          // Confirm import if there are existing sessions
          let shouldImport = true;
          if (currentSessions.length > 0) {
            shouldImport = confirm(
              `You have ${currentSessions.length} existing session(s). Do you want to:\n\n` +
                "- Click OK to add imported sessions to your existing ones\n" +
                "- Click Cancel to replace all existing sessions with imported ones"
            );
          }

          // Prepare new sessions array
          let newSessions;
          if (shouldImport) {
            // Add imported sessions to existing ones
            newSessions = [...currentSessions, ...importData.sessions];
          } else {
            // Replace existing sessions
            newSessions = importData.sessions;
          }

          // Save to storage
          await chrome.storage.local.set({ sessions: newSessions });

          // Reload sessions in UI
          loadSavedSessions();

          showNotification(
            `Successfully imported ${importData.sessions.length} session(s)`
          );
        } catch (error) {
          console.error("Error parsing import file:", error);
          showNotification("Error importing: Invalid file format", true);
        }
      };

      reader.onerror = () => {
        showNotification("Error reading import file", true);
      };

      reader.readAsText(file);
    });

    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(fileInput);
    }, 100);
  } catch (error) {
    console.error("Error importing data:", error);
    showNotification("Error importing data", true);
  }
}

function openSettings() {
  // TODO: Implement settings page
  alert("Settings page will be implemented in a future version");
}

// Storage helpers
async function getSavedSessions() {
  const data = await chrome.storage.local.get("sessions");
  return data.sessions || [];
}

async function saveSession(session) {
  const sessions = await getSavedSessions();
  sessions.push(session);
  await chrome.storage.local.set({ sessions });
}

// UI helpers
function showNotification(message, isError = false) {
  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification ${isError ? "error" : "success"}`;
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.bottom = "20px";
  notification.style.right = "20px";
  notification.style.padding = "10px 15px";
  notification.style.borderRadius = "4px";
  notification.style.backgroundColor = isError ? "#ea4335" : "#34a853";
  notification.style.color = "white";
  notification.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
  notification.style.zIndex = "9999";

  // Add to DOM
  document.body.appendChild(notification);

  // Remove after delay
  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transition = "opacity 0.3s";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
