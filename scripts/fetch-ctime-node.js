const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse error: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const allItems = [];
  for (let offset = 0; offset < 300; offset += 60) {
    const url = `https://shopee.co.th/api/v4/search/search_items?by=ctime&limit=60&match_id=27307493&newest=${offset}&order=desc&page_type=shop&scenario=PAGE_OTHERS&version=2`;
    console.log(`Fetching offset ${offset}...`);
    try {
      const data = await fetchJSON(url);
      const items = data.items || [];
      if (items.length === 0) break;
      items.forEach(item => {
        const b = item.item_basic;
        if (b?.image && b?.ctime) {
          allItems.push(b.image + ':' + b.ctime);
        }
      });
      console.log(`  Got ${items.length} items (total: ${allItems.length})`);
      if (items.length < 60) break;
      await new Promise(r => setTimeout(r, 2000));
    } catch(e) {
      console.error(`  Error at offset ${offset}: ${e.message}`);
      break;
    }
  }

  const outFile = path.join(__dirname, 'shopee-ctime.txt');
  fs.writeFileSync(outFile, allItems.join('\n'), 'utf8');
  console.log(`\nSaved ${allItems.length} entries to shopee-ctime.txt`);
}

main().catch(console.error);
