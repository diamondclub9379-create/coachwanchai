/**
 * youtube-to-blog.js
 * ดึงวิดีโอล่าสุดจากช่อง YouTube coachwanchai
 * ดึง transcript → rewrite เป็นบทความ SEO → สร้าง Hugo markdown
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// --- Config ---
const CHANNEL_URL = 'https://www.youtube.com/@coachwanchai';
const CHANNEL_ID = 'UCOLtU6KsWbTOy4dDln8SkFg';
const MAX_VIDEOS = 10;
const YTDLP = 'python -m yt_dlp'; // Use python module since yt-dlp may not be in PATH on Windows
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

// Get existing blog slugs to avoid duplicates
function getExistingSlugs() {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') && f !== '_index.md');
  return new Set(files.map(f => f.replace('.md', '')));
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

// Fetch latest videos using yt-dlp
function fetchLatestVideos() {
  console.log(`\n📺 กำลังดึงรายชื่อวิดีโอล่าสุด ${MAX_VIDEOS} อันจากช่อง...`);
  try {
    const result = execSync(
      `${YTDLP} --flat-playlist --playlist-end ${MAX_VIDEOS} ` +
      `--print "%(id)s|||%(title)s|||%(upload_date)s|||%(duration)s" ` +
      `"${CHANNEL_URL}/videos"`,
      { encoding: 'utf8', timeout: 60000 }
    );

    const videos = result.trim().split('\n').map(line => {
      const [id, title, uploadDate, duration] = line.split('|||');
      return {
        id: id.trim(),
        title: title.trim(),
        uploadDate: uploadDate ? `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}` : new Date().toISOString().split('T')[0],
        duration: parseInt(duration) || 0
      };
    }).filter(v => v.id && v.title);

    console.log(`   ✅ พบ ${videos.length} วิดีโอ`);
    return videos;
  } catch (err) {
    console.error('❌ ดึงรายชื่อวิดีโอไม่ได้:', err.message);
    return [];
  }
}

// Fetch transcript for a video
function fetchTranscript(videoId) {
  console.log(`   📝 ดึง transcript: ${videoId}`);
  const tmpDir = path.join(__dirname, '..', 'tmp_subs');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // Clean tmp_subs first
  try {
    for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
  } catch (e) {}

  try {
    // Download auto-generated Thai subtitles to tmp_subs folder
    execSync(
      `${YTDLP} --write-auto-sub --sub-lang "th" --sub-format vtt ` +
      `--skip-download -o "${tmpDir.replace(/\\/g, '/')}/%(id)s" ` +
      `"https://www.youtube.com/watch?v=${videoId}"`,
      { encoding: 'utf8', timeout: 120000, stdio: 'pipe' }
    );

    // Find any .vtt file in tmp_subs
    const vttFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.vtt'));
    if (vttFiles.length > 0) {
      const vttContent = fs.readFileSync(path.join(tmpDir, vttFiles[0]), 'utf8');
      // Cleanup
      for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
      const text = parseVTT(vttContent);
      if (text && text.length > 50) return text;
    }
  } catch (err) {
    // Try with manual sub instead of auto sub
    try {
      execSync(
        `${YTDLP} --write-sub --sub-lang "th" --sub-format vtt ` +
        `--skip-download -o "${tmpDir.replace(/\\/g, '/')}/%(id)s" ` +
        `"https://www.youtube.com/watch?v=${videoId}"`,
        { encoding: 'utf8', timeout: 120000, stdio: 'pipe' }
      );

      const vttFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.vtt'));
      if (vttFiles.length > 0) {
        const vttContent = fs.readFileSync(path.join(tmpDir, vttFiles[0]), 'utf8');
        for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
        const text = parseVTT(vttContent);
        if (text && text.length > 50) return text;
      }
    } catch (e2) {}
  }

  // Cleanup
  try {
    for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
  } catch (e) {}

  console.log(`   ⚠️ ไม่สามารถดึง transcript: ${videoId}`);
  return null;
}

// Parse VTT subtitle to plain text
function parseVTT(vttContent) {
  const lines = vttContent.split('\n');
  const textLines = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headers, timestamps, and empty lines
    if (!trimmed || trimmed === 'WEBVTT' || trimmed.includes('-->') || /^Kind:|^Language:/.test(trimmed)) continue;
    // Remove VTT tags like <00:00:01.000>
    const cleaned = trimmed.replace(/<[^>]+>/g, '').trim();
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      textLines.push(cleaned);
    }
  }

  return textLines.join(' ').replace(/\s+/g, ' ').trim();
}

// Generate slug from title
function generateSlug(title) {
  // Remove special chars, keep Thai + English + numbers
  return title
    .toLowerCase()
    .replace(/[^\u0E00-\u0E7Fa-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// Rewrite transcript to blog article using Claude
async function rewriteArticle(client, title, transcript, videoId) {
  console.log(`   ✍️ กำลัง rewrite บทความ...`);

  const prompt = `คุณคือ Coach Wanchai นักเขียนบทความภาษาไทยที่เชี่ยวชาญด้านพัฒนาตัวเอง กฎแรงดึงดูด และจิตวิญญาณ

จงเขียนบทความ SEO ภาษาไทยจาก transcript วิดีโอนี้:

**ชื่อวิดีโอ:** ${title}
**Transcript:** ${transcript.slice(0, 8000)}

## กฎการเขียน:
1. เขียนบทความใหม่ทั้งหมด ห้าม copy transcript ตรงๆ
2. ใช้ภาษาพูดที่อ่านง่าย เป็นกันเอง
3. มีหัวข้อย่อย (## heading) อย่างน้อย 3-5 หัวข้อ
4. มี introduction ที่น่าสนใจ
5. มี conclusion พร้อม call-to-action
6. ความยาวประมาณ 800-1500 คำ
7. ใส่ bold (**) สำหรับคำสำคัญ
8. ใช้ > blockquote สำหรับคำพูดเด่นๆ 1-2 จุด

## ตอบเฉพาะเนื้อบทความ (markdown) เท่านั้น ห้ามใส่ frontmatter หรือชื่อบทความ`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  } catch (err) {
    console.error(`   ❌ Rewrite ไม่สำเร็จ: ${err.message}`);
    return null;
  }
}

// Generate SEO description using Claude
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
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
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

  // Step 1: Fetch latest videos
  const videos = fetchLatestVideos();
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

  const existingSlugs = getExistingSlugs();
  let created = 0;

  for (const video of newVideos) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 [${created + 1}/${newVideos.length}] ${video.title}`);

    // Step 2: Fetch transcript
    const transcript = fetchTranscript(video.id);
    if (!transcript || transcript.length < 50) {
      console.log(`   ⏭️ ข้าม - transcript สั้นเกินไปหรือไม่มี`);
      continue;
    }
    console.log(`   📄 Transcript: ${transcript.length} ตัวอักษร`);

    // Step 3: Rewrite article
    const article = await rewriteArticle(client, video.title, transcript, video.id);
    if (!article) {
      console.log(`   ⏭️ ข้าม - rewrite ไม่สำเร็จ`);
      continue;
    }

    // Generate meta (description, categories, tags)
    const meta = await generateMeta(client, video.title, article);

    // Step 4: Create Hugo markdown
    let slug = generateSlug(video.title);
    if (!slug || slug.length < 3) slug = `video-${video.id}`;
    if (existingSlugs.has(slug)) slug = `${slug}-${video.id.slice(0, 6)}`;

    const filePath = createBlogPost(video, article, meta, slug);
    existingSlugs.add(slug);
    created++;

    console.log(`   ✅ สร้างบทความแล้ว: ${path.basename(filePath)}`);

    // Small delay to avoid rate limiting
    if (created < newVideos.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 เสร็จ! สร้างบทความใหม่ ${created} บทความ`);
  console.log(`📁 ตำแหน่ง: ${BLOG_DIR}`);
}

main().catch(console.error);
