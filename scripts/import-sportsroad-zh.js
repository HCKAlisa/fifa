#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, '.tmp', 'sportsroad.html');
const ROSTERS_PATH = path.join(ROOT, 'data', 'official-rosters.json');
const DATA_JS_PATH = path.join(ROOT, 'data.js');

function normalize(value=''){
  return String(value)
    .replace(/&#8217;|&rsquo;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeHtml(value=''){
  return String(value)
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;|&rsquo;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value=''){
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeClub(value=''){
  return normalize(String(value).replace(/\s+\([A-Z]{3}\)\s*$/, ''));
}

function looksBrokenEnglishName(value=''){
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  if(!words.length) return true;
  for(let i = 1; i < words.length; i++){
    if(normalize(words[i]) === normalize(words[i - 1])) return true;
  }
  const normalized = normalize(value);
  if(!normalized) return true;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const uniques = new Set(tokens);
  return tokens.length >= 4 && uniques.size <= Math.ceil(tokens.length / 2);
}

function normalizeTeamZh(value=''){
  return String(value).replace(/[：:]\s*$/, '').trim();
}

function extractTeamSections(html){
  const sections = [];
  const re = /<p><strong>([^<]+?)：<\/strong><\/p>[\s\S]*?<table class="table">([\s\S]*?)<\/table>/g;
  let match;
  while((match = re.exec(html))){
    sections.push({
      team_zh: normalizeTeamZh(stripTags(match[1])),
      tableHtml: match[2]
    });
  }
  return sections;
}

function extractPlayersFromTable(tableHtml){
  const players = [];
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;
  let match;
  while((match = cellRe.exec(tableHtml))){
    const html = match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n');
    const text = stripTags(html);
    const entryRe = /\((\d+)\)\s*([^（(]+?)\s*[（(]\s*([^／/]+?)\s*[／/]\s*([^)）]+?)\s*[)）]/g;
    let entry;
    while((entry = entryRe.exec(text))){
      players.push({
        number: entry[1].trim(),
        name_zh: entry[2].trim(),
        name_en: entry[3].trim(),
        club_zh: entry[4].trim()
      });
    }

    const numberOnlyRe = /\((\d+)\)\s*([^（(]+?)\s*[（(]\s*([^)）／/]+?)\s*[)）]/g;
    while((entry = numberOnlyRe.exec(text))){
      const number = entry[1].trim();
      if(players.some(player => player.number === number)) continue;
      players.push({
        number,
        name_zh: entry[2].trim(),
        name_en: '',
        club_zh: entry[3].trim()
      });
    }
  }
  return players;
}

function loadJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildPlayerIndex(teams){
  const index = new Map();
  for(const team of teams){
    const playerMap = new Map();
    for(const player of team.players || []){
      const key = normalize(player.name_en);
      if(!key) continue;
      if(!playerMap.has(key)) playerMap.set(key, []);
      playerMap.get(key).push(player);
    }
    index.set(team.code, playerMap);
  }
  return index;
}

function loadTeamZhMap(){
  const text = fs.readFileSync(DATA_JS_PATH, 'utf8');
  const map = new Map();
  const re = /zh:'([^']+)'\s*,\s*code:'([^']+)'/g;
  let match;
  while((match = re.exec(text))){
    map.set(normalizeTeamZh(match[1]), match[2]);
  }

  const aliases = {
    '韓國': 'KOR',
    '波斯尼亞': 'BIH',
    '科特迪瓦': 'CIV',
    '沙特阿拉伯': 'KSA',
    '剛果民主共和國': 'COD',
    '英格蘭': 'ENG',
    '土耳其': 'TUR',
    '南非': 'RSA',
    '海地': 'HTI',
    '佛得角': 'CPV',
    '伊朗': 'IRI',
    '阿爾及利亞': 'DZA',
    '澳洲': 'AUS'
  };
  for(const [zh, code] of Object.entries(aliases)) map.set(zh, code);
  return map;
}

function main(){
  if(!fs.existsSync(HTML_PATH)){
    throw new Error(`Missing ${HTML_PATH}. Fetch the Sportsroad page first.`);
  }
  if(!fs.existsSync(ROSTERS_PATH)){
    throw new Error(`Missing ${ROSTERS_PATH}. Run update:rosters first.`);
  }

  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const rosters = loadJson(ROSTERS_PATH);
  const teamZhMap = loadTeamZhMap();
  const teamSections = extractTeamSections(html);
  const sectionTeams = teamSections.map(section => ({
    team_zh: section.team_zh,
    players: extractPlayersFromTable(section.tableHtml)
  })).filter(team => team.players.length);

  const rosterTeams = rosters.teams || [];
  const rosterIndex = buildPlayerIndex(rosterTeams);

  let matchedPlayers = 0;
  let updatedNameZh = 0;
  let updatedClubZh = 0;
  let updatedNumbers = 0;
  let updatedNameEn = 0;
  let matchedTeams = 0;
  const unmatchedTeams = [];

  for(const sourceTeam of sectionTeams){
    const code = teamZhMap.get(sourceTeam.team_zh);
    const team = code ? rosterTeams.find(team => team.code === code) : null;
    if(!team){
      unmatchedTeams.push(sourceTeam.team_zh);
      continue;
    }
    matchedTeams++;

    const playerMap = rosterIndex.get(team.code);
    for(const sourcePlayer of sourceTeam.players){
      const key = normalize(sourcePlayer.name_en);
      const numberMatch = (team.players || []).find(player => String(player.number || '') === sourcePlayer.number);
      const candidates = key ? (playerMap?.get(key) || []) : [];
      const match = numberMatch && (!candidates.length || candidates.includes(numberMatch))
        ? numberMatch
        : candidates.find(player => normalizeClub(player.club_en) === normalizeClub(sourcePlayer.club_zh))
        || candidates[0]
        || numberMatch;
      if(!match) continue;

      matchedPlayers++;
      if(sourcePlayer.name_zh && !match.name_zh){
        match.name_zh = sourcePlayer.name_zh;
        match.confidence = 'Sportsroad zh-HK';
        updatedNameZh++;
      }
      if(sourcePlayer.name_en && (looksBrokenEnglishName(match.name_en) || !normalize(match.name_en) || normalize(match.name_en) !== normalize(sourcePlayer.name_en))){
        match.name_en = sourcePlayer.name_en;
        if(/Special:Search/.test(match.profile_url || '')){
          match.profile_url = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(sourcePlayer.name_en)}`;
        }
        updatedNameEn++;
      }
      if(sourcePlayer.club_zh && !match.club_zh){
        match.club_zh = sourcePlayer.club_zh;
        updatedClubZh++;
      }
      if(sourcePlayer.number && !match.number){
        match.number = sourcePlayer.number;
        updatedNumbers++;
      }
    }
  }

  const sportsroadNote = 'zh-HK player names and club names may be enriched from Sportsroad where matched by English player name/number.';
  if(!String(rosters.note || '').includes(sportsroadNote)){
    rosters.note = `${String(rosters.note || '').trim()} ${sportsroadNote}`.trim();
  }
  rosters.updatedAt = new Date().toISOString();
  fs.writeFileSync(ROSTERS_PATH, JSON.stringify(rosters, null, 2) + '\n');

  console.log(JSON.stringify({
    matchedTeams,
    matchedPlayers,
    updatedNameEn,
    updatedNameZh,
    updatedClubZh,
    updatedNumbers,
    unmatchedTeams
  }, null, 2));
}

main();
