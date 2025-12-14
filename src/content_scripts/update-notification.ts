// Update notification for Vimtion extension
// Shows a toast notification when the extension is updated

const NOTIFICATION_DURATION = 10000; // 10 seconds
const GITHUB_RELEASE_URL = 'https://github.com/tatsukamijo/vimtion/releases';

// Check if we should show the Vimium warning notification
function checkAndShowVimiumWarning() {
  chrome.storage.local.get(['vimtion_show_vimium_warning'], (result) => {
    if (result.vimtion_show_vimium_warning) {
      showVimiumWarning();
      // Mark notification as shown
      chrome.storage.local.set({ vimtion_show_vimium_warning: false });
    }
  });
}

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

// Create and show the Vimium warning notification
function showVimiumWarning() {
  // Check if notification already exists
  if (document.querySelector('.vimtion-vimium-warning')) {
    return;
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'vimtion-notification-overlay';
  document.body.appendChild(overlay);

  const notification = createVimiumWarningElement();
  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    overlay.classList.add('vimtion-notification-overlay-visible');
    notification.classList.add('vimtion-notification-visible');
  }, 10);

  // Setup event listeners (no auto-dismiss for important warning)
  const dismissBtn = notification.querySelector('.vimtion-notification-dismiss');
  const gotItBtn = notification.querySelector('.vimtion-notification-got-it');
  const copyBtn = notification.querySelector('.vimtion-notification-copy');

  const dismissWithOverlay = () => {
    const overlay = document.querySelector('.vimtion-notification-overlay');
    if (overlay) {
      overlay.classList.remove('vimtion-notification-overlay-visible');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
    dismissNotification(notification);
  };

  dismissBtn?.addEventListener('click', dismissWithOverlay);

  gotItBtn?.addEventListener('click', dismissWithOverlay);

  // Click overlay to dismiss (optional)
  overlay?.addEventListener('click', dismissWithOverlay);

  copyBtn?.addEventListener('click', async () => {
    const url = 'https://www.notion.so/*';
    try {
      await navigator.clipboard.writeText(url);
      // Show visual feedback
      const svg = copyBtn.querySelector('svg');
      if (svg) {
        const originalHTML = svg.innerHTML;
        // Change to checkmark icon
        svg.innerHTML = '<path d="M20 6L9 17l-5-5"></path>';
        svg.setAttribute('stroke-width', '3');
        setTimeout(() => {
          svg.innerHTML = originalHTML;
          svg.setAttribute('stroke-width', '2');
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  });
}

// Create the Vimium warning DOM element
function createVimiumWarningElement(): HTMLElement {
  const notification = document.createElement('div');
  notification.className = 'vimtion-update-notification vimtion-vimium-warning';

  notification.innerHTML = `
    <div class="vimtion-notification-header">
      <div class="vimtion-notification-icon">⚠️</div>
      <div class="vimtion-notification-title">Using Vimium?</div>
      <button class="vimtion-notification-dismiss" aria-label="Dismiss">×</button>
    </div>
    <div class="vimtion-notification-body">
      <div class="vimtion-notification-message">
        If you use Vimium, please add this URL to
        <strong>Excluded URLs and keys</strong> in Vimium settings to avoid key binding conflicts:
      </div>
      <div class="vimtion-notification-url-container">
        <code class="vimtion-notification-url">https://www.notion.so/*</code>
        <button class="vimtion-notification-copy" aria-label="Copy URL" title="Copy to clipboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="vimtion-notification-actions">
      <button class="vimtion-notification-got-it">Got it</button>
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
  document.addEventListener('DOMContentLoaded', () => {
    checkAndShowVimiumWarning();  // Check Vimium warning first (first install)
    checkAndShowUpdateNotification();  // Then check update notification
  });
} else {
  // DOM is already ready
  checkAndShowVimiumWarning();
  checkAndShowUpdateNotification();
}
