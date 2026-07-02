// Canonical Shape Score tier-color palette — ONE source of truth for the website
// surfaces (the mobile app's BS_TIER_COLORS in iosAppBroadsheetClient.jsx holds
// the same values; keep the two in sync). Window-exposed so any babel-standalone
// page that loads this script can read the same map. Each consumer also keeps a
// local fallback to these exact values, so a page that hasn't loaded this module
// still renders the canonical colors (no hard load-order dependency).
//
//   Member ladder: Raw → Tempo → Form → Peak → Legend
//   Coach ladder:  Certified → Pro → Elite → Master → Icon
//                  (teal — the logo color — crowns the coach ladder at Icon)
(function () {
  var MEMBER = { raw: '#5fa96e', base: '#5fa96e', tempo: '#d8a23a', form: '#e0463c', peak: '#8fe3e6', legend: '#34d6c5' };
  var COACH = { certified: '#5fa96e', pro: '#d8a23a', elite: '#e0463c', master: '#8fe3e6', icon: '#34d6c5' };
  function tierColor(tier, isCoach) {
    var map = isCoach ? COACH : MEMBER;
    return map[String(tier || '').toLowerCase()] || '#d8a23a';
  }
  function tierColorByPoints(pts, isCoach) {
    var p = Number(pts) || 0;
    if (p >= 15000) return isCoach ? COACH.icon : MEMBER.legend;
    if (p >= 5000) return isCoach ? COACH.master : MEMBER.peak;
    if (p >= 2000) return isCoach ? COACH.elite : MEMBER.form;
    if (p >= 750) return isCoach ? COACH.pro : MEMBER.tempo;
    return isCoach ? COACH.certified : MEMBER.raw;
  }
  if (typeof window !== 'undefined') {
    window.SHAPE_TIER_COLORS = { member: MEMBER, coach: COACH };
    window.tierColor = tierColor;
    window.tierColorByPoints = tierColorByPoints;
  }
})();
