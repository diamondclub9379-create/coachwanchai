const fs = require('fs');
const path = require('path');

// Read sales data to know which slugs were matched
const genScript = fs.readFileSync(path.join(__dirname, 'generate-all-products.js'), 'utf8');
const rawDataMatch = genScript.match(/const RAW_DATA = `\n([\s\S]*?)`.trim\(\)/);
if (!rawDataMatch) { console.error('Could not parse RAW_DATA'); process.exit(1); }

function slugify(name, index) {
  const englishParts = name.match(/[a-zA-Z][a-zA-Z0-9'.!?&+\-]*/g);
  let slug = '';
  if (englishParts && englishParts.length > 0) {
    slug = englishParts.join(' ').toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  if (slug.length < 3) slug = `product-${index}`;
  if (slug.length > 80) slug = slug.substring(0, 80).replace(/-$/g, '');
  return slug;
}

const lines = rawDataMatch[1].trim().split('\n');
const hashToSlug = {};
const usedSlugs = new Set();
lines.forEach((line, i) => {
  const parts = line.split('|');
  if (parts.length < 2) return;
  const name = parts[0].trim();
  const hash = parts[1].trim();
  let slug = slugify(name, i);
  if (usedSlugs.has(slug)) {
    let n = 2;
    while (usedSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  usedSlugs.add(slug);
  hashToSlug[hash] = slug;
});

// Read sales data
const salesFile = path.join(__dirname, 'shopee-sales.txt');
const salesRaw = fs.readFileSync(salesFile, 'utf8');
const matchedSlugs = new Set();
salesRaw.trim().split('\n').forEach(line => {
  const idx = line.lastIndexOf(':');
  if (idx === -1) return;
  const hash = line.substring(0, idx).trim();
  const slug = hashToSlug[hash];
  if (slug) matchedSlugs.add(slug);
});

console.log(`Matched slugs from sales: ${matchedSlugs.size}`);

// Update unmatched .md files to weight 999
const productsDir = path.join(__dirname, '..', 'content', 'products');
const mdFiles = fs.readdirSync(productsDir).filter(f => f.endsWith('.md'));
let fixed = 0;

mdFiles.forEach(file => {
  const slug = file.replace('.md', '');
  if (matchedSlugs.has(slug)) return; // already matched, skip

  const filePath = path.join(productsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const weightMatch = content.match(/weight:\s*(\d+)/);
  if (weightMatch && parseInt(weightMatch[1]) === 999) return; // already 999

  let newContent;
  if (weightMatch) {
    newContent = content.replace(/weight:\s*\d+/, 'weight: 999');
  } else {
    newContent = content.replace(/(title:\s*"[^"]*"\n)/, '$1weight: 999\n');
  }

  if (newContent && newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    fixed++;
    console.log(`  ${file}: weight → 999 (was ${weightMatch ? weightMatch[1] : 'none'})`);
  }
});

console.log(`\nFixed ${fixed} unmatched files to weight 999`);
