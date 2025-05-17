// DOM Elements
const saveTabsBtn = document.getElementById("saveTabsBtn");
const saveSessionForm = document.getElementById("saveSessionForm");
const sessionNameInput = document.getElementById("sessionName");
const confirmSaveBtn = document.getElementById("confirmSaveBtn");
const cancelSaveBtn = document.getElementById("cancelSaveBtn");
const sessionsList = document.getElementById("sessionsList");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Load saved sessions
  loadSavedSessions();

  // Set up event listeners
  saveTabsBtn.addEventListener("click", showSaveForm);
  confirmSaveBtn.addEventListener("click", saveCurrentSession);
  cancelSaveBtn.addEventListener("click", hideSaveForm);
  exportBtn.addEventListener("click", exportData);
  importBtn.addEventListener("click", importData);
});

// Functions
function showSaveForm() {
  // Generate default session name (current date and time)
  const now = new Date();
  const defaultName = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  // Set default name and show form
  sessionNameInput.value = defaultName;
  saveSessionForm.classList.remove("hidden");
  saveTabsBtn.classList.add("hidden");

  // Focus the input field
  sessionNameInput.focus();
  sessionNameInput.select();
}

function hideSaveForm() {
  saveSessionForm.classList.add("hidden");
  saveTabsBtn.classList.remove("hidden");
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

    if (sessions.length === 0) {
      sessionsList.innerHTML =
        '<div class="empty-state">No saved sessions yet</div>';
      return;
    }

    // Sort sessions by creation date (newest first)
    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Generate HTML for sessions
    sessionsList.innerHTML = sessions
      .map((session) => {
        const date = new Date(session.createdAt).toLocaleString();
        const tabCount = session.tabs.length;
        const groupCount = session.tabGroups.length;

        return `
        <div class="session-item" data-id="${session.id}">
          <div class="session-header">
            <span class="session-title">${session.name}</span>
            <span class="session-date">${date}</span>
          </div>
          <div class="session-stats">
            ${tabCount} tab${tabCount !== 1 ? "s" : ""}
            ${
              groupCount > 0
                ? `(${groupCount} group${groupCount !== 1 ? "s" : ""})`
                : ""
            }
          </div>
          <div class="session-actions">
            <button class="btn primary restore-btn" data-id="${
              session.id
            }">Restore</button>
            <button class="btn secondary delete-btn" data-id="${
              session.id
            }">Delete</button>
          </div>
        </div>
      `;
      })
      .join("");

    // Add event listeners to buttons
    document.querySelectorAll(".restore-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => restoreSession(e.target.dataset.id));
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => deleteSession(e.target.dataset.id));
    });
  } catch (error) {
    console.error("Error loading sessions:", error);
    sessionsList.innerHTML =
      '<div class="empty-state">Error loading sessions</div>';
  }
}

async function restoreSession(sessionId) {
  try {
    const sessions = await getSavedSessions();
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    // Show loading notification
    showNotification("Restoring session...");

    // Create a map to track new tab IDs
    const tabIdMap = {};

    // Group tabs by their group ID for more efficient restoration
    const tabsByGroup = {};
    const ungroupedTabs = [];

    // Organize tabs by their group
    session.tabs.forEach((tab) => {
      if (tab.groupId) {
        if (!tabsByGroup[tab.groupId]) {
          tabsByGroup[tab.groupId] = [];
        }
        tabsByGroup[tab.groupId].push(tab);
      } else {
        ungroupedTabs.push(tab);
      }
    });

    // Process each group separately
    if (chrome.tabGroups && session.tabGroups && session.tabGroups.length > 0) {
      for (const group of session.tabGroups) {
        const groupTabs = tabsByGroup[group.id] || [];

        if (groupTabs.length > 0) {
          // Open all tabs for this group
          const newTabIds = [];

          for (const tab of groupTabs) {
            const newTab = await chrome.tabs.create({ url: tab.url });
            tabIdMap[tab.id] = newTab.id;
            newTabIds.push(newTab.id);
          }

          // Wait a moment for tabs to load
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Create a group with these tabs
          if (newTabIds.length > 0) {
            const groupId = await chrome.tabs.group({ tabIds: newTabIds });

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

    // Open ungrouped tabs last
    for (const tab of ungroupedTabs) {
      const newTab = await chrome.tabs.create({ url: tab.url });
      tabIdMap[tab.id] = newTab.id;
    }

    showNotification("Session restored successfully!");
  } catch (error) {
    console.error("Error restoring session:", error);
    showNotification("Error restoring session", true);
  }
}

async function deleteSession(sessionId) {
  try {
    let sessions = await getSavedSessions();
    sessions = sessions.filter((session) => session.id !== sessionId);

    await chrome.storage.local.set({ sessions });
    loadSavedSessions();

    showNotification("Session deleted");
  } catch (error) {
    console.error("Error deleting session:", error);
    showNotification("Error deleting session", true);
  }
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

// Export/Import functions
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

// UI helpers
function showNotification(message, isError = false) {
  // Simple notification for now
  // TODO: Implement better notifications
  console.log(message);

  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification ${isError ? "error" : "success"}`;
  notification.textContent = message;

  // Add to DOM
  document.body.appendChild(notification);

  // Remove after delay
  setTimeout(() => {
    notification.remove();
  }, 3000);
}
