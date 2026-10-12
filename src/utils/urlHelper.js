/**
 * PetCare Passport - Public URL and QR Code Resolution Helper
 * 
 * Provides centralized, validated URL generation for public digital passports and QR codes.
 * - Supports PUBLIC_BASE_URL (with APP_URL as backward-compatible fallback).
 * - Enforces HTTPS and rejects localhost in production.
 * - Permits localhost in local development and test environments.
 */
const QRCode = require('qrcode');

/**
 * Resolves the public base URL for passport QR generation.
 * Enforces HTTPS in production and rejects insecure or localhost fallbacks.
 * Allows localhost in development/test environments.
 * 
 * @param {Object} [options] Optional overrides (e.g. for testing)
 * @returns {string} Normalized public base URL (no trailing slash)
 */
function getPublicBaseUrl(options = {}) {
  const env = options.env || process.env;
  const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';

  // Support PUBLIC_BASE_URL as primary, APP_URL as alias
  const rawUrl = (options.baseUrlOverride || env.PUBLIC_BASE_URL || env.APP_URL || '').trim();

  if (isProduction) {
    if (!rawUrl) {
      throw new Error(
        'Configuration Error: PUBLIC_BASE_URL is required in production environment. ' +
        'Refusing to generate QR codes with localhost URLs in production. ' +
        'Please set PUBLIC_BASE_URL=https://your-domain.com in your environment configuration.'
      );
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (e) {
      throw new Error(
        `Configuration Error: PUBLIC_BASE_URL '${rawUrl}' is not a valid URL. ` +
        `Example: PUBLIC_BASE_URL=https://petcare.yourdomain.com`
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(
        `Configuration Error: PUBLIC_BASE_URL must use HTTPS protocol in production. ` +
        `Received '${rawUrl}'. Insecure HTTP or localhost URLs are prohibited in production.`
      );
    }

    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      throw new Error(
        `Configuration Error: PUBLIC_BASE_URL cannot point to localhost in production. ` +
        `Received '${rawUrl}'. Please configure your deployed public domain.`
      );
    }

    return parsed.origin + (parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '');
  }

  // Development & Test environments
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      return parsed.origin + (parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '');
    } catch (e) {
      return rawUrl.replace(/\/+$/, '');
    }
  }

  // Development fallback: localhost on configured PORT
  const port = parseInt(env.PORT || '3000', 10);
  return `http://localhost:${port}`;
}

/**
 * Builds the complete public passport destination URL.
 * 
 * @param {string} publicId Non-guessable public pet passport identifier
 * @param {Object} [options] Optional overrides
 * @returns {string} Fully qualified public passport URL
 */
function buildPassportPublicUrl(publicId, options = {}) {
  if (!publicId || typeof publicId !== 'string') {
    throw new Error('A valid publicId string is required to construct a passport URL.');
  }
  const baseUrl = getPublicBaseUrl(options);
  return `${baseUrl}/passport-view.html?id=${encodeURIComponent(publicId.trim())}`;
}

/**
 * Generates a high-resolution QR code data URL for a pet's public passport.
 * 
 * @param {string} publicId Non-guessable public pet passport identifier
 * @param {Object} [options] Optional overrides or QR styling
 * @returns {Promise<{ passportUrl: string, qrDataUrl: string }>}
 */
async function generatePassportQr(publicId, options = {}) {
  const passportUrl = buildPassportPublicUrl(publicId, options);
  const qrDataUrl = await QRCode.toDataURL(passportUrl, {
    errorCorrectionLevel: 'H', // High error correction (~30% recovery for physical tags)
    margin: 2,
    width: 320
  });

  return { passportUrl, qrDataUrl };
}

module.exports = {
  getPublicBaseUrl,
  buildPassportPublicUrl,
  generatePassportQr
};
