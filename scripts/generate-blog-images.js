/**
 * generate-blog-images.js
 * สร้างภาพ featured image สำหรับบทความที่ยังไม่มีภาพ
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '..', 'content', 'blog');
const IMAGE_DIR = path.join(__dirname, '..', 'static', 'images', 'blog');
const WIDTH = 1200;
const HEIGHT = 675;

// Color themes for variety
const THEMES = [
  { bg: ['#667eea', '#764ba2'], text: '#fff', accent: '#ffd700' },
  { bg: ['#f093fb', '#f5576c'], text: '#fff', accent: '#ffe066' },
  { bg: ['#4facfe', '#00f2fe'], text: '#fff', accent: '#ffd700' },
  { bg: ['#43e97b', '#38f9d7'], text: '#1a1a2e', accent: '#ff6b6b' },
  { bg: ['#fa709a', '#fee140'], text: '#1a1a2e', accent: '#4a00e0' },
  { bg: ['#a18cd1', '#fbc2eb'], text: '#1a1a2e', accent: '#ff6b35' },
  { bg: ['#ffecd2', '#fcb69f'], text: '#1a1a2e', accent: '#e74c3c' },
  { bg: ['#ff9a9e', '#fecfef'], text: '#1a1a2e', accent: '#6c5ce7' },
  { bg: ['#a1c4fd', '#c2e9fb'], text: '#1a1a2e', accent: '#e17055' },
  { bg: ['#d4fc79', '#96e6a1'], text: '#1a1a2e', accent: '#e84393' },
  { bg: ['#1a1a2e', '#16213e'], text: '#fff', accent: '#ffd700' },
  { bg: ['#0f3460', '#533483'], text: '#fff', accent: '#e94560' },
  { bg: ['#2c3e50', '#3498db'], text: '#fff', accent: '#f39c12' },
  { bg: ['#6a0572', '#ab83a1'], text: '#fff', accent: '#ffd700' },
  { bg: ['#1b4332', '#2d6a4f'], text: '#fff', accent: '#ffd166' },
];

// Wrap text to fit canvas width
function wrapText(ctx, text, maxWidth) {
  const words = text.split('');
  const lines = [];
  let currentLine = '';

  for (const char of words) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function generateImage(title, slug, themeIndex) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const theme = THEMES[themeIndex % THEMES.length];

  // Draw gradient background
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, theme.bg[0]);
  gradient.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Decorative circles
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(WIDTH * 0.85, HEIGHT * 0.2, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(WIDTH * 0.1, HEIGHT * 0.8, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Title text
  const fontSize = title.length > 40 ? 42 : title.length > 25 ? 48 : 56;
  ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';

  const lines = wrapText(ctx, title, WIDTH - 160);
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const startY = (HEIGHT - totalHeight) / 2 + fontSize * 0.3;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], WIDTH / 2, startY + i * lineHeight);
  }

  // Accent line
  ctx.fillStyle = theme.accent;
  ctx.fillRect(WIDTH / 2 - 60, startY + lines.length * lineHeight + 15, 120, 4);

  // Branding
  ctx.font = `bold 24px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.fillText('Coach Wanchai', WIDTH / 2, HEIGHT - 40);

  // Save
  const outPath = path.join(IMAGE_DIR, `${slug}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

function main() {
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

  // Find blog posts that don't have images yet
  const blogFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') && f !== '_index.md');
  let created = 0;

  for (let i = 0; i < blogFiles.length; i++) {
    const slug = blogFiles[i].replace('.md', '');
    const imagePath = path.join(IMAGE_DIR, `${slug}.png`);

    if (fs.existsSync(imagePath)) continue; // Skip if image exists

    // Read title from frontmatter
    const content = fs.readFileSync(path.join(BLOG_DIR, blogFiles[i]), 'utf8');
    const titleMatch = content.match(/title:\s*"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : slug;

    const outPath = generateImage(title, slug, i);
    created++;
    console.log(`✅ ${slug}.png`);
  }

  console.log(`\n🎉 สร้างภาพใหม่ ${created} ภาพ`);
}

main();
