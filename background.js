// background.js (or service-worker.js if MV3)

const SETTINGS_KEY = "tabNestUserSettings"; // Same key as in options.js
const defaultSettings = {
  // Same defaults as in options.js
  defaultRestoreBehavior: "currentWindow",
  autoCollapseGroups: false,
};

// Storage helper
async function getSavedSessionsFromStorage() {
  try {
    const data = await chrome.storage.local.get("sessions");
    return data.sessions || [];
  } catch (error) {
    console.error("Background: Error getting saved sessions:", error);
    return [];
  }
}

// Utility to introduce a small delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to get user settings
async function getUserSettings() {
  try {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    // Merge with defaults to ensure all settings are present
    return { ...defaultSettings, ...(result[SETTINGS_KEY] || {}) };
  } catch (error) {
    console.error("Background: Error fetching user settings:", error);
    return { ...defaultSettings }; // Fallback to defaults on error
  }
}

async function restoreSessionInWorker(sessionId, inNewWindowFromMessage) {
  // Renamed param for clarity
  try {
    // --- FETCH USER SETTINGS AT THE START ---
    const userSettings = await getUserSettings();
    // --- END FETCH ---

    const allSessions = await getSavedSessionsFromStorage();
    const session = allSessions.find((s) => s.id === sessionId);

    if (!session) {
      console.error(`Background: Session with ID ${sessionId} not found.`);
      return { success: false, error: "Session not found" };
    }

    console.log(
      `Background: Restoring session "${session.name}" with settings:`,
      userSettings,
      `Explicit new window: ${inNewWindowFromMessage}`
    );

    const newTabIdMap = new Map();
    const newGroupIdMap = new Map();

    // Determine if we should open in a new window
    // The 'inNewWindowFromMessage' (from UI button) takes precedence.
    // If it's not explicitly set (e.g., could be undefined if called from a context without explicit choice),
    // then use the user's default setting.
    let shouldOpenInNewWindow;
    if (typeof inNewWindowFromMessage === "boolean") {
      shouldOpenInNewWindow = inNewWindowFromMessage;
    } else {
      shouldOpenInNewWindow =
        userSettings.defaultRestoreBehavior === "newWindow";
    }
    console.log(
      `Background: Determined shouldOpenInNewWindow: ${shouldOpenInNewWindow}`
    );

    let targetWindowId = chrome.windows.WINDOW_ID_CURRENT;
    let firstTabCreated = false;

    if (shouldOpenInNewWindow) {
      // Use the determined value
      const firstUrlToOpen =
        session.tabs.length > 0 ? session.tabs[0].url : undefined;
      const newWindow = await chrome.windows.create({
        url: firstUrlToOpen,
        focused: true,
      });
      targetWindowId = newWindow.id;
      if (firstUrlToOpen && newWindow.tabs && newWindow.tabs.length > 0) {
        newTabIdMap.set(session.tabs[0].id.toString(), newWindow.tabs[0].id);
        firstTabCreated = true;
      }
    }

    const tabsToCreateInGroups = new Map();

    for (let i = 0; i < session.tabs.length; i++) {
      const tabData = session.tabs[i];

      if (shouldOpenInNewWindow && i === 0 && firstTabCreated) {
        console.log(
          `Background: First tab for new window already created: ${tabData.url}`
        );
        if (tabData.groupId && session.tabGroups) {
          const originalGroupData = session.tabGroups.find(
            (g) => g.id.toString() === tabData.groupId.toString()
          );
          if (originalGroupData) {
            const originalGroupIdStr = originalGroupData.id.toString();
            if (!tabsToCreateInGroups.has(originalGroupIdStr)) {
              tabsToCreateInGroups.set(originalGroupIdStr, []);
            }
            const firstTabNewId = newTabIdMap.get(tabData.id.toString());
            if (firstTabNewId) {
              // Ensure the ID was actually found
              tabsToCreateInGroups.get(originalGroupIdStr).push(firstTabNewId);
            }
          }
        }
        continue;
      }

      try {
        console.log(
          `Background: Creating tab: ${tabData.title} (${tabData.url})`
        );
        const createProperties = {
          windowId: targetWindowId,
          url: tabData.url,
          active: tabData.active || false,
          pinned: tabData.pinned || false,
        };

        const newTab = await chrome.tabs.create(createProperties);
        newTabIdMap.set(tabData.id.toString(), newTab.id);
        console.log(
          `Background: Created new tab ID ${newTab.id} for original ${tabData.id}`
        );
        await delay(150);

        if (tabData.groupId && session.tabGroups) {
          const originalGroupData = session.tabGroups.find(
            (g) => g.id.toString() === tabData.groupId.toString()
          );
          if (originalGroupData) {
            const originalGroupIdStr = originalGroupData.id.toString();
            if (!tabsToCreateInGroups.has(originalGroupIdStr)) {
              tabsToCreateInGroups.set(originalGroupIdStr, []);
            }
            tabsToCreateInGroups.get(originalGroupIdStr).push(newTab.id);
          }
        }
      } catch (e) {
        console.error(`Background: Failed to create tab ${tabData.url}:`, e);
      }
    }

    if (
      chrome.tabGroups &&
      session.tabGroups &&
      tabsToCreateInGroups.size > 0
    ) {
      for (const originalGroupData of session.tabGroups) {
        const originalGroupIdStr = originalGroupData.id.toString();
        const newTabIdsForGroup = tabsToCreateInGroups.get(originalGroupIdStr);

        if (newTabIdsForGroup && newTabIdsForGroup.length > 0) {
          try {
            console.log(
              `Background: Grouping tabs for original group ${originalGroupIdStr}:`,
              newTabIdsForGroup
            );
            const newGroupId = await chrome.tabs.group({
              tabIds: newTabIdsForGroup,
              createProperties: { windowId: targetWindowId },
            });
            newGroupIdMap.set(originalGroupIdStr, newGroupId);
            console.log(
              `Background: Created new group ID ${newGroupId} for original ${originalGroupIdStr}`
            );
            await delay(200);

            // --- USE USER SETTING FOR COLLAPSED STATE ---
            let collapsedState = userSettings.autoCollapseGroups;
            // If the original group had a collapsed state saved, prefer that,
            // unless the user setting is to always collapse (or always expand, if you add such a setting).
            // For now, let's keep it simple: user setting for autoCollapse takes precedence if true.
            // If originalGroupData.collapsed is undefined, it will default to browser's behavior (usually expanded).
            // So if user wants auto-collapse, we set it. If not, we use the saved state or browser default.

            // More robust: Use saved state unless user preference overrides to always collapse/expand
            // For this ticket, we're implementing "auto-collapse"
            // If the original session had a specific collapsed state, we should respect it UNLESS the user setting overrides it.
            // However, your current `originalGroupData` (from save) *does* save a `collapsed` state.
            // Let's assume: if `autoCollapseGroups` is true, all groups are collapsed.
            // If `autoCollapseGroups` is false, use the `originalGroupData.collapsed` value.

            const groupUpdateProperties = {
              title: originalGroupData.title,
              color: originalGroupData.color,
              collapsed: userSettings.autoCollapseGroups
                ? true
                : originalGroupData.collapsed,
              // If autoCollapse is true, collapse it.
              // Otherwise, use the collapsed state saved with the session.
            };
            console.log(
              "Background: Group update properties:",
              groupUpdateProperties
            );

            await chrome.tabGroups.update(newGroupId, groupUpdateProperties);
            // --- END USE ---

            console.log(
              `Background: Updated group ${newGroupId} with title "${originalGroupData.title}" and color ${originalGroupData.color}`
            );
            await delay(100);
          } catch (e) {
            console.error(
              `Background: Failed to group tabs or update group for original group ${originalGroupIdStr}:`,
              e
            );
          }
        }
      }
    }

    console.log("Background: Session restoration process completed.");
    return { success: true };
  } catch (error) {
    console.error("Background: Error restoring session:", error);
    return {
      success: false,
      error: error.message || "Unknown error during restore",
    };
  }
}

// Message listener remains the same, but the parameter name to restoreSessionInWorker was clarified
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "restoreSession") {
    console.log("Background: Received restoreSession request", request);
    // 'request.inNewWindow' comes from the UI (popup.js or dashboard.js)
    restoreSessionInWorker(request.sessionId, request.inNewWindow)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        console.error(
          "Background: Critical error in restoreSessionInWorker promise chain:",
          error
        );
        sendResponse({
          success: false,
          error: error.message || "Critical background error",
        });
      });
    return true;
  }
});

// onInstalled listener remains the same
chrome.runtime.onInstalled.addListener((details) => {
  console.log("TabNest extension installed or updated:", details);
  if (details.reason === "install") {
    chrome.storage.local.set({ sessions: [] }); // Initialize sessions
    // Initialize default settings if they don't exist
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      if (!result[SETTINGS_KEY]) {
        chrome.storage.local.set({ [SETTINGS_KEY]: defaultSettings });
        console.log("Initialized default user settings.");
      }
    });
  }
});
