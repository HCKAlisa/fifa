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
const SKIP_BEFORE_FIRST_MATCH = /^(1|true|yes)$/i.test(process.env.SKIP_BEFORE_FIRST_MATCH || '');
const MATCH_UPDATE_OFFSET_HOURS = String(process.env.MATCH_UPDATE_OFFSET_HOURS || '')
  .split(',')
  .map(value => Number.parseFloat(value.trim()))
  .filter(value => Number.isFinite(value) && value >= 0)
  .sort((a, b) => a - b);
const MATCH_UPDATE_WINDOW_MINUTES = Number.parseInt(process.env.MATCH_UPDATE_WINDOW_MINUTES || '15', 10);

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

async function readJson(filename) {
  try {
    const text = await fs.readFile(path.join(OUT_DIR, filename), 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function normalizeGroupFromMatch(match) {
  // football-data.org may expose group as a stage/group string depending on competition.
  // Keep the raw value so the frontend can display it.
  return match.group || match.stage || '';
}

function getFirstMatchUtcDate(matches) {
  return matches
    .map(match => match?.utcDate)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null;
}

function getScheduledUpdateMatch(matches, nowMs, lastRefreshMs) {
  if (!MATCH_UPDATE_OFFSET_HOURS.length) return null;

  const lastEligibleRefreshMs = Number.isFinite(lastRefreshMs) ? lastRefreshMs : 0;

  return matches.reduce((selected, match) => {
    const kickoffMs = Date.parse(match?.utcDate || '');
    if (!Number.isFinite(kickoffMs)) return selected;

    for (const offsetHours of MATCH_UPDATE_OFFSET_HOURS) {
      const targetMs = kickoffMs + (offsetHours * 60 * 60 * 1000);
      if (targetMs > nowMs || targetMs <= lastEligibleRefreshMs) continue;
      if (!selected || targetMs > selected.targetMs) {
        selected = { match, targetMs, offsetHours };
      }
    }

    return selected;
  }, null);
}

function formatOffsetHours(offsetHours) {
  return Number.isInteger(offsetHours) ? String(offsetHours) : String(offsetHours).replace(/\.0+$/, '');
}

async function main() {
  console.log(`Fetching ${COMPETITION} season ${SEASON} from football-data.org...`);

  const matchesPayload = await api(`/competitions/${COMPETITION}/matches?season=${SEASON}`);
  const matches = matchesPayload.matches || [];
  const firstMatchUtcDate = getFirstMatchUtcDate(matches);
  const nowMs = Date.now();
  const previousMeta = await readJson('live-meta.json');
  const previousUpdatedAt = previousMeta?.updatedAt || '';
  const previousUpdatedMs = Date.parse(previousUpdatedAt);
  const offsetHoursLabel = MATCH_UPDATE_OFFSET_HOURS.map(formatOffsetHours).join(', ');

  if (SKIP_BEFORE_FIRST_MATCH && firstMatchUtcDate && nowMs < Date.parse(firstMatchUtcDate)) {
    console.log(`Skipping update because the first match has not started yet. First kickoff: ${firstMatchUtcDate}`);
    return;
  }

  const scheduledUpdate = getScheduledUpdateMatch(matches, nowMs, previousUpdatedMs);
  if (MATCH_UPDATE_OFFSET_HOURS.length > 0 && !scheduledUpdate) {
    const lastRefreshLabel = Number.isFinite(previousUpdatedMs) ? previousUpdatedAt : 'never';
    console.log(`Skipping update because no match has newly crossed any refresh threshold (${offsetHoursLabel} hours after kickoff) since the last refresh (${lastRefreshLabel}).`);
    return;
  }
  if (scheduledUpdate) {
    console.log(`Refreshing data for match ${scheduledUpdate.match.id} after it crossed the ${formatOffsetHours(scheduledUpdate.offsetHours)}-hour kickoff threshold (${scheduledUpdate.match.utcDate}).`);
    if (Number.isFinite(previousUpdatedMs) && Number.isFinite(MATCH_UPDATE_WINDOW_MINUTES) && MATCH_UPDATE_WINDOW_MINUTES > 0) {
      const delayMinutes = Math.round((nowMs - scheduledUpdate.targetMs) / 60000);
      if (delayMinutes > MATCH_UPDATE_WINDOW_MINUTES) {
        console.log(`Scheduled refresh window was missed by about ${delayMinutes} minutes, so this run is catching up on the next available schedule tick.`);
      }
    }
  }

  const [standingsRes, teamsRes] = await Promise.allSettled([
    api(`/competitions/${COMPETITION}/standings?season=${SEASON}`),
    api(`/competitions/${COMPETITION}/teams?season=${SEASON}`)
  ]);

  const errors = [];
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
    firstMatchUtcDate,
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
