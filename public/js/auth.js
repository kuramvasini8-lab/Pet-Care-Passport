/**
 * PetCare Passport - Unified Authentication State & Experience Guards
 */

let currentUser = null;

const Auth = {
  async init() {
    try {
      const data = await API.get('/api/auth/me');
      if (data.authenticated && data.user) {
        currentUser = data.user;
        this.renderAuthUI(currentUser);
        return currentUser;
      } else {
        currentUser = null;
        this.renderAuthUI(null);
        return null;
      }
    } catch (e) {
      console.warn('[Auth] Auth state check failed:', e.message);
      currentUser = null;
      this.renderAuthUI(null);
      return null;
    }
  },

  async requireAuth(redirectUrl = '/login.html') {
    const user = await this.init();
    if (!user) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${redirectUrl}?returnUrl=${currentPath}`;
      throw new Error('Authentication required');
    }
    return user;
  },

  async requireAdmin(redirectUrl = '/login.html') {
    const user = await this.init();
    if (!user) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${redirectUrl}?returnUrl=${currentPath}`;
      throw new Error('Authentication required');
    }
    if (user.role !== 'admin') {
      alert('Access Denied: Administrator privileges required.');
      window.location.href = '/owner/dashboard.html';
      throw new Error('Administrative authorization required');
    }
    return user;
  },

  async logout() {
    try {
      await API.post('/api/auth/logout');
      showToast('Logged out successfully.', 'info');
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 500);
    } catch (e) {
      showToast(e.message || 'Logout failed', 'error');
    }
  },

  async updateNotificationBadge() {
    try {
      const res = await API.get('/api/notifications/unread-count');
      const count = res.count || 0;
      
      const badge = document.getElementById('nav-notif-badge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : count;
          badge.style.display = 'inline-flex';
        } else {
          badge.textContent = '0';
          badge.style.display = 'none';
        }
      }

      // Also update any sidebar or page badges
      document.querySelectorAll('.notif-number-badge, #sidebar-notif-count, #header-notif-count').forEach(el => {
        el.textContent = count;
        if (count > 0) el.style.display = 'inline-flex';
      });
    } catch (e) {
      // Quiet fail if not supported
    }
  },

  renderAuthUI(user) {
    const container = document.getElementById('nav-auth-container');
    if (!container) return;

    if (!user) {
      container.innerHTML = `
        <a href="/login.html" class="btn btn-outline btn-sm">Log In</a>
        <a href="/register.html" class="btn btn-primary btn-sm">Register</a>
      `;
    } else {
      const initials = user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U';
      const isAdmin = user.role === 'admin';

      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <!-- Notification Bell with Exact Count Badge -->
          <a href="/owner/notifications.html" class="nav-notif-btn" title="View Notifications">
            <span>🔔</span>
            <span class="notif-badge-pill" id="nav-notif-badge" style="display:none;">0</span>
          </a>

          ${isAdmin ? `
            <a href="/admin/dashboard.html" class="btn btn-danger btn-sm" title="Go to Admin Dashboard">
              🛡️ Admin Console
            </a>
          ` : `
            <a href="/owner/dashboard.html" class="btn btn-outline btn-sm" style="display:flex;align-items:center;gap:6px;">
              🐾 Dashboard
            </a>
          `}
          <div class="user-pill" onclick="window.location.href='${isAdmin ? '/admin/dashboard.html' : '/owner/profile.html'}'" title="Manage Account">
            <div class="user-avatar-small">${initials}</div>
            <span>${user.full_name}</span>
          </div>
          <button onclick="Auth.logout()" class="btn btn-outline btn-sm" title="Sign out" style="padding:6px 10px;">
            🚪
          </button>
        </div>
      `;

      // Fetch and display live unread count
      this.updateNotificationBadge();
    }
  }
};

// Initialize auth state automatically on page load
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
