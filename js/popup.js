// DOM Elements
const saveTabsBtn = document.getElementById('saveTabsBtn');
const saveSessionForm = document.getElementById('saveSessionForm');
const sessionNameInput = document.getElementById('sessionName');
const confirmSaveBtn = document.getElementById('confirmSaveBtn');
const cancelSaveBtn = document.getElementById('cancelSaveBtn');
const sessionsList = document.getElementById('sessionsList');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load saved sessions
  loadSavedSessions();
  
  // Set up event listeners
  saveTabsBtn.addEventListener('click', showSaveForm);
  confirmSaveBtn.addEventListener('click', saveCurrentSession);
  cancelSaveBtn.addEventListener('click', hideSaveForm);
});

// Functions
function showSaveForm() {
  // Generate default session name (current date and time)
  const now = new Date();
  const defaultName = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  
  // Set default name and show form
  sessionNameInput.value = defaultName;
  saveSessionForm.classList.remove('hidden');
  saveTabsBtn.classList.add('hidden');
  
  // Focus the input field
  sessionNameInput.focus();
  sessionNameInput.select();
}

function hideSaveForm() {
  saveSessionForm.classList.add('hidden');
  saveTabsBtn.classList.remove('hidden');
}

async function saveCurrentSession() {
  const sessionName = sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
  
  try {
    // Show loading state
    confirmSaveBtn.textContent = 'Saving...';
    confirmSaveBtn.disabled = true;
    
    // Get all tabs in current window
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    // Get tab groups if available
    let tabGroups = [];
    if (chrome.tabGroups) {
      tabGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    }
    
    // Create session object
    const session = {
      id: Date.now().toString(),
      name: sessionName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: tabs.map(tab => ({
        id: tab.id.toString(),
        url: tab.url,
        title: tab.title,
        favicon: tab.favIconUrl,
        groupId: tab.groupId && tab.groupId !== -1 ? tab.groupId.toString() : null
      })),
      tabGroups: tabGroups.map(group => ({
        id: group.id.toString(),
        name: group.title || '',
        color: group.color || 'grey',
        tabs: tabs
          .filter(tab => tab.groupId === group.id)
          .map(tab => tab.id.toString())
      }))
    };
    
    // Save to storage
    await saveSession(session);
    
    // Reset UI
    hideSaveForm();
    loadSavedSessions();
    
    // Show success message
    showNotification('Session saved successfully!');
  } catch (error) {
    console.error('Error saving session:', error);
    showNotification('Error saving session', true);
  } finally {
    confirmSaveBtn.textContent = 'Save';
    confirmSaveBtn.disabled = false;
  }
}

async function loadSavedSessions() {
  try {
    const sessions = await getSavedSessions();
    
    if (sessions.length === 0) {
      sessionsList.innerHTML = '<div class="empty-state">No saved sessions yet</div>';
      return;
    }
    
    // Sort sessions by creation date (newest first)
    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Generate HTML for sessions
    sessionsList.innerHTML = sessions.map(session => {
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
            ${tabCount} tab${tabCount !== 1 ? 's' : ''} 
            ${groupCount > 0 ? `(${groupCount} group${groupCount !== 1 ? 's' : ''})` : ''}
          </div>
          <div class="session-actions">
            <button class="btn primary restore-btn" data-id="${session.id}">Restore</button>
            <button class="btn secondary delete-btn" data-id="${session.id}">Delete</button>
          </div>
        </div>
      `;
    }).join('');
    
    // Add event listeners to buttons
    document.querySelectorAll('.restore-btn').forEach(btn => {
      btn.addEventListener('click', (e) => restoreSession(e.target.dataset.id));
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => deleteSession(e.target.dataset.id));
    });
  } catch (error) {
    console.error('Error loading sessions:', error);
    sessionsList.innerHTML = '<div class="empty-state">Error loading sessions</div>';
  }
}

async function restoreSession(sessionId) {
  try {
    const sessions = await getSavedSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    // TODO: Implement options for new window vs. current window
    // For now, open in current window
    
    // Open all tabs
    for (const tab of session.tabs) {
      await chrome.tabs.create({ url: tab.url });
    }
    
    // TODO: Restore tab groups when API allows
    
    showNotification('Session restored successfully!');
  } catch (error) {
    console.error('Error restoring session:', error);
    showNotification('Error restoring session', true);
  }
}

async function deleteSession(sessionId) {
  try {
    let sessions = await getSavedSessions();
    sessions = sessions.filter(session => session.id !== sessionId);
    
    await chrome.storage.local.set({ sessions });
    loadSavedSessions();
    
    showNotification('Session deleted');
  } catch (error) {
    console.error('Error deleting session:', error);
    showNotification('Error deleting session', true);
  }
}

// Storage helpers
async function getSavedSessions() {
  const data = await chrome.storage.local.get('sessions');
  return data.sessions || [];
}

async function saveSession(session) {
  const sessions = await getSavedSessions();
  sessions.push(session);
  await chrome.storage.local.set({ sessions });
}

// UI helpers
function showNotification(message, isError = false) {
  // Simple notification for now
  // TODO: Implement better notifications
  console.log(message);
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${isError ? 'error' : 'success'}`;
  notification.textContent = message;
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Remove after delay
  setTimeout(() => {
    notification.remove();
  }, 3000);
}
