/**
 * PetCare Passport - Unified Fetch API Wrapper & UI Utilities
 */

const API = {
  async request(url, options = {}) {
    options.credentials = 'same-origin';
    if (!options.headers) {
      options.headers = {};
    }

    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: An unexpected error occurred.`);
      }

      return data;
    } catch (error) {
      console.error(`[API Error] ${options.method || 'GET'} ${url}:`, error.message);
      throw error;
    }
  },

  get(url) {
    return this.request(url, { method: 'GET' });
  },

  post(url, body) {
    return this.request(url, { method: 'POST', body });
  },

  put(url, body) {
    return this.request(url, { method: 'PUT', body });
  },

  delete(url) {
    return this.request(url, { method: 'DELETE' });
  },

  upload(url, formData, method = 'POST') {
    return fetch(url, {
      method,
      credentials: 'same-origin',
      body: formData
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    });
  }
};

// Global Floating Toast Notification
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
  toast.innerHTML = `<span>${icon}</span><div style="flex:1;">${message}</div>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal Control Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// Format date to human friendly string (e.g. "Oct 15, 2026") without timezone day shifts
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  if (typeof dateString === 'string') {
    const trimmed = dateString.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      // If it's a date-only string or midnight time, treat strictly as calendar date in local time
      if (trimmed.length === 10 || /^[T ]00:00(:00)?(\.000)?Z?$/i.test(trimmed.slice(10))) {
        const d = new Date(year, month, day);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
  }
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Format date and time to human friendly string (e.g. "Oct 15, 2026, 10:30 AM") without timezone jumps
function formatDateTime(dateTimeString) {
  if (!dateTimeString) return 'N/A';
  if (typeof dateTimeString === 'string') {
    const trimmed = dateTimeString.trim();
    // Matches "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" without trailing Z/offset
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      const hour = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      const sec = m[6] ? parseInt(m[6], 10) : 0;
      const d = new Date(year, month, day, hour, min, sec);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
  const d = new Date(dateTimeString);
  if (isNaN(d.getTime())) return String(dateTimeString);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Convert date/string to "YYYY-MM-DD" in local time for <input type="date">
function getLocalDateInputString(d = new Date()) {
  if (typeof d === 'string') {
    const m = d.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const date = d instanceof Date ? d : new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Convert date/string to "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">
function getLocalDateTimeInputString(d = new Date()) {
  if (typeof d === 'string') {
    const m = d.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (m) return `${m[1]}T${m[2]}`;
  }
  const date = d instanceof Date ? d : new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

