// Background script for TabNest extension

// Initialize when the extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log("TabNest extension installed");

  // Initialize storage with empty sessions array if not exists
  const data = await chrome.storage.local.get("sessions");
  if (!data.sessions) {
    await chrome.storage.local.set({ sessions: [] });
  }
});

// Listen for messages from popup or dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getCurrentTabs") {
    // Get all tabs in current window
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      sendResponse({ tabs });
    });
    return true; // Required for async response
  }

  if (message.action === "getTabGroups") {
    // Get all tab groups in current window
    if (chrome.tabGroups) {
      chrome.tabGroups.query(
        { windowId: chrome.windows.WINDOW_ID_CURRENT },
        (groups) => {
          sendResponse({ groups });
        }
      );
      return true; // Required for async response
    } else {
      sendResponse({ groups: [] });
    }
  }
});
