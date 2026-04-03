const fs = require('fs');
const path = require('path');

// 1. Load shopee-categories.txt: image_hash:cat1,cat2
const catRaw = fs.readFileSync(path.join(__dirname, 'shopee-categories.txt'), 'utf8');
const hashToCats = {};
catRaw.trim().split('\n').forEach(line => {
  const idx = line.indexOf(':');
  if (idx === -1) return;
  const hash = line.substring(0, idx).trim();
  const cats = line.substring(idx + 1).trim().split(',').map(c => c.trim()).filter(Boolean);
  if (hash && cats.length) hashToCats[hash] = cats;
});
console.log(`Loaded ${Object.keys(hashToCats).length} hash->category mappings`);

// 2. Parse RAW_DATA from generate-all-products.js for hash -> slug mapping
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

// 3. Build slug -> shopee categories
const slugToCats = {};
let matched = 0;
for (const [hash, cats] of Object.entries(hashToCats)) {
  const slug = hashToSlug[hash];
  if (slug) {
    slugToCats[slug] = cats;
    matched++;
  }
}
console.log(`Matched ${matched} hashes to slugs`);

// Also build image path based matching
// Product .md files have image: "/images/products/SLUG.jpg" and the hash is in RAW_DATA
// So we also need reverse: for hashes NOT in RAW_DATA, try matching via image field in .md
const hashToSlugViaImage = {};
const productsDir = path.join(__dirname, '..', 'content', 'products');
const mdFiles = fs.readdirSync(productsDir).filter(f => f.endsWith('.md'));

mdFiles.forEach(file => {
  const content = fs.readFileSync(path.join(productsDir, file), 'utf8');
  const imgMatch = content.match(/image:\s*"\/images\/products\/([^"]+)"/);
  if (!imgMatch) return;
  // The image filename is the slug
  // But we need to find the hash from the image
  // Actually the hash IS in the image URL on Shopee, not locally
  // Let's just use slug matching from RAW_DATA
});

// 4. Update .md files
let updated = 0, noMatch = 0, alreadyCorrect = 0;

// Clean category name mapping - simplify "วันชัย ประชาเรืองวิทย์ CoachWanchai" to "ผลงานเขียน"
function cleanCats(cats) {
  return cats.map(c => {
    if (c === 'วันชัย ประชาเรืองวิทย์ CoachWanchai') return 'CoachWanchai';
    if (c === 'หมากล้อม โก๊ะ หมากกระดาน') return 'หมากล้อม';
    return c;
  });
}

mdFiles.forEach(file => {
  const slug = file.replace('.md', '');
  const cats = slugToCats[slug];

  if (!cats) { noMatch++; return; }

  const filePath = path.join(productsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const cleanedCats = cleanCats(cats);

  // Build new categories YAML
  const catYaml = cleanedCats.map(c => `  - ${c}`).join('\n');

  // Check current categories
  const currentCatMatch = content.match(/categories:\n((?:\s+-\s+.+\n)*)/);
  const currentCats = currentCatMatch
    ? currentCatMatch[1].trim().split('\n').map(l => l.replace(/^\s*-\s*/, '').trim())
    : [];

  // Compare
  if (JSON.stringify(currentCats.sort()) === JSON.stringify(cleanedCats.sort())) {
    alreadyCorrect++;
    return;
  }

  // Replace categories block
  let newContent;
  if (content.match(/categories:\n(?:\s+-\s+.+\n)*/)) {
    newContent = content.replace(/categories:\n(?:\s+-\s+.+\n)*/, `categories:\n${catYaml}\n`);
  } else if (content.match(/categories:\n/)) {
    newContent = content.replace(/categories:\n/, `categories:\n${catYaml}\n`);
  } else {
    // No categories field, add before tags or at end of front matter
    if (content.includes('tags:')) {
      newContent = content.replace(/tags:/, `categories:\n${catYaml}\ntags:`);
    } else {
      newContent = content.replace(/---\n\n/, `categories:\n${catYaml}\n---\n\n`);
    }
  }

  if (newContent && newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    updated++;
    console.log(`  ${file}: [${currentCats.join(', ')}] → [${cleanedCats.join(', ')}]`);
  }
});

console.log(`\nResults:`);
console.log(`  Updated: ${updated}`);
console.log(`  Already correct: ${alreadyCorrect}`);
console.log(`  No match (not in any Shopee category): ${noMatch}`);
