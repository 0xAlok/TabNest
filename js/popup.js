// popup.js

// DOM Elements
const saveTabsBtn = document.getElementById("saveTabsBtn");
const saveSessionForm = document.getElementById("saveSessionForm");
const sessionNameInput = document.getElementById("sessionName");
const confirmSaveBtn = document.getElementById("confirmSaveBtn");
const cancelSaveBtn = document.getElementById("cancelSaveBtn");
const sessionsList = document.getElementById("sessionsList");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const manageAllLink = document.getElementById("manageAllLink"); // Assuming you have a link to dashboard

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  loadSavedSessions();

  saveTabsBtn.addEventListener("click", showSaveForm);
  confirmSaveBtn.addEventListener("click", saveCurrentSession);
  cancelSaveBtn.addEventListener("click", hideSaveForm);

  if (exportBtn) exportBtn.addEventListener("click", exportDataFromPopup);
  if (importBtn) importBtn.addEventListener("click", importDataInPopup);

  if (manageAllLink) {
    manageAllLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      window.close(); // Close the popup
    });
  }

  const settingsLinkPopup = document.getElementById("settingsLinkPopup");
  if (settingsLinkPopup) {
    settingsLinkPopup.addEventListener("click", (e) => {
      e.preventDefault();
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("options.html"));
      }
      window.close(); // Close popup after opening options
    });
  }
});

function handleRestoreResponse(response) {
  if (response?.success) {
    showNotification("Session restoration initiated!");
    // Optionally close the popup after initiating restore
    // window.close();
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
  const defaultName = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" }
  )}`;
  sessionNameInput.value = defaultName;
  saveSessionForm.classList.remove("hidden");
  saveTabsBtn.classList.add("hidden");
  sessionNameInput.focus();
  sessionNameInput.select();
}

function hideSaveForm() {
  saveSessionForm.classList.add("hidden");
  saveTabsBtn.classList.remove("hidden");
  sessionNameInput.value = ""; // Clear input
}

async function saveCurrentSession() {
  const sessionName =
    sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;

  try {
    confirmSaveBtn.textContent = "Saving...";
    confirmSaveBtn.disabled = true;

    const currentWindow = await chrome.windows.getCurrent({ populate: false }); // Get current window ID
    if (!currentWindow || currentWindow.id === chrome.windows.WINDOW_ID_NONE) {
      throw new Error("Could not get current window information.");
    }
    const windowId = currentWindow.id;

    const tabs = await chrome.tabs.query({ windowId: windowId });

    let tabGroups = [];
    if (chrome.tabGroups) {
      try {
        tabGroups = await chrome.tabGroups.query({ windowId: windowId });
      } catch (e) {
        console.warn(
          "Popup: Error querying tab groups, possibly not supported or no groups exist:",
          e
        );
      }
    }

    const session = {
      id: Date.now().toString(),
      name: sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: "", // Popups usually don't have a notes field, initialize as empty
      tabs: tabs.map((tab) => ({
        id: tab.id.toString(), // Original tab ID for reference
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned,
        active: tab.active,
        favicon: tab.favIconUrl,
        groupId:
          tab.groupId && tab.groupId !== chrome.tabs.TAB_ID_NONE
            ? tab.groupId.toString()
            : null,
      })),
      tabGroups: tabGroups.map((group) => ({
        id: group.id.toString(), // Original group ID
        title: group.title || "",
        color: group.color || "grey",
        collapsed: group.collapsed,
        // No need for 'tabs' array here, tabs link to groups via tab.groupId
      })),
    };

    await saveSessionToStorage(session); // Use specific storage helper
    hideSaveForm();
    loadSavedSessions();
    showNotification("Session saved successfully!");
  } catch (error) {
    console.error("Popup: Error saving session:", error);
    showNotification("Error saving session: " + error.message, true);
  } finally {
    confirmSaveBtn.textContent = "Save";
    confirmSaveBtn.disabled = false;
  }
}

async function loadSavedSessions() {
  try {
    const sessions = await getSessionsFromStorage(); // Use specific helper

    if (!sessionsList) {
      console.error("sessionsList element not found in popup DOM.");
      return;
    }

    const emptyStateHTML = `
    <div class="empty-state-content">
      <svg class="empty-state-icon" viewBox="0 0 24 24" width="64" height="64"> <!-- Example SVG -->
        <path fill="currentColor" d="M4,6A2,2 0 0,1 2,4A2,2 0 0,1 4,2H10L12,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,6M11,13V17H13V13H11M11,9V11H13V9H11Z" />
      </svg>
      <p>No sessions saved yet.</p>
      <p class="empty-state-subtext">Click "Save Current Tabs" to get started!</p>
    </div>
  `;

    if (!sessions || sessions.length === 0) {
      sessionsList.innerHTML =
        '<div class="empty-state">No saved sessions yet.</div>';
      return;
    }

    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Display only a few recent sessions in the popup, e.g., latest 5
    const recentSessions = sessions.slice(0, 5);

    if (recentSessions.length === 0) {
      // Check recentSessions specifically
      sessionsList.innerHTML =
        '<div class="empty-state card">No saved sessions yet.</div>'; // Apply card style
      return;
    }

    sessionsList.innerHTML = recentSessions
      .map((session) => {
        const date = new Date(session.createdAt).toLocaleDateString([], {
          month: "short",
          day: "numeric", // Date is already like "May 18"
        });
        const tabCount = session.tabs.length;
        const groupCount = session.tabGroups?.length || 0;

        // This structure is what we will style:
        return `
      <div class="session-item-card" data-id="${session.id}">
        <div class="session-item-header">
          <span class="session-title-text" title="${session.name}">${
          session.name
        }</span>
          <span class="session-date-text">${date}</span>
        </div>
        <div class="session-item-body">
          <p class="session-meta-text">
            ${tabCount} tab${tabCount !== 1 ? "s" : ""}
            ${
              groupCount > 0
                ? `(${groupCount} group${groupCount !== 1 ? "s" : ""})`
                : ""
            }
          </p>
          <div class="session-actions-inline">
            <button class="btn btn-restore restore-btn" data-id="${
              session.id
            }">Restore</button>
            <button class="btn btn-delete delete-btn" data-id="${
              session.id
            }">Delete</button>
          </div>
        </div>
      </div>
    `;
      })
      .join("");

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
        deleteSessionFromPopup(e.target.dataset.id);
      });
    });
  } catch (error) {
    console.error("Popup: Error loading sessions:", error);
    if (sessionsList)
      sessionsList.innerHTML =
        '<div class="empty-state">Error loading sessions.</div>';
  }
}

// REMOVE the old restoreSession function from popup.js
// async function restoreSession(sessionId) { ... } // DELETE THIS

async function deleteSessionFromPopup(sessionId) {
  // Renamed for clarity
  try {
    let sessions = await getSessionsFromStorage();
    sessions = sessions.filter((session) => session.id !== sessionId);
    await chrome.storage.local.set({ sessions });
    loadSavedSessions(); // Reload the list in the popup
    showNotification("Session deleted");
  } catch (error) {
    console.error("Popup: Error deleting session:", error);
    showNotification("Error deleting session", true);
  }
}

// Storage helpers (can be distinct from dashboard.js or shared if identical)
async function getSessionsFromStorage() {
  const data = await chrome.storage.local.get("sessions");
  return data.sessions || [];
}

async function saveSessionToStorage(session) {
  const sessions = await getSessionsFromStorage();
  sessions.push(session);
  await chrome.storage.local.set({ sessions });
}

// Export/Import functions - These can also message the background if they become complex
// or if you want to centralize file dialog logic. For simplicity, keeping them here for now.
function exportDataFromPopup() {
  // Renamed
  chrome.storage.local.get("sessions", (data) => {
    if (chrome.runtime.lastError) {
      showNotification("Error fetching sessions for export.", true);
      return;
    }
    if (!data.sessions || data.sessions.length === 0) {
      showNotification("No sessions to export.", false); // Not an error, just info
      return;
    }
    const exportObject = {
      type: "TabNestSessionExport",
      version: "1.1",
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
    showNotification("Sessions exported successfully!");
  });
}

function importDataInPopup() {
  // Renamed
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
        importedData.sessions.forEach((s) => {
          if (!s.id || !s.name || !s.tabs)
            throw new Error("Imported session missing required fields.");
        });

        const data = await chrome.storage.local.get("sessions");
        let existingSessions = data.sessions || [];
        let newSessions;
        const importedSessionCount = importedData.sessions.length;

        if (existingSessions.length > 0) {
          // In popup, maybe simpler: always merge, or just ask once
          // For simplicity, let's just merge and notify for popup. Dashboard has more space for complex confirm.
          const existingIds = new Set(existingSessions.map((s) => s.id));
          const sessionsToAdd = importedData.sessions.filter(
            (s) => !existingIds.has(s.id)
          );
          newSessions = [...existingSessions, ...sessionsToAdd];
          showNotification(
            `Merged: Added ${sessionsToAdd.length} new session(s). Skipped ${
              importedSessionCount - sessionsToAdd.length
            } duplicates.`
          );
        } else {
          newSessions = importedData.sessions;
          showNotification(
            `Successfully imported ${importedSessionCount} session(s).`
          );
        }
        await chrome.storage.local.set({ sessions: newSessions });
        loadSavedSessions();
      } catch (error) {
        console.error("Popup: Error parsing/processing import file:", error);
        showNotification(`Error importing: ${error.message}`, true);
      }
    };
    reader.onerror = () => {
      showNotification("Error reading import file.", true);
    };
    reader.readAsText(file);
  });
  document.body.appendChild(fileInput);
  fileInput.click();
  setTimeout(() => {
    if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
  }, 100);
}

// UI helpers
function showNotification(message, isError = false) {
  const existingNotification = document.querySelector(".popup-notification");
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement("div");
  notification.className = "popup-notification"; // Use a specific class
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.bottom = "5px"; // Adjust for popup
  notification.style.left = "5px";
  notification.style.right = "5px"; // Make it span width
  notification.style.padding = "8px";
  notification.style.borderRadius = "4px";
  notification.style.color = "white";
  notification.style.textAlign = "center";
  notification.style.zIndex = "10001";
  notification.style.fontSize = "12px"; // Smaller for popup
  notification.style.opacity = "0";
  notification.style.transition = "opacity 0.3s ease-in-out";
  notification.style.backgroundColor = isError ? "#cc0000" : "#006400"; // Darker red/green

  document.body.appendChild(notification);

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
      }, 300);
    },
    isError ? 4000 : 2500
  );
}
