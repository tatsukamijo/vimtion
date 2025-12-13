// Options page logic for Vimtion settings

interface VimtionSettings {
  showStatusBar: boolean;
  statusBarPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  statusBarColor: string;
  cursorBlink: boolean;
  cursorColor: string;
  visualHighlightColor: string;
  showUpdateNotifications: boolean;
}

const DEFAULT_SETTINGS: VimtionSettings = {
  showStatusBar: true,
  statusBarPosition: 'bottom-right',
  statusBarColor: '#667eea',
  cursorBlink: true,
  cursorColor: '#667eea',
  visualHighlightColor: '#667eea',
  showUpdateNotifications: true,
};

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings: VimtionSettings) => {
    // Status Bar
    (document.getElementById('showStatusBar') as HTMLInputElement).checked = settings.showStatusBar;
    (document.getElementById('statusBarPosition') as HTMLSelectElement).value = settings.statusBarPosition;

    // Appearance
    (document.getElementById('cursorBlink') as HTMLInputElement).checked = settings.cursorBlink;
    (document.getElementById('statusBarColor') as HTMLInputElement).value = settings.statusBarColor;
    (document.getElementById('statusBarColorText') as HTMLInputElement).value = settings.statusBarColor;
    (document.getElementById('cursorColor') as HTMLInputElement).value = settings.cursorColor;
    (document.getElementById('cursorColorText') as HTMLInputElement).value = settings.cursorColor;
    (document.getElementById('visualHighlightColor') as HTMLInputElement).value = settings.visualHighlightColor;
    (document.getElementById('visualHighlightColorText') as HTMLInputElement).value = settings.visualHighlightColor;

    // Apply theme color to page
    applyThemeColor(settings.statusBarColor);

    // Notifications
    (document.getElementById('showUpdateNotifications') as HTMLInputElement).checked = settings.showUpdateNotifications;
  });
}

// Save settings to storage
function saveSettings() {
  const settings: VimtionSettings = {
    showStatusBar: (document.getElementById('showStatusBar') as HTMLInputElement).checked,
    statusBarPosition: (document.getElementById('statusBarPosition') as HTMLSelectElement).value as VimtionSettings['statusBarPosition'],
    statusBarColor: (document.getElementById('statusBarColor') as HTMLInputElement).value,
    cursorBlink: (document.getElementById('cursorBlink') as HTMLInputElement).checked,
    cursorColor: (document.getElementById('cursorColor') as HTMLInputElement).value,
    visualHighlightColor: (document.getElementById('visualHighlightColor') as HTMLInputElement).value,
    showUpdateNotifications: (document.getElementById('showUpdateNotifications') as HTMLInputElement).checked,
  };

  chrome.storage.sync.set(settings, () => {
    showStatus('Settings saved successfully!', 'success');
  });
}

// Reset to default settings
function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
      loadSettings();
      showStatus('Settings reset to defaults', 'success');
    });
  }
}

// Show status message
function showStatus(message: string, type: 'success' | 'error') {
  const statusElement = document.getElementById('status');
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;
  statusElement.style.display = 'block';

  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Apply theme color to page background and elements
function applyThemeColor(color: string) {
  const gradientEnd = adjustColor(color, -20);

  // Update body gradient
  document.body.style.background = `linear-gradient(135deg, ${color} 0%, ${gradientEnd} 100%)`;

  // Update header gradient
  const header = document.querySelector('header') as HTMLElement;
  if (header) {
    header.style.background = `linear-gradient(135deg, ${color} 0%, ${gradientEnd} 100%)`;
  }

  // Update primary button gradient
  const style = document.createElement('style');
  style.id = 'vimtion-theme-styles';
  const existingStyle = document.getElementById('vimtion-theme-styles');
  if (existingStyle) {
    existingStyle.remove();
  }

  style.textContent = `
    .btn-primary {
      background: linear-gradient(135deg, ${color} 0%, ${gradientEnd} 100%) !important;
    }
    .btn-primary:hover {
      box-shadow: 0 4px 12px ${color}66 !important;
    }
    .select-input:focus {
      border-color: ${color} !important;
      box-shadow: 0 0 0 3px ${color}1a !important;
    }
    .color-text-input:focus {
      border-color: ${color} !important;
      box-shadow: 0 0 0 3px ${color}1a !important;
    }
    .select-input:hover,
    .color-text-input:hover {
      border-color: ${color} !important;
    }
    .toggle-input:checked + .toggle-slider {
      background-color: ${color} !important;
    }
    .footer-info a {
      color: ${color} !important;
    }
    .btn-secondary {
      color: ${color} !important;
      border-color: ${color} !important;
    }
  `;
  document.head.appendChild(style);
}

// Sync color picker with text input
function setupColorPickers() {
  const colorInputs = [
    { picker: 'statusBarColor', text: 'statusBarColorText' },
    { picker: 'cursorColor', text: 'cursorColorText' },
    { picker: 'visualHighlightColor', text: 'visualHighlightColorText' },
  ];

  colorInputs.forEach(({ picker, text }) => {
    const pickerElement = document.getElementById(picker) as HTMLInputElement;
    const textElement = document.getElementById(text) as HTMLInputElement;

    pickerElement.addEventListener('input', () => {
      textElement.value = pickerElement.value;
      // Live preview for status bar color
      if (picker === 'statusBarColor') {
        applyThemeColor(pickerElement.value);
      }
    });

    textElement.addEventListener('input', () => {
      const color = textElement.value;
      if (/^#[0-9A-F]{6}$/i.test(color)) {
        pickerElement.value = color;
        // Live preview for status bar color
        if (picker === 'statusBarColor') {
          applyThemeColor(color);
        }
      }
    });

    textElement.addEventListener('blur', () => {
      const color = textElement.value;
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        textElement.value = pickerElement.value;
      }
    });
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupColorPickers();

  const saveButton = document.getElementById('save');
  const resetButton = document.getElementById('reset');

  saveButton?.addEventListener('click', saveSettings);
  resetButton?.addEventListener('click', resetSettings);

  // Save on Enter key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      saveSettings();
    }
  });
});
