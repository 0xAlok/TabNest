// js/options.js
document.addEventListener("DOMContentLoaded", () => {
  const defaultRestoreBehaviorSelect = document.getElementById(
    "defaultRestoreBehavior"
  );
  const autoCollapseGroupsCheckbox =
    document.getElementById("autoCollapseGroups");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const statusMessageDiv = document.getElementById("statusMessage");

  const SETTINGS_KEY = "tabNestUserSettings";

  // Default settings
  const defaultSettings = {
    defaultRestoreBehavior: "currentWindow", // 'currentWindow' or 'newWindow'
    autoCollapseGroups: false, // true or false
  };

  // Function to load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(SETTINGS_KEY);
      const currentSettings = {
        ...defaultSettings,
        ...(result[SETTINGS_KEY] || {}),
      };

      defaultRestoreBehaviorSelect.value =
        currentSettings.defaultRestoreBehavior;
      autoCollapseGroupsCheckbox.checked = currentSettings.autoCollapseGroups;
    } catch (error) {
      console.error("Error loading settings:", error);
      showStatusMessage("Error loading settings.", true);
    }
  }

  // Function to save settings to storage
  async function saveSettings() {
    const newSettings = {
      defaultRestoreBehavior: defaultRestoreBehaviorSelect.value,
      autoCollapseGroups: autoCollapseGroupsCheckbox.checked,
    };

    try {
      await chrome.storage.local.set({ [SETTINGS_KEY]: newSettings });
      showStatusMessage("Settings saved successfully!", false);
    } catch (error) {
      console.error("Error saving settings:", error);
      showStatusMessage("Error saving settings. Please try again.", true);
    }
  }

  // Function to display status messages
  function showStatusMessage(message, isError = false) {
    statusMessageDiv.textContent = message;
    statusMessageDiv.className = "status-message"; // Reset classes
    if (isError) {
      statusMessageDiv.classList.add("error");
    } else {
      statusMessageDiv.classList.add("success");
    }
    statusMessageDiv.classList.remove("hidden");

    // Hide the message after a few seconds
    setTimeout(() => {
      statusMessageDiv.classList.add("hidden");
      statusMessageDiv.textContent = ""; // Clear text
    }, 3000);
  }

  // Event Listeners
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", saveSettings);
  } else {
    console.error("Save Settings button not found.");
  }

  // Load settings when the page is ready
  loadSettings();
});
