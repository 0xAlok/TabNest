// background.js (or service-worker.js if MV3)

// Storage helper (can be shared or duplicated from dashboard.js if complex)
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

async function restoreSessionInWorker(sessionId, inNewWindow = false) {
  try {
    const allSessions = await getSavedSessionsFromStorage();
    const session = allSessions.find((s) => s.id === sessionId);

    if (!session) {
      console.error(`Background: Session with ID ${sessionId} not found.`);
      return { success: false, error: "Session not found" };
    }

    console.log(`Background: Restoring session "${session.name}"`, session);

    const newTabIdMap = new Map();
    const newGroupIdMap = new Map();

    let targetWindowId = chrome.windows.WINDOW_ID_CURRENT;
    let firstTabCreated = false;

    if (inNewWindow) {
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

      if (inNewWindow && i === 0 && firstTabCreated) {
        // If tab belongs to a group, collect its new ID for grouping later
        // (This part was a bit complex before, simplifying the thought process here)
        // The main collection of tabs for groups happens below after newTab is created.
        console.log(
          `Background: First tab for new window already created: ${tabData.url}`
        );
        // We still need to add this tab to the `tabsToCreateInGroups` map if it belongs to one
        if (tabData.groupId && session.tabGroups) {
          const originalGroupData = session.tabGroups.find(
            (g) => g.id.toString() === tabData.groupId.toString()
          );
          if (originalGroupData) {
            const originalGroupIdStr = originalGroupData.id.toString();
            if (!tabsToCreateInGroups.has(originalGroupIdStr)) {
              tabsToCreateInGroups.set(originalGroupIdStr, []);
            }
            // Add the ID of the already created first tab
            tabsToCreateInGroups
              .get(originalGroupIdStr)
              .push(newTabIdMap.get(tabData.id.toString()));
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

    // Now, group the collected tabs
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
            // --- APPLY THE FIX HERE ---
            const newGroupId = await chrome.tabs.group({
              tabIds: newTabIdsForGroup,
              createProperties: { windowId: targetWindowId }, // Correct for MV3
            });
            // --------------------------
            newGroupIdMap.set(originalGroupIdStr, newGroupId);
            console.log(
              `Background: Created new group ID ${newGroupId} for original ${originalGroupIdStr}`
            );
            await delay(200);

            await chrome.tabGroups.update(newGroupId, {
              title: originalGroupData.title,
              color: originalGroupData.color,
              collapsed: originalGroupData.collapsed,
            });
            console.log(
              `Background: Updated group ${newGroupId} with title "${originalGroupData.title}" and color ${originalGroupData.color}`
            );
            await delay(100);
          } catch (e) {
            // The error message you're seeing comes from this catch block
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "restoreSession") {
    console.log("Background: Received restoreSession request", request);
    // Ensure you return true to indicate an asynchronous response
    restoreSessionInWorker(request.sessionId, request.inNewWindow)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        // This catch is for errors in the promise chain of restoreSessionInWorker itself
        console.error(
          "Background: Critical error in restoreSessionInWorker promise chain:",
          error
        );
        sendResponse({
          success: false,
          error: error.message || "Critical background error",
        });
      });
    return true; // Crucial for asynchronous sendResponse
  }
  // Handle other actions if any
});

// Example: Log when the extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log("TabNest extension installed or updated:", details);
  if (details.reason === "install") {
    // Perform initial setup, e.g., set default settings
    chrome.storage.local.set({ sessions: [] });
    console.log("Initialized empty sessions array in storage.");
  }
});
