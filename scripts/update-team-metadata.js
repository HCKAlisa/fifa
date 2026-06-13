const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OFFICIAL_ROSTERS_PATH = path.join(DATA_DIR, 'official-rosters.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'team-metadata.json');
const RANKINGS_URL = 'https://api.fifa.com/api/v3/rankings/?gender=1&count=250&language=en';

const COACH_ZH_BY_CODE = {
  ARG: '史卡朗尼',
  ALG: '比高域',
  AUS: '普波域治',
  AUT: '蘭歷克',
  BEL: '魯迪加西亞',
  BIH: '巴巴利斯',
  BRA: '安察洛堤',
  CAN: '馬殊',
  CIV: '法希',
  COD: '迪沙比',
  COL: '羅倫素',
  CPV: '般比斯達',
  CRO: '達利域',
  CUW: '艾禾卡特',
  CZE: '高碧克',
  DZA: '比高域',
  ECU: '比卡錫斯',
  EGY: '哈辛',
  ENG: '杜曹',
  ESP: '迪拉富安堤',
  FRA: '迪甘斯',
  GER: '拿高士文',
  GHA: '基羅斯',
  HAI: '米尼',
  HTI: '米尼',
  IRI: '加倫奴伊',
  IRN: '加倫奴伊',
  IRQ: '阿諾',
  JOR: '施拉米',
  JPN: '森保一',
  KOR: '洪明甫',
  KSA: '當尼斯',
  MAR: '華比',
  MEX: '阿古利',
  NED: '朗奴高文',
  NOR: '蘇巴根',
  NZL: '巴斯利',
  PAN: '基斯甸臣',
  PAR: '阿法路',
  POR: '馬天尼斯',
  QAT: '盧柏迪古',
  RSA: '布高斯',
  SCO: '史提夫奇勒',
  SEN: '迪奧',
  SUI: '耶堅',
  SWE: '樸達',
  TUN: '林姆希',
  TUR: '蒙迪拿',
  URU: '比爾沙',
  USA: '普捷天奴',
  UZB: '簡拿華路'
};

const RANKING_CODE_ALIASES = {
  ALG: 'DZA',
  HAI: 'HTI',
  IRN: 'IRI'
};

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function fetchJson(url){
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function normalizeCoachName(name = ''){
  return String(name)
    .replace(/\bHossam\s+Hossam\b/i, 'Hossam')
    .replace(/\bCarlos\s+Carlos\b/i, 'Carlos')
    .trim();
}

async function main(){
  const officialRosters = readJson(OFFICIAL_ROSTERS_PATH);
  const rankingPayload = await fetchJson(RANKINGS_URL);
  const rankings = rankingPayload.Results || [];

  const rankingsByCode = new Map();
  for (const entry of rankings) {
    const code = RANKING_CODE_ALIASES[entry.IdCountry] || entry.IdCountry;
    rankingsByCode.set(code, entry);
  }

  const teams = officialRosters.teams.map(team => {
    const ranking = rankingsByCode.get(team.code);
    if (!ranking) {
      throw new Error(`Missing FIFA ranking for ${team.code} (${team.team_en})`);
    }
    const coachEn = normalizeCoachName(team.coach);
    const coachZh = COACH_ZH_BY_CODE[team.code] || '';
    return {
      code: team.code,
      team_en: team.team_en,
      group: team.group,
      coach_en: coachEn,
      coach_zh: coachZh,
      ranking: ranking.Rank,
      ranking_points: ranking.DecimalTotalPoints,
      ranking_prev: ranking.PrevRank,
      ranking_updated_at: ranking.PubDate
    };
  });

  const out = {
    source: 'Official FIFA Men\'s World Ranking + zh-HK head coach mapping',
    source_url: RANKINGS_URL,
    updatedAt: new Date().toISOString(),
    rankingUpdatedAt: teams[0]?.ranking_updated_at || null,
    teams
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${teams.length} teams`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
