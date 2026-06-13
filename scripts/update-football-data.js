#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || 'WC';
const SEASON = process.env.FOOTBALL_DATA_SEASON || '2026';
const BASE_URL = 'https://api.football-data.org/v4';
const OUT_DIR = path.join(process.cwd(), 'data');

if (!TOKEN) {
  console.error('Missing FOOTBALL_DATA_TOKEN. Add it in GitHub repo Settings → Secrets and variables → Actions.');
  process.exit(1);
}

async function api(pathname) {
  const url = `${BASE_URL}${pathname}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': TOKEN } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} from ${url}\n${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function writeJson(filename, data) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
}

function normalizeGroupFromMatch(match) {
  // football-data.org may expose group as a stage/group string depending on competition.
  // Keep the raw value so the frontend can display it.
  return match.group || match.stage || '';
}

async function main() {
  console.log(`Fetching ${COMPETITION} season ${SEASON} from football-data.org...`);

  const [matchesRes, standingsRes, teamsRes] = await Promise.allSettled([
    api(`/competitions/${COMPETITION}/matches?season=${SEASON}`),
    api(`/competitions/${COMPETITION}/standings?season=${SEASON}`),
    api(`/competitions/${COMPETITION}/teams?season=${SEASON}`)
  ]);

  const errors = [];
  const matches = matchesRes.status === 'fulfilled' ? matchesRes.value.matches || [] : (errors.push(`matches: ${matchesRes.reason.message}`), []);
  const standings = standingsRes.status === 'fulfilled' ? standingsRes.value : (errors.push(`standings: ${standingsRes.reason.message}`), null);
  const teams = teamsRes.status === 'fulfilled' ? teamsRes.value.teams || [] : (errors.push(`teams: ${teamsRes.reason.message}`), []);

  const simplifiedMatches = matches.map(m => ({
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    matchday: m.matchday,
    stage: m.stage,
    group: normalizeGroupFromMatch(m),
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    score: m.score
  }));

  await writeJson('live-matches.json', simplifiedMatches);
  await writeJson('live-standings.json', standings);
  await writeJson('live-teams-api.json', teams);
  await writeJson('live-meta.json', {
    source: 'football-data.org',
    competition: COMPETITION,
    season: SEASON,
    updatedAt: new Date().toISOString(),
    counts: { matches: simplifiedMatches.length, teams: teams.length, standingsTables: standings?.standings?.length || 0 },
    warnings: errors
  });

  if (errors.length) {
    console.warn('Completed with warnings:');
    for (const err of errors) console.warn(`- ${err}`);
  } else {
    console.log('Football data update complete.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
