const { createCanvas } = require('canvas');
const fs = require('fs');

// Create 192x192 icon
const canvas192 = createCanvas(192, 192);
const ctx192 = canvas192.getContext('2d');
ctx192.fillStyle = '#ff7b4a';
ctx192.fillRect(0, 0, 192, 192);
ctx192.strokeStyle = 'white';
ctx192.lineWidth = 4;
ctx192.strokeRect(48, 48, 96, 96);

// Save 192x192
const buffer192 = canvas192.toBuffer('image/png');
fs.writeFileSync('./public/icon-192x192.png', buffer192);

// Create 512x512 icon
const canvas512 = createCanvas(512, 512);
const ctx512 = canvas512.getContext('2d');
ctx512.fillStyle = '#ff7b4a';
ctx512.fillRect(0, 0, 512, 512);
ctx512.strokeStyle = 'white';
ctx512.lineWidth = 10;
ctx512.strokeRect(128, 128, 256, 256);

// Save 512x512
const buffer512 = canvas512.toBuffer('image/png');
fs.writeFileSync('./public/icon-512x512.png', buffer512);

console.log('✓ Generated new favicon PNG files');
