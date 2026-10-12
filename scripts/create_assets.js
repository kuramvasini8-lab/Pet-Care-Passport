const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../public/assets/images');
fs.mkdirSync(targetDir, { recursive: true });

const petGraphics = {
  'dog-luna.jpg': {
    name: 'Luna',
    species: 'Golden Retriever',
    bg: '#f6ad55',
    emoji: '🐕',
    color: '#dd6b20'
  },
  'cat-milo.jpg': {
    name: 'Milo',
    species: 'British Shorthair',
    bg: '#63b3ed',
    emoji: '🐈',
    color: '#3182ce'
  },
  'dog-barnaby.jpg': {
    name: 'Barnaby',
    species: 'Beagle',
    bg: '#68d391',
    emoji: '🐶',
    color: '#38a169'
  },
  'cat-cleo.jpg': {
    name: 'Cleo',
    species: 'Siamese',
    bg: '#b794f4',
    emoji: '🐱',
    color: '#805ad5'
  },
  'dog-rocky.jpg': {
    name: 'Rocky',
    species: 'Boxer Mix',
    bg: '#f687b3',
    emoji: '🐕‍🦺',
    color: '#d53f8c'
  },
  'lost-corgi.jpg': {
    name: 'Daisy (Lost)',
    species: 'Corgi',
    bg: '#fc8181',
    emoji: '🐾',
    color: '#e53e3e'
  },
  'found-tabby.jpg': {
    name: 'Found Tabby',
    species: 'Domestic Cat',
    bg: '#4fd1c5',
    emoji: '🐱',
    color: '#319795'
  },
  'default-pet.jpg': {
    name: 'PetCare',
    species: 'Passport Pet',
    bg: '#cbd5e0',
    emoji: '🐾',
    color: '#4a5568'
  }
};

for (const [filename, data] of Object.entries(petGraphics)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${data.bg};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${data.color};stop-opacity:1" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.15"/>
      </filter>
    </defs>
    <rect width="600" height="450" fill="url(#grad)" />
    <circle cx="300" cy="180" r="90" fill="#ffffff" filter="url(#shadow)" opacity="0.95"/>
    <text x="300" y="210" font-size="95" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${data.emoji}</text>
    <rect x="50" y="310" width="500" height="95" rx="16" fill="#ffffff" opacity="0.92" filter="url(#shadow)"/>
    <text x="300" y="348" font-size="28" font-weight="bold" fill="#1a202c" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${data.name}</text>
    <text x="300" y="380" font-size="18" font-weight="500" fill="#4a5568" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${data.species}</text>
  </svg>`;

  fs.writeFileSync(path.join(targetDir, filename), svg, 'utf8');
  // Also save .svg version
  fs.writeFileSync(path.join(targetDir, filename.replace('.jpg', '.svg')), svg, 'utf8');
}

console.log('[Assets] Created clean pet visual assets in public/assets/images');
