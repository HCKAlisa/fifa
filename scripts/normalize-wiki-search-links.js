#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROSTERS_PATH = path.join(ROOT, 'data', 'official-rosters.json');

function normalizeName(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
    const last = normalizeName(words[words.length - 1]).replace(/\s+/g, '');
    const prevTwo = normalizeName(`${words[words.length - 3] || ''} ${words[words.length - 2] || ''}`.trim()).replace(/\s+/g, '');
    if(last && prevTwo && last === prevTwo){
      words.splice(words.length - 3, 2);
    }
  }
  return words.join(' ');
}

function normalizeSearchUrl(url='', playerName=''){
  if(!/Special:Search/.test(url)) return url;
  try{
    const parsed = new URL(url);
    const normalized = tidyPlayerName(playerName || '');
    if(normalized) parsed.searchParams.set('search', normalized);
    return parsed.toString();
  }catch{
    const encoded = encodeURIComponent(tidyPlayerName(playerName || ''));
    return encoded ? `https://en.wikipedia.org/wiki/Special:Search?search=${encoded}` : String(url).replace(/%20footballer(?=(?:&|$))/i, '');
  }
}

function main(){
  const rosters = JSON.parse(fs.readFileSync(ROSTERS_PATH, 'utf8'));
  let updated = 0;
  for(const team of rosters.teams || []){
    for(const player of team.players || []){
      const next = normalizeSearchUrl(player.profile_url || '', player.name_en || '');
      if(next !== player.profile_url){
        player.profile_url = next;
        updated++;
      }
    }
  }
  rosters.updatedAt = new Date().toISOString();
  fs.writeFileSync(ROSTERS_PATH, JSON.stringify(rosters, null, 2) + '\n');
  console.log(JSON.stringify({ updated }, null, 2));
}

main();
