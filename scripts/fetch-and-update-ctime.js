const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Parse RAW_DATA for hash -> slug mapping
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

console.log(`Mapped ${Object.keys(hashToSlug).length} hashes to slugs`);

// 2. Read ctime data from shopee-ctime.txt (hash:timestamp per line)
const ctimeFile = path.join(__dirname, 'shopee-ctime.txt');
if (!fs.existsSync(ctimeFile)) {
  console.error('shopee-ctime.txt not found. Please create it first.');
  process.exit(1);
}

const ctimeRaw = fs.readFileSync(ctimeFile, 'utf8');
const hashToCtime = {};
ctimeRaw.trim().split('\n').forEach(line => {
  const idx = line.lastIndexOf(':');
  if (idx === -1) return;
  const hash = line.substring(0, idx).trim();
  const ts = parseInt(line.substring(idx + 1).trim());
  if (hash && !isNaN(ts)) hashToCtime[hash] = ts;
});

console.log(`Loaded ${Object.keys(hashToCtime).length} ctime entries`);

// 3. Build slug -> date
const slugToDate = {};
let matched = 0;
for (const [hash, ts] of Object.entries(hashToCtime)) {
  const slug = hashToSlug[hash];
  if (slug) {
    const d = new Date(ts * 1000);
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    slugToDate[slug] = dateStr;
    matched++;
  }
}
console.log(`Matched ${matched} to slugs`);

// 4. Update .md files with date field
const productsDir = path.join(__dirname, '..', 'content', 'products');
const mdFiles = fs.readdirSync(productsDir).filter(f => f.endsWith('.md'));
let updated = 0, noMatch = 0, alreadyCorrect = 0;

mdFiles.forEach(file => {
  const slug = file.replace('.md', '');
  const dateStr = slugToDate[slug];
  if (!dateStr) { noMatch++; return; }

  const filePath = path.join(productsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Check if date already exists and is correct
  const dateMatch = content.match(/date:\s*"?(\d{4}-\d{2}-\d{2})"?/);
  if (dateMatch && dateMatch[1] === dateStr) { alreadyCorrect++; return; }

  let newContent;
  if (dateMatch) {
    // Replace existing date
    newContent = content.replace(/date:\s*"?\d{4}-\d{2}-\d{2}"?/, `date: "${dateStr}"`);
  } else {
    // Add date after title line
    newContent = content.replace(/(title:\s*"[^"]*"\n)/, `$1date: "${dateStr}"\n`);
  }

  if (newContent && newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    updated++;
    if (updated <= 10) console.log(`  ${file}: date → ${dateStr}`);
  }
});

console.log(`\nResults:`);
console.log(`  Updated: ${updated}`);
console.log(`  Already correct: ${alreadyCorrect}`);
console.log(`  No match: ${noMatch}`);
