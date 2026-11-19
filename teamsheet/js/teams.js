/*
 * Fair team picker.
 *
 * Input: the confirmed players, each { id, skill (1-5), is_keeper }.
 * Output: two teams whose total skill is as equal as possible, with one
 * keeper on each side when there are keepers to go round.
 *
 * How it works: put a keeper on each side, then try EVERY way of
 * splitting the outfield players (for 10 players that is only 70 ways)
 * and keep the splits with the smallest skill difference. If several are
 * equally fair, pick one at random, so "Reshuffle" gives new teams.
 */
(function (root) {
  'use strict';

  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sum(list) {
    return list.reduce(function (t, p) { return t + (Number(p.skill) || 3); }, 0);
  }

  // Number of ways to choose k from n (to know when to stop enumerating).
  function choose(n, k) {
    var r = 1;
    for (var i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return r;
  }

  // Calls fn(indices) for every k-sized subset of 0..n-1.
  function eachSubset(n, k, fn) {
    var idx = [];
    for (var i = 0; i < k; i++) idx.push(i);
    while (true) {
      fn(idx);
      var p = k - 1;
      while (p >= 0 && idx[p] === n - k + p) p--;
      if (p < 0) return;
      idx[p]++;
      for (var q = p + 1; q < k; q++) idx[q] = idx[q - 1] + 1;
    }
  }

  function signature(aIds) {
    return aIds.slice().sort().join(',');
  }

  /**
   * pick(players, options)
   *   options.random: function returning 0..1 (defaults to Math.random)
   *   options.avoid:  a previous result, to get a different split if possible
   */
  function pick(players, options) {
    options = options || {};
    var rand = options.random || Math.random;
    if (!players || players.length < 2) throw new Error('Need at least 2 players.');

    var people = shuffle(players, rand);
    var keepers = people.filter(function (p) { return p.is_keeper; });
    var gkA = keepers[0] || null;
    var gkB = keepers[1] || null;
    var outfield = people.filter(function (p) { return p !== gkA && p !== gkB; });

    var n = people.length;
    // With an odd number, try giving the extra player to either side.
    var sizeOptions = n % 2 === 0 ? [n / 2] : [Math.floor(n / 2), Math.ceil(n / 2)];
    var avoidSig = options.avoid ? signature(options.avoid.a) : null;
    var gkSkillA = gkA ? sum([gkA]) : 0;
    var gkSkillB = gkB ? sum([gkB]) : 0;
    var total = sum(outfield);

    var best = [];
    var bestDiff = Infinity;
    function consider(aOut, sizeA) {
      var aSkill = gkSkillA + sum(aOut);
      var bSkill = gkSkillB + total - sum(aOut);
      var diff = Math.abs(aSkill - bSkill);
      if (diff < bestDiff) { bestDiff = diff; best = []; }
      if (diff === bestDiff) best.push(aOut);
    }

    sizeOptions.forEach(function (sizeA) {
      var k = sizeA - (gkA ? 1 : 0);
      if (k < 0 || k > outfield.length) return;
      if (choose(outfield.length, k) <= 200000) {
        eachSubset(outfield.length, k, function (idx) {
          consider(idx.map(function (i) { return outfield[i]; }), sizeA);
        });
      } else {
        // Very big squads: random splits, then improve by swapping.
        for (var round = 0; round < 300; round++) {
          var s = shuffle(outfield, rand);
          var a = s.slice(0, k), b = s.slice(k);
          var improved = true;
          while (improved) {
            improved = false;
            var d = (gkSkillA + sum(a)) - (gkSkillB + sum(b));
            for (var i = 0; i < a.length && !improved; i++) {
              for (var j = 0; j < b.length && !improved; j++) {
                var delta = (Number(a[i].skill) || 3) - (Number(b[j].skill) || 3);
                if (Math.abs(d - 2 * delta) < Math.abs(d)) {
                  var t = a[i]; a[i] = b[j]; b[j] = t; improved = true;
                }
              }
            }
          }
          consider(a, sizeA);
        }
      }
    });

    var choices = best.map(function (aOut) {
      var aIds = aOut.map(function (p) { return p.id; });
      if (gkA) aIds.unshift(gkA.id);
      return aIds;
    });
    var fresh = choices.filter(function (ids) { return signature(ids) !== avoidSig; });
    var chosenA = (fresh.length ? fresh : choices)[Math.floor(rand() * (fresh.length || choices.length))];

    var inA = {};
    chosenA.forEach(function (id) { inA[id] = true; });
    var teamA = people.filter(function (p) { return inA[p.id]; });
    var teamB = people.filter(function (p) { return !inA[p.id]; });

    return {
      a: teamA.map(function (p) { return p.id; }),
      b: teamB.map(function (p) { return p.id; }),
      gk_a: gkA ? gkA.id : null,
      gk_b: gkB ? gkB.id : null,
      total_a: sum(teamA),
      total_b: sum(teamB),
      alternatives: choices.length
    };
  }

  var TeamPicker = { pick: pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = TeamPicker;
  else root.TeamPicker = TeamPicker;
})(this);
