(function(root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WarRoomEspnParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var POSITION_PATTERN = '(QB|RB|WR|TE|K|D\\s*\\/\\s*ST|DST|DEF)';

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t ]+/g, ' ')
      .replace(/\r/g, '')
      .trim();
  }

  function normalizePosition(value) {
    var normalized = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (normalized === 'DEF' || normalized === 'DST' || normalized === 'D') return 'DST';
    return ['QB', 'RB', 'WR', 'TE', 'K'].indexOf(normalized) >= 0 ? normalized : '';
  }

  function snakeTeamSlot(overallPick, teams) {
    overallPick = Number(overallPick);
    teams = Number(teams) || 10;
    if (!Number.isInteger(overallPick) || overallPick < 1 || teams < 2) return null;
    var round = Math.ceil(overallPick / teams);
    var pickInRound = ((overallPick - 1) % teams) + 1;
    return round % 2 === 1 ? pickInRound : teams - pickInRound + 1;
  }

  function parseOverallPick(text, options) {
    text = cleanText(text);
    options = options || {};
    var match = text.match(/\b(?:overall\s+)?pick\s*#?\s*(\d{1,3})\b/i);
    if (match) return Number(match[1]);

    match = text.match(/\b(\d{1,2})\.(\d{1,2})\b/);
    if (match) {
      var round = Number(match[1]);
      var pickInRound = Number(match[2]);
      var teams = Number(options.teams) || 10;
      if (round > 0 && pickInRound > 0 && pickInRound <= teams) {
        return ((round - 1) * teams) + pickInRound;
      }
    }

    match = text.match(/^\s*#?(\d{1,3})\s*(?:[.):-]|\n)/m);
    if (match) return Number(match[1]);

    return null;
  }

  function parsePosition(text) {
    var match = cleanText(text).match(new RegExp('\\b' + POSITION_PATTERN + '\\b', 'i'));
    return match ? normalizePosition(match[1]) : '';
  }

  function looksLikeName(line) {
    line = cleanText(line);
    if (line.length < 3 || line.length > 70) return false;
    if (/\b(pick|round|team|drafted|overall|on the clock|select)\b/i.test(line)) return false;
    if (new RegExp('^' + POSITION_PATTERN + '(?:\\b|\\s*-)', 'i').test(line)) return false;
    if (/^\d+(?:\.\d+)?$/.test(line)) return false;
    return /[A-Za-z]/.test(line) && /[A-Za-z'’.-]+\s+[A-Za-z'’.-]+/.test(line);
  }

  function parsePlayerName(text, attrs) {
    attrs = attrs || {};
    var preferred = cleanText(
      attrs.playerName || attrs['data-player-name'] || attrs['data-athlete-name']
    );
    if (preferred) return preferred;

    var classic = cleanText(text).match(
      /^\s*#?\d{1,3}\s*[.)-]\s*(?:\(\d{1,3}\)\s*)?(.+?)\s*\([A-Z]{2,4}\s*[-–—·]\s*(?:QB|RB|WR|TE|K|D\s*\/\s*ST|DST|DEF)\)/im
    );
    if (classic && looksLikeName(classic[1])) return cleanText(classic[1]);

    var lines = cleanText(text).split('\n').map(cleanText).filter(Boolean);
    for (var index = 0; index < lines.length; index++) {
      var line = lines[index];
      var inline = line.match(new RegExp('^(.+?)(?:\\s*[-·|,]\\s*|\\s+)' + POSITION_PATTERN + '\\b', 'i'));
      if (inline) {
        var inlineName = cleanText(inline[1]).replace(/^\s*#?\d{1,3}\s*(?:[.):-]\s*)?/, '');
        if (looksLikeName(inlineName)) return inlineName;
      }

      if (new RegExp('^' + POSITION_PATTERN + '(?:\\b|\\s*-)', 'i').test(line) && index > 0) {
        if (looksLikeName(lines[index - 1])) return lines[index - 1];
      }
    }

    return lines.find(looksLikeName) || '';
  }

  function parseTeamSlot(text, overallPick, options) {
    var match = cleanText(text).match(/\b(?:team|slot)\s*#?\s*(\d{1,2})\b/i);
    if (match) return Number(match[1]);
    return snakeTeamSlot(overallPick, options && options.teams);
  }

  function parseEspnPlayerId(attrs, href) {
    attrs = attrs || {};
    var direct = attrs.playerId || attrs['data-player-id'] || attrs['data-athlete-id'];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    var match = String(href || '').match(/\/id\/(\d+)/i);
    return match ? match[1] : null;
  }

  function parsePickText(text, options, attrs, href) {
    text = cleanText(text);
    options = options || {};
    if (!text || text.length > 600) return null;

    var overallPick = parseOverallPick(text, options);
    var playerName = parsePlayerName(text, attrs);
    var position = parsePosition(text);
    if (!overallPick || !playerName || !position) return null;

    return {
      overallPick: overallPick,
      playerName: playerName,
      position: position,
      teamSlot: parseTeamSlot(text, overallPick, options),
      espnPlayerId: parseEspnPlayerId(attrs, href)
    };
  }

  function readAttributes(element) {
    var result = {};
    if (!element || !element.attributes) return result;
    Array.prototype.forEach.call(element.attributes, function(attribute) {
      result[attribute.name] = attribute.value;
    });
    return result;
  }

  function scanDocument(documentObject, options) {
    return scanDocumentDetailed(documentObject, options).picks;
  }

  function scanDocumentDetailed(documentObject, options) {
    if (!documentObject || !documentObject.querySelectorAll) {
      return {candidateCount: 0, picks: []};
    }
    var selectors = [
      '[data-testid*="pick" i]',
      '[data-testid*="draft" i] [role="row"]',
      '[data-testid*="draft" i] li',
      '[data-player-id]',
      '[data-athlete-id]',
      '[aria-label*="pick" i]',
      '[class*="pickHistory" i] > *',
      '[class*="draftHistory" i] > *',
      '[class*="draftBoard" i] [class*="pick" i]',
      '[class*="pick-history" i] > *',
      '[class*="draft-history" i] > *',
      '[class*="draft-results" i] tr',
      '[class*="draft" i] [role="row"]',
      '[class*="draft" i] [role="listitem"]',
      'main tr',
      'main [role="row"]'
    ];
    var nodes = [];
    try {
      nodes = Array.prototype.slice.call(documentObject.querySelectorAll(selectors.join(',')));
    } catch (error) {
      nodes = [];
    }

    var byPick = new Map();
    nodes.slice(0, 4000).forEach(function(node) {
      var candidate = node;
      for (var depth = 0; candidate && depth < 4; depth++) {
        var text = cleanText(candidate.innerText || candidate.textContent || candidate.getAttribute('aria-label'));
        if (text.length <= 900) {
          var link = candidate.matches && candidate.matches('a[href]')
            ? candidate
            : candidate.querySelector && candidate.querySelector('a[href*="/id/"]');
          var parsed = parsePickText(
            text,
            options,
            readAttributes(candidate),
            link && link.getAttribute ? link.getAttribute('href') : ''
          );
          if (parsed && !byPick.has(parsed.overallPick)) {
            byPick.set(parsed.overallPick, parsed);
            break;
          }
        }
        candidate = candidate.parentElement;
      }
    });

    return {
      candidateCount: nodes.length,
      picks: Array.from(byPick.values()).sort(function(a, b) {
        return a.overallPick - b.overallPick;
      })
    };
  }

  return {
    cleanText: cleanText,
    normalizePosition: normalizePosition,
    snakeTeamSlot: snakeTeamSlot,
    parseOverallPick: parseOverallPick,
    parsePlayerName: parsePlayerName,
    parsePickText: parsePickText,
    scanDocument: scanDocument,
    scanDocumentDetailed: scanDocumentDetailed
  };
});
