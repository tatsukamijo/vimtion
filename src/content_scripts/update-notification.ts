// Update notification for Vimtion extension
// Shows a toast notification when the extension is updated

const NOTIFICATION_DURATION = 10000; // 10 seconds
const GITHUB_RELEASE_URL = 'https://github.com/tatsukamijo/vimtion/releases';

// Check if we should show the update notification
function checkAndShowUpdateNotification() {
  chrome.storage.local.get(['vimtion_show_update_notification', 'vimtion_version'], (result) => {
    if (result.vimtion_show_update_notification) {
      showUpdateNotification(result.vimtion_version);
      // Mark notification as shown
      chrome.storage.local.set({ vimtion_show_update_notification: false });
    }
  });
}

// Create and show the update notification
function showUpdateNotification(version: string) {
  // Check if notification already exists
  if (document.querySelector('.vimtion-update-notification')) {
    return;
  }

  const notification = createNotificationElement(version);
  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add('vimtion-notification-visible');
  }, 10);

  // Auto-dismiss after duration
  const autoDismissTimeout = setTimeout(() => {
    dismissNotification(notification);
  }, NOTIFICATION_DURATION);

  // Setup event listeners
  const dismissBtn = notification.querySelector('.vimtion-notification-dismiss');
  const whatsNewBtn = notification.querySelector('.vimtion-notification-whats-new');

  dismissBtn?.addEventListener('click', () => {
    clearTimeout(autoDismissTimeout);
    dismissNotification(notification);
  });

  whatsNewBtn?.addEventListener('click', () => {
    clearTimeout(autoDismissTimeout);
    window.open(GITHUB_RELEASE_URL, '_blank');
    dismissNotification(notification);
  });
}

// Create the notification DOM element
function createNotificationElement(version: string): HTMLElement {
  const notification = document.createElement('div');
  notification.className = 'vimtion-update-notification';

  notification.innerHTML = `
    <div class="vimtion-notification-header">
      <div class="vimtion-notification-icon">🎉</div>
      <div class="vimtion-notification-title">Vimtion Updated</div>
      <button class="vimtion-notification-dismiss" aria-label="Dismiss">×</button>
    </div>
    <div class="vimtion-notification-body">
      <div class="vimtion-notification-version">Version ${version}</div>
      <div class="vimtion-notification-message">
        New features and bug fixes available
      </div>
    </div>
    <div class="vimtion-notification-actions">
      <button class="vimtion-notification-whats-new">What's New</button>
    </div>
  `;

  return notification;
}

// Dismiss the notification with animation
function dismissNotification(notification: HTMLElement) {
  notification.classList.remove('vimtion-notification-visible');
  notification.classList.add('vimtion-notification-hidden');

  // Remove from DOM after animation completes
  setTimeout(() => {
    notification.remove();
  }, 300);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndShowUpdateNotification);
} else {
  // DOM is already ready
  checkAndShowUpdateNotification();
}
