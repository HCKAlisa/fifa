#!/usr/bin/env node
// Pulls FIFA's official squad PDF, parses rosters/coaches, and optionally enriches players
// with Wikipedia profile URLs, thumbnails, and Wikidata zh-HK labels when available.
// Requires poppler-utils (`pdftotext`) on GitHub Actions.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TMP_DIR = path.join(ROOT, '.tmp');
const OFFICIAL_ROSTERS_PATH = path.join(DATA_DIR, 'official-rosters.json');
const PDF_URL = process.env.FIFA_SQUAD_PDF_URL || 'https://fdp.fifa.org/assetspublic/ce281/pdf/SquadLists-English.pdf';
const ENABLE_ENRICHMENT = String(process.env.ENABLE_PROFILE_ENRICHMENT || 'true').toLowerCase() !== 'false';
const ALLOW_ROSTER_DATA_DROP = /^(1|true|yes)$/i.test(process.env.ALLOW_ROSTER_DATA_DROP || '');
const clubLabelCache = new Map();
const PRESERVE_PLAYER_FIELDS = [
  'name_zh',
  'club_zh',
  'photo_url',
  'profile_url',
  'confidence',
  'number',
  'notes',
  'dob',
  'club_en',
  'position',
  'wikidata_id',
  'club_wikidata_id',
  'club_zh_confidence',
  'enrichment_error',
  'club_enrichment_error'
];

function resolvePdfToTextBin(){
  const candidates = [
    process.env.PDFTOTEXT_BIN,
    'C:\\Program Files\\Calibre2\\app\\bin\\pdftotext.exe',
    'pdftotext',
    'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'
  ].filter(Boolean);

  for(const candidate of candidates){
    try{
      execFileSync(candidate, ['-v'], { stdio: 'ignore' });
      return candidate;
    }catch(err){
      if(err.code !== 'ENOENT') return candidate;
    }
  }
  throw new Error('pdftotext was not found. Install Poppler or set PDFTOTEXT_BIN in .env to the full executable path.');
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const teamCodeToGroup = {
  MEX:'A', RSA:'A', KOR:'A', CZE:'A', CAN:'B', BIH:'B', QAT:'B', SUI:'B', BRA:'C', MAR:'C', HTI:'C', SCO:'C',
  USA:'D', PAR:'D', AUS:'D', TUR:'D', GER:'E', CUW:'E', CIV:'E', ECU:'E', NED:'F', JPN:'F', SWE:'F', TUN:'F',
  BEL:'G', EGY:'G', IRI:'G', NZL:'G', ESP:'H', CPV:'H', KSA:'H', URU:'H', FRA:'I', SEN:'I', IRQ:'I', NOR:'I',
  ARG:'J', DZA:'J', AUT:'J', JOR:'J', POR:'K', COD:'K', UZB:'K', COL:'K', ENG:'L', CRO:'L', GHA:'L', PAN:'L',
};
const teamCodeAliases = { ALG:'DZA', HAI:'HTI', IRN:'IRI' };

function download(url, out){
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(out);
    https.get(url, res => {
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        file.close(); fs.rmSync(out, { force:true });
        return download(new URL(res.headers.location, url).toString(), out).then(resolve, reject);
      }
      if(res.statusCode !== 200){
        file.close(); fs.rmSync(out, { force:true });
        return reject(new Error(`Download failed ${res.statusCode}: ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

function titleCaseToken(token){
  return token.split(/([-'’])/).map(part => {
    if(part === '-' || part === "'" || part === '’') return part;
    if(!part) return part;
    return part.slice(0,1).toUpperCase() + part.slice(1).toLowerCase();
  }).join('');
}
function titleCaseName(name){
  return String(name || '').split(/\s+/).map(titleCaseToken).join(' ').trim();
}
function isSurnameToken(t){
  return /^[A-ZÀ-ÖØ-Þ0-9.'’\-]+$/.test(t) && /[A-ZÀ-ÖØ-Þ]/.test(t);
}
function parseOfficialName(preDate){
  const tokens = preDate.trim().split(/\s+/);
  if(tokens.length < 2) return preDate.trim();
  let i = 0;
  while(i < tokens.length && isSurnameToken(tokens[i])) i++;
  if(i === 0 || i >= tokens.length) return titleCaseName(preDate.trim());
  const surname = tokens.slice(0, i).join(' ');
  const given = tokens[i];
  return `${titleCaseName(given)} ${titleCaseName(surname)}`.trim();
}
function normalizeName(s){
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function dedupeWords(value=''){
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const out = [];
  words.forEach(word => {
    if(!out.length || normalizeName(out[out.length - 1]) !== normalizeName(word)) out.push(word);
  });
  return out;
}
function tidyPlayerName(value=''){
  let words = dedupeWords(value);
  if(words.length >= 3 && normalizeName(words[0]) === normalizeName(words[words.length - 1])){
    words = words.slice(1);
  }
  if(words.length >= 3){
    const last = normalizeName(words[words.length - 1]).replace(/\s+/g, '');
    const prevTwo = normalizeName(`${words[words.length - 3] || ''} ${words[words.length - 2] || ''}`.trim()).replace(/\s+/g, '');
    if(last && prevTwo && last === prevTwo){
      words.splice(words.length - 3, 2);
    }
  }
  return words.join(' ');
}
function clubNameFrom(club){
  return String(club || '').replace(/\s+/g, ' ').trim();
}
function clubSearchName(club){
  return clubNameFrom(club).replace(/\s+\([A-Z]{3}\)\s*$/, '').trim();
}

function hasMeaningfulValue(value){
  if(value == null) return false;
  if(typeof value === 'string') return value.trim() !== '';
  if(Array.isArray(value)) return value.length > 0;
  if(typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function readExistingRosters(){
  if(!fs.existsSync(OFFICIAL_ROSTERS_PATH)) return null;
  try{
    return JSON.parse(fs.readFileSync(OFFICIAL_ROSTERS_PATH, 'utf8'));
  }catch(err){
    console.warn(`Warning: could not parse existing official-rosters.json: ${err.message}`);
    return null;
  }
}

function buildExistingPlayerMaps(team){
  const byName = new Map();
  const byNumber = new Map();
  for(const player of team?.players || []){
    const nameKey = normalizeName(player?.name_en || '');
    const numberKey = String(player?.number || '').trim();
    if(nameKey){
      if(!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(player);
    }
    if(numberKey && !byNumber.has(numberKey)) byNumber.set(numberKey, player);
  }
  return { byName, byNumber };
}

function findExistingPlayer(player, existingMaps, usedPlayers){
  const nameKey = normalizeName(player?.name_en || '');
  const numberKey = String(player?.number || '').trim();

  if(nameKey){
    const named = (existingMaps.byName.get(nameKey) || []).find(candidate => !usedPlayers.has(candidate));
    if(named) return named;
  }

  if(numberKey){
    const numbered = existingMaps.byNumber.get(numberKey);
    if(numbered && !usedPlayers.has(numbered)) return numbered;
  }

  return null;
}

function mergeRosterNotes(nextNote='', existingNote=''){
  const next = String(nextNote || '').trim();
  const existing = String(existingNote || '').trim();
  if(!next) return existing;
  if(!existing) return next;
  if(existing === next || existing.includes(next)) return existing;
  if(next.includes(existing)) return next;
  return `${next} ${existing}`.trim();
}

function mergeExistingPlayer(nextPlayer, existingPlayer){
  if(!existingPlayer) return nextPlayer;

  const merged = { ...existingPlayer, ...nextPlayer };

  for(const key of PRESERVE_PLAYER_FIELDS){
    if(hasMeaningfulValue(existingPlayer[key])) merged[key] = existingPlayer[key];
  }

  return merged;
}

function mergeExistingTeams(nextTeams, existingRosters){
  const existingTeamsByCode = new Map((existingRosters?.teams || []).map(team => [team.code, team]));

  return nextTeams.map(team => {
    const existingTeam = existingTeamsByCode.get(team.code);
    if(!existingTeam) return team;

    const existingMaps = buildExistingPlayerMaps(existingTeam);
    const usedPlayers = new Set();
    const players = (team.players || []).map(player => {
      const existingPlayer = findExistingPlayer(player, existingMaps, usedPlayers);
      if(existingPlayer) usedPlayers.add(existingPlayer);
      return mergeExistingPlayer(player, existingPlayer);
    });

    const unmatchedPlayers = (existingTeam.players || []).filter(player => !usedPlayers.has(player));
    if(unmatchedPlayers.length){
      console.warn(`Warning: ${team.code} has ${unmatchedPlayers.length} previously saved player(s) that no longer matched the latest import and were not carried forward.`);
    }

    return {
      ...existingTeam,
      ...team,
      players
    };
  });
}

function countPlayersWithField(teams, field){
  return (teams || []).reduce((sum, team) => {
    return sum + (team.players || []).filter(player => hasMeaningfulValue(player?.[field])).length;
  }, 0);
}

function isFallbackSearchUrl(url=''){
  return /Special:Search/i.test(String(url || ''));
}

function countPlayersMatching(teams, predicate){
  return (teams || []).reduce((sum, team) => {
    return sum + (team.players || []).filter(player => predicate(player || {})).length;
  }, 0);
}

function assertNoMajorRosterDataLoss(existingRosters, nextTeams){
  if(!existingRosters?.teams?.length) return;

  const checks = [
    { field: 'name_zh', label: 'zh-HK player names', minExisting: 50 },
    { field: 'club_zh', label: 'zh-HK club names', minExisting: 50 },
    { field: 'photo_url', label: 'player photo URLs', minExisting: 50 },
    {
      label: 'direct player profile URLs',
      minExisting: 50,
      count: teams => countPlayersMatching(teams, player => {
        return hasMeaningfulValue(player.profile_url) && !isFallbackSearchUrl(player.profile_url);
      })
    }
  ];

  const issues = checks.flatMap(check => {
    const counter = typeof check.count === 'function'
      ? check.count
      : (teams => countPlayersWithField(teams, check.field));
    const existingCount = counter(existingRosters.teams);
    const nextCount = counter(nextTeams);
    if(existingCount < check.minExisting) return [];

    const minimumSafeCount = Math.floor(existingCount * 0.9);
    if(nextCount >= minimumSafeCount) return [];

    return [{
      ...check,
      existingCount,
      nextCount,
      minimumSafeCount
    }];
  });

  if(!issues.length) return;

  const message = issues.map(issue => {
    return `${issue.label}: had ${issue.existingCount}, would drop to ${issue.nextCount}, safety floor ${issue.minimumSafeCount}`;
  }).join('; ');

  if(ALLOW_ROSTER_DATA_DROP){
    console.warn(`Warning: allowing major roster data drop because ALLOW_ROSTER_DATA_DROP=true. ${message}`);
    return;
  }

  throw new Error(
    `Safety stop: update-official-rosters would remove too much saved roster data. ${message}. `
    + 'If you intentionally want to accept that loss, rerun with ALLOW_ROSTER_DATA_DROP=true.'
  );
}

function parsePdfText(text){
  const teams = [];
  let current = null;
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/,'')).filter(l => l.trim());

  for(const raw of lines){
    const line = raw.trim().replace(/\s+/g, ' ');
    const teamMatch = line.match(/^(?:SQUAD LIST\s*)?(.+?)\s*\(([A-Z]{3})\)$/);
    const normalizedCode = teamMatch ? (teamCodeAliases[teamMatch[2]] || teamMatch[2]) : '';
    if(teamMatch && teamCodeToGroup[normalizedCode]){
      current = { team_en: teamMatch[1].replace(/ And /g, ' and '), code: normalizedCode, group: teamCodeToGroup[normalizedCode], coach: '', players: [] };
      teams.push(current);
      continue;
    }
    if(!current) continue;
    if(line.startsWith('Head coach ')){
      // Example: Head coach SCALONI Lionel Lionel Sebastián SCALONI Argentina
      const rest = line.replace(/^Head coach\s+/, '');
      const parts = rest.split(/\s+/);
      let i = 0; while(i < parts.length && isSurnameToken(parts[i])) i++;
      if(i > 0 && i < parts.length) current.coach = `${titleCaseName(parts[i])} ${titleCaseName(parts.slice(0,i).join(' '))}`;
      else current.coach = rest;
      continue;
    }
    const playerMatch = line.match(/^(?:(\d+)\s+)?(GK|DF|MF|FW)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{2,3})\s+(\d+)\s+(\d+)$/);
    if(playerMatch){
      const [, number, pos, preDate, dob, club, height, caps, goals] = playerMatch;
      const name = tidyPlayerName(parseOfficialName(preDate));
      current.players.push({
        name_en: name,
        name_zh: '',
        position: pos,
        number: number || '',
        club_en: clubNameFrom(club),
        club_zh: '',
        photo_url: '',
        profile_url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`,
        confidence: 'English only',
        source_url: PDF_URL,
        source: 'Official FIFA squad PDF',
        dob,
        height_cm: Number(height),
        caps: Number(caps),
        goals: Number(goals)
      });
    }
  }
  return teams.sort((a,b) => a.group.localeCompare(b.group) || a.team_en.localeCompare(b.team_en));
}

function fetchJson(url, headers={}){
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'wc2026-roster-tracker/1.0 (GitHub Pages personal project)', ...headers }}, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if(res.statusCode >= 200 && res.statusCode < 300){
          try{ resolve(JSON.parse(data)); } catch(e){ reject(e); }
        } else reject(new Error(`HTTP ${res.statusCode} ${url}: ${data.slice(0,120)}`));
      });
    }).on('error', reject);
  });
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function tokenSet(value){
  return new Set(normalizeName(value).split(/\s+/).filter(Boolean));
}
function hasBadPageTitle(title=''){
  return /(national football team|fifa world cup|group [a-z]|squad list|qualification|qualifying)/i.test(title);
}
function playerCandidateScore(playerName, candidateTitle=''){
  if(!candidateTitle || hasBadPageTitle(candidateTitle)) return -1;
  const playerNorm = normalizeName(playerName);
  const titleNorm = normalizeName(candidateTitle);
  if(!playerNorm || !titleNorm) return -1;
  if(playerNorm === titleNorm) return 100;
  if(titleNorm.includes(playerNorm) || playerNorm.includes(titleNorm)) return 80;

  const playerTokens = tokenSet(playerName);
  const titleTokens = tokenSet(candidateTitle);
  let overlap = 0;
  for(const token of playerTokens){
    if(titleTokens.has(token)) overlap++;
  }
  return overlap >= 2 ? overlap * 20 : -1;
}

async function fetchWikidataLabels(id){
  const wd = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${id}&props=labels&languages=zh-hk|zh-hant|zh|en&origin=*`);
  return wd?.entities?.[id]?.labels || {};
}

function pickChineseLabel(labels){
  if(labels['zh-hk']?.value) return { value: labels['zh-hk'].value, confidence: 'Wikidata zh-HK' };
  if(labels['zh-hant']?.value) return { value: labels['zh-hant'].value, confidence: 'Need HK check' };
  if(labels['zh']?.value) return { value: labels['zh'].value, confidence: 'Need HK check' };
  return null;
}

async function enrichClub(player){
  const clubEn = clubNameFrom(player.club_en || '');
  if(!clubEn) return;

  const cacheKey = clubSearchName(clubEn);
  if(clubLabelCache.has(cacheKey)){
    const cached = clubLabelCache.get(cacheKey);
    if(cached?.club_zh) player.club_zh = cached.club_zh;
    if(cached?.club_wikidata_id) player.club_wikidata_id = cached.club_wikidata_id;
    if(cached?.club_zh_confidence) player.club_zh_confidence = cached.club_zh_confidence;
    return;
  }

  try{
    const search = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(`${cacheKey} football club`)}&origin=*`);
    const hit = (search?.search || []).find(item => {
      const text = `${item.label || ''} ${item.description || ''}`.toLowerCase();
      return text.includes('football') || text.includes('soccer') || text.includes('sports club');
    }) || search?.search?.[0];

    if(!hit){
      clubLabelCache.set(cacheKey, null);
      return;
    }

    const labels = await fetchWikidataLabels(hit.id);
    const zh = pickChineseLabel(labels);
    const payload = zh ? {
      club_zh: zh.value,
      club_wikidata_id: hit.id,
      club_zh_confidence: zh.confidence
    } : {
      club_wikidata_id: hit.id
    };

    clubLabelCache.set(cacheKey, payload);
    if(payload.club_zh) player.club_zh = payload.club_zh;
    if(payload.club_wikidata_id) player.club_wikidata_id = payload.club_wikidata_id;
    if(payload.club_zh_confidence) player.club_zh_confidence = payload.club_zh_confidence;
  }catch(err){
    player.club_enrichment_error = err.message.slice(0, 160);
    clubLabelCache.set(cacheKey, null);
  }
}

async function searchWikipediaPages(query){
  const api = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&prop=info|pageimages|pageprops&inprop=url&pithumbsize=180&origin=*`;
  const wiki = await fetchJson(api);
  return wiki?.query?.pages ? Object.values(wiki.query.pages) : [];
}

function fallbackProfileUrl(playerName, withFootballer=true){
  const cleanName = tidyPlayerName(playerName);
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(cleanName)}`;
}

async function pickBestWikipediaPage(player, team){
  const queries = [
    tidyPlayerName(player.name_en),
    `${tidyPlayerName(player.name_en)} ${team.team_en}`,
    `${tidyPlayerName(player.name_en)} football`
  ];

  let best = null;
  let bestWithPhoto = null;
  const seen = new Set();

  for(const query of queries){
    const pages = await searchWikipediaPages(query);
    for(const page of pages){
      const key = String(page.pageid || page.title || '');
      if(!key || seen.has(key)) continue;
      seen.add(key);

      const score = playerCandidateScore(player.name_en, page.title || '');
      if(score < 0) continue;

      const candidate = { page, score, query, hasPhoto: Boolean(page.thumbnail?.source) };
      if(!best || score > best.score || (score === best.score && candidate.hasPhoto && !best.hasPhoto)) best = candidate;
      if(candidate.hasPhoto && (!bestWithPhoto || score > bestWithPhoto.score)) bestWithPhoto = candidate;
    }
  }

  return bestWithPhoto || best;
}

async function enrichPlayer(player, team){
  try{
    const candidate = await pickBestWikipediaPage(player, team);
    const page = candidate?.page;

    if(page){
      if(page.fullurl) player.profile_url = page.fullurl;
      if(page.thumbnail?.source) player.photo_url = page.thumbnail.source;
      const qid = page.pageprops?.wikibase_item;
      if(qid){
        player.wikidata_id = qid;
        const labels = await fetchWikidataLabels(qid);
        if(playerCandidateScore(player.name_en, labels.en?.value || page.title || '') < 0){
          delete player.wikidata_id;
          delete player.photo_url;
          player.profile_url = fallbackProfileUrl(player.name_en, false);
        }else{
          const zh = pickChineseLabel(labels);
          if(zh){
            player.name_zh = zh.value;
            player.confidence = zh.confidence;
          }
        }
      }
    } else {
      player.profile_url = fallbackProfileUrl(player.name_en, false);
    }
  }catch(err){
    player.enrichment_error = err.message.slice(0, 160);
  }
  await enrichClub(player);
  return player;
}

async function main(){
  const existingRosters = readExistingRosters();
  const pdf = path.join(TMP_DIR, 'SquadLists-English.pdf');
  const txt = path.join(TMP_DIR, 'SquadLists-English.txt');
  const pdftotextBin = resolvePdfToTextBin();
  console.log(`Downloading ${PDF_URL}`);
  await download(PDF_URL, pdf);
  console.log(`Converting PDF to text with ${pdftotextBin}`);
  execFileSync(pdftotextBin, ['-layout', pdf, txt], { stdio:'inherit' });
  const text = fs.readFileSync(txt, 'utf8');
  const teams = parsePdfText(text);
  const playerCount = teams.reduce((sum,t)=>sum+t.players.length,0);
  console.log(`Parsed ${teams.length} teams and ${playerCount} players.`);

  if(ENABLE_ENRICHMENT){
    console.log('Enriching player rows from Wikipedia/Wikidata. This may take a few minutes.');
    let i = 0;
    for(const team of teams){
      for(const player of team.players){
        i++;
        if(i % 50 === 0) console.log(`Enriched ${i}/${playerCount}`);
        await enrichPlayer(player, team);
        await sleep(120);
      }
    }
  }

  const mergedTeams = mergeExistingTeams(teams, existingRosters);
  assertNoMajorRosterDataLoss(existingRosters, mergedTeams);
  const note = mergeRosterNotes(
    'English roster, position, club, caps/goals and coaches come from the official FIFA squad PDF. profile_url/photo_url/name_zh may be enriched from Wikipedia/Wikidata and should be checked for HK wording.',
    existingRosters?.note || ''
  );

  const out = {
    ...existingRosters,
    source: 'FIFA official squad PDF + Wikipedia/Wikidata enrichment',
    source_url: PDF_URL,
    updatedAt: new Date().toISOString(),
    note,
    teams: mergedTeams
  };
  fs.writeFileSync(OFFICIAL_ROSTERS_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote data/official-rosters.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
