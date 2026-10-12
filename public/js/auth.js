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
          ${isAdmin ? `
            <a href="/admin/dashboard.html" class="btn btn-danger btn-sm" title="Go to Admin Dashboard">
              🛡️ Admin Dashboard
            </a>
          ` : `
            <a href="/owner/dashboard.html" class="btn btn-outline btn-sm" style="display:flex;align-items:center;gap:6px;">
              🐾 My Pets & Dashboard
            </a>
          `}
          <div class="user-pill" onclick="window.location.href='${isAdmin ? '/admin/dashboard.html' : '/owner/profile.html'}'" title="Manage Account">
            <div class="user-avatar-small">${initials}</div>
            <span>${user.full_name}</span>
          </div>
          <button onclick="Auth.logout()" class="btn btn-outline btn-sm" title="Sign out" style="padding:6px 10px;">
            🚪 Logout
          </button>
        </div>
      `;
    }
  }
};

// Initialize auth state automatically on page load
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
