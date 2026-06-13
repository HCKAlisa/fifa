// FIFA World Cup 2026 roster tracker data
// Edit this file to add official roster/player/photo data.
// Use Hong Kong Traditional Chinese names for all zh / zh-HK fields.
// Source suggestions:
// - Official FIFA team pages: https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams
// - Official squad PDF: https://fdp.fifa.org/assetspublic/ce281/pdf/SquadLists-English.pdf
// - FIFA ranking: https://inside.fifa.com/fifa-world-ranking/men
// For each player, use profile_url for the info/source page you trust. Examples: Wikipedia, FIFA profile, Transfermarkt, Soccerway.

window.TEAMS = [
  {group:'A', en:'Mexico', zh:'墨西哥', code:'MEX', flag:'🇲🇽', coach:'', ranking:'', players:[]},
  {group:'A', en:'South Africa', zh:'南非', code:'RSA', flag:'🇿🇦', coach:'', ranking:'', players:[]},
  {group:'A', en:'South Korea', zh:'南韓', code:'KOR', flag:'🇰🇷', coach:'', ranking:'', players:[]},
  {group:'A', en:'Czechia', zh:'捷克', code:'CZE', flag:'🇨🇿', coach:'', ranking:'', players:[]},
  {group:'B', en:'Canada', zh:'加拿大', code:'CAN', flag:'🇨🇦', coach:'', ranking:'', players:[
    {name_en:'Example Player', name_zh:'範例球員', position:'FW', number:'', dob:'02/04/1998', club_en:'Example FC', club_zh:'範例足球會', photo_url:'https://placehold.co/120x120?text=Player', profile_url:'https://en.wikipedia.org/wiki/Main_Page', confidence:'Example only'}
  ]},
  {group:'B', en:'Bosnia and Herzegovina', zh:'波斯尼亞和黑塞哥維那', code:'BIH', flag:'🇧🇦', coach:'', ranking:'', players:[]},
  {group:'B', en:'Qatar', zh:'卡塔爾', code:'QAT', flag:'🇶🇦', coach:'', ranking:'', players:[]},
  {group:'B', en:'Switzerland', zh:'瑞士', code:'SUI', flag:'🇨🇭', coach:'', ranking:'', players:[]},
  {group:'C', en:'Brazil', zh:'巴西', code:'BRA', flag:'🇧🇷', coach:'', ranking:'', players:[]},
  {group:'C', en:'Morocco', zh:'摩洛哥', code:'MAR', flag:'🇲🇦', coach:'', ranking:'', players:[]},
  {group:'C', en:'Haiti', zh:'海地', code:'HTI', flag:'🇭🇹', coach:'', ranking:'', players:[]},
  {group:'C', en:'Scotland', zh:'蘇格蘭', code:'SCO', flag:'🏴', coach:'', ranking:'', players:[]},
  {group:'D', en:'United States', zh:'美國', code:'USA', flag:'🇺🇸', coach:'', ranking:'', players:[]},
  {group:'D', en:'Paraguay', zh:'巴拉圭', code:'PAR', flag:'🇵🇾', coach:'', ranking:'', players:[]},
  {group:'D', en:'Australia', zh:'澳洲', code:'AUS', flag:'🇦🇺', coach:'', ranking:'', players:[]},
  {group:'D', en:'Turkey', zh:'土耳其', code:'TUR', flag:'🇹🇷', coach:'', ranking:'', players:[]},
  {group:'E', en:'Germany', zh:'德國', code:'GER', flag:'🇩🇪', coach:'', ranking:'', players:[]},
  {group:'E', en:'Curaçao', zh:'庫拉索', code:'CUW', flag:'🇨🇼', coach:'', ranking:'', players:[]},
  {group:'E', en:'Ivory Coast', zh:'科特迪瓦', code:'CIV', flag:'🇨🇮', coach:'', ranking:'', players:[]},
  {group:'E', en:'Ecuador', zh:'厄瓜多爾', code:'ECU', flag:'🇪🇨', coach:'', ranking:'', players:[]},
  {group:'F', en:'Netherlands', zh:'荷蘭', code:'NED', flag:'🇳🇱', coach:'', ranking:'', players:[]},
  {group:'F', en:'Japan', zh:'日本', code:'JPN', flag:'🇯🇵', coach:'', ranking:'', players:[]},
  {group:'F', en:'Sweden', zh:'瑞典', code:'SWE', flag:'🇸🇪', coach:'', ranking:'', players:[]},
  {group:'F', en:'Tunisia', zh:'突尼西亞', code:'TUN', flag:'🇹🇳', coach:'', ranking:'', players:[]},
  {group:'G', en:'Belgium', zh:'比利時', code:'BEL', flag:'🇧🇪', coach:'', ranking:'', players:[]},
  {group:'G', en:'Egypt', zh:'埃及', code:'EGY', flag:'🇪🇬', coach:'', ranking:'', players:[]},
  {group:'G', en:'IR Iran', zh:'伊朗', code:'IRI', flag:'🇮🇷', coach:'', ranking:'', players:[]},
  {group:'G', en:'New Zealand', zh:'新西蘭', code:'NZL', flag:'🇳🇿', coach:'', ranking:'', players:[]},
  {group:'H', en:'Spain', zh:'西班牙', code:'ESP', flag:'🇪🇸', coach:'', ranking:'', players:[]},
  {group:'H', en:'Cape Verde', zh:'佛得角', code:'CPV', flag:'🇨🇻', coach:'', ranking:'', players:[]},
  {group:'H', en:'Saudi Arabia', zh:'沙地阿拉伯', code:'KSA', flag:'🇸🇦', coach:'', ranking:'', players:[]},
  {group:'H', en:'Uruguay', zh:'烏拉圭', code:'URU', flag:'🇺🇾', coach:'', ranking:'', players:[]},
  {group:'I', en:'France', zh:'法國', code:'FRA', flag:'🇫🇷', coach:'', ranking:'', players:[]},
  {group:'I', en:'Senegal', zh:'塞內加爾', code:'SEN', flag:'🇸🇳', coach:'', ranking:'', players:[]},
  {group:'I', en:'Iraq', zh:'伊拉克', code:'IRQ', flag:'🇮🇶', coach:'', ranking:'', players:[]},
  {group:'I', en:'Norway', zh:'挪威', code:'NOR', flag:'🇳🇴', coach:'', ranking:'', players:[]},
  {group:'J', en:'Argentina', zh:'阿根廷', code:'ARG', flag:'🇦🇷', coach:'', ranking:'', players:[]},
  {group:'J', en:'Algeria', zh:'阿爾及利亞', code:'DZA', flag:'🇩🇿', coach:'', ranking:'', players:[]},
  {group:'J', en:'Austria', zh:'奧地利', code:'AUT', flag:'🇦🇹', coach:'', ranking:'', players:[]},
  {group:'J', en:'Jordan', zh:'約旦', code:'JOR', flag:'🇯🇴', coach:'', ranking:'', players:[]},
  {group:'K', en:'Portugal', zh:'葡萄牙', code:'POR', flag:'🇵🇹', coach:'', ranking:'', players:[]},
  {group:'K', en:'DR Congo', zh:'剛果民主共和國', code:'COD', flag:'🇨🇩', coach:'', ranking:'', players:[]},
  {group:'K', en:'Uzbekistan', zh:'烏茲別克', code:'UZB', flag:'🇺🇿', coach:'', ranking:'', players:[]},
  {group:'K', en:'Colombia', zh:'哥倫比亞', code:'COL', flag:'🇨🇴', coach:'', ranking:'', players:[]},
  {group:'L', en:'England', zh:'英格蘭', code:'ENG', flag:'🏴', coach:'', ranking:'', players:[]},
  {group:'L', en:'Croatia', zh:'克羅地亞', code:'CRO', flag:'🇭🇷', coach:'', ranking:'', players:[]},
  {group:'L', en:'Ghana', zh:'加納', code:'GHA', flag:'🇬🇭', coach:'', ranking:'', players:[]},
  {group:'L', en:'Panama', zh:'巴拿馬', code:'PAN', flag:'🇵🇦', coach:'', ranking:'', players:[]},
];
