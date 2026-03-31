/**
 * youtube-to-blog-notranscript.js
 * ดึงวิดีโอล่าสุดจากช่อง YouTube coachwanchai ผ่าน RSS
 * ใช้ Claude เขียนบทความ SEO จากชื่อวิดีโอ (ไม่ต้องใช้ transcript)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');

// --- Config ---
const CHANNEL_ID = 'UCOLtU6KsWbTOy4dDln8SkFg';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const BLOG_DIR = path.join(__dirname, '..', 'content', 'blog');
const ENV_PATH = path.join(process.env.USERPROFILE || process.env.HOME, 'ai-news-pipeline', '.env');

// Load ANTHROPIC_API_KEY from ai-news-pipeline .env
function loadEnv() {
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// Get existing blog files that have youtubeId in frontmatter
function getExistingVideoIds() {
  const ids = new Set();
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') && f !== '_index.md');
  for (const file of files) {
    const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
    const match = content.match(/youtubeId:\s*"?([^"\s]+)"?/);
    if (match) ids.add(match[1]);
  }
  return ids;
}

// Fetch RSS feed
function fetchRSS() {
  return new Promise((resolve, reject) => {
    console.log('\n📺 กำลังดึงรายชื่อวิดีโอจาก RSS feed...');
    https.get(RSS_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Parse RSS XML to video list
function parseRSS(xml) {
  const videos = [];
  const entries = xml.split('<entry>').slice(1); // skip header

  for (const entry of entries) {
    const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);

    if (idMatch && titleMatch) {
      const published = publishedMatch ? publishedMatch[1].split('T')[0] : new Date().toISOString().split('T')[0];
      videos.push({
        id: idMatch[1],
        title: titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        uploadDate: published
      });
    }
  }

  console.log(`   ✅ พบ ${videos.length} วิดีโอ`);
  return videos;
}

// Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\u0E00-\u0E7Fa-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// Get existing slugs
function getExistingSlugs() {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') && f !== '_index.md');
  return new Set(files.map(f => f.replace('.md', '')));
}

// Write blog article using Claude (from title only, no transcript)
async function writeArticle(client, title, videoId) {
  console.log(`   ✍️ กำลังเขียนบทความ...`);

  const prompt = `คุณคือ Coach Wanchai นักเขียนบทความภาษาไทยที่เชี่ยวชาญด้านพัฒนาตัวเอง กฎแรงดึงดูด จิตวิญญาณ และ Mindset

จงเขียนบทความ SEO ภาษาไทยจากหัวข้อวิดีโอนี้:

**ชื่อวิดีโอ:** ${title}

## กฎการเขียน:
1. เขียนบทความเชิงลึกที่ครอบคลุมหัวข้อนี้อย่างละเอียด
2. ใช้ภาษาพูดที่อ่านง่าย เป็นกันเอง เหมือน Coach พูดกับลูกศิษย์
3. มีหัวข้อย่อย (## heading) อย่างน้อย 3-5 หัวข้อ
4. มี introduction ที่น่าสนใจ ดึงดูดให้อ่านต่อ
5. มี conclusion พร้อม call-to-action
6. ความยาวประมาณ 800-1500 คำ
7. ใส่ bold (**) สำหรับคำสำคัญ
8. ใช้ > blockquote สำหรับคำคมเด่นๆ 1-2 จุด
9. เนื้อหาต้องเชื่อมโยงกับกฎแรงดึงดูด พัฒนาตัวเอง หรือจิตวิญญาณ
10. ห้ามใส่ frontmatter หรือชื่อบทความ

## ตอบเฉพาะเนื้อบทความ (markdown) เท่านั้น`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  } catch (err) {
    console.error(`   ❌ เขียนบทความไม่สำเร็จ: ${err.message}`);
    return null;
  }
}

// Generate SEO meta using Claude
async function generateMeta(client, title, articleContent) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `จากบทความเรื่อง "${title}" ให้ตอบเป็น JSON เท่านั้น (ไม่มี markdown block):
{"description": "คำอธิบาย SEO ภาษาไทย 150-160 ตัวอักษร", "categories": ["หมวดหมู่หลัก"], "tags": ["tag1", "tag2", "tag3"]}

หมวดหมู่ที่ใช้ได้: กฎแรงดึงดูด, พัฒนาตัวเอง, การเงิน, จิตวิญญาณ, สุขภาพ

เนื้อหาบทความ (บางส่วน):
${articleContent.slice(0, 1000)}`
      }]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return null;
  } catch (err) {
    return null;
  }
}

// Create Hugo markdown file
function createBlogPost(video, article, meta, slug) {
  const date = video.uploadDate || new Date().toISOString().split('T')[0];
  const description = meta?.description || `${video.title} - Coach Wanchai`;
  const categories = meta?.categories || ['พัฒนาตัวเอง'];
  const tags = meta?.tags || ['Coach Wanchai'];

  const frontmatter = [
    '---',
    `title: "${video.title.replace(/"/g, '\\"')}"`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    `date: ${date}`,
    `youtubeId: "${video.id}"`,
    'categories:',
    ...categories.map(c => `  - ${c}`),
    'tags:',
    ...tags.map(t => `  - ${t}`),
    `featuredImage: "/images/blog/${slug}.png"`,
    '---',
    '',
    `{{< youtube ${video.id} >}}`,
    '',
    article,
    '',
    '---',
    '',
    `> ชอบบทความนี้ไหม? ดูวิดีโอเต็มๆ ได้ที่ [YouTube ช่อง Coach Wanchai](https://www.youtube.com/watch?v=${video.id}) และ [ปรึกษา Coach Wanchai](/contact/) ได้เลย`,
  ].join('\n');

  const filePath = path.join(BLOG_DIR, `${slug}.md`);
  fs.writeFileSync(filePath, frontmatter, 'utf8');
  return filePath;
}

// --- Main ---
async function main() {
  loadEnv();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ไม่พบ ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const client = new Anthropic();
  const existingVideoIds = getExistingVideoIds();
  const existingSlugs = getExistingSlugs();

  // Step 1: Fetch videos from RSS
  const rssXml = await fetchRSS();
  const videos = parseRSS(rssXml);

  if (videos.length === 0) {
    console.log('❌ ไม่พบวิดีโอ');
    return;
  }

  // Filter out already-existing videos
  const newVideos = videos.filter(v => !existingVideoIds.has(v.id));
  console.log(`\n📊 วิดีโอทั้งหมด: ${videos.length} | ใหม่: ${newVideos.length} | มีแล้ว: ${videos.length - newVideos.length}`);

  if (newVideos.length === 0) {
    console.log('✅ ทุกวิดีโอมีบทความหมดแล้ว!');
    return;
  }

  let created = 0;

  for (const video of newVideos) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 [${created + 1}/${newVideos.length}] ${video.title}`);

    // Write article from title
    const article = await writeArticle(client, video.title, video.id);
    if (!article) {
      console.log(`   ⏭️ ข้าม - เขียนบทความไม่สำเร็จ`);
      continue;
    }

    // Generate meta
    const meta = await generateMeta(client, video.title, article);

    // Create slug
    let slug = generateSlug(video.title);
    if (!slug || slug.length < 3) slug = `video-${video.id}`;
    if (existingSlugs.has(slug)) slug = `${slug}-${video.id.slice(0, 6)}`;

    // Create blog post
    const filePath = createBlogPost(video, article, meta, slug);
    existingSlugs.add(slug);
    created++;

    console.log(`   ✅ สร้างบทความแล้ว: ${path.basename(filePath)}`);

    // Delay to avoid Claude API rate limiting
    if (created < newVideos.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 เสร็จ! สร้างบทความใหม่ ${created} บทความ`);
  console.log(`📁 ตำแหน่ง: ${BLOG_DIR}`);
}

main().catch(console.error);
