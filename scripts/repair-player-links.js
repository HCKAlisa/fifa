#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const ROOT = path.resolve(__dirname, '..');
const ROSTERS_PATH = path.join(ROOT, 'data', 'official-rosters.json');
const REQUEST_DELAY_MS = Number(process.env.WIKI_REQUEST_DELAY_MS || 75);
const MAX_RETRIES = Number(process.env.WIKI_MAX_RETRIES || 4);
const MAX_PLAYERS_PER_RUN = Number(process.env.WIKI_MAX_PLAYERS_PER_RUN || 250);
const SAVE_EVERY = Number(process.env.WIKI_SAVE_EVERY || 20);
const pageInspectCache = new Map();
const PRIORITY_PLAYERS = [
  'lionel messi',
  'cristiano ronaldo',
  'christian pulisic',
  'takefusa kubo',
  'sadio mane',
  'harry kane',
  'kylian mbappe',
  'mohamed salah',
  'neymar jr',
  'romelu lukaku',
  'kevin de bruyne',
  'heungmin son',
  'luka modric',
  'memphis depay',
  'riyad mahrez',
  'james rodriguez',
  'mejdi taremi',
  'mehdi taremi',
  'granit xhaka',
  'raul jimenez',
  'son heung min',
  'son heung-min'
];
const NAME_ALIASES = {
  'heungmin son': ['Son Heung-min', 'Heung-min Son'],
  'kylian mbappe': ['Kylian Mbappé'],
  'james rodriguez': ['James Rodríguez'],
  'lionel messi': ['Lionel Andrés Messi'],
  'raul jimenez': ['Raúl Jiménez'],
  'mohamed salah': ['Mohamed Salah'],
  'sadio mane': ['Sadio Mané'],
  'andrej kramaric': ['Andrej Kramarić'],
  'luka modric': ['Luka Modrić'],
  'edin dzeko': ['Edin Džeko'],
  'mehdi taremi': ['Mehdi Taremi'],
  'riyad mahrez': ['Riyad Mahrez'],
  'mark mckenzie': ['Mark McKenzie (soccer)', 'Mark McKenzie'],
  'weston mckennie': ['Weston McKennie'],
  'christian pulisic': ['Christian Pulisic'],
  'takefusa kubo': ['Takefusa Kubo'],
  'sadio mane': ['Sadio Mané'],
  'neymar': ['Neymar', 'Neymar Jr.'],
  'neymar jr': ['Neymar', 'Neymar Jr.'],
  'cristiano ronaldo': ['Cristiano Ronaldo'],
  'harry kane': ['Harry Kane'],
  'mohamed salah': ['Mohamed Salah'],
  'son heung min': ['Son Heung-min'],
  'son heung-min': ['Son Heung-min']
};

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeName(value=''){
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCompact(value=''){
  return normalizeName(value).replace(/\s+/g, '');
}

function normalizeLooseName(value=''){
  return normalizeName(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u'))
    .join(' ');
}

function normalizeLooseCompact(value=''){
  return normalizeLooseName(value).replace(/\s+/g, '');
}

function normalizeSortedCompact(value=''){
  return normalizeLooseName(value)
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join('');
}

function tidyPlayerName(value=''){
  let words = String(value).trim().split(/\s+/).filter(Boolean);
  const deduped = [];
  for(const word of words){
    if(!deduped.length || normalizeName(deduped[deduped.length - 1]) !== normalizeName(word)){
      deduped.push(word);
    }
  }
  words = deduped;
  if(words.length >= 3 && normalizeName(words[0]) === normalizeName(words[words.length - 1])){
    words = words.slice(1);
  }
  if(words.length >= 3){
    const last = normalizeCompact(words[words.length - 1]);
    const prevTwo = normalizeCompact(`${words[words.length - 3] || ''} ${words[words.length - 2] || ''}`.trim());
    if(last && prevTwo && last === prevTwo){
      words.splice(words.length - 3, 2);
    }
  }
  return words.join(' ');
}

function tokenSet(value=''){
  return new Set(normalizeName(value).split(/\s+/).filter(Boolean));
}

function normalizeDob(value=''){
  const text = String(value || '').trim();
  if(!text) return '';
  const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return '';
}

function playerCandidateScore(playerName, candidateTitle=''){
  const bad = /(national football team|fifa world cup|group [a-z]|qualification|qualifying|squad list)/i;
  if(!candidateTitle || bad.test(candidateTitle)) return -1;
  const playerNorm = normalizeName(playerName);
  const titleNorm = normalizeName(candidateTitle);
  const playerCompact = normalizeCompact(playerName);
  const titleCompact = normalizeCompact(candidateTitle);
  const playerLooseCompact = normalizeLooseCompact(playerName);
  const titleLooseCompact = normalizeLooseCompact(candidateTitle);
  const playerSortedCompact = normalizeSortedCompact(playerName);
  const titleSortedCompact = normalizeSortedCompact(candidateTitle);
  if(!playerNorm || !titleNorm) return -1;
  if(playerNorm === titleNorm) return 100;
  if(playerCompact === titleCompact) return 95;
  if(playerLooseCompact === titleLooseCompact) return 94;
  if(playerSortedCompact === titleSortedCompact) return 93;
  if(titleNorm.includes(playerNorm) || playerNorm.includes(titleNorm)) return 80;

  const playerTokens = tokenSet(playerName);
  const titleTokens = tokenSet(candidateTitle);
  let overlap = 0;
  for(const token of playerTokens){
    if(titleTokens.has(token)) overlap++;
  }
  return overlap >= 2 ? overlap * 20 : -1;
}

function bestPlayerCandidateScore(playerName, candidateTitle='', aliases=[]){
  return [playerName, ...aliases]
    .filter(Boolean)
    .reduce((best, name) => Math.max(best, playerCandidateScore(name, candidateTitle)), -1);
}

function buildNameVariants(playerName='', aliases=[]){
  const variants = new Set();
  const addVariant = (value='') => {
    const clean = tidyPlayerName(value);
    if(clean) variants.add(clean);
  };
  addVariant(playerName);
  aliases.forEach(addVariant);
  for(const value of [...variants]){
    const parts = value.split(/\s+/).filter(Boolean);
    if(parts.length === 2){
      addVariant(`${parts[1]} ${parts[0]}`);
    }
  }
  return [...variants];
}

function fetchJson(url, attempt = 0){
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'wc2026-roster-tracker/1.0 (local repair script)'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        if(res.statusCode === 429 && attempt < MAX_RETRIES){
          const retryAfter = Number(res.headers['retry-after'] || 0);
          const waitMs = Math.max(retryAfter * 1000, 1000 * (attempt + 1));
          await sleep(waitMs);
          try{
            resolve(await fetchJson(url, attempt + 1));
          }catch(err){
            reject(err);
          }
          return;
        }

        if(res.statusCode >= 200 && res.statusCode < 300){
          try{
            resolve(JSON.parse(data));
          }catch(err){
            reject(err);
          }
          return;
        }

        reject(new Error(`HTTP ${res.statusCode} ${url}: ${data.slice(0, 160)}`));
      });
    }).on('error', reject);
  });
}

function fetchText(url, attempt = 0, redirectCount = 0){
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 wc2026-roster-tracker/1.0'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
          if(redirectCount >= 5){
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const nextUrl = new URL(res.headers.location, url).toString();
          try{
            resolve(await fetchText(nextUrl, attempt, redirectCount + 1));
          }catch(err){
            reject(err);
          }
          return;
        }
        if((res.statusCode === 429 || res.statusCode === 503) && attempt < MAX_RETRIES){
          const retryAfter = Number(res.headers['retry-after'] || 0);
          const waitMs = Math.max(retryAfter * 1000, 1000 * (attempt + 1));
          await sleep(waitMs);
          try{
            resolve(await fetchText(url, attempt + 1, redirectCount));
          }catch(err){
            reject(err);
          }
          return;
        }
        if(res.statusCode >= 200 && res.statusCode < 300){
          resolve({ html: data, finalUrl: url });
          return;
        }
        reject(new Error(`HTTP ${res.statusCode} ${url}: ${data.slice(0, 160)}`));
      });
    }).on('error', reject);
  });
}

function decodeHtml(value=''){
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseSearchResults(html){
  const results = [];
  const liRe = /<li class="mw-search-result[\s\S]*?<\/li>/g;
  const blocks = html.match(liRe) || [];
  for(const block of blocks){
    const linkMatch = block.match(/<div class="mw-search-result-heading"><a href="([^"]+)" title="([^"]+)"/);
    if(!linkMatch) continue;
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
    const title = decodeHtml(linkMatch[2]);
    const href = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://en.wikipedia.org${linkMatch[1]}`;
    const img = imgMatch ? (imgMatch[1].startsWith('//') ? `https:${imgMatch[1]}` : imgMatch[1]) : '';
    results.push({
      title,
      fullurl: href,
      thumbnail: { source: img }
    });
  }
  return results;
}

function parseArticlePage(html, finalUrl){
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] || finalUrl;
  const title = decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] || '').replace(/\s*-\s*Wikipedia\s*$/, '').trim();
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || '';
  const bday = html.match(/<span[^>]*class="[^"]*\bbday\b[^"]*"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>/i)?.[1]
    || html.match(/"birthDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/i)?.[1]
    || '';
  if(!title || /Search results - Wikipedia$/i.test(title)) return null;
  return {
    title,
    fullurl: canonical,
    thumbnail: { source: ogImage },
    dob: bday
  };
}

async function searchWikipediaHtml(query){
  const url = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`;
  const { html, finalUrl } = await fetchText(url);
  if(!/Special:Search/.test(finalUrl)){
    const article = parseArticlePage(html, finalUrl);
    return article ? [article] : [];
  }
  return parseSearchResults(html);
}

function isWikipediaUrl(url=''){
  return /^https:\/\/en\.wikipedia\.org\//i.test(String(url || ''));
}

async function inspectWikipediaPage(page){
  const fullurl = page?.fullurl || '';
  if(!fullurl || !isWikipediaUrl(fullurl)) return null;
  if(pageInspectCache.has(fullurl)) return pageInspectCache.get(fullurl);
  const task = (async () => {
    const { html, finalUrl } = await fetchText(fullurl);
    const parsed = parseArticlePage(html, finalUrl);
    if(!parsed) return null;
    return {
      title: parsed.title || page.title || '',
      fullurl: parsed.fullurl || fullurl,
      thumbnail: { source: parsed.thumbnail?.source || page.thumbnail?.source || '' },
      dob: parsed.dob || ''
    };
  })();
  pageInspectCache.set(fullurl, task);
  return task;
}

function compareCandidatePriority(a, b){
  return (b.dobScore || 0) - (a.dobScore || 0)
    || (b.score || 0) - (a.score || 0)
    || Number(Boolean(b.page?.thumbnail?.source)) - Number(Boolean(a.page?.thumbnail?.source));
}

async function findBestPage(player, teamName){
  let best = null;
  const wantedDob = normalizeDob(player.dob);
  const aliases = NAME_ALIASES[normalizeName(player.name_en)] || [];
  const nameVariants = buildNameVariants(player.name_en, aliases);

  if(isWikipediaUrl(player.profile_url || '')){
    const currentPage = await inspectWikipediaPage({
      title: '',
      fullurl: player.profile_url,
      thumbnail: { source: player.photo_url || '' }
    });
    if(currentPage){
      const currentDob = normalizeDob(currentPage.dob);
      const dobMatches = !wantedDob || !currentDob || currentDob === wantedDob;
      const currentScore = bestPlayerCandidateScore(nameVariants[0] || player.name_en, currentPage.title || '', nameVariants.slice(1));
      if(dobMatches && currentScore >= 0 && currentPage.fullurl && !/Special:Search/.test(currentPage.fullurl)){
        best = {
          page: currentPage,
          score: currentScore,
          dobScore: wantedDob && currentDob === wantedDob ? 1000 : 0
        };
      }
    }
  }

  const queries = [
    ...nameVariants,
    ...nameVariants.map(name => `${name} ${teamName}`),
    ...nameVariants.map(name => `${name} football`)
  ];
  for(const query of queries){
    const pages = await searchWikipediaHtml(query);
    let queryBest = null;
    for(const page of pages){
      const nameScore = bestPlayerCandidateScore(nameVariants[0] || player.name_en, page.title || '', nameVariants.slice(1));
      if(nameScore < 0) continue;
      const inspected = await inspectWikipediaPage(page).catch(() => page);
      const candidateDob = normalizeDob(inspected?.dob || '');
      if(wantedDob && candidateDob && candidateDob !== wantedDob) continue;
      const candidate = {
        page: {
          title: inspected?.title || page.title || '',
          fullurl: inspected?.fullurl || page.fullurl || '',
          thumbnail: { source: inspected?.thumbnail?.source || page.thumbnail?.source || '' },
          dob: inspected?.dob || ''
        },
        score: nameScore,
        dobScore: wantedDob && candidateDob === wantedDob ? 1000 : 0
      };
      if(!queryBest || compareCandidatePriority(queryBest, candidate) > 0){
        queryBest = candidate;
      }
    }
    if(queryBest && (!best || compareCandidatePriority(best, queryBest) > 0)){
      best = queryBest;
    }
    await sleep(REQUEST_DELAY_MS);
    if(best?.dobScore >= 1000 && best?.page?.thumbnail?.source) break;
  }

  return best?.page || null;
}

function needsRepair(player){
  return !player.photo_url || /Special:Search/.test(player.profile_url || '');
}

function priorityRank(player){
  const name = normalizeName(player.name_en);
  const priorityIndex = PRIORITY_PLAYERS.indexOf(name);
  const needsProfile = /Special:Search/.test(player.profile_url || '') || !player.profile_url;
  const needsPhoto = !player.photo_url;
  if(priorityIndex !== -1) return 1000000 - priorityIndex * 1000;
  return (needsProfile ? 500000 : 0)
    + (needsPhoto ? 100000 : 0)
    + ((player.caps || 0) * 2)
    + ((player.goals || 0) * 3);
}

async function main(){
  if(!fs.existsSync(ROSTERS_PATH)){
    throw new Error(`Missing ${ROSTERS_PATH}`);
  }

  const rosters = JSON.parse(fs.readFileSync(ROSTERS_PATH, 'utf8'));
  const teams = rosters.teams || [];
  for(const team of teams){
    for(const player of team.players || []){
      const tidy = tidyPlayerName(player.name_en || '');
      if(tidy && tidy !== player.name_en) player.name_en = tidy;
      if(/Special:Search/.test(player.profile_url || '')){
        player.profile_url = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(player.name_en)}`;
      }
    }
  }

  const targets = teams
    .flatMap(team => (team.players || []).filter(needsRepair).map(player => ({
      team,
      player: { ...player, team_en: team.team_en },
      original: player,
      rank: priorityRank(player)
    })))
    .sort((a, b) => b.rank - a.rank || (b.player.caps || 0) - (a.player.caps || 0))
    .slice(0, MAX_PLAYERS_PER_RUN);

  console.log(`Repairing Wikipedia links/images for ${targets.length} players...`);

  let repairedProfile = 0;
  let repairedPhoto = 0;
  let failed = 0;
  let i = 0;

  for(const item of targets){
    i++;
    const { team, player, original } = item;
    if(i % 25 === 0) console.log(`Checked ${i}/${targets.length}`);
    try{
      const page = await findBestPage(player, team.team_en);
      if(page?.fullurl && /Special:Search/.test(original.profile_url || '')){
        original.profile_url = page.fullurl;
        repairedProfile++;
      }
      if(page?.thumbnail?.source && !original.photo_url){
        original.photo_url = page.thumbnail.source;
        repairedPhoto++;
      }
      if(!page && !original.profile_url){
        original.profile_url = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(player.name_en)}`;
      }
      if(page?.fullurl || page?.thumbnail?.source) delete original.link_repair_error;
    }catch(err){
      original.link_repair_error = err.message.slice(0, 160);
      failed++;
    }
    if(i % SAVE_EVERY === 0){
      rosters.updatedAt = new Date().toISOString();
      fs.writeFileSync(ROSTERS_PATH, JSON.stringify(rosters, null, 2) + '\n');
    }
    await sleep(REQUEST_DELAY_MS);
  }

  rosters.updatedAt = new Date().toISOString();
  fs.writeFileSync(ROSTERS_PATH, JSON.stringify(rosters, null, 2) + '\n');

  console.log(JSON.stringify({
    targets: targets.length,
    repairedProfile,
    repairedPhoto,
    failed
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
