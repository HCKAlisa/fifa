const TEAMS = Array.isArray(window.TEAMS) ? window.TEAMS : [];
const groups = [...new Set(TEAMS.map(t => t.group))].sort();
const PLAYER_VIEW_STORAGE_KEY = 'wc2026-player-view';
const MOBILE_PLAYER_VIEW_BREAKPOINT = 760;
const state = { view:'teams', groups:[], teams:[], positions:[], stages:[], search:'', selected:null, fixtureGrouping:'date-group', playerView:readStoredPlayerView(), teamSort:'group-alpha' };
const live = { matches:[], standings:null, meta:null, teamsApi:[], officialRosters:null, teamMetadata:null };
const originalManualPlayers = new Map(TEAMS.map(t => [t.code, (t.players || []).filter(p => p.confidence !== 'Example only')]));

const groupFilter = document.querySelector('#groupFilter');
const groupTabs = document.querySelector('#groupTabs');
const grid = document.querySelector('#teamsGrid');
const controls = document.querySelector('.controls');
const search = document.querySelector('#search');
const details = document.querySelector('#teamDetails');
const teamModal = document.querySelector('#teamModal');
const teamModalClose = document.querySelector('#teamModalClose');
const teamSort = document.querySelector('#teamSort');
const teamFilter = document.querySelector('#teamFilter');
const positionFilter = document.querySelector('#positionFilter');
const stageFilter = document.querySelector('#stageFilter');
const liveStatus = document.querySelector('#liveStatus');
const fixtureGroupingButtons = [...document.querySelectorAll('.fixture-grouping-btn')];
const teamHiddenControls = [...document.querySelectorAll('[data-hide-on-teams="true"]')];
const teamVisibleControls = [...document.querySelectorAll('[data-show-on-teams="true"]')];
const multiDropdownSources = [...document.querySelectorAll('.multi-dropdown-source')];

const teamByCode = Object.fromEntries(TEAMS.map(t => [t.code, t]));

function isMobileViewport(){
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(`(max-width:${MOBILE_PLAYER_VIEW_BREAKPOINT}px)`).matches;
}

function readStoredPlayerView(){
  try{
    const storedValue = localStorage.getItem(PLAYER_VIEW_STORAGE_KEY);
    if(storedValue === 'list' || storedValue === 'grid') return storedValue;
    return isMobileViewport() ? 'list' : 'grid';
  }catch(err){
    return isMobileViewport() ? 'list' : 'grid';
  }
}

function persistPlayerView(){
  try{
    localStorage.setItem(PLAYER_VIEW_STORAGE_KEY, state.playerView);
  }catch(err){
    // Ignore storage failures and keep the in-memory preference.
  }
}

function renderPlayerViewToggle(label='Player view mode'){
  return `
    <div class="player-view-toolbar">
      <div class="player-view-label">${escapeHtml(label)}</div>
      <div class="player-view-toggle" role="group" aria-label="${escapeHtml(label)}">
        <button type="button" class="player-view-btn ${state.playerView === 'list' ? 'active' : ''}" data-player-view="list" onclick="setPlayerViewMode('list')" aria-pressed="${state.playerView === 'list' ? 'true' : 'false'}">List / 列表</button>
        <button type="button" class="player-view-btn ${state.playerView === 'grid' ? 'active' : ''}" data-player-view="grid" onclick="setPlayerViewMode('grid')" aria-pressed="${state.playerView === 'grid' ? 'true' : 'false'}">Cards / 網格</button>
      </div>
    </div>
  `;
}

function updatePlayerViewToggleButtons(){
  document.querySelectorAll('.player-view-btn').forEach(button => {
    const active = button.dataset.playerView === state.playerView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setPlayerViewMode(mode='list'){
  const nextMode = mode === 'grid' ? 'grid' : 'list';
  if(state.playerView === nextMode) return;
  state.playerView = nextMode;
  persistPlayerView();
  renderAllPlayers();
  renderDetails();
  updatePlayerViewToggleButtons();
}
window.setPlayerViewMode = setPlayerViewMode;

function normalizePlayerName(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getMultiSelectValues(select){
  return [...select.selectedOptions].map(option => option.value).filter(Boolean);
}

function setMultiSelectValues(select, values){
  const active = new Set(values || []);
  [...select.options].forEach(option => {
    option.selected = active.has(option.value);
  });
  refreshMultiDropdown(select);
}

function matchesMulti(values, candidate){
  return !values.length || values.includes(candidate);
}

function multiDropdownSummary(select){
  const selected = getMultiSelectValues(select);
  const labels = [...select.options]
    .filter(option => selected.includes(option.value))
    .map(option => option.textContent.trim());
  if(!labels.length) return select.dataset.placeholder || 'All';
  if(labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

function ensureMultiDropdown(select){
  if(select.dataset.dropdownReady === 'true') return;
  const wrapper = document.createElement('div');
  wrapper.className = 'multi-dropdown';
  wrapper.dataset.sourceId = select.id;
  wrapper.innerHTML = `
    <button class="multi-dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"></button>
    <div class="multi-dropdown-menu" hidden></div>
  `;
  select.insertAdjacentElement('afterend', wrapper);
  select.dataset.dropdownReady = 'true';
}

function refreshMultiDropdown(select){
  if(!select?.id || select.tagName !== 'SELECT') return;
  ensureMultiDropdown(select);
  const wrapper = document.querySelector(`.multi-dropdown[data-source-id="${select.id}"]`);
  if(!wrapper) return;
  const trigger = wrapper.querySelector('.multi-dropdown-trigger');
  const menu = wrapper.querySelector('.multi-dropdown-menu');
  const selected = new Set(getMultiSelectValues(select));
  trigger.textContent = multiDropdownSummary(select);
  trigger.setAttribute('aria-expanded', wrapper.classList.contains('open') ? 'true' : 'false');
  menu.innerHTML = `
    <label class="multi-dropdown-option multi-dropdown-option-all">
      <input type="checkbox" ${selected.size === 0 ? 'checked' : ''} data-role="clear" />
      <span>${escapeHtml(select.dataset.placeholder || 'All')}</span>
    </label>
    ${[...select.options].map(option => `
      <label class="multi-dropdown-option">
        <input type="checkbox" value="${escapeHtml(option.value)}" ${selected.has(option.value) ? 'checked' : ''} />
        <span>${escapeHtml(option.textContent.trim())}</span>
      </label>
    `).join('')}
  `;
  wrapper.hidden = select.hidden;
}

function refreshAllMultiDropdowns(){
  multiDropdownSources.forEach(refreshMultiDropdown);
}

function closeAllMultiDropdowns(exceptId=''){
  document.querySelectorAll('.multi-dropdown.open').forEach(wrapper => {
    if(exceptId && wrapper.dataset.sourceId === exceptId) return;
    wrapper.classList.remove('open');
    const trigger = wrapper.querySelector('.multi-dropdown-trigger');
    const menu = wrapper.querySelector('.multi-dropdown-menu');
    if(trigger) trigger.setAttribute('aria-expanded', 'false');
    if(menu) menu.hidden = true;
  });
}

function formatStageLabel(stage=''){
  const map = {
    GROUP_STAGE: 'Group Stage',
    LAST_32: 'Round of 32',
    LAST_16: 'Round of 16',
    QUARTER_FINALS: 'Quarter-finals',
    SEMI_FINALS: 'Semi-finals',
    THIRD_PLACE: 'Third-place Playoff',
    FINAL: 'Final'
  };
  return map[stage] || String(stage || 'Fixtures').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function dedupeWords(value=''){
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const out = [];
  words.forEach(word => {
    if(!out.length || out[out.length - 1].toLowerCase() !== word.toLowerCase()) out.push(word);
  });
  return out;
}

function dedupeDisplayName(value=''){
  let words = dedupeWords(value);
  if(words.length >= 3 && words[0].toLowerCase() === words[words.length - 1].toLowerCase()){
    words = words.slice(1);
  }
  if(words.length >= 3){
    const last = normalizePlayerName(words[words.length - 1]);
    const prevTwo = normalizePlayerName(`${words[words.length - 3] || ''} ${words[words.length - 2] || ''}`.trim()).replace(/\s+/g, '');
    if(last && prevTwo && last === prevTwo){
      words.splice(words.length - 3, 2);
    }
  }
  return words.join(' ');
}

function sanitizeWikiSearchUrl(url='', playerName=''){
  if(!/Special:Search/i.test(url)) return url || '';
  const cleanName = dedupeDisplayName(playerName).trim();
  if(!cleanName) return url || '';
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(cleanName)}`;
}

function sanitizePlayer(player){
  return {
    ...player,
    name_en: dedupeDisplayName(player?.name_en || ''),
    club_en: dedupeWords(player?.club_en || '').join(' '),
    profile_url: sanitizeWikiSearchUrl(player?.profile_url || '', player?.name_en || '')
  };
}

function mergePlayer(base, override){
  if(!override) return base;
  const merged = {...base};
  ['name_zh','club_zh','photo_url','profile_url','confidence','number','notes','dob'].forEach(key => {
    if(override[key]) merged[key] = override[key];
  });
  if(override.club_en) merged.club_en = override.club_en;
  if(override.position) merged.position = override.position;
  return merged;
}

function applyOfficialRosters(payload){
  if(!payload?.teams?.length) return;
  live.officialRosters = payload;
  const officialByCode = Object.fromEntries(payload.teams.map(t => [t.code, t]));
  TEAMS.forEach(team => {
    const official = officialByCode[team.code];
    if(!official) return;
    team.coach = dedupeDisplayName(team.coach || official.coach || '');
    const manual = originalManualPlayers.get(team.code) || [];
    const sanitizedManual = manual.map(sanitizePlayer);
    const manualByName = new Map(sanitizedManual.map(p => [normalizePlayerName(p.name_en), p]));
    const officialPlayers = (official.players || []).map(p => {
      const sanitized = sanitizePlayer(p);
      return sanitizePlayer(mergePlayer(sanitized, manualByName.get(normalizePlayerName(sanitized.name_en))));
    });
    const officialNames = new Set(officialPlayers.map(p => normalizePlayerName(p.name_en)));
    const manualExtras = sanitizedManual.filter(p => !officialNames.has(normalizePlayerName(p.name_en)));
    team.players = [...officialPlayers, ...manualExtras];
  });
}

function applyTeamMetadata(payload){
  if(!payload?.teams?.length) return;
  live.teamMetadata = payload;
  const metadataByCode = Object.fromEntries(payload.teams.map(t => [t.code, t]));
  TEAMS.forEach(team => {
    const metadata = metadataByCode[team.code];
    if(!metadata) return;
    if(metadata.coach_en) team.coach = dedupeDisplayName(metadata.coach_en);
    if(metadata.coach_zh) team.coach_zh = metadata.coach_zh;
    if(Number.isFinite(metadata.ranking)) team.ranking = String(metadata.ranking);
    if(Number.isFinite(metadata.ranking_points)) team.ranking_points = metadata.ranking_points;
    if(metadata.ranking_updated_at) team.ranking_updated_at = metadata.ranking_updated_at;
  });
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function formatDateTime(value){
  if(!value) return 'TBD';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' });
}

function formatFixtureKickoff(value){
  if(!value) return 'TBD';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(d);
}

function formatCoach(team){
  if(team?.coach && team?.coach_zh) return `${team.coach} / ${team.coach_zh}`;
  return team?.coach || team?.coach_zh || '';
}

function formatRanking(team){
  return team?.ranking ? `#${team.ranking}` : '';
}

function teamRankingValue(team){
  const value = Number.parseInt(String(team?.ranking || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function formatOverallTeamRank(rank, total){
  if(!Number.isFinite(rank)) return 'TBD';
  return `#${rank} / ${total}`;
}

function overallTeamRankMap(){
  const sortByName = (a, b) => a.en.localeCompare(b.en) || a.zh.localeCompare(b.zh) || a.code.localeCompare(b.code);
  const sortByOverallRanking = (a, b) => teamRankingValue(a) - teamRankingValue(b) || a.group.localeCompare(b.group) || sortByName(a, b);
  return new Map(
    TEAMS.slice()
      .sort(sortByOverallRanking)
      .map((team, index) => [team.code, index + 1])
  );
}

function getTeamByName(name=''){
  const normalized = name.toLowerCase();
  return TEAMS.find(t => [t.en, t.code, t.zh].some(v => String(v).toLowerCase() === normalized))
    || TEAMS.find(t => normalized.includes(t.en.toLowerCase()) || t.en.toLowerCase().includes(normalized));
}

function getLocalTeam(team){
  return teamByCode[team?.tla] || getTeamByName(team?.name || team?.shortName || '');
}

function normalizeGroupLabel(value=''){
  const match = String(value).match(/GROUP[_\s-]?([A-Z])/i);
  return match ? match[1].toUpperCase() : value;
}

function teamLabelFromApi(team){
  if(!team) return 'TBD';
  const local = getLocalTeam(team);
  return local ? `${local.en} / ${local.zh}` : (team.shortName || team.name || 'TBD');
}

function teamGroupFromApi(team){
  const local = getLocalTeam(team);
  return local?.group || '';
}

function statusText(status){
  const map = { SCHEDULED:'Scheduled', TIMED:'Scheduled', IN_PLAY:'Live', PAUSED:'Paused', FINISHED:'Finished', POSTPONED:'Postponed', SUSPENDED:'Suspended', CANCELLED:'Cancelled' };
  return map[status] || status || 'TBD';
}

function scoreText(match){
  const ft = match?.score?.fullTime || {};
  const hasScore = Number.isFinite(ft.home) && Number.isFinite(ft.away);
  return hasScore ? `${ft.home}–${ft.away}` : 'vs';
}

function fixtureStatusClass(status=''){
  const value = String(status).toUpperCase();
  if(value === 'FINISHED') return 'finished';
  if(value === 'IN_PLAY' || value === 'PAUSED') return 'live';
  if(value === 'TIMED' || value === 'SCHEDULED') return 'scheduled';
  return 'other';
}

function formatFixtureDateLabel(value){
  if(!value) return 'TBD';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(d);
}

function isTodayFixtureDate(value){
  if(!value) return false;
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

function fixtureTeamMarkup(team){
  const local = getLocalTeam(team);
  const hasRealTeam = Boolean(local?.code || team?.tla || team?.name || team?.shortName);
  const flag = hasRealTeam ? (local?.flag || '') : '';
  const en = hasRealTeam ? (local?.en || team?.shortName || team?.name || 'TBD') : 'TBD';
  const zh = hasRealTeam ? (local?.zh || '') : '待定';
  const code = hasRealTeam ? (local?.code || team?.tla || '') : 'TBD';
  const flagClass = hasRealTeam ? 'fixture-team-flag' : 'fixture-team-flag fixture-team-flag-placeholder';
  return `
    <div class="fixture-team-head">
      <div class="${flagClass}">${escapeHtml(flag || '?')}</div>
      <div class="fixture-team-text">
        <div class="fixture-team-en">${escapeHtml(en)}</div>
        <div class="fixture-team-zh">${escapeHtml(zh)}</div>
      </div>
    </div>
    <div class="fixture-team-code">${escapeHtml(code)}</div>
  `;
}

function fixtureHasLockedTeams(match){
  if(!match) return false;
  const hasLockedTeam = (team) => Boolean(
    team
    && team.id != null
    && (team.tla || team.name || team.shortName)
  );
  return hasLockedTeam(match.homeTeam) && hasLockedTeam(match.awayTeam);
}

function fixtureTeamPlaceholderMarkup(){
  return `
    <div class="fixture-team-head">
      <div class="fixture-team-flag fixture-team-flag-placeholder">?</div>
      <div class="fixture-team-text">
        <div class="fixture-team-en">TBD</div>
        <div class="fixture-team-zh">待定</div>
      </div>
    </div>
    <div class="fixture-team-code">TBD</div>
  `;
}

function fillFilters(){
  groupFilter.innerHTML = '';
  teamFilter.innerHTML = '';
  positionFilter.innerHTML = '';
  groups.forEach(g => {
    const opt = document.createElement('option'); opt.value = g; opt.textContent = `Group ${g} / ${g} 組`; groupFilter.appendChild(opt);
  });
  TEAMS.slice().sort((a,b)=> a.en.localeCompare(b.en)).forEach(t => {
    const opt = document.createElement('option'); opt.value = t.code; opt.textContent = `${t.en} / ${t.zh}`; teamFilter.appendChild(opt);
  });
  uniquePlayerValues('position').forEach(pos => {
    const opt = document.createElement('option'); opt.value = pos; opt.textContent = pos; positionFilter.appendChild(opt);
  });
  setMultiSelectValues(groupFilter, state.groups);
  setMultiSelectValues(teamFilter, state.teams);
  setMultiSelectValues(positionFilter, state.positions);
  refreshAllMultiDropdowns();
}

function fillStageFilter(){
  stageFilter.innerHTML = '';
  const stages = [...new Set((live.matches || []).map(match => match.stage).filter(Boolean))];
  stages.forEach(stage => {
    const opt = document.createElement('option');
    opt.value = stage;
    opt.textContent = formatStageLabel(stage);
    stageFilter.appendChild(opt);
  });
  setMultiSelectValues(stageFilter, state.stages);
  refreshMultiDropdown(stageFilter);
}

function uniquePlayerValues(field){
  return [...new Set(TEAMS.flatMap(t => t.players.map(p => (p[field] || '').trim()).filter(Boolean)))].sort();
}

function playerSearchText(p, t){
  return `${p.name_en} ${p.name_zh} ${p.club_en || p.club || ''} ${p.club_zh || ''} ${p.position} ${p.number} ${p.dob || ''} ${p.confidence} ${p.profile_url || p.source_url || ''} ${t?.en || ''} ${t?.zh || ''} ${t?.code || ''}`.toLowerCase();
}

function playerMatches(p, t){
  const q = state.search.trim().toLowerCase();
  if(!matchesMulti(state.positions, p.position)) return false;
  if(!matchesMulti(state.groups, t?.group)) return false;
  if(!matchesMulti(state.teams, t?.code)) return false;
  if(!q) return true;
  return playerSearchText(p, t).includes(q);
}

function teamMatches(t){
  const q = state.search.trim().toLowerCase();
  const isTeamsView = state.view === 'teams';
  const activeGroups = state.groups;
  const activeTeams = isTeamsView ? [] : state.teams;
  const activePositions = isTeamsView ? [] : state.positions;
  if(!matchesMulti(activeGroups, t.group)) return false;
  if(!matchesMulti(activeTeams, t.code)) return false;
  const playerFiltersActive = activePositions.length > 0;
  const teamTextHit = `${t.en} ${t.zh} ${t.code} ${t.coach || ''} ${t.coach_zh || ''}`.toLowerCase().includes(q);
  const clubHit = q ? t.players.some(p => `${p.club_en || p.club || ''} ${p.club_zh || ''}`.toLowerCase().includes(q)) : false;
  const playerHit = t.players.some(p => {
    if(isTeamsView){
      if(q) return playerSearchText(p, t).includes(q);
      return true;
    }
    return playerMatches(p, t);
  });
  if(playerFiltersActive) return playerHit;
  if(!q) return true;
  return teamTextHit || clubHit || playerHit;
}

function fixtureMatches(m){
  const q = state.search.trim().toLowerCase();
  const homeLocal = teamByCode[m.homeTeam?.tla] || getTeamByName(m.homeTeam?.name || '');
  const awayLocal = teamByCode[m.awayTeam?.tla] || getTeamByName(m.awayTeam?.name || '');
  const group = homeLocal?.group || awayLocal?.group || m.group || '';
  if(!matchesMulti(state.stages, m.stage)) return false;
  if(!matchesMulti(state.groups, group)) return false;
  if(state.teams.length && ![homeLocal?.code, awayLocal?.code, m.homeTeam?.tla, m.awayTeam?.tla].some(code => state.teams.includes(code))) return false;
  if(!q) return true;
  return `${m.stage || ''} ${m.group || ''} ${m.status || ''} ${homeLocal?.en || ''} ${homeLocal?.zh || ''} ${awayLocal?.en || ''} ${awayLocal?.zh || ''} ${m.homeTeam?.name || ''} ${m.awayTeam?.name || ''}`.toLowerCase().includes(q);
}

function hasRealFixtureTeams(match){
  const home = match?.homeTeam;
  const away = match?.awayTeam;
  return Boolean(
    home?.tla || away?.tla
    || home?.name || away?.name
    || home?.shortName || away?.shortName
  );
}

function dedupeFixtures(matches){
  const seen = new Map();
  matches.forEach(match => {
    const key = String(match.id || `${match.utcDate}|${match.homeTeam?.tla || match.homeTeam?.name || 'TBD'}|${match.awayTeam?.tla || match.awayTeam?.name || 'TBD'}|${match.stage || ''}`);
    const current = seen.get(key);
    const currentHasTeams = hasRealFixtureTeams(current);
    const nextHasTeams = hasRealFixtureTeams(match);
    const currentScore = (current?.score?.fullTime?.home ?? -1) + (current?.score?.fullTime?.away ?? -1);
    const nextScore = (match?.score?.fullTime?.home ?? -1) + (match?.score?.fullTime?.away ?? -1);
    if(!current || (nextHasTeams && !currentHasTeams) || nextScore > currentScore){
      seen.set(key, match);
    }
  });
  return [...seen.values()];
}

function fixtureGroupLabel(match){
  const localGroup = teamGroupFromApi(match.homeTeam) || teamGroupFromApi(match.awayTeam);
  const normalizedFeedGroup = normalizeGroupLabel(match.group);
  return localGroup
    ? `Group ${localGroup}`
    : normalizedFeedGroup
      ? `Group ${normalizedFeedGroup}`
      : (match.stage || 'Fixtures');
}

function fixtureStageLabel(match){
  return formatStageLabel(match?.stage || 'Fixtures');
}

function renderFixtureCard(match){
  const placeholder = !hasRealFixtureTeams(match) || (match.stage !== 'GROUP_STAGE' && !fixtureHasLockedTeams(match));
  return `
    <article class="fixture-card ${placeholder ? 'fixture-card-placeholder' : ''}">
      <div class="fixture-card-top">
        <div class="fixture-kickoff">${escapeHtml(formatFixtureKickoff(match.utcDate))}</div>
        <div class="fixture-card-tags">
          <span class="fixture-status ${escapeHtml(fixtureStatusClass(match.status))}">${escapeHtml(statusText(match.status))}</span>
          ${placeholder ? '<span class="fixture-placeholder-badge">Teams TBD</span>' : ''}
        </div>
      </div>
      <div class="fixture-teams">
        <div class="fixture-team">
          ${placeholder ? fixtureTeamPlaceholderMarkup() : fixtureTeamMarkup(match.homeTeam)}
        </div>
        <div class="fixture-score">${escapeHtml(scoreText(match))}</div>
        <div class="fixture-team fixture-team-away">
          ${placeholder ? fixtureTeamPlaceholderMarkup() : fixtureTeamMarkup(match.awayTeam)}
        </div>
      </div>
    </article>
  `;
}

function renderFixtureDateSection(label, matches){
  const isToday = matches.some(match => isTodayFixtureDate(match.utcDate));
  return `
    <details class="fixture-date-block" ${isToday ? 'open' : ''}>
      <summary class="fixture-date-summary">
        <span class="fixture-date-label">${escapeHtml(label)}</span>
        <span class="muted">${matches.length} match${matches.length === 1 ? '' : 'es'}</span>
      </summary>
      <div class="fixture-list">
        ${matches.map(renderFixtureCard).join('')}
      </div>
    </details>
  `;
}

function updateFixtureGroupingButtons(){
  fixtureGroupingButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.mode === state.fixtureGrouping);
  });
}

function filteredPlayers(t){ return t.players.filter(p => playerMatches(p, t)); }

function renderTabs(){
  groupTabs.innerHTML = '';
  [{label:'All / 全部', value:'all'}, ...groups.map(g=>({label:`Group ${g}`, value:g}))].forEach(item => {
    const b = document.createElement('button');
    const active = item.value === 'all' ? state.groups.length === 0 : state.groups.length === 1 && state.groups[0] === item.value;
    b.className = `tab ${active ? 'active':''}`;
    b.textContent = item.label;
    b.onclick = () => {
      state.groups = item.value === 'all' ? [] : [item.value];
      setMultiSelectValues(groupFilter, state.groups);
      render();
    };
    groupTabs.appendChild(b);
  });
}

function renderGrid(){
  const teams = TEAMS.filter(teamMatches);
  if(!teams.length){
    grid.classList.remove('grouped');
    grid.innerHTML = '<div class="empty-roster">No teams match your filters.</div>';
    return;
  }

  const sortMode = state.teamSort;
  const sortByName = (a, b) => a.en.localeCompare(b.en) || a.zh.localeCompare(b.zh) || a.code.localeCompare(b.code);
  const sortByGroupThenName = (a, b) => a.group.localeCompare(b.group) || sortByName(a, b);
  const sortByGroupThenRanking = (a, b) => a.group.localeCompare(b.group) || teamRankingValue(a) - teamRankingValue(b) || sortByName(a, b);
  const sortByOverallRanking = (a, b) => teamRankingValue(a) - teamRankingValue(b) || a.group.localeCompare(b.group) || sortByName(a, b);
  const overallRankByCode = overallTeamRankMap();
  const sortedTeams = teams.slice().sort(
    sortMode === 'overall-ranking'
      ? sortByOverallRanking
      : sortMode === 'group-ranking'
        ? sortByGroupThenRanking
        : sortByGroupThenName
  );

  const cardMarkup = t => `
    <article class="team-card" onclick="selectTeam('${escapeHtml(t.code)}')">
      <div class="team-top"><div class="flag">${escapeHtml(t.flag)}</div><div class="group">Group ${escapeHtml(t.group)}</div></div>
      <h3>${escapeHtml(t.en)}</h3>
      <div class="zh">${escapeHtml(t.zh)}</div>
      <div class="meta">
        <div><strong>Code:</strong> ${escapeHtml(t.code)}</div>
        <div><strong>Ranking:</strong> ${escapeHtml(formatRanking(t) || 'Add FIFA rank')}</div>
        <div><strong>Overall:</strong> ${escapeHtml(formatOverallTeamRank(overallRankByCode.get(t.code), TEAMS.length))}</div>
        <div><strong>Head coach:</strong> ${escapeHtml(formatCoach(t) || 'Add coach')}</div>
      </div>
    </article>`;

  if(sortMode === 'overall-ranking'){
    grid.classList.remove('grouped');
    grid.innerHTML = `
      <section class="team-group-section">
        <div class="fixture-group-head">
          <h3>World ranking / 世界排名</h3>
          <span class="muted">${sortedTeams.length} team${sortedTeams.length === 1 ? '' : 's'}</span>
        </div>
        <div class="team-group-grid">
          ${sortedTeams.map(cardMarkup).join('')}
        </div>
      </section>
    `;
    return;
  }

  if(state.groups.length === 0){
    grid.classList.add('grouped');
    const grouped = groups
      .map(group => [group, sortedTeams.filter(team => team.group === group)])
      .filter(([, groupTeams]) => groupTeams.length);
    grid.innerHTML = grouped.map(([group, groupTeams]) => `
      <section class="team-group-section">
        <div class="fixture-group-head">
          <h3>Group ${escapeHtml(group)}</h3>
          <span class="muted">${groupTeams.length} team${groupTeams.length === 1 ? '' : 's'}${sortMode === 'group-ranking' ? ' · Sorted by world ranking' : ''}</span>
        </div>
        <div class="team-group-grid">
          ${groupTeams.map(cardMarkup).join('')}
        </div>
      </section>
    `).join('');
    return;
  }

  grid.classList.remove('grouped');
  grid.innerHTML = `
    <section class="team-group-section">
      <div class="fixture-group-head">
        <h3>${sortMode === 'group-ranking' ? 'Group ranking order / 小組排名次序' : 'Teams / 球隊'}</h3>
        <span class="muted">${sortedTeams.length} team${sortedTeams.length === 1 ? '' : 's'}${sortMode === 'group-ranking' ? ' · Sorted by world ranking' : ''}</span>
      </div>
      <div class="team-group-grid">
        ${sortedTeams.map(cardMarkup).join('')}
      </div>
    </section>
  `;
}

function closeTeamModal(){
  state.selected = null;
  teamModal.hidden = true;
  document.body.classList.remove('modal-open');
  renderDetails();
}
window.closeTeamModal = closeTeamModal;

function selectTeam(code){
  state.selected = TEAMS.find(t => t.code === code);
  renderDetails();
  teamModal.hidden = false;
  document.body.classList.add('modal-open');
}
window.selectTeam = selectTeam;

function playerPhoto(p){
  const url = p.photo_url || p.photo || '';
  const initial = escapeHtml((p.name_en || '?').slice(0,1));
  if(url){
    return `<div class="photo"><img loading="lazy" src="${escapeHtml(url)}" alt="${escapeHtml(p.name_en)}" onerror="this.parentElement.classList.add('broken'); this.remove(); this.parentElement.textContent='${initial}'"></div>`;
  }
  return `<div class="photo">${initial}</div>`;
}

function photoLinkCell(p){
  const url = p.photo_url || p.photo || '';
  return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open image</a>` : '<span class="muted">No link</span>';
}

function playerNameCell(p){
  const name = escapeHtml(p.name_en || '');
  const url = p.profile_url || p.source_url || p.info_url || '';
  return url ? `<a class="player-link" href="${escapeHtml(url)}" target="_blank" rel="noopener"><strong>${name}</strong></a>` : `<strong>${name}</strong>`;
}

function playerSourceCell(p){
  const url = p.profile_url || p.source_url || p.info_url || '';
  return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open profile</a>` : '<span class="muted">No link</span>';
}

function playerDrawerSummary(p, t, options={}){
  const { showTeam = false, showPosition = true } = options;
  const summaryBits = [];
  if(showTeam && t) summaryBits.push(`${escapeHtml(t.en)} / <span class="zh">${escapeHtml(t.zh)}</span>`);
  if(showPosition && p.position) summaryBits.push(escapeHtml(p.position));
  if(p.number) summaryBits.push(`#${escapeHtml(p.number)}`);
  return `
    <div class="player-drawer-summary-main">
      ${playerPhoto(p)}
      <div class="player-drawer-heading">
        <div class="player-drawer-name"><strong>${escapeHtml(p.name_en || 'Unknown player')}</strong></div>
        ${p.name_zh ? `<div class="player-drawer-zh">${escapeHtml(p.name_zh)}</div>` : ''}
        ${summaryBits.length ? `<div class="player-drawer-summary-meta">${summaryBits.map(bit => `<span class="player-drawer-chip">${bit}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `;
}

function playerDrawerDetails(p, t, options={}){
  const { showTeam = false, showPosition = true } = options;
  const dob = formatPlayerDob(p);
  const clubEn = p.club_en || p.club || '';
  const detailItems = [];
  if(showTeam && t) detailItems.push(['Team', `${escapeHtml(t.en)} / <span class="zh">${escapeHtml(t.zh)}</span>`]);
  if(showPosition) detailItems.push(['Position', escapeHtml(p.position || 'TBD')]);
  if(p.number) detailItems.push(['Number', `#${escapeHtml(p.number)}`]);
  if(dob) detailItems.push(['DOB (Age)', escapeHtml(dob)]);
  detailItems.push(['Club EN', escapeHtml(clubEn || 'TBD')]);
  if(p.club_zh) detailItems.push(['Club zh-HK', `<span class="zh">${escapeHtml(p.club_zh)}</span>`]);
  if(p.profile_url || p.source_url || p.info_url) detailItems.push(['Profile', playerSourceCell(p)]);
  return `
    <div class="player-drawer-detail-grid">
      ${detailItems.map(([label, value]) => `
        <div class="player-drawer-detail">
          <span class="player-drawer-detail-label">${label}</span>
          <span class="player-drawer-detail-value">${value}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function playerDrawer(p, t, options={}){
  return `
    <details class="player-drawer">
      <summary class="player-drawer-summary">
        ${playerDrawerSummary(p, t, options)}
      </summary>
      <div class="player-drawer-body">
        ${playerDrawerDetails(p, t, options)}
      </div>
    </details>
  `;
}

function parsePlayerDob(value=''){
  const text = String(value || '').trim();
  if(!text) return null;
  const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(slashMatch){
    const [, dayText, monthText, yearText] = slashMatch;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(year, month - 1, day);
    if(date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day){
      return date;
    }
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(isoMatch){
    const [, yearText, monthText, dayText] = isoMatch;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(year, month - 1, day);
    if(date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day){
      return date;
    }
  }
  return null;
}

function formatPlayerDob(p){
  const rawDob = String(p?.dob || '').trim();
  if(!rawDob) return '';
  const date = parsePlayerDob(rawDob);
  if(!date) return rawDob;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const hadBirthday = today.getMonth() > date.getMonth()
    || (today.getMonth() === date.getMonth() && today.getDate() >= date.getDate());
  if(!hadBirthday) age -= 1;
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
  return age >= 0 ? `${formattedDate} (${age})` : formattedDate;
}

function groupPlayersByPosition(players){
  const order = ['GK', 'DF', 'MF', 'FW'];
  const grouped = new Map();
  players.forEach(player => {
    const key = player.position || 'Other';
    if(!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(player);
  });
  return [...grouped.entries()].sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    if(ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
    if(ai === -1) return 1;
    if(bi === -1) return -1;
    return ai - bi;
  });
}

function filteredPlayerEntries(){
  return TEAMS.flatMap(team => team.players
    .filter(player => playerMatches(player, team))
    .map(player => ({ player, team })))
    .sort((a, b) => a.team.group.localeCompare(b.team.group)
      || a.team.en.localeCompare(b.team.en)
      || (a.player.position || '').localeCompare(b.player.position || '')
      || (a.player.name_en || '').localeCompare(b.player.name_en || ''));
}

function playerCardMedia(p, innerMarkup=''){
  const url = p.photo_url || p.photo || '';
  const initial = escapeHtml((p.name_en || '?').slice(0,1));
  return `
    <div class="player-card-media ${url ? 'has-photo' : 'no-photo'}">
      ${url ? `<img class="player-card-media-backdrop" loading="lazy" src="${escapeHtml(url)}" alt="" aria-hidden="true" onerror="this.remove()">` : ''}
      ${url ? `<img class="player-card-media-photo" loading="lazy" src="${escapeHtml(url)}" alt="${escapeHtml(p.name_en)}" onerror="this.parentElement.classList.remove('has-photo'); this.parentElement.classList.add('no-photo'); this.remove()">` : ''}
      <div class="player-card-fallback" aria-hidden="true">${initial}</div>
      <div class="player-card-media-scrim"></div>
      <div class="player-card-content">
        ${innerMarkup}
      </div>
    </div>
  `;
}

function playerCard(p, t, options={}){
  const { showTeam = false, showPosition = true } = options;
  const clubEn = p.club_en || p.club || '';
  const clubZh = p.club_zh || '';
  const dob = formatPlayerDob(p);
  const detailItems = [];
  if(p.number) detailItems.push(`<div class="player-card-detail"><span class="player-card-label">Number</span><span class="player-card-value">#${escapeHtml(p.number)}</span></div>`);
  if(showPosition) detailItems.push(`<div class="player-card-detail"><span class="player-card-label">Position</span><span class="player-card-value">${escapeHtml(p.position || 'TBD')}</span></div>`);
  if(dob) detailItems.push(`<div class="player-card-detail"><span class="player-card-label">DOB (Age)</span><span class="player-card-value">${escapeHtml(dob)}</span></div>`);
  detailItems.push(`<div class="player-card-detail"><span class="player-card-label">Club</span><span class="player-card-value">${escapeHtml(clubEn || 'TBD')}${clubZh ? ` / <span class="zh">${escapeHtml(clubZh)}</span>` : ''}</span></div>`);
  return `
    <article class="player-card">
      ${playerCardMedia(p, `
        <div class="player-card-heading">
          <div class="player-card-name">${playerNameCell(p)}</div>
          ${p.name_zh ? `<div class="player-card-zh">${escapeHtml(p.name_zh)}</div>` : ''}
          ${showTeam && t ? `<div class="player-card-team">${escapeHtml(t.en)} / <span class="zh">${escapeHtml(t.zh)}</span></div>` : ''}
        </div>
        <div class="player-card-meta player-card-meta-list">
          ${detailItems.join('')}
        </div>
      `)}
    </article>
  `;
}

function renderDetails(){
  const t = state.selected;
  if(!t){ details.className='details-empty'; details.textContent='Choose a team card to see roster details. / 選擇一隊查看名單詳情。'; return; }
  details.className = '';
  const overallRankByCode = overallTeamRankMap();
  const shownPlayers = filteredPlayers(t);
  const groupedPlayers = groupPlayersByPosition(shownPlayers);
  const groupedContent = groupedPlayers.map(([position, players]) => `
    <section class="team-position-group">
      <div class="fixture-group-head">
        <h3>${escapeHtml(position)}</h3>
        <span class="muted">${players.length} player${players.length === 1 ? '' : 's'}</span>
      </div>
      ${state.playerView === 'grid'
        ? `<div class="player-card-grid">${players.map(player => playerCard(player, t, { showPosition:false })).join('')}</div>`
        : `<div class="player-drawer-list">${players.map(player => playerDrawer(player, t, { showPosition:false })).join('')}</div>`}
    </section>
  `).join('');
  details.innerHTML = `
    <div class="team-detail-head">
      <div class="flag">${escapeHtml(t.flag)}</div>
      <div>
        <h2>${escapeHtml(t.en)} / <span class="zh">${escapeHtml(t.zh)}</span></h2>
        <span class="badge">Group ${escapeHtml(t.group)}</span><span class="badge">${escapeHtml(t.code)}</span><span class="badge">Rank: ${escapeHtml(formatRanking(t) || 'TBD')}</span><span class="badge">Overall: ${escapeHtml(formatOverallTeamRank(overallRankByCode.get(t.code), TEAMS.length))}</span><span class="badge">Coach: ${escapeHtml(formatCoach(t) || 'TBD')}</span>
      </div>
    </div>
    ${t.players.length ? `${renderPlayerViewToggle('Roster layout / 名單版面')}<div class="filter-note">Showing ${shownPlayers.length} of ${t.players.length} players based on current filters, grouped by position.</div>${groupedContent || '<div class="empty-roster">No players match these filters.</div>'}` : `<div class="empty-roster">Roster data is ready to add in <code>data.js</code>. Add <code>dob</code> as <code>DD/MM/YYYY</code>, <code>photo_url</code> for the player image, and <code>profile_url</code> for the player info/source page. Use <code>club_en</code> and <code>club_zh</code> for club names.</div>`}
  `;
}

function renderAllPlayers(){
  const entries = filteredPlayerEntries();
  const teamCount = new Set(entries.map(entry => entry.team.code)).size;
  const content = state.playerView === 'grid'
    ? (entries.length
      ? `<div class="player-card-grid">${entries.map(({ player, team }) => playerCard(player, team, { showTeam:true })).join('')}</div>`
      : '<div class="empty-roster">No players match these filters, or rosters are not added yet.</div>')
    : (entries.length
      ? `<div class="player-drawer-list">${entries.map(({ player, team }) => playerDrawer(player, team, { showTeam:true })).join('')}</div>`
      : '<div class="empty-roster">No players match these filters, or rosters are not added yet.</div>');
  document.querySelector('#allPlayers').innerHTML = `
    ${renderPlayerViewToggle('Player layout / 球員版面')}
    <div class="filter-note">Showing ${entries.length} player${entries.length === 1 ? '' : 's'} across ${teamCount} team${teamCount === 1 ? '' : 's'}.</div>
    ${content}
  `;
}

function renderFixtures(){
  const matches = dedupeFixtures(live.matches).filter(fixtureMatches).sort((a,b)=> new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
  if(!live.matches.length){
    document.querySelector('#fixtures').innerHTML = `<div class="empty-roster">No live fixture JSON found yet. Run the GitHub Action after adding your football-data.org token.</div>`;
    return;
  }
  if(!matches.length){
    document.querySelector('#fixtures').innerHTML = '<div class="empty-roster">No fixtures match these filters.</div>';
    return;
  }
  const byStage = new Map();
  matches.forEach(match => {
    const stageLabel = fixtureStageLabel(match);
    if(!byStage.has(stageLabel)) byStage.set(stageLabel, []);
    byStage.get(stageLabel).push(match);
  });

  document.querySelector('#fixtures').innerHTML = [...byStage.entries()].map(([stageLabel, stageMatches]) => {
    if(state.fixtureGrouping === 'group-date'){
      const grouped = new Map();
      stageMatches.forEach(match => {
        const label = fixtureGroupLabel(match);
        if(!grouped.has(label)) grouped.set(label, []);
        grouped.get(label).push(match);
      });
      return `
      <details class="fixture-stage" open>
        <summary class="fixture-stage-head">
          <h3>${escapeHtml(stageLabel)}</h3>
          <span class="muted">${stageMatches.length} match${stageMatches.length === 1 ? '' : 'es'}</span>
        </summary>
        ${[...grouped.entries()].map(([label, groupMatches]) => `
    <section class="fixture-group">
      <div class="fixture-group-head">
        <h4>${escapeHtml(label)}</h4>
        <span class="muted">${groupMatches.length} match${groupMatches.length === 1 ? '' : 'es'}</span>
      </div>
      ${Object.entries(groupMatches.reduce((acc, match) => {
        const dateKey = formatFixtureDateLabel(match.utcDate);
        if(!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(match);
        return acc;
      }, {})).map(([dateLabel, dateMatches]) => renderFixtureDateSection(dateLabel, dateMatches)).join('')}
    </section>
  `).join('')}
      </details>`;
    }

    const groupedByDate = new Map();
    stageMatches.forEach(match => {
      const dateLabel = formatFixtureDateLabel(match.utcDate);
      if(!groupedByDate.has(dateLabel)) groupedByDate.set(dateLabel, []);
      groupedByDate.get(dateLabel).push(match);
    });

    return `
      <details class="fixture-stage" open>
        <summary class="fixture-stage-head">
          <h3>${escapeHtml(stageLabel)}</h3>
          <span class="muted">${stageMatches.length} match${stageMatches.length === 1 ? '' : 'es'}</span>
        </summary>
        ${[...groupedByDate.entries()].map(([dateLabel, dateMatches]) => {
          const byGroup = new Map();
          dateMatches.forEach(match => {
            const label = fixtureGroupLabel(match);
            if(!byGroup.has(label)) byGroup.set(label, []);
            byGroup.get(label).push(match);
          });
          return `
    <details class="fixture-date-block" ${dateMatches.some(match => isTodayFixtureDate(match.utcDate)) ? 'open' : ''}>
      <summary class="fixture-group-head fixture-date-summary">
        <h4>${escapeHtml(dateLabel)}</h4>
        <span class="muted">${dateMatches.length} match${dateMatches.length === 1 ? '' : 'es'}</span>
      </summary>
      ${[...byGroup.entries()].map(([groupLabel, groupMatches]) => `
        <div class="fixture-date-block">
          <div class="fixture-date-label">${escapeHtml(groupLabel)}</div>
          <div class="fixture-list">
            ${groupMatches.map(renderFixtureCard).join('')}
          </div>
        </div>
      `).join('')}
    </details>`;
        }).join('')}
      </details>`;
  }).join('');
}

function renderStandings(){
  const container = document.querySelector('#standings');
  const tables = live.standings?.standings || [];
  if(!tables.length){
    container.innerHTML = `<div class="empty-roster">No standings JSON found yet. Run the GitHub Action after adding your football-data.org token. The site will read <code>data/live-standings.json</code>.</div>`;
    return;
  }
  const q = state.search.trim().toLowerCase();
  const rows = tables.flatMap(table => (table.table || []).map(row => ({ ...row, sourceGroup: table.group, sourceStage: table.stage })));
  const grouped = new Map();
  const rowStrength = row => {
    return ((row.points ?? 0) * 1000000)
      + ((row.playedGames ?? 0) * 10000)
      + (((row.goalDifference ?? 0) + 1000) * 100)
      + (row.goalsFor ?? 0);
  };
  const sameStandingRecord = (a, b) => {
    if(!a || !b) return false;
    return (a.points ?? 0) === (b.points ?? 0)
      && (a.playedGames ?? 0) === (b.playedGames ?? 0)
      && (a.won ?? 0) === (b.won ?? 0)
      && (a.draw ?? 0) === (b.draw ?? 0)
      && (a.lost ?? 0) === (b.lost ?? 0)
      && (a.goalsFor ?? 0) === (b.goalsFor ?? 0)
      && (a.goalsAgainst ?? 0) === (b.goalsAgainst ?? 0)
      && (a.goalDifference ?? 0) === (b.goalDifference ?? 0);
  };

  rows.forEach(row => {
    const local = getLocalTeam(row.team);
    const groupKey = local?.group || normalizeGroupLabel(row.sourceGroup) || row.sourceStage || 'Standings';
    const groupLabel = groupKey.length === 1 ? `Group ${groupKey}` : groupKey;
    if(state.groups.length && !state.groups.includes(local?.group) && !state.groups.some(group => String(groupLabel).includes(group))) return;
    if(state.teams.length && !state.teams.includes(row.team?.tla) && !state.teams.includes(local?.code)) return;
    if(q && !`${row.team?.name || ''} ${row.team?.tla || ''} ${local?.en || ''} ${local?.zh || ''} ${groupLabel}`.toLowerCase().includes(q)) return;
    if(!grouped.has(groupLabel)) grouped.set(groupLabel, new Map());
    const groupMap = grouped.get(groupLabel);
    const teamKey = local?.code || row.team?.tla || row.team?.name || '';
    if(!teamKey) return;
    const current = groupMap.get(teamKey);
    if(!current || rowStrength(row) > rowStrength(current.row)){
      groupMap.set(teamKey, { row, local });
    }
  });

  container.innerHTML = [...grouped.entries()]
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([groupLabel, entryMap]) => {
      const sorted = [...entryMap.values()].sort((a,b) => {
        return (b.row.points ?? 0) - (a.row.points ?? 0)
          || (b.row.goalDifference ?? 0) - (a.row.goalDifference ?? 0)
          || (b.row.goalsFor ?? 0) - (a.row.goalsFor ?? 0)
          || (a.local?.en || '').localeCompare(b.local?.en || '');
      });
      const body = sorted.map((entry, index) => {
        const previous = sorted[index - 1];
        const displayRank = previous && sameStandingRecord(entry.row, previous.row) ? previous.displayRank : index + 1;
        entry.displayRank = displayRank;
        return `<tr>
        <td>${escapeHtml(displayRank)}</td>
        <td>${escapeHtml(teamLabelFromApi(entry.row.team))}</td>
        <td>${escapeHtml(entry.row.points ?? '')}</td>
        <td>${escapeHtml(entry.row.playedGames ?? '')}</td>
        <td>${escapeHtml(entry.row.won ?? '')}</td>
        <td>${escapeHtml(entry.row.draw ?? '')}</td>
        <td>${escapeHtml(entry.row.lost ?? '')}</td>
        <td>${escapeHtml(entry.row.goalsFor ?? '')}</td>
        <td>${escapeHtml(entry.row.goalsAgainst ?? '')}</td>
        <td>${escapeHtml(entry.row.goalDifference ?? '')}</td>
      </tr>`;
      }).join('');
      return `<section class="standings-group"><h3>${escapeHtml(groupLabel)}</h3><div class="table-wrap"><table class="standings-table"><colgroup><col style="width:6%"><col style="width:28%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:10%"></colgroup><thead><tr><th>#</th><th>Team</th><th>Pts</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
    }).join('') || '<div class="empty-roster">No standings match these filters.</div>';
}

function renderStatus(){
  const updated = live.meta?.updatedAt ? formatDateTime(live.meta.updatedAt) : 'Not updated yet';
  const source = live.meta?.source || 'football-data.org';
  const rosterUpdated = live.officialRosters?.updatedAt ? formatDateTime(live.officialRosters.updatedAt) : 'Not imported yet';
  const teamMetadataUpdated = live.teamMetadata?.updatedAt ? formatDateTime(live.teamMetadata.updatedAt) : 'Not imported yet';
  const rosterPlayers = TEAMS.reduce((sum,t)=>sum+(t.players?.length || 0),0);
  liveStatus.innerHTML = `<strong>Fixtures/standings:</strong> ${escapeHtml(updated)} <span class="muted">Source: ${escapeHtml(source)}</span><br><strong>Official rosters:</strong> ${escapeHtml(rosterUpdated)} <span class="muted">${rosterPlayers} players loaded</span><br><strong>Team metadata:</strong> ${escapeHtml(teamMetadataUpdated)}`;
}

function syncTeamsViewControls(){
  if(state.view !== 'teams') return;
  state.teams = [];
  state.positions = [];
  setMultiSelectValues(teamFilter, state.teams);
  setMultiSelectValues(positionFilter, state.positions);
}

function updateControlVisibility(){
  const hideForTeams = state.view === 'teams';
  controls?.classList.toggle('teams-mode', hideForTeams);
  teamHiddenControls.forEach(control => {
    control.hidden = hideForTeams;
    if(control.tagName === 'SELECT') refreshMultiDropdown(control);
  });
  teamVisibleControls.forEach(control => {
    control.hidden = !hideForTeams;
  });
  if(state.view === 'standings' || state.view === 'fixtures'){
    state.positions = [];
    setMultiSelectValues(positionFilter, state.positions);
  }
  positionFilter.hidden = state.view === 'teams' || state.view === 'standings' || state.view === 'fixtures';
  stageFilter.hidden = state.view !== 'fixtures';
  if(state.view !== 'fixtures'){
    state.stages = [];
    setMultiSelectValues(stageFilter, state.stages);
  }
  refreshMultiDropdown(positionFilter);
  refreshMultiDropdown(stageFilter);
}

function setView(view){
  state.view = view;
  syncTeamsViewControls();
  updateControlVisibility();
  document.querySelectorAll('.view-tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector(`#${view}View`).classList.add('active');
  render();
}

function render(){
  renderTabs(); renderGrid(); renderDetails(); renderAllPlayers(); renderStandings(); renderFixtures(); renderStatus();
  updatePlayerViewToggleButtons();
}

async function loadJson(path, fallback){
  try{
    const res = await fetch(path, { cache:'no-store' });
    if(!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  }catch(err){ return fallback; }
}

async function loadLiveData(){
  const teamMetadata = await loadJson('data/team-metadata.json', null);
  applyTeamMetadata(teamMetadata);
  const rosters = await loadJson('data/official-rosters.json', null);
  applyOfficialRosters(rosters);
  live.matches = await loadJson('data/live-matches.json', []);
  live.standings = await loadJson('data/live-standings.json', null);
  live.teamsApi = await loadJson('data/live-teams-api.json', []);
  live.meta = await loadJson('data/live-meta.json', null);
  fillFilters();
  fillStageFilter();
  render();
}

fillFilters();
fillStageFilter();
updateControlVisibility();
updateFixtureGroupingButtons();
refreshAllMultiDropdowns();
document.querySelectorAll('.view-tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
fixtureGroupingButtons.forEach(button => button.addEventListener('click', () => {
  state.fixtureGrouping = button.dataset.mode || 'date-group';
  updateFixtureGroupingButtons();
  renderFixtures();
}));
teamModalClose?.addEventListener('click', closeTeamModal);
teamModal?.addEventListener('click', event => {
  if(event.target instanceof HTMLElement && event.target.dataset.closeTeamModal === 'true'){
    closeTeamModal();
  }
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && !teamModal?.hidden){
    closeTeamModal();
  }
});
search.addEventListener('input', e => { state.search = e.target.value; render(); });
teamSort?.addEventListener('change', e => {
  state.teamSort = e.target.value || 'group-alpha';
  renderGrid();
});
groupFilter.addEventListener('change', e => { state.groups = getMultiSelectValues(e.target); render(); });
teamFilter.addEventListener('change', e => { state.teams = getMultiSelectValues(e.target); render(); });
positionFilter.addEventListener('change', e => { state.positions = getMultiSelectValues(e.target); render(); });
stageFilter.addEventListener('change', e => { state.stages = getMultiSelectValues(e.target); renderFixtures(); });
document.addEventListener('click', event => {
  const trigger = event.target.closest('.multi-dropdown-trigger');
  const checkbox = event.target.closest('.multi-dropdown-option input');
  if(trigger){
    const wrapper = trigger.closest('.multi-dropdown');
    const sourceId = wrapper?.dataset.sourceId || '';
    const isOpen = wrapper?.classList.contains('open');
    closeAllMultiDropdowns(isOpen ? '' : sourceId);
    if(wrapper && !isOpen){
      wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      const menu = wrapper.querySelector('.multi-dropdown-menu');
      if(menu) menu.hidden = false;
    }
    return;
  }
  if(checkbox){
    const wrapper = checkbox.closest('.multi-dropdown');
    const sourceId = wrapper?.dataset.sourceId || '';
    const select = document.querySelector(`#${sourceId}`);
    if(!select) return;
    if(checkbox.dataset.role === 'clear'){
      setMultiSelectValues(select, []);
    }else{
      const next = new Set(getMultiSelectValues(select));
      if(checkbox.checked) next.add(checkbox.value);
      else next.delete(checkbox.value);
      setMultiSelectValues(select, [...next]);
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
    refreshMultiDropdown(select);
    if(wrapper) wrapper.classList.add('open');
    const menu = wrapper?.querySelector('.multi-dropdown-menu');
    if(menu) menu.hidden = false;
    return;
  }
  if(!event.target.closest('.multi-dropdown')){
    closeAllMultiDropdowns();
  }
});
document.querySelector('#resetBtn').onclick = () => {
  state.groups=[]; state.teams=[]; state.positions=[]; state.stages=[]; state.search=''; state.selected=null;
  search.value='';
  setMultiSelectValues(groupFilter, state.groups);
  setMultiSelectValues(teamFilter, state.teams);
  setMultiSelectValues(positionFilter, state.positions);
  setMultiSelectValues(stageFilter, state.stages);
  render();
};
render();
loadLiveData();
