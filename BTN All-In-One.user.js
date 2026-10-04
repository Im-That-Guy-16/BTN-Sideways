// ==UserScript==
// @name         BTN All-In-One
// @namespace    https://broadcasthe.net/
// @version      1.0.19
// @description  Every BTN userscript rolled into one: Animated Power Logo, Front Page Tidy, Trending Shows, Search Table Toggle, Series Page Declutter, one-line torrent details, Fanart.tv logos, TMDB Recommended Shows, IMDb Parents Guide, Sonarr Integration, TMDB Enricher panels, and a profile-edit feature toggle tab. Each module keeps its own original page scope.
// @author       Prism16 / you
// @match        https://broadcasthe.net/*
// @match        https://*.broadcasthe.net/*
// @match        http://broadcasthe.net/*
// @match        http://*.broadcasthe.net/*
// @icon         https://broadcasthe.net/favicon.ico
// @updateURL    https://Im-That-Guy-16.github.io/BTN-Sideways/BTN%20All-In-One.user.js
// @downloadURL  https://Im-That-Guy-16.github.io/BTN-Sideways/BTN%20All-In-One.user.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        GM.notification
// @connect      *
// @connect      api.graphql.imdb.com
// @connect      api.themoviedb.org
// @connect      image.tmdb.org
// @connect      webservice.fanart.tv
// @connect      thetvdb.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* =============================================================================
 *  MERGED FROM (all original behaviour preserved verbatim, including every
 *  layout / style tweak):
 *
 *    1.  BTN - Animated Power Logo                     v1.2   — all BTN pages
 *    2.  BTN Front Page Tidy                           v1.1   — / and index.php
 *    3.  Add Trending Shows to BTN Homepage            v1     — index.php
 *    4.  BTN - Search Table Show/Hide Toggle           v1.0   — torrents.php
 *    5.  BTN Series Page Declutter                     v2.1   — series.php?id=
 *    6.  BTN series.php — torrent details on one line  v2.0   — series.php
 *    7.  BTN Fanart.tv API                             v1.1   — series.php?id=
 *    8.  Add Similar Shows to BTN Pages                v1     — series.php?…
 *    9.  BTN Parental Helper (card layout)             v3.1.0 — series.php?id=
 *    10. BTN Sonarr Integration 2                      v0.9.4 — series.php
 *    11. BTN TMDB Enricher                             v1.5.0 — series.php
 *
 *  Module order matters in two places:
 *    • Declutter (5) runs before TMDB Enricher (11) because the Enricher appends
 *      pills into the `.btn-tmdb-info .btn-info-grid` that Declutter builds.
 *    • The Logo (1) runs first so it is in place before anything reflows.
 *
 *  NOT CARRIED OVER: the "Add Similar Shows" file had a second, empty Tampermonkey
 *  stub appended at the bottom of it (`// Your code here...`) with no code in it.
 *  There was nothing to bring across.
 * ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   *  Page scope helpers — these reproduce each original script's @match.
   * ------------------------------------------------------------------ */
  const PATH   = location.pathname;
  const SEARCH = location.search;

  const onAnyPage     = true;                                   // logo
  const onIndex       = /^\/(index\.php)?$/i.test(PATH);        // / and /index.php
  const onTorrents    = /^\/torrents\.php$/i.test(PATH);        // torrents.php*
  const onSeries      = /^\/series\.php$/i.test(PATH);          // series.php*
  const onSeriesQuery = onSeries && SEARCH.length > 1;          // series.php?*
  const onSeriesId    = onSeries && /[?&]id=\d+/.test(SEARCH);  // series.php?id=*
  const onUserEdit    = /^\/user\.php$/i.test(PATH) && /[?&]action=edit\b/i.test(SEARCH);

  const FEATURE_TOGGLE_STORAGE_PREFIX = 'btn_aio_feature_enabled_';
  const FEATURE_TOGGLES = [
    {
      id: 'animated_power_logo',
      name: 'Animated Power Logo',
      page: 'All pages',
      detail: 'Replaces the BTN header logo with the animated power mark.',
    },
    {
      id: 'front_page_tidy',
      name: 'Front Page Tidy',
      page: 'Home',
      detail: 'Adds read/collapse handling and hides featured panels.',
    },
    {
      id: 'trending_shows',
      name: 'Trending Shows',
      page: 'Home',
      detail: 'Adds TMDB trending shows to the front page.',
    },
    {
      id: 'search_table_toggle',
      name: 'Search Table Toggle',
      page: 'Torrents',
      detail: 'Adds the show/hide control for the browse search table.',
    },
    {
      id: 'series_page_declutter',
      name: 'Series Page Declutter',
      page: 'Series',
      detail: 'Tidies series pages and controls torrent table defaults.',
    },
    {
      id: 'torrent_details_one_line',
      name: 'Torrent Details On One Line',
      page: 'Series',
      detail: 'Compacts torrent detail rows for easier scanning.',
    },
    {
      id: 'fanart_tv_api',
      name: 'Fanart.tv API',
      page: 'Series',
      detail: 'Adds Fanart.tv ClearLogo artwork when available.',
    },
    {
      id: 'similar_shows',
      name: 'Similar Shows',
      page: 'Series',
      detail: 'Adds TMDB recommended/similar shows.',
    },
    {
      id: 'parental_helper',
      name: 'Parental Helper',
      page: 'Series',
      detail: 'Adds IMDb Parents Guide cards.',
    },
    {
      id: 'sonarr_integration',
      name: 'Sonarr Integration',
      page: 'Series',
      detail: 'Adds Sonarr status, setup, and add-series tools.',
    },
    {
      id: 'tmdb_enricher',
      name: 'TMDB Enricher',
      page: 'Series',
      detail: 'Adds the TMDB hero, metadata, actors, seasons, reviews, recommendations, and trailer tools.',
    },
  ];
  const FEATURE_TOGGLE_MAP = FEATURE_TOGGLES.reduce((map, feature) => {
    map[feature.id] = feature;
    return map;
  }, {});

  // Run a module in isolation: one module throwing can never stop the others.
  function mod(featureId, name, enabled, fn) {
    if (!enabled || !isFeatureEnabled(featureId)) return;
    try { fn(); }
    catch (e) { console.error('[BTN All-In-One] module "' + name + '" failed:', e); }
  }

  const TMDB_API_KEY_STORAGE = 'tmdb_api_key';
  const TMDB_BEARER_STORAGE = 'tmdb_bearer';
  const TORRENT_TABLE_MODE_STORAGE = 'btn_torrent_table_mode';
  const TORRENT_TABLE_MODE_LABELS = {
    collapsed: 'Collapse all tables',
    open: 'Open all tables',
    latestSeason: 'Open latest season only',
  };

  function getStoredValue(key, fallback) {
    try { return GM_getValue(key, fallback); }
    catch (e) { return fallback; }
  }

  function setStoredValue(key, value) {
    try { GM_setValue(key, value); }
    catch (e) {}
  }

  function featureStorageKey(featureId) {
    return FEATURE_TOGGLE_STORAGE_PREFIX + featureId;
  }

  function isFeatureEnabled(featureId) {
    if (!FEATURE_TOGGLE_MAP[featureId]) return true;
    const value = getStoredValue(featureStorageKey(featureId), true);
    return value !== false && value !== 'false' && value !== '0' && value !== 0;
  }

  function setFeatureEnabled(featureId, enabled) {
    if (!FEATURE_TOGGLE_MAP[featureId]) return;
    setStoredValue(featureStorageKey(featureId), !!enabled);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function normalizeTorrentTableMode(value, fallback) {
    return Object.prototype.hasOwnProperty.call(TORRENT_TABLE_MODE_LABELS, value) ? value : fallback;
  }

  function getStoredTorrentTableMode(fallback) {
    return normalizeTorrentTableMode(String(getStoredValue(TORRENT_TABLE_MODE_STORAGE, '') || ''), fallback);
  }

  function parseTorrentTableMode(value) {
    const raw = String(value || '').trim();
    const compact = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (raw === '1' || /^(collapsed|collapse|closed|close)$/.test(compact)) return 'collapsed';
    if (raw === '2' || /^(open|opened|allopen|openall)$/.test(compact)) return 'open';
    if (raw === '3' || /^(latest|latestseason|latestonly|latestseasononly|openlatestseason|openlatestseasononly)$/.test(compact)) return 'latestSeason';
    return normalizeTorrentTableMode(raw, '');
  }

  function registerTorrentTableModeMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    const currentMode = getStoredTorrentTableMode('latestSeason');

    GM_registerMenuCommand('Set torrent table default: ' + TORRENT_TABLE_MODE_LABELS[currentMode], () => {
      const current = getStoredTorrentTableMode('latestSeason');
      const choice = prompt(
        'Torrent table default on series pages:\n\n' +
        '1 = Collapse all tables\n' +
        '2 = Open all tables\n' +
        '3 = Open latest season only\n\n' +
        'Current: ' + TORRENT_TABLE_MODE_LABELS[current] + '\n\n' +
        'Enter 1, 2, 3, collapsed, open, or latestSeason:',
        current
      );
      if (choice == null) return;

      const mode = parseTorrentTableMode(choice);
      if (!mode) {
        alert('Unknown torrent table setting. Use 1, 2, 3, collapsed, open, or latestSeason.');
        return;
      }

      setStoredValue(TORRENT_TABLE_MODE_STORAGE, mode);
      location.reload();
    });
  }

  function getStoredTmdbApiKey() {
    return String(getStoredValue(TMDB_API_KEY_STORAGE, '') || '').trim();
  }

  function getStoredTmdbBearer() {
    return String(getStoredValue(TMDB_BEARER_STORAGE, '') || '').trim();
  }

  function youtubeKeyFromUrl(url) {
    try {
      const u = new URL(url, location.href);
      const host = u.hostname.replace(/^www\./i, '');
      if (/youtu\.be$/i.test(host)) return u.pathname.split('/').filter(Boolean)[0] || null;
      if (/youtube(?:-nocookie)?\.com$/i.test(host)) {
        if (u.pathname.startsWith('/embed/')) return u.pathname.split('/').filter(Boolean)[1] || null;
        if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/').filter(Boolean)[1] || null;
        return u.searchParams.get('v');
      }
    } catch (e) {}
    return null;
  }

  function findPageYoutubeTrailer() {
    const iframe = [...document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"]')]
      .map(f => ({ key: youtubeKeyFromUrl(f.src), title: f.title || '' }))
      .find(v => v.key);
    if (iframe) return { site: 'YouTube', type: 'Trailer', key: iframe.key, name: iframe.title || 'Embedded Trailer' };

    const link = [...document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]')]
      .map(a => ({ key: youtubeKeyFromUrl(a.href), title: (a.textContent || a.title || '').trim() }))
      .find(v => v.key);
    if (link) return { site: 'YouTube', type: 'Trailer', key: link.key, name: link.title || 'Trailer' };

    return null;
  }

  // Grab BTN's own trailer before later modules hide or move panels around.
  const INITIAL_PAGE_YOUTUBE_TRAILER = findPageYoutubeTrailer();
  if (isFeatureEnabled('series_page_declutter')) registerTorrentTableModeMenu();


/* =============================================================================
 * Userscript Settings Tab
 *    Adds a Userscript tab to the BTN user edit page with per-feature toggles.
 * ========================================================================== */
mod('userscript_settings', 'Userscript Settings Tab', onUserEdit, function () {

  const PANEL_ID = 'section7.editprofile';

  function featureRows() {
    return FEATURE_TOGGLES.map(feature => {
      const checked = isFeatureEnabled(feature.id) ? ' checked' : '';
      const rowClass = checked ? '' : ' class="btn-aio-feature-disabled"';
      return `
        <tr${rowClass} data-feature-id="${escapeHtml(feature.id)}">
          <td>
            <label class="btn-aio-toggle-row">
              <input type="checkbox" data-feature-id="${escapeHtml(feature.id)}"${checked}>
              <span class="btn-aio-feature-name">${escapeHtml(feature.name)}</span>
            </label>
            <div class="btn-aio-feature-detail">${escapeHtml(feature.detail)}</div>
          </td>
          <td class="nobr">${escapeHtml(feature.page)}</td>
          <td class="btn-aio-feature-state">${checked ? 'On' : 'Off'}</td>
        </tr>`;
    }).join('');
  }

  function updateRow(input) {
    const row = input.closest('tr[data-feature-id]');
    if (!row) return;
    row.classList.toggle('btn-aio-feature-disabled', !input.checked);
    const state = row.querySelector('.btn-aio-feature-state');
    if (state) state.textContent = input.checked ? 'On' : 'Off';
  }

  function setStatus(panel, message) {
    const status = panel.querySelector('.btn-aio-settings-status');
    if (!status) return;
    status.textContent = message;
    clearTimeout(setStatus.timer);
    setStatus.timer = setTimeout(() => { status.textContent = ''; }, 5000);
  }

  function syncAll(panel, enabled) {
    panel.querySelectorAll('input[data-feature-id]').forEach(input => {
      input.checked = enabled;
      setFeatureEnabled(input.dataset.featureId, enabled);
      updateRow(input);
    });
    setStatus(panel, 'Saved. Reload any open BTN pages to apply the changes.');
  }

  function activateUserscriptPanel(navLink, panel, scroll) {
    document.querySelectorAll('#slider ul.navigation a').forEach(link => link.classList.remove('selected'));
    navLink.classList.add('selected');
    if (scroll && typeof scroll.scrollTo === 'function') {
      scroll.scrollTo({ left: panel.offsetLeft, behavior: 'smooth' });
    } else if (scroll) {
      scroll.scrollLeft = panel.offsetLeft;
    }
  }

  function injectStyle() {
    if (document.getElementById('btn-aio-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'btn-aio-settings-style';
    style.textContent = `
      .btn-aio-settings-panel { box-sizing: border-box; }
      .btn-aio-settings-panel .box { margin-bottom: 12px; }
      .btn-aio-settings-intro { margin: 0 0 12px; opacity: .85; line-height: 1.5; }
      .btn-aio-feature-table { width: 100%; }
      .btn-aio-feature-table td { vertical-align: middle; }
      .btn-aio-toggle-row { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
      .btn-aio-toggle-row input { margin: 0; }
      .btn-aio-feature-name { font-weight: 700; }
      .btn-aio-feature-detail { margin-top: 3px; opacity: .72; font-size: 11px; line-height: 1.35; }
      .btn-aio-feature-disabled { opacity: .58; }
      .btn-aio-feature-state { text-align: center; font-weight: 700; width: 60px; }
      .btn-aio-settings-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .btn-aio-settings-status { margin-left: 4px; font-weight: 700; color: #8fd0ff; }
    `;
    document.head.appendChild(style);
  }

  function injectTab() {
    const slider = document.getElementById('slider');
    const nav = slider && slider.querySelector('ul.navigation');
    const scroll = slider && slider.querySelector('.scroll');
    const scrollContainer = slider && slider.querySelector('.scrollContainer');
    if (!nav || !scroll || !scrollContainer || document.getElementById(PANEL_ID)) return;

    injectStyle();

    const navItem = document.createElement('li');
    const navLink = document.createElement('a');
    navLink.href = '#' + PANEL_ID;
    navLink.textContent = 'Userscript';
    navItem.appendChild(navLink);
    nav.appendChild(navItem);

    const firstPanel = scrollContainer.querySelector('.panel');
    const panelWidth = Math.round(
      (firstPanel && firstPanel.getBoundingClientRect().width) ||
      scroll.getBoundingClientRect().width ||
      620
    );
    const currentWidth = parseFloat(scrollContainer.style.width) || scrollContainer.scrollWidth || panelWidth * scrollContainer.children.length;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'panel btn-aio-settings-panel';
    panel.style.cssText = 'float: left; position: relative; width: ' + panelWidth + 'px;';
    panel.innerHTML = `
      <div class="box">
        <div class="head">BTN All-In-One Userscript</div>
        <div class="pad">
          <p class="btn-aio-settings-intro">Choose which BTN All-In-One features run in this browser. Changes are saved in Tampermonkey storage and apply on the next BTN page load.</p>
          <table class="border btn-aio-feature-table">
            <tr class="colhead">
              <td>Feature</td>
              <td>Page</td>
              <td>Status</td>
            </tr>
            ${featureRows()}
          </table>
          <div class="btn-aio-settings-actions">
            <input type="button" class="btn-aio-enable-all" value="Enable all">
            <input type="button" class="btn-aio-disable-all" value="Disable all">
            <input type="button" class="btn-aio-reset-all" value="Reset defaults">
            <span class="btn-aio-settings-status" aria-live="polite"></span>
          </div>
        </div>
      </div>`;
    scrollContainer.appendChild(panel);
    scrollContainer.style.width = (currentWidth + panelWidth) + 'px';

    navLink.addEventListener('click', e => {
      e.preventDefault();
      activateUserscriptPanel(navLink, panel, scroll);
      try { history.replaceState(null, '', '#' + PANEL_ID); } catch (err) {}
    });

    panel.addEventListener('change', e => {
      const input = e.target && e.target.closest && e.target.closest('input[data-feature-id]');
      if (!input) return;
      setFeatureEnabled(input.dataset.featureId, input.checked);
      updateRow(input);
      setStatus(panel, 'Saved. Reload any open BTN pages to apply the changes.');
    });

    panel.querySelector('.btn-aio-enable-all').addEventListener('click', () => syncAll(panel, true));
    panel.querySelector('.btn-aio-disable-all').addEventListener('click', () => syncAll(panel, false));
    panel.querySelector('.btn-aio-reset-all').addEventListener('click', () => {
      panel.querySelectorAll('input[data-feature-id]').forEach(input => {
        try { GM_deleteValue(featureStorageKey(input.dataset.featureId)); } catch (e) {}
        input.checked = true;
        updateRow(input);
      });
      setStatus(panel, 'Defaults restored. Reload any open BTN pages to apply the changes.');
    });

    if (location.hash === '#' + PANEL_ID) {
      setTimeout(() => activateUserscriptPanel(navLink, panel, scroll), 50);
    }
  }

  injectTab();
});


/* =============================================================================
 * 1. BTN - Animated Power Logo  (v1.2)
 *    Replaces the top-left BTN logo block with an animated blue power-symbol
 *    mark and a modern wordmark. Occasional idle animation; on hover the
 *    vertical bar rises then sinks. Also hides leftover pill/text from any
 *    older logo script.
 * ========================================================================== */
mod('animated_power_logo', 'Animated Power Logo', onAnyPage, function () {

  const LOGO_ID = 'logo';

  // ---- Styles -------------------------------------------------------------
  const css = `
    #${LOGO_ID}.btn-power-logo {
      width: 268px;
      height: 64px;
    }
    #${LOGO_ID}.btn-power-logo a {
      display: flex !important;
      align-items: center;
      gap: 14px;
      width: 268px;
      height: 64px;
      text-decoration: none;
      background: none !important;
    }
    /* Kill leftover pseudo-elements from the old/other logo script
       (the "BTN" gradient pill and the old "Broadcast The Net" wordmark) */
    #${LOGO_ID}.btn-power-logo a::before,
    #${LOGO_ID}.btn-power-logo a::after {
      content: none !important;
      display: none !important;
      background: none !important;
    }

    /* Power symbol */
    #${LOGO_ID}.btn-power-logo .btn-mark {
      width: 46px;
      height: 46px;
      flex: 0 0 auto;
      display: block;
      filter: drop-shadow(0 0 6px rgba(56,160,255,.55));
      animation: btnFloat 6s ease-in-out infinite;
    }
    #${LOGO_ID}.btn-power-logo a:hover .btn-mark {
      animation: btnPulse 1.1s ease-in-out infinite;
    }
    /* Hover: the vertical bar rises up then sinks back down */
    #${LOGO_ID}.btn-power-logo a:hover .btn-bar {
      animation: btnBarHover 1s ease-in-out infinite;
    }

    #${LOGO_ID}.btn-power-logo .btn-bar {
      transform-box: fill-box;
      transform-origin: 50% 50%;
      animation: btnBar 6s ease-in-out infinite;
    }

    /* Wordmark */
    #${LOGO_ID}.btn-power-logo .btn-word {
      display: flex;
      flex-direction: column;
      line-height: 1;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    }
    #${LOGO_ID}.btn-power-logo .btn-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 1px;
      background: linear-gradient(92deg,#7fd4ff 0%,#3a8dff 45%,#1e63ff 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: #3a8dff;
    }
    #${LOGO_ID}.btn-power-logo .btn-sub {
      margin-top: 4px;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 4.5px;
      text-transform: uppercase;
      color: #8fb8e6;
      opacity: .85;
    }

    @keyframes btnFloat {
      0%,100% { transform: translateY(0); }
      50%     { transform: translateY(-3px); }
    }
    @keyframes btnPulse {
      0%,100% { filter: drop-shadow(0 0 6px rgba(56,160,255,.55)); }
      50%     { filter: drop-shadow(0 0 14px rgba(56,160,255,.95)); }
    }
    /* Occasional idle toggle of the bar */
    @keyframes btnBar {
      0%, 72%, 100% { transform: translateY(0)  scaleY(1);   }
      78%           { transform: translateY(-2px) scaleY(.78); }
      86%           { transform: translateY(1px)  scaleY(1.06); }
      92%           { transform: translateY(0)   scaleY(1);   }
    }
    /* Hover: rise up then sink back down */
    @keyframes btnBarHover {
      0%   { transform: translateY(0)   scaleY(1);    }
      45%  { transform: translateY(-7px) scaleY(1.08); }
      100% { transform: translateY(0)   scaleY(1);    }
    }
    @media (prefers-reduced-motion: reduce) {
      #${LOGO_ID}.btn-power-logo * { animation: none !important; }
    }
  `;

  // ---- Markup -------------------------------------------------------------
  // Blue power symbol: an almost-full ring with a gap at top + vertical bar.
  // Gradient uses userSpaceOnUse so it applies to the zero-width vertical bar too.
  const markup = `
    <svg class="btn-mark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="btnGrad" gradientUnits="userSpaceOnUse" x1="20" y1="8" x2="80" y2="92">
          <stop offset="0"  stop-color="#7fd4ff"/>
          <stop offset=".5" stop-color="#3a8dff"/>
          <stop offset="1"  stop-color="#1e63ff"/>
        </linearGradient>
      </defs>
      <path class="btn-ring"
            d="M32 22 A34 34 0 1 0 68 22"
            fill="none" stroke="url(#btnGrad)" stroke-width="9"
            stroke-linecap="round"/>
      <line class="btn-bar" x1="50" y1="12" x2="50" y2="48"
            stroke="url(#btnGrad)" stroke-width="9" stroke-linecap="round"/>
    </svg>
    <span class="btn-word">
      <span class="btn-title">BTN</span>
      <span class="btn-sub">Broadcast&nbsp;The&nbsp;Net</span>
    </span>
  `;

  function inject() {
    const logo = document.getElementById(LOGO_ID);
    if (!logo || logo.classList.contains('btn-power-logo')) return;

    const style = document.createElement('style');
    style.id = 'btn-power-logo-style';
    style.textContent = css;
    document.head.appendChild(style);

    let a = logo.querySelector('a');
    if (!a) {
      a = document.createElement('a');
      a.href = 'index.php';
      logo.appendChild(a);
    }
    a.innerHTML = markup;
    logo.classList.add('btn-power-logo');
  }

  inject();
});


/* =============================================================================
 * 2. BTN Front Page Tidy  (v1.1)
 *    Adds an unread marker to the main front-page article header; clicking marks
 *    it read and auto-collapses the article, leaving a Show/Hide toggle in the
 *    header to reopen it. A new article resets to unread. Also hides the
 *    Featured Series and Featured Actor panels.
 * ========================================================================== */
mod('front_page_tidy', 'Front Page Tidy', onIndex, function () {

    var LS_READ = 'btn_article_read';       // { "<article title>": 1 }
    var LS_COLL = 'btn_article_collapsed';   // { "<article title>": true/false }

    function getMap(k) {
        try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; }
    }
    function setMap(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

    // ---- Hide Featured Series & Featured Actor panels ----
    document.querySelectorAll('.box .head').forEach(function (h) {
        var t = h.textContent.trim();
        if (t === 'Featured Series' || t === 'Featured Actor') {
            var b = h.closest('.box');
            if (b) b.style.display = 'none';
        }
    });

    // ---- Main front-page article (the .box that contains #news_post) ----
    var post = document.querySelector('#news_post');
    if (!post) return;
    var box = post.closest('.box');
    if (!box) return;
    // On this page the header (.head) and body (.pad) both live INSIDE #news_post,
    // with pagination (.extrapad) as a sibling of #news_post. We must collapse the
    // body + pagination but keep the header (and our toggle) visible.
    var head = post.querySelector('.head') || box.querySelector('.head');
    if (!head) return;

    // Key read-state on the article title so a NEW article shows as unread again.
    var strong = head.querySelector('strong');
    var key = (strong ? strong.textContent : head.textContent).trim();
    if (!key) return;

    // Everything to collapse: siblings of the header inside #news_post, plus
    // any siblings of #news_post inside the box (e.g. .extrapad pagination).
    var bodyEls = Array.prototype.filter.call(post.children, function (c) { return c !== head; })
        .concat(Array.prototype.filter.call(box.children, function (c) { return c !== post; }));

    var readMap = getMap(LS_READ);
    var collMap = getMap(LS_COLL);

    function isRead() { return !!readMap[key]; }
    function isCollapsed() { return (key in collMap) ? collMap[key] : isRead(); }

    var existing = head.querySelector('.btn-eye-ctrl');
    if (existing) existing.remove();

    var btn = document.createElement('span');
    btn.className = 'btn-eye-ctrl';
    btn.style.cssText = 'float:right;cursor:pointer;user-select:none;margin-left:8px;' +
        'padding:0 7px;border:1px solid currentColor;border-radius:4px;' +
        'font-size:12px;line-height:16px;opacity:.85;';
    head.appendChild(btn);

    function apply() {
        var collapsed = isCollapsed();
        bodyEls.forEach(function (el) { el.style.display = collapsed ? 'none' : ''; });
        if (!isRead()) {
            btn.textContent = '👁 Unread';                 // 👁 Unread
            btn.title = 'Unread — click to mark read & collapse';
        } else {
            btn.textContent = collapsed ? '▶ Show' : '▼ Hide'; // ▶ Show / ▼ Hide
            btn.title = collapsed ? 'Click to expand the article' : 'Click to collapse the article';
        }
    }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (!isRead()) {
            readMap[key] = 1; setMap(LS_READ, readMap);
            collMap[key] = true; setMap(LS_COLL, collMap);
        } else {
            collMap[key] = !isCollapsed(); setMap(LS_COLL, collMap);
        }
        apply();
    });

    apply();
});


/* =============================================================================
 * 3. Add Trending Shows to BTN Homepage  (v1)
 *    Poster strip of TMDB's daily trending TV at the top of the main column.
 * ========================================================================== */
mod('trending_shows', 'Trending Shows', onIndex, function () {

    let tmdbApiKey = getStoredTmdbApiKey();
    if (!tmdbApiKey) {
        console.warn('[BTN All-In-One] TMDB API key is not set; skipping Trending Shows.');
        return;
    }

    function fetchTrendingShows() {
        let url = `https://api.themoviedb.org/3/trending/tv/day?api_key=${encodeURIComponent(tmdbApiKey)}&language=en-US`;

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                let trendingShows = (Array.isArray(data.results) ? data.results : []).slice(0, 7);
                return trendingShows;
            })
            .catch(error => {
                console.error('Error:', error);
                return [];
            });
    }

    function fetchShowDetails(show) {
        let showDetailsUrl = `https://api.themoviedb.org/3/tv/${show.id}?api_key=${encodeURIComponent(tmdbApiKey)}`;

        return fetch(showDetailsUrl)
            .then(response => response.json())
            .catch(error => console.error('Error:', error));
    }

    function panelBuilder() {
        var mainColumn = document.querySelector("#content > div.thin > div.main_column");
        if (!mainColumn) return;

        var boxDiv = document.createElement('div');
        boxDiv.className = 'box';
        boxDiv.style.display = 'flex';
        boxDiv.style.flexWrap = 'wrap';
        boxDiv.style.justifyContent = 'space-between';

        var headDiv = document.createElement('div');
        headDiv.className = 'head';
        headDiv.textContent = 'Trending Shows From TMDB';
        headDiv.style.fontWeight = 'bold';
        headDiv.style.fontSize = '1rem';
        headDiv.style.width = '100%';
        boxDiv.appendChild(headDiv);

        fetchTrendingShows().then(trendingShows => {
            for (let show of trendingShows) {
                fetchShowDetails(show).then(showData => {
                    let posterUrl = `https://media.themoviedb.org/t/p/w440_and_h660_face${showData.poster_path}`;

                    var showDiv = document.createElement('div');
                    showDiv.style.width = '12%';
                    showDiv.style.margin = '1%';
                    var img = document.createElement('img');
                    img.src = posterUrl;
                    img.style.width = '100%';
                    var nameDiv = document.createElement('div');
                    nameDiv.textContent = showData.name;
                    nameDiv.style.textAlign = 'center';
                    nameDiv.style.cursor = 'pointer';
                    nameDiv.onclick = function() {
                        window.location.href = `https://broadcasthe.net/series.php?name=${encodeURIComponent(showData.name)}`;
                    };
                    showDiv.appendChild(img);
                    showDiv.appendChild(nameDiv);
                    boxDiv.appendChild(showDiv);
                });
            }
        });
        mainColumn.insertBefore(boxDiv, mainColumn.firstChild);
    }

    panelBuilder();
});


/* =============================================================================
 * 4. BTN - Search Table Show/Hide Toggle  (v1.0)
 *    Adds a show/hide toggle for the search/filter table at the top of
 *    torrents.php. Hidden by default.
 * ========================================================================== */
mod('search_table_toggle', 'Search Table Toggle', onTorrents, function () {

    // The search/filter form is the first <form> directly inside #content
    // (headed by "Filter" / "Advanced Search").
    var searchForm = document.querySelector('#content > form');
    if (!searchForm) return;

    var STORAGE_KEY = 'btnSearchTableVisible';

    // Hidden by default. Remembers your last choice across page loads.
    var visible = localStorage.getItem(STORAGE_KEY) === '1';

    // --- Build the toggle control ---
    var bar = document.createElement('div');
    bar.className = 'linkbox';
    bar.style.marginBottom = '6px';

    var toggle = document.createElement('a');
    toggle.href = '#';
    toggle.className = 'brackets';
    toggle.style.cursor = 'pointer';

    bar.appendChild(toggle);
    searchForm.parentNode.insertBefore(bar, searchForm);

    function render() {
        searchForm.style.display = visible ? '' : 'none';
        toggle.textContent = visible ? 'Hide search' : 'Show search';
    }

    toggle.addEventListener('click', function (e) {
        e.preventDefault();
        visible = !visible;
        localStorage.setItem(STORAGE_KEY, visible ? '1' : '0');
        render();
    });

    render();
});


/* =============================================================================
 * 5. BTN Series Page Declutter  (v2.1)
 *    Cleans up series pages: hides the broken stacked info block, lets you
 *    toggle each panel on/off, pulls the Series Summary to the top, controls
 *    the season table default state, and rebuilds the Series Info box as a compact
 *    TMDB-style panel (pills, country flags, network logos) placed below the
 *    tables and above the fan art.
 * ========================================================================== */
mod('series_page_declutter', 'Series Page Declutter', onSeries, function () {

    /* =========================================================================
     *  CONFIG  —  true = SHOW the panel,  false = HIDE it
     *  Just flip any value and save. Panels are matched by their heading text,
     *  so this keeps working across every series page.
     *
     *  Any panel from the top "stacked" block that you set to true is moved into
     *  the main column (below the tables, above the fan art) at full width instead
     *  of being squashed into the narrow left column.
     * ========================================================================= */
    const CONFIG = {
        // ---- Left column panels ------------------------------------------------
        poster:             true,   // The series poster box
        seriesRating:       true,   // "Series Rating" (star/vote box)
        seriesCollector:    true,   // "Series Collector"
        actors:             false,  // "Actors"
        buyStamps:          false,  // "Buy Stamps"

        // ---- The broken "stacked" block at the top (hidden by default) ---------
        seriesInfo:         true,   // "Series Info" (airs / network / rating, etc.)
        highestRatedReview: false,  // "Highest Rated Review"
        latestEpisode:      false,  // "Latest Episode"
        nextEpisode:        false,  // "Next Episode"
        discuss:            true,   // "Discuss"
        youtubeTrailer:     false,  // "Youtube Trailer"
        genres:             false,  // "Genres"
        statistics:         false,  // "Statistics"

        // ---- Layout / style tweaks --------------------------------------------
        moveSummaryToTop:   true,   // Put the Series Summary at the very top of the main area
        removeTopGap:       true,   // Remove the empty space the stacked block used to reserve
        torrentTableMode:   getStoredTorrentTableMode('latestSeason'), // 'collapsed', 'open', or 'latestSeason'
        styleSeriesInfo:    true,   // Rebuild the Series Info box as a TMDB-style pill panel
    };

    /* ========================================================================= */

    // Only run on a real series page (has ?id=NNN). torrents.php is a different
    // path so this script never loads there, but this guards edge cases too.
    if (!/[?&]id=\d+/.test(location.search)) return;

    // Map each CONFIG key to the text shown in that box's heading.
    const MATCH = {
        seriesInfo:         'Series Info',
        seriesRating:       'Series Rating',
        highestRatedReview: 'Highest Rated Review',
        latestEpisode:      'Latest Episode',
        nextEpisode:        'Next Episode',
        seriesCollector:    'Series Collector',
        discuss:            'Discuss',
        youtubeTrailer:     'Youtube Trailer',
        genres:             'Genres',
        statistics:         'Statistics',
        actors:             'Actors',
        buyStamps:          'Buy Stamps',
    };

    // The main column is a CSS flexbox laid out with `order` (summary is lowest,
    // fan art is highest, tables in between). The exact numbers vary per page, so
    // we read the fan-art box's order at runtime and place relocated panels just
    // above it (same order value + inserted before it in the DOM).
    const FALLBACK_ORDER = '4';

    const headText = el => {
        const h = el.querySelector('.head');
        return (h ? h.textContent : '').replace(/\s+/g, ' ').trim();
    };

    // Network / studio name -> domain, used to fetch a small brand icon.
    const NET_DOMAIN = {
        'HBO': 'hbo.com', 'HBO Max': 'hbomax.com', 'Max': 'max.com',
        'Netflix': 'netflix.com', 'Amazon': 'amazon.com', 'Prime Video': 'primevideo.com',
        'Apple TV+': 'apple.com', 'Hulu': 'hulu.com', 'Disney+': 'disneyplus.com',
        'BBC': 'bbc.co.uk', 'BBC One': 'bbc.co.uk', 'BBC Two': 'bbc.co.uk',
        'BBC America': 'bbcamerica.com', 'ITV': 'itv.com', 'Sky': 'sky.com',
        'Sky Atlantic': 'sky.com', 'AMC': 'amc.com', 'FX': 'fxnetworks.com',
        'Showtime': 'sho.com', 'Paramount+': 'paramountplus.com', 'NBC': 'nbc.com',
        'ABC': 'abc.com', 'CBS': 'cbs.com', 'FOX': 'fox.com', 'The CW': 'cwtv.com',
        'Starz': 'starz.com', 'Peacock': 'peacocktv.com', 'Channel 4': 'channel4.com',
        'Comedy Central': 'cc.com', 'Cartoon Network': 'cartoonnetwork.com',
        'Adult Swim': 'adultswim.com', 'Nickelodeon': 'nick.com', 'USA Network': 'usanetwork.com',
    };

    // Country name / code -> 2-letter ISO code for the flag CDN.
    const COUNTRY_CODE = {
        'United States': 'us', 'USA': 'us', 'United Kingdom': 'gb', 'UK': 'gb',
        'Canada': 'ca', 'Australia': 'au', 'Japan': 'jp', 'France': 'fr',
        'Germany': 'de', 'Spain': 'es', 'Italy': 'it', 'South Korea': 'kr',
        'New Zealand': 'nz', 'Ireland': 'ie', 'Mexico': 'mx', 'Brazil': 'br',
    };
    const flagCode = v => {
        v = v.trim();
        if (/^[A-Za-z]{2}$/.test(v)) return v.toLowerCase();
        return COUNTRY_CODE[v] || null;
    };

    function apply() {
        const sidebar  = document.querySelector('.sidebar');
        const mainCol  = document.querySelector('.main_column');
        if (!sidebar || !mainCol) return;

        const toRelocate = [];

        [...sidebar.children].forEach(box => {
            const head = headText(box);
            const key  = Object.keys(MATCH).find(k => head.includes(MATCH[k]));
            // Boxes with no matching heading (the poster) fall back to CONFIG.poster.
            const show = key ? CONFIG[key] : CONFIG.poster;

            if (!show) {
                box.style.setProperty('display', 'none', 'important');
            } else if (getComputedStyle(box).position === 'absolute') {
                // A shown panel from the broken top stack → move it into the main
                // column at full width instead of squashing it in the sidebar.
                toRelocate.push(box);
            }
        });

        // ---- main column tweaks ----------------------------------------------
        if (CONFIG.removeTopGap) {
            mainCol.style.setProperty('padding-top', '0', 'important');
        }
        if (CONFIG.moveSummaryToTop) {
            const summary = [...mainCol.children].find(c => /Series Summary/.test(headText(c)));
            if (summary && mainCol.firstElementChild !== summary) {
                mainCol.insertBefore(summary, mainCol.firstElementChild);
            }
        }

        // ---- relocate shown top panels into the main column ------------------
        const fanArt = [...mainCol.children].find(c => /Series Fan Art/.test(headText(c)));
        const targetOrder = fanArt ? (getComputedStyle(fanArt).order || FALLBACK_ORDER) : FALLBACK_ORDER;
        const collector = [...sidebar.children].find(c => /Series Collector/.test(headText(c)));

        if (collector) {
            collector.classList.add('btn-series-collector');
            collector.style.setProperty('position', 'static', 'important');
            collector.style.setProperty('width', 'auto', 'important');
            collector.style.setProperty('max-width', 'none', 'important');
            collector.style.setProperty('order', '4', 'important');
            setupCollectorHeaderControls(collector);
            if (fanArt) mainCol.insertBefore(collector, fanArt);
            else mainCol.appendChild(collector);
        }

        toRelocate.forEach(box => {
            box.style.setProperty('position', 'static', 'important');
            box.style.setProperty('width', 'auto', 'important');
            // Same order as fan art, but inserted before it → sits just above it,
            // and still below the tables (which have a lower order).
            box.style.setProperty('order', targetOrder, 'important');
            if (fanArt) mainCol.insertBefore(box, fanArt);
            else mainCol.appendChild(box);

            if (CONFIG.styleSeriesInfo && /Series Info/.test(headText(box))) {
                buildInfoPanel(box);
            }
        });

        // ---- season / other table default state ------------------------------
        setupTorrentTables();

        injectStyle();
    }

    function setupCollectorHeaderControls(box) {
        if (box.querySelector('.btn-collector-header-controls')) return;

        const head = box.querySelector(':scope > .head');
        const form = box.querySelector('form');
        if (!head || !form) return;

        if (!form.id) form.id = 'btn-series-collector-form';

        const controls = document.createElement('div');
        controls.className = 'btn-collector-header-controls';

        ['Episode', 'Season'].forEach(labelText => {
            const row = [...form.querySelectorAll('tr')].find(tr =>
                new RegExp('^' + labelText + '$', 'i').test((tr.children[0]?.textContent || '').replace(/\s+/g, ' ').trim())
            );
            const input = row && row.querySelector('input[type="checkbox"]');
            if (!input) return;

            input.setAttribute('form', form.id);

            const label = document.createElement('label');
            label.className = 'btn-collector-toggle';
            const text = document.createElement('span');
            text.textContent = labelText;
            label.append(text, input);
            controls.appendChild(label);
            row.remove();
        });

        const submitRow = [...form.querySelectorAll('tr')].find(tr => tr.querySelector('input[type="submit"]'));
        const submit = submitRow && submitRow.querySelector('input[type="submit"]');
        if (submit) {
            submit.classList.add('btn-collector-download');
            submit.setAttribute('form', form.id);
            controls.appendChild(submit);
            submitRow.remove();
        }

        if (controls.children.length) head.appendChild(controls);
    }

    function tableSeasonNumber(table) {
        const textParts = [];
        const addText = el => {
            if (!el) return;
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) textParts.push(text);
        };

        const toggle = table.querySelector('a.toggle');
        addText(toggle && toggle.closest('tr'));
        addText(table.querySelector('caption'));
        addText(table.querySelector('tr'));
        table.querySelectorAll('tr.group_torrent').forEach(addText);

        const text = textParts.join(' ');
        const nums = [];
        for (const m of text.matchAll(/\bSeason\s+(\d+)\b/gi)) nums.push(Number(m[1]));
        for (const m of text.matchAll(/\bS(\d{1,2})E\d{1,3}\b/gi)) nums.push(Number(m[1]));

        const valid = nums.filter(n => Number.isFinite(n) && n > 0);
        return valid.length ? Math.max(...valid) : null;
    }

    function setupTorrentTables() {
        const tables = [...document.querySelectorAll('table#discog_table')]
            .filter(t => t.querySelector('a.toggle'));
        if (!tables.length) return;

        const mode = /^(collapsed|open|latestSeason)$/.test(CONFIG.torrentTableMode)
            ? CONFIG.torrentTableMode
            : 'collapsed';

        const seasonNumbers = tables.map(tableSeasonNumber);
        const latestSeason = Math.max(...seasonNumbers.filter(n => Number.isFinite(n) && n > 0));
        const fallbackLatest = tables[0];

        tables.forEach((table, index) => {
            const link = table.querySelector('a.toggle');
            if (!link || link.dataset.btnBound) return;   // don't double-bind

            const rows = [...table.querySelectorAll('tr.group_torrent')];
            const setHidden = hide => rows.forEach(r =>
                r.style.setProperty('display', hide ? 'none' : '', hide ? 'important' : ''));

            // The site's built-in toggle is broken (flips the label but
            // never hides the rows), so replace it with a working handler.
            const fresh = link.cloneNode(true);
            link.replaceWith(fresh);
            fresh.dataset.btnBound = '1';

            let startHidden = true;
            if (mode === 'open') {
                startHidden = false;
            } else if (mode === 'latestSeason') {
                const seasonNo = seasonNumbers[index];
                startHidden = Number.isFinite(latestSeason)
                    ? seasonNo !== latestSeason
                    : table !== fallbackLatest;
            }

            setHidden(startHidden);
            fresh.textContent = startHidden ? 'show' : 'hide';

            fresh.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const hidden = rows[0] && getComputedStyle(rows[0]).display === 'none';
                setHidden(!hidden);
                fresh.textContent = hidden ? 'hide' : 'show';
            });
        });
    }

    /* -------------------------------------------------------------------------
     *  Rebuild the Series Info box (a plain label/value table) into a modern
     *  TMDB-style panel: a grid of uppercase labels with pill values, plus the
     *  external-link icons kept as a "Links" row.
     * ---------------------------------------------------------------------- */
    function buildInfoPanel(box) {
        if (box.classList.contains('btn-tmdb-info')) return;   // already done

        const rows = [...box.querySelectorAll('tr')];
        if (!rows.length) return;

        const grid = document.createElement('div');
        grid.className = 'btn-info-grid';

        // Give these fields a green accent pill.
        const accent = { 'Series Status': 1, 'TVDB Rating': 1, 'Rating': 1 };
        let linksCell = null;

        rows.forEach(tr => {
            const cells = tr.children;
            if (cells.length < 2) return;
            const label = cells[0].textContent.replace(/:/g, '').replace(/\s+/g, ' ').trim();
            const valCell = cells[1];

            if (/External Links/i.test(label)) { linksCell = valCell; return; }

            const val = valCell.textContent.replace(/\s+/g, ' ').trim();
            if (!val) return;

            const item = document.createElement('div');
            item.className = 'btn-info-item';
            const l = document.createElement('div');
            l.className = 'btn-info-label';
            l.textContent = label;
            const p = document.createElement('span');
            p.className = 'btn-info-pill' + (accent[label] ? ' accent' : '');

            if (/Country/i.test(label)) {
                // Prepend a country flag if we can resolve the code.
                const code = flagCode(val);
                if (code) {
                    const f = document.createElement('img');
                    f.className = 'btn-flag';
                    f.src = 'https://flagcdn.com/w20/' + code + '.png';
                    f.onerror = () => f.remove();
                    p.appendChild(f);
                }
                p.appendChild(document.createTextNode(val));
            } else if (/Network/i.test(label)) {
                // Prepend a small network/studio brand icon if we know its domain.
                const dom = NET_DOMAIN[val];
                if (dom) {
                    const lg = document.createElement('img');
                    lg.className = 'btn-logo';
                    lg.alt = val;
                    lg.src = 'https://icons.duckduckgo.com/ip3/' + dom + '.ico';
                    lg.onerror = () => lg.remove();
                    p.appendChild(lg);
                }
                p.appendChild(document.createTextNode(val));
            } else {
                p.textContent = val;
            }

            item.append(l, p);
            grid.appendChild(item);
        });

        // Keep the original external-link icon nodes (their hrefs are preserved
        // even though we don't read them).
        let footer = null;
        if (linksCell) {
            footer = document.createElement('div');
            footer.className = 'btn-info-links';
            const lbl = document.createElement('span');
            lbl.className = 'btn-info-label';
            lbl.textContent = 'Links';
            footer.appendChild(lbl);
            [...linksCell.childNodes].forEach(n => footer.appendChild(n));
        }

        // Replace everything after the heading with the new layout.
        const head = box.querySelector('.head');
        [...box.children].forEach(ch => { if (ch !== head) ch.remove(); });
        box.appendChild(grid);
        if (footer) box.appendChild(footer);
        box.classList.add('btn-tmdb-info');
    }

    function injectStyle() {
        if (document.getElementById('btn-tmdb-style')) return;
        const s = document.createElement('style');
        s.id = 'btn-tmdb-style';
        s.textContent = `
.btn-tmdb-info .head{font-size:14px!important;font-weight:700!important;letter-spacing:.02em}
.btn-info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(115px,1fr));gap:9px 12px;padding:12px 16px}
.btn-info-item{display:flex;flex-direction:column;gap:4px;min-width:0}
.btn-info-label{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7d8797;font-weight:700}
.btn-info-pill{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;background:#2b3444;color:#e8edf4;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid #3b4557;line-height:1.35;max-width:100%}
.btn-info-pill.accent{background:linear-gradient(135deg,#1f7a4d,#25925c);border-color:#2ba368;color:#eafff2}
.btn-flag{width:16px;height:auto;border-radius:2px;display:block}
.btn-logo{height:15px;width:15px;object-fit:contain;border-radius:3px;display:block}
.btn-info-links{display:flex;align-items:center;gap:10px;padding:0 16px 12px}
.btn-info-links img{vertical-align:middle}
`;
        document.head.appendChild(s);
    }

    apply();
    // Re-apply once more after full load in case the site reflows late.
    window.addEventListener('load', apply);
});


/* =============================================================================
 * 6. BTN series.php — torrent details on one line  (v2.0)
 *    Join each torrent's details onto a single line by replacing the <br> in the
 *    row. No font/padding/border changes.
 * ========================================================================== */
mod('torrent_details_one_line', 'Torrent details on one line', onSeries, function () {

  const SEP = ' / '; // what to put where the <br> was

  const flatten = (root) => {
    const rows = root.querySelectorAll(
      'table.torrent_table tr.group_torrent, ' +
      'table.torrent_table tr.torrent'
    );
    rows.forEach(tr => {
      tr.querySelectorAll('td br').forEach(br => {
        br.replaceWith(document.createTextNode(SEP));
      });
    });
  };

  flatten(document);

  // Re-apply to rows BTN loads after page load (AJAX season expand, etc.)
  new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) flatten(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
});


/* =============================================================================
 * 7. BTN Fanart.tv API  (v1.1)
 *    Pulls the show's HD ClearLogo from fanart.tv (via the TVDB id scraped off
 *    the linked TVDB page) and drops it in at the top of the sidebar.
 * ========================================================================== */
mod('fanart_tv_api', 'Fanart.tv API', onSeriesId, function () {

    var fanartapiKey = "8a3d24a20c50c65c9f729fa3e67eebd2";
    var isPanelVisible = false;

    function searchTVDBUrl() {
        let aElements = document.getElementsByTagName('a');
        for (let i = 0; i < aElements.length; i++) {
            let aElement = aElements[i];
            if (aElement.href.includes('thetvdb.com')) {
                return aElement.href;
            }
        }
    }

    function PassTvdbIdToFanartTv() {
        let tvdbUrl = searchTVDBUrl();
        if (tvdbUrl) {
            GM_xmlhttpRequest({
                method: "GET",
                url: tvdbUrl,
                onload: function(response) {
                    let parser = new DOMParser();
                    let doc = parser.parseFromString(response.responseText, "text/html");
                    let spanElement = doc.querySelector("#series_basic_info > ul > li:nth-child(1) > span");
                    if (spanElement) {
                        let tvdbId = spanElement.textContent;
                        var fanartUrl = "https://webservice.fanart.tv/v3/tv/" + tvdbId + "?api_key=" + fanartapiKey;
                        console.log("Fanart API Call: " + fanartUrl);
                        getHDClearLogo(fanartUrl);
                    }
                }
            });
        }
    }

    function getHDClearLogo(fanartUrl) {
        GM_xmlhttpRequest({
            method: "GET",
            url: fanartUrl,
            onload: function(response) {
                let jsonResponse = JSON.parse(response.responseText);
                if (jsonResponse && jsonResponse.hdtvlogo) {
                    for (let i = 0; i < jsonResponse.hdtvlogo.length; i++) {
                        let logo = jsonResponse.hdtvlogo[i];
                        if (logo.lang === 'en') {
                            console.log("HD Clear Logo URL: " + logo.url);
                            addLogoToPanel(logo.url);
                            break;
                        }
                    }
                }
            }
        });
    }

    function addLogoToPanel(logoUrl) {
        var mainColumn = document.querySelector('div.sidebar');
        if (!mainColumn) return;
        var boxDiv = document.createElement('div');
        boxDiv.className = 'box';
        var logoImg = document.createElement('img');
        logoImg.src = logoUrl;
        logoImg.style.width = '100%';
        boxDiv.appendChild(logoImg);
        mainColumn.insertBefore(boxDiv, mainColumn.children[0]);
    }

    PassTvdbIdToFanartTv();
});


/* =============================================================================
 * 8. Add Similar Shows to BTN Pages  (v1)
 *    "TMDB Recommended Shows" collapsible box in the sidebar (hidden until you
 *    click the heading).
 * ========================================================================== */
mod('similar_shows', 'Similar Shows', onSeriesQuery, function () {

    let tmdbApiKey = getStoredTmdbApiKey();
    if (!tmdbApiKey) {
        console.warn('[BTN All-In-One] TMDB API key is not set; skipping Similar Shows.');
        return;
    }
    let title = document.querySelector("head > title").innerText.replace(" :: BroadcasTheNet", "");

    let searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${encodeURIComponent(tmdbApiKey)}&query=${encodeURIComponent(title)}`;

    fetch(searchUrl)
        .then(response => response.json())
        .then(data => {
            if (data.results && data.results.length > 0) {
                let series_id = data.results[0].id;
                let url = `https://api.themoviedb.org/3/tv/${series_id}/recommendations?api_key=${encodeURIComponent(tmdbApiKey)}&language=en-US`;

                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        var mainColumn = document.querySelector('div.sidebar');
                        if (!mainColumn) return;
                        var boxDiv = document.createElement('div');
                        boxDiv.className = 'box';
                        var headDiv = document.createElement('div');
                        headDiv.className = 'head';
                        headDiv.textContent = 'TMDB Recommended Shows';
                        headDiv.style.fontWeight = 'bold';
                        headDiv.style.cursor = 'pointer';
                        var notesDiv = document.createElement('div');
                        notesDiv.id = 'recommendedshows';
                        notesDiv.style.display = 'none';
                        var list = document.createElement('ol');
                        notesDiv.appendChild(list);
                        boxDiv.appendChild(headDiv);
                        boxDiv.appendChild(notesDiv);
                        mainColumn.insertBefore(boxDiv, mainColumn.children[2]);

                        headDiv.addEventListener('click', function() {
                            notesDiv.style.display = notesDiv.style.display === 'none' ? 'block' : 'none';
                        });

                        data.results.forEach(series => {
                            var listItem = document.createElement('li');
                            var link = document.createElement('a');
                            link.href = `https://broadcasthe.net/series.php?name=${encodeURIComponent(series.name)}`;
                            link.textContent = series.name;
                            listItem.appendChild(link);
                            list.appendChild(listItem);
                        });
                    })
                    .catch(error => console.error('Error:', error));
            }
        })
        .catch(error => console.error('Error:', error));
});

/* =============================================================================
 * 9. BTN Parental Helper (card layout)  (v3.1.0)
 *    IMDb Parents Guide via IMDb's internal GraphQL API, rendered as an even
 *    grid of category cards below the torrent table: colour-coded by severity,
 *    top few notes per category with a "+ N more" toggle, vote bars,
 *    collapsible, spoiler blur, UK (BBFC) certificate badge, 7-day caching.
 *    Panel collapsed by default.
 * ========================================================================== */
mod('parental_helper', 'Parental Helper', onSeriesId, function () {

    /* ------------------------------------------------------------------ *
     *  Config
     * ------------------------------------------------------------------ */
    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // cache IMDb data for 7 days
    const CACHE_PREFIX = 'btn_pg_cache_';
    const PREF_BOX_COLLAPSED = 'btn_pg_box_collapsed';
    const PREF_CAT_COLLAPSED = 'btn_pg_cat_collapsed'; // JSON map {CATID:true}
    const GQL_ENDPOINT = 'https://api.graphql.imdb.com/';
    const GQL_CLIENT_NAME = 'imdb-web-next-localized';
    // Preferred certificate country, in priority order. 'GB' = UK/BBFC.
    const CERT_PREF = ['GB', 'US'];
    // How many notes to show per category before the "+ N more" toggle.
    const ITEMS_PREVIEW = 3;
    const LOG = (...a) => console.log('[BTN-PG]', ...a);

    const CAT_META = {
        NUDITY:      { icon: '🔞', order: 0 },
        VIOLENCE:    { icon: '🔪', order: 1 },
        PROFANITY:   { icon: '🤬', order: 2 },
        ALCOHOL:     { icon: '🍸', order: 3 },
        FRIGHTENING: { icon: '😱', order: 4 }
    };

    const SEV = {
        'None':     { color: '#9a9998', rank: 0 },
        'Mild':     { color: '#8cb844', rank: 1 },
        'Moderate': { color: '#ed9a02', rank: 2 },
        'Severe':   { color: '#fa6f64', rank: 3 }
    };
    const SEV_UNKNOWN = { color: '#8a94a6', rank: -1 };

    /* ------------------------------------------------------------------ *
     *  Helpers
     * ------------------------------------------------------------------ */
    function sevInfo(level) { return (level && SEV[level]) || SEV_UNKNOWN; }
    function loadPref(k, d) { try { return GM_getValue(k, d); } catch (e) { return d; } }
    function savePref(k, v) { try { GM_setValue(k, v); } catch (e) {} }
    function delPref(k)     { try { GM_deleteValue(k); } catch (e) {} }

    function getCatCollapsedMap() {
        try { return JSON.parse(loadPref(PREF_CAT_COLLAPSED, '{}')) || {}; }
        catch (e) { return {}; }
    }
    function setCatCollapsed(catId, collapsed) {
        const m = getCatCollapsedMap();
        if (collapsed) m[catId] = true; else delete m[catId];
        savePref(PREF_CAT_COLLAPSED, JSON.stringify(m));
    }

    function sanitize(html) {
        const t = document.createElement('div');
        t.innerHTML = html || '';
        t.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(n => n.remove());
        t.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(a => {
                const n = a.name.toLowerCase();
                if (n.startsWith('on') || (n === 'href' && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
            });
        });
        return t.innerHTML;
    }
    function escapeHtml(s) {
        return (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function el(tag, cls, html) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }
    function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

    /* ------------------------------------------------------------------ *
     *  Find the IMDb id on the BTN series page
     * ------------------------------------------------------------------ */
    function findImdbId() {
        const a = document.querySelector('a[href*="imdb.com/title/tt"]');
        if (a) { const m = a.href.match(/tt\d{7,9}/); if (m) return m[0]; }
        const m2 = document.documentElement.innerHTML.match(/imdb\.com\/title\/(tt\d{7,9})/);
        return m2 ? m2[1] : null;
    }

    /* ------------------------------------------------------------------ *
     *  Networking — GraphQL POST
     * ------------------------------------------------------------------ */
    function gmPostJson(url, bodyObj, extraHeaders) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: Object.assign({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }, extraHeaders || {}),
                data: JSON.stringify(bodyObj),
                timeout: 8000,
                onload: (r) => resolve(r),
                onerror: () => reject(new Error('Network error contacting IMDb GraphQL')),
                ontimeout: () => reject(new Error('IMDb GraphQL request timed out'))
            });
        });
    }

    /* ------------------------------------------------------------------ *
     *  GraphQL query — per-category items + severity + votes
     * ------------------------------------------------------------------ */
    const PG_QUERY = `
      query BTN_ParentsGuide($id: ID!) {
        title(id: $id) {
          id
          certificate { rating }
          parentsGuide {
            categories {
              category { id text }
              severity { text votedFor }
              totalSeverityVotes
              guideItems(first: 100) {
                edges {
                  node {
                    ... on ParentsGuideItem {
                      isSpoiler
                      text { plaidHtml plainText }
                    }
                  }
                }
              }
            }
          }
        }
      }`;

    function normalizeTitle(title) {
        const pg = title && title.parentsGuide;
        const certificate = (title && title.certificate && title.certificate.rating) || null;
        if (!pg) return { ok: false, reason: 'No parents-guide data for this title.', certificate };

        const categories = (pg.categories || []).map(c => {
            const id = (c && c.category && c.category.id) || null;
            const label = (c && c.category && c.category.text) || id || '?';
            let level = (c && c.severity && c.severity.text) || null;
            if (level === 'Unknown') level = null;
            const items = ((c && c.guideItems && c.guideItems.edges) || [])
                .map(e => {
                    const n = e && e.node; if (!n) return null;
                    const html = (n.text && (n.text.plaidHtml || n.text.plainText)) || '';
                    return html ? { html, spoiler: !!n.isSpoiler } : null;
                })
                .filter(Boolean)
                .sort((a, b) => (a.spoiler ? 1 : 0) - (b.spoiler ? 1 : 0)); // non-spoilers first
            return {
                id: id || label, label, level,
                votedFor: (c && c.severity && c.severity.votedFor) || 0,
                total: (c && c.totalSeverityVotes) || 0,
                items
            };
        }).sort((a, b) => (CAT_META[a.id]?.order ?? 99) - (CAT_META[b.id]?.order ?? 99));

        const hasAny = categories.some(c => c.level || c.items.length);
        if (!hasAny) return { ok: false, reason: 'No parents-guide entries submitted for this title yet.', certificate };
        return { ok: true, certificate, categories };
    }

    async function fetchViaGraphQL(ttId) {
        const body = { query: PG_QUERY, operationName: 'BTN_ParentsGuide', variables: { id: ttId } };
        let r;
        try {
            r = await gmPostJson(GQL_ENDPOINT, body, { 'x-imdb-client-name': GQL_CLIENT_NAME });
        } catch (e) {
            return { ok: false, reason: e.message || 'GraphQL network error' };
        }
        LOG('graphql status', r.status, 'len', (r.responseText || '').length);
        if (r.status === 202 || !(r.responseText || '').trim())
            return { ok: false, reason: 'GraphQL endpoint throttled/empty (HTTP ' + r.status + ').' };
        if (r.status >= 400)
            return { ok: false, reason: 'GraphQL endpoint returned HTTP ' + r.status + '.', rawText: r.responseText };

        let json;
        try { json = JSON.parse(r.responseText); }
        catch (e) { return { ok: false, reason: 'GraphQL response was not JSON.', rawText: r.responseText }; }

        if (json.errors && json.errors.length)
            return { ok: false, reason: 'GraphQL errors: ' + json.errors.map(e => e.message).join('; '), raw: json };

        const title = json && json.data && json.data.title;
        if (!title) return { ok: false, reason: 'GraphQL returned no title data.', raw: json };

        const norm = normalizeTitle(title);
        norm.raw = json;
        return norm;
    }

    /* ------------------------------------------------------------------ *
     *  Certificates by country (separate request so a wrong field name here
     *  cannot break the parents-guide query). Picks first country in CERT_PREF.
     * ------------------------------------------------------------------ */
    const CERT_QUERY = `
      query BTN_Certs($id: ID!) {
        title(id: $id) {
          certificates(first: 80) {
            edges { node { rating country { id text } ratingsBody { id } } }
          }
        }
      }`;

    async function fetchPreferredCert(ttId) {
        let r;
        try {
            r = await gmPostJson(GQL_ENDPOINT,
                { query: CERT_QUERY, operationName: 'BTN_Certs', variables: { id: ttId } },
                { 'x-imdb-client-name': GQL_CLIENT_NAME });
        } catch (e) { LOG('cert request failed', e && e.message); return null; }
        if (r.status >= 400 || !(r.responseText || '').trim()) { LOG('cert http', r.status); return null; }
        let j; try { j = JSON.parse(r.responseText); } catch (e) { return null; }
        if (j.errors && j.errors.length) { LOG('cert query rejected:', j.errors.map(e => e.message).join('; ')); return null; }
        const edges = (j && j.data && j.data.title && j.data.title.certificates && j.data.title.certificates.edges) || [];
        const byCountry = {};
        edges.forEach(e => {
            const n = e && e.node; if (!n) return;
            const c = n.country && n.country.id; if (!c) return;
            if (!byCountry[c]) byCountry[c] = { rating: n.rating, body: (n.ratingsBody && n.ratingsBody.id) || null };
        });
        for (const c of CERT_PREF) {
            if (byCountry[c] && byCountry[c].rating) return { country: c, rating: byCountry[c].rating, body: byCountry[c].body };
        }
        return null;
    }

    /* ------------------------------------------------------------------ *
     *  Fetch with cache
     * ------------------------------------------------------------------ */
    const inflight = {};
    function fetchGuide(ttId, force) {
        if (!force && inflight[ttId]) return inflight[ttId];
        const p = _fetchGuide(ttId, force).finally(() => { if (inflight[ttId] === p) delete inflight[ttId]; });
        inflight[ttId] = p;
        return p;
    }

    async function _fetchGuide(ttId, force) {
        const cacheKey = CACHE_PREFIX + ttId;
        if (!force) {
            try {
                const cached = JSON.parse(loadPref(cacheKey, 'null'));
                if (cached && cached.data && (Date.now() - cached.at) < CACHE_TTL_MS) return cached.data;
            } catch (e) {}
        }
        let res;
        try { res = await fetchViaGraphQL(ttId); }
        catch (e) { res = { ok: false, reason: (e && e.message) || 'GraphQL failed' }; }
        if (res.ok) {
            try {
                const c = await fetchPreferredCert(ttId);
                if (c) { res.certificate = c.rating; res.certCountry = c.country; res.certBody = c.body; }
            } catch (e) { LOG('cert override skipped', e && e.message); }
            savePref(cacheKey, JSON.stringify({ at: Date.now(), data: res }));
        }
        return res;
    }

    /* ------------------------------------------------------------------ *
     *  Rendering
     * ------------------------------------------------------------------ */
    function fullLink(ttId) {
        const p = el('div', 'pg-fulllink');
        p.innerHTML = '<a href="https://www.imdb.com/title/' + ttId +
            '/parentalguide/" target="_blank" rel="noopener">View full guide on IMDb →</a>';
        return p;
    }
    function sourceBadge() {
        return '<span class="pg-src" title="Fetched from IMDb\'s internal GraphQL endpoint">GraphQL API</span>';
    }
    function certSpan(data) {
        if (!data || !data.certificate) return null;
        const country = data.certCountry ? data.certCountry + ' ' : '';
        const s = el('span', 'pg-cert', escapeHtml(country + data.certificate));
        s.title = ((data.certBody || data.certCountry || '') + ' rating').trim();
        return s;
    }
    function buildBox(ttId) {
        const box = el('div', 'box pg-box');
        box.id = 'btn-parents-guide';

        const head = el('div', 'head pg-head');
        const collapsedBox = loadPref(PREF_BOX_COLLAPSED, true);
        head.innerHTML =
            '<span class="pg-caret">' + (collapsedBox ? '▸' : '▾') + '</span>' +
            '<span class="pg-title">🎬 IMDb Parents Guide</span>' +
            '<span class="pg-head-right"></span>';

        const body = el('div', 'body pg-body');
        if (collapsedBox) body.style.display = 'none';

        head.addEventListener('click', () => {
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            head.querySelector('.pg-caret').textContent = hidden ? '▾' : '▸';
            savePref(PREF_BOX_COLLAPSED, !hidden);
        });

        box.appendChild(head);
        box.appendChild(body);
        load(box, head, body, ttId, false);
        return box;
    }

    function load(box, head, body, ttId, force) {
        body.innerHTML = '';
        body.appendChild(el('div', 'pg-status', 'Loading parents guide…'));
        fetchGuide(ttId, force)
            .then(res => res.ok ? renderData(box, head, body, res, ttId)
                                : renderMessage(box, head, body, ttId, res))
            .catch(err => {
                LOG('error', err);
                renderMessage(box, head, body, ttId, { reason: (err && err.message) || 'Unknown error' }, true);
            });
    }

    function renderMessage(box, head, body, ttId, res, isError) {
        body.innerHTML = '';
        const rightM = head.querySelector('.pg-head-right');
        rightM.innerHTML = '';
        const cM = certSpan(res); if (cM) rightM.appendChild(cM);
        body.appendChild(el('div', 'pg-status' + (isError ? ' pg-error' : ''),
            (isError ? '⚠️ ' : '') + (res.reason || 'No data.')));
        if (/202|throttl|http 4|http 5|persisted|not json|no title|did you mean/i.test(res.reason || '')) {
            body.appendChild(el('div', 'pg-hint',
                'The internal GraphQL endpoint is undocumented. Use "Show raw GraphQL response" to see exactly what it returned, then adjust the query if a field name changed.'));
        }
        const retry = el('button', 'pg-retry', '↻ Retry');
        retry.addEventListener('click', () => { delPref(CACHE_PREFIX + ttId); load(box, head, body, ttId, true); });
        body.appendChild(retry);
        body.appendChild(fullLink(ttId));
    }

    function renderData(box, head, body, data, ttId) {
        body.innerHTML = '';
        let worst = SEV_UNKNOWN, worstLevel = null;
        data.categories.forEach(c => {
            const inf = sevInfo(c.level);
            if (inf.rank > worst.rank) { worst = inf; worstLevel = c.level; }
        });
        box.style.setProperty('--pg-accent', worst.color);

        const right = head.querySelector('.pg-head-right');
        right.innerHTML = '';
        right.insertAdjacentHTML('beforeend', sourceBadge());
        const cD = certSpan(data); if (cD) right.appendChild(cD);
        if (worstLevel) { const o = el('span', 'pg-overall', worstLevel); o.style.background = worst.color; right.appendChild(o); }

        const catCollapsed = getCatCollapsedMap();

        data.categories.forEach(cat => {
            const meta = CAT_META[cat.id] || { icon: '•' };
            const inf = sevInfo(cat.level);
            const hasItems = cat.items.length > 0;

            const catEl = el('div', 'pg-cat');
            catEl.style.setProperty('--sev', inf.color);

            let collapsed = (cat.id in catCollapsed) ? catCollapsed[cat.id] : (cat.level === 'None' || !hasItems);

            const cHead = el('div', 'pg-cat-head');
            cHead.innerHTML =
                '<span class="pg-cat-caret">' + (collapsed ? '▸' : '▾') + '</span>' +
                '<span class="pg-cat-icon">' + meta.icon + '</span>' +
                '<span class="pg-cat-label">' + escapeHtml(cat.label) + '</span>' +
                (hasItems ? '<span class="pg-cat-count">' + cat.items.length + '</span>' : '') +
                '<span class="pg-sev-badge">' + (cat.level || '—') + '</span>';

            const cBody = el('div', 'pg-cat-body');
            if (collapsed) cBody.style.display = 'none';

            if (cat.total > 0) {
                const vp = pct(cat.votedFor, cat.total);
                const bar = el('div', 'pg-votebar');
                bar.title = cat.votedFor + ' of ' + cat.total + ' voters (' + vp + '%)';
                const fill = el('div', 'pg-votebar-fill');
                fill.style.width = vp + '%'; fill.style.background = inf.color;
                bar.appendChild(fill);
                cBody.appendChild(bar);
                cBody.appendChild(el('div', 'pg-votemeta', cat.votedFor + '/' + cat.total + ' voters (' + vp + '%)'));
            }

            if (hasItems) {
                const makeLi = (item) => {
                    const li = el('li', 'pg-item' + (item.spoiler ? ' pg-spoiler' : ''));
                    li.innerHTML = sanitize(item.html);
                    if (item.spoiler) { li.title = 'Spoiler — click to reveal'; li.addEventListener('click', () => li.classList.toggle('revealed')); }
                    return li;
                };
                const shown = cat.items.slice(0, ITEMS_PREVIEW);
                const rest  = cat.items.slice(ITEMS_PREVIEW);

                const ul = el('ul', 'pg-items');
                shown.forEach(item => ul.appendChild(makeLi(item)));
                cBody.appendChild(ul);

                if (rest.length) {
                    const moreUl = el('ul', 'pg-items pg-more-items');
                    moreUl.style.display = 'none';
                    rest.forEach(item => moreUl.appendChild(makeLi(item)));
                    cBody.appendChild(moreUl);

                    const moreBtn = el('button', 'pg-more', '+ ' + rest.length + ' more');
                    moreBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const hidden = moreUl.style.display === 'none';
                        moreUl.style.display = hidden ? '' : 'none';
                        moreBtn.textContent = hidden ? '− show less' : ('+ ' + rest.length + ' more');
                    });
                    cBody.appendChild(moreBtn);
                }
            } else {
                cBody.appendChild(el('div', 'pg-noitems', 'No detailed notes listed.'));
            }

            cHead.addEventListener('click', () => {
                const hidden = cBody.style.display === 'none';
                cBody.style.display = hidden ? '' : 'none';
                cHead.querySelector('.pg-cat-caret').textContent = hidden ? '▾' : '▸';
                setCatCollapsed(cat.id, !hidden);
            });

            catEl.appendChild(cHead);
            catEl.appendChild(cBody);
            body.appendChild(catEl);
        });

        body.appendChild(fullLink(ttId));
    }

    /* ------------------------------------------------------------------ *
     *  Injection — panel below the torrent table in the main column
     * ------------------------------------------------------------------ */
    function placeBox(box) {
        const mc = document.querySelector('.main_column');
        if (mc) {
            // Insert directly after the last torrent table (the season listings).
            const tables = mc.querySelectorAll('.torrent_table');
            if (tables.length) {
                const last = tables[tables.length - 1];
                last.parentNode.insertBefore(box, last.nextSibling);
                return true;
            }
            mc.appendChild(box);
            return true;
        }
        const thin = document.querySelector('.thin');
        if (thin) { thin.appendChild(box); return true; }
        return false;
    }

    function tryInject() {
        if (document.getElementById('btn-parents-guide')) return true;
        const ttId = findImdbId();
        if (!ttId) return false;
        // Wait until the torrent table(s) exist so we can place ourselves after them.
        if (!document.querySelector('.main_column .torrent_table') && !document.querySelector('.main_column')) return false;
        const box = buildBox(ttId);
        const placed = placeBox(box);
        if (placed) LOG('injected for', ttId);
        return placed;
    }

    function start() {
        const ttEarly = findImdbId();
        if (ttEarly) fetchGuide(ttEarly, false);

        if (tryInject()) return;
        let done = false;
        const finish = () => { done = true; obs.disconnect(); clearInterval(poll); clearTimeout(stop); };
        const obs = new MutationObserver(() => { if (!done && tryInject()) finish(); });
        obs.observe(document.body, { childList: true, subtree: true });
        const poll = setInterval(() => { if (!done && tryInject()) finish(); }, 800);
        const stop = setTimeout(() => { if (!done) { finish(); LOG('gave up: no IMDb link / target found'); } }, 12000);
    }

    /* ------------------------------------------------------------------ *
     *  Styles — full-width card panel, dark Gazelle theme
     * ------------------------------------------------------------------ */
    GM_addStyle(`
        #btn-parents-guide { --pg-accent:#8a94a6; clear:both; width:100%; box-sizing:border-box; margin:0 0 10px; overflow:hidden; }
        #btn-parents-guide .pg-head { display:flex; align-items:center; gap:6px; cursor:pointer; border-left:4px solid var(--pg-accent); }
        #btn-parents-guide .pg-caret { width:12px; display:inline-block; opacity:.8; }
        #btn-parents-guide .pg-title { font-weight:bold; }
        #btn-parents-guide .pg-head-right { margin-left:auto; display:flex; gap:6px; align-items:center; }
        #btn-parents-guide .pg-cert { font-size:11px; font-weight:700; letter-spacing:.3px; border:1px solid currentColor; border-radius:3px; padding:0 5px; opacity:.85; }
        #btn-parents-guide .pg-overall { font-size:11px; font-weight:700; color:#0e0e0e; border-radius:3px; padding:1px 6px; }
        #btn-parents-guide .pg-src { font-size:10px; font-weight:600; opacity:.55; border:1px solid rgba(255,255,255,.2); border-radius:3px; padding:0 5px; }

        #btn-parents-guide .pg-body { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px; align-items:start; padding:12px; }
        #btn-parents-guide .pg-status { grid-column:1 / -1; padding:6px 2px; opacity:.85; font-size:12px; }
        #btn-parents-guide .pg-error { color:#ff8a80; }
        #btn-parents-guide .pg-retry { cursor:pointer; font:inherit; font-size:11px; padding:3px 10px; border-radius:4px; border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.06); color:inherit; }
        #btn-parents-guide .pg-retry:hover { background:rgba(255,255,255,.14); }

        #btn-parents-guide .pg-cat { min-width:0; box-sizing:border-box; border:1px solid rgba(255,255,255,.08); border-top:3px solid var(--sev); border-radius:5px; background:rgba(255,255,255,.03); overflow:hidden; }
        #btn-parents-guide .pg-cat-head { display:flex; align-items:center; gap:6px; cursor:pointer; padding:7px 9px; user-select:none; }
        #btn-parents-guide .pg-cat-head:hover { background:rgba(255,255,255,.05); }
        #btn-parents-guide .pg-cat-caret { width:11px; opacity:.7; font-size:11px; }
        #btn-parents-guide .pg-cat-icon { font-size:15px; }
        #btn-parents-guide .pg-cat-label { flex:1 1 auto; font-weight:600; font-size:13px; line-height:1.2; }
        #btn-parents-guide .pg-cat-count { font-size:10px; opacity:.55; }
        #btn-parents-guide .pg-sev-badge { font-size:10px; font-weight:700; color:#0e0e0e; background:var(--sev); border-radius:3px; padding:1px 6px; white-space:nowrap; }
        #btn-parents-guide .pg-cat-body { padding:6px 9px 9px; }

        #btn-parents-guide .pg-votebar { height:5px; border-radius:3px; background:rgba(255,255,255,.1); overflow:hidden; margin:2px 0 3px; }
        #btn-parents-guide .pg-votebar-fill { height:100%; }
        #btn-parents-guide .pg-votemeta { font-size:10px; opacity:.6; margin-bottom:5px; }

        #btn-parents-guide .pg-items { list-style:none; margin:0; padding:0; }
        #btn-parents-guide .pg-item { font-size:12px; line-height:1.45; padding:5px 0; border-top:1px solid rgba(255,255,255,.06); }
        #btn-parents-guide .pg-item:first-child { border-top:none; }
        #btn-parents-guide .pg-item a { text-decoration:underline; }
        #btn-parents-guide .pg-noitems { font-size:11px; opacity:.55; padding:2px 0; }
        #btn-parents-guide .pg-more { cursor:pointer; font:inherit; font-size:11px; margin-top:6px; padding:2px 8px; border-radius:4px; border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.05); color:inherit; opacity:.85; }
        #btn-parents-guide .pg-more:hover { background:rgba(255,255,255,.13); opacity:1; }

        #btn-parents-guide .pg-spoiler { filter:blur(4px); cursor:pointer; transition:filter .15s; background:rgba(250,111,100,.06); border-radius:3px; }
        #btn-parents-guide .pg-spoiler::after { content:" 🔒 spoiler"; font-size:9px; opacity:.7; }
        #btn-parents-guide .pg-spoiler.revealed { filter:none; background:transparent; }
        #btn-parents-guide .pg-spoiler.revealed::after { content:""; }

        #btn-parents-guide .pg-fulllink { grid-column:1 / -1; margin-top:2px; font-size:11px; text-align:right; }
        #btn-parents-guide .pg-hint { grid-column:1 / -1; font-size:11px; opacity:.7; line-height:1.4; margin:2px 0 6px; }
        #btn-parents-guide .pg-retry { justify-self:start; }
    `);

    start();
});


/* =============================================================================
 * 10. BTN Sonarr Integration 2  (v0.9.4)
 *     Native-looking [Sonarr] linkbox item on BTN series pages. Multi-server
 *     config, connection testing, auto-populated quality profile & root folder
 *     dropdowns, sidebar card with per-server View/Add lines, and the
 *     add-to-Sonarr confirm modal.
 * ========================================================================== */
mod('sonarr_integration', 'Sonarr Integration', onSeries, function () {

  // Only ever run on series pages. (Belt-and-suspenders alongside @match, so a broad
  // match or future edit can never make the Sonarr UI appear on other BTN pages.)
  if (!/^\/series\.php\b/i.test(location.pathname)) return;

  /* =========================================================================
   * Storage
   * =======================================================================*/
  const STORE_KEY = 'btn_sonarr_servers_v1';

  // Cross-manager storage. Tampermonkey/Violentmonkey expose synchronous GM_getValue/
  // GM_setValue; Safari's "Userscripts" app only exposes the async GM.getValue/GM.setValue
  // (Promise-based). We hydrate an in-memory cache once at boot so the rest of the code can
  // stay synchronous, and persist writes through whichever API exists.
  const GMstore = {
    get(key, def) {
      if (typeof GM_getValue === 'function') return Promise.resolve(GM_getValue(key, def));
      if (typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function') return Promise.resolve(GM.getValue(key, def));
      try { const v = localStorage.getItem('GM_' + key); return Promise.resolve(v == null ? def : v); }
      catch (e) { return Promise.resolve(def); }
    },
    set(key, val) {
      if (typeof GM_setValue === 'function') { try { GM_setValue(key, val); } catch (e) {} return Promise.resolve(); }
      if (typeof GM !== 'undefined' && GM && typeof GM.setValue === 'function') return Promise.resolve(GM.setValue(key, val));
      try { localStorage.setItem('GM_' + key, val); } catch (e) {}
      return Promise.resolve();
    }
  };

  let serversCache = [];
  function parseServers(raw) {
    try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  async function initStorage() {
    const raw = await GMstore.get(STORE_KEY, '[]');
    serversCache = parseServers(raw);
  }
  function loadServers() {
    // hand back independent copies so callers can mutate freely before saving
    return serversCache.map(s => Object.assign({}, s));
  }
  function saveServers(list) {
    serversCache = list.map(s => Object.assign({}, s));
    GMstore.set(STORE_KEY, JSON.stringify(serversCache));
  }
  function newId() {
    return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function blankServer() {
    return {
      id: newId(),
      name: '',
      url: '',
      apiKey: '',
      qualityProfileId: null,
      rootFolderPath: '',
      languageProfileId: null,
      seasonFolder: true,
      searchOnAdd: true,
      monitor: 'all',
      // cached lookups (not authoritative)
      _profiles: [],
      _rootFolders: [],
      _languageProfiles: [],
      _version: null
    };
  }

  /* =========================================================================
   * Sonarr API helper (uses GM_xmlhttpRequest to bypass CORS / mixed content)
   * =======================================================================*/
  function normBase(url) {
    let u = (url || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/\/+$/, '');
  }

  // Tampermonkey exposes GM_xmlhttpRequest; Safari's Userscripts exposes GM.xmlHttpRequest.
  function gmXhr(opts) {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest(opts);
    if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') return GM.xmlHttpRequest(opts);
    throw new Error('No GM_xmlhttpRequest / GM.xmlHttpRequest available — check the userscript @grant lines');
  }

  function sonarrRequest(server, path, { method = 'GET', body = null } = {}) {
    const base = normBase(server.url);
    const url = base + path;
    return new Promise((resolve, reject) => {
      gmXhr({
        method,
        url,
        headers: {
          'X-Api-Key': (server.apiKey || '').trim(),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        data: body ? JSON.stringify(body) : undefined,
        timeout: 15000,
        onload: (res) => {
          let data = null;
          try { data = res.responseText ? JSON.parse(res.responseText) : null; } catch (e) {}
          if (res.status >= 200 && res.status < 300) {
            resolve({ status: res.status, data });
          } else {
            reject({
              status: res.status,
              message: (data && (data.message || data.error)) ||
                       (res.status === 401 ? 'Unauthorized — check the API key' :
                        res.status === 404 ? 'Endpoint not found — check the URL / base path' :
                        'HTTP ' + res.status),
              data
            });
          }
        },
        ontimeout: () => reject({ status: 0, message: 'Request timed out (15s)' }),
        onerror: () => reject({ status: 0, message: 'Network error — URL unreachable, or Sonarr not running' })
      });
    });
  }

  const SonarrAPI = {
    status: (s) => sonarrRequest(s, '/api/v3/system/status'),
    qualityProfiles: (s) => sonarrRequest(s, '/api/v3/qualityprofile'),
    rootFolders: (s) => sonarrRequest(s, '/api/v3/rootfolder'),
    languageProfiles: (s) => sonarrRequest(s, '/api/v3/languageprofile'), // v3 only; 404 on v4
    lookup: (s, term) => sonarrRequest(s, '/api/v3/series/lookup?term=' + encodeURIComponent(term)),
    seriesByTvdb: (s, tvdbId) => sonarrRequest(s, '/api/v3/series?tvdbId=' + encodeURIComponent(tvdbId)),
    addSeries: (s, payload) => sonarrRequest(s, '/api/v3/series', { method: 'POST', body: payload })
  };

  /* =========================================================================
   * Page facts (series identity for phase 2 add-show)
   * =======================================================================*/
  function seriesInfo() {
    try {
      const banner = document.querySelector('#banner');
      const bsrc = banner ? (banner.src || '') : '';
      // TVDB id appears in several banner URL shapes depending on show age:
      //   new: /tvdb/banners/v4/series/457437/posters/...
      //   old: /tvdb/banners/graphical/152831-g18.jpg
      //   old: /tvdb/banners/posters/152831-3.jpg  (etc.)
      let tvdbId =
        (bsrc.match(/\/v4\/series\/(\d+)\//) || [])[1] ||
        (bsrc.match(/\/series\/(\d+)\//) || [])[1] ||
        (bsrc.match(/\/graphical\/(\d+)-/) || [])[1] ||
        (bsrc.match(/\/(?:posters|fanart|seasons|banners)\/(\d+)-/) || [])[1] ||
        null;
      // Cheap, targeted lookups instead of serialising the whole page (document.body.innerHTML
      // on these large series pages was expensive and is avoided here).
      if (!tvdbId) {
        const tv = document.querySelector('a[href*="thetvdb.com"]');
        if (tv) tvdbId = (tv.href.match(/[?&](?:id|seriesid)=(\d+)/i) || [])[1] || null;
      }
      const imdbA = document.querySelector('a[href*="imdb.com/title/"]');
      const imdbId = imdbA ? ((imdbA.href.match(/title\/(tt\d+)/i) || [])[1] || null) : null;
      const title = (document.title || '').replace(/\s*::\s*BroadcasTheNet\s*$/i, '').trim();
      return { tvdbId, imdbId, title };
    } catch (e) {
      console.warn('[BTN-Sonarr] seriesInfo failed', e);
      return { tvdbId: null, imdbId: null, title: (document.title || '').replace(/\s*::\s*BroadcasTheNet\s*$/i, '').trim() };
    }
  }

  /* =========================================================================
   * Styles
   * =======================================================================*/
  const CSS = `
  #sonarr-linkbox-link { cursor: pointer; }
  #sonarr-ov {
    position: fixed; inset: 0; background: rgba(0,0,0,.6);
    z-index: 99998; display: none; align-items: flex-start; justify-content: center;
    font-family: Verdana, Arial, sans-serif;
  }
  #sonarr-ov.open { display: flex; }
  #sonarr-modal {
    background: #1c1f26; color: #d8dee9; margin-top: 6vh; width: 680px; max-width: 94vw;
    max-height: 86vh; border: 1px solid #333a45; border-radius: 8px; overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,.6); display: flex; flex-direction: column;
    font-size: 13px;
  }
  #sonarr-modal * { box-sizing: border-box; }
  .snr-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: #232833; border-bottom: 1px solid #333a45;
  }
  .snr-head h3 { margin: 0; font-size: 15px; color: #fff; font-weight: 600; letter-spacing:.3px;}
  .snr-head .snr-x { cursor: pointer; font-size: 20px; line-height: 1; color: #8b95a5; background:none;border:none;}
  .snr-head .snr-x:hover { color: #fff; }
  .snr-tabs {
    display: flex; gap: 4px; padding: 8px 12px 0 12px; background: #232833;
    border-bottom: 1px solid #333a45; overflow-x: auto; flex-wrap: nowrap;
  }
  .snr-tab {
    padding: 7px 14px; border: 1px solid #333a45; border-bottom: none; cursor: pointer;
    background: #1c1f26; color: #9aa4b2; border-radius: 6px 6px 0 0; white-space: nowrap;
    display:flex; align-items:center; gap:7px; font-size:12px;
  }
  .snr-tab.active { background: #2b3240; color: #fff; }
  .snr-tab .dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex:0 0 auto;}
  .snr-tab .dot.ok { background: #4caf50; box-shadow: 0 0 5px #4caf50; }
  .snr-tab .dot.bad { background: #e05555; }
  .snr-tab-add { color:#8fd67a; font-weight:700; }
  .snr-body { padding: 18px 20px; overflow-y: auto; }
  .snr-empty { color:#8b95a5; text-align:center; padding: 30px 10px; }
  .snr-field { margin-bottom: 14px; }
  .snr-field label { display: block; margin-bottom: 5px; color: #aeb7c4; font-weight: 600; font-size:12px;}
  .snr-field input[type=text], .snr-field input[type=url], .snr-field input[type=password], .snr-field select {
    width: 100%; padding: 8px 10px; background: #12151b; color: #e6ebf2;
    border: 1px solid #3a424f; border-radius: 5px; font-size: 13px;
  }
  .snr-field input:focus, .snr-field select:focus { outline: none; border-color: #5a8bd4; }
  .snr-row { display:flex; gap: 12px; }
  .snr-row > .snr-field { flex: 1; }
  .snr-inline { display:flex; gap:8px; align-items:center; }
  .snr-inline input[type=text],.snr-inline input[type=password]{ flex:1; }
  .snr-btn {
    padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer; font-size: 13px;
    font-weight: 600; background: #3a4757; color: #dfe6ef;
  }
  .snr-btn:hover { background: #45566a; }
  .snr-btn.primary { background: #3d7dd6; color: #fff; }
  .snr-btn.primary:hover { background: #4a8ae4; }
  .snr-btn.good { background: #3f9d54; color:#fff; }
  .snr-btn.danger { background: #7a3535; color:#f2d5d5; }
  .snr-btn.danger:hover { background: #944040; }
  .snr-btn:disabled { opacity:.5; cursor: not-allowed; }
  .snr-toggle { display:flex; align-items:center; gap:8px; cursor:pointer; color:#aeb7c4; }
  .snr-status {
    margin: 6px 0 16px; padding: 9px 12px; border-radius: 5px; font-size: 12.5px;
    display:none; align-items:center; gap:8px;
  }
  .snr-status.show { display:flex; }
  .snr-status.ok  { background: #17361f; color:#9fe6ac; border:1px solid #2f6b3d; }
  .snr-status.bad { background: #3a1c1c; color:#f0b4b4; border:1px solid #7a3838; }
  .snr-status.info{ background: #1b2836; color:#b7d2ec; border:1px solid #375473; }
  .snr-spin { width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;display:inline-block;animation:snrspin .7s linear infinite;}
  @keyframes snrspin { to { transform: rotate(360deg);} }
  .snr-foot {
    display:flex; justify-content: space-between; gap: 8px; padding: 12px 20px;
    border-top: 1px solid #333a45; background:#232833;
  }
  .snr-foot .right { display:flex; gap:8px; }
  .snr-hint { color:#7d8794; font-size:11px; margin-top:4px; }

  /* left-column card */
  #sonarr-card .head { font-weight:bold; }
  #sonarr-card .body { padding: 8px 10px; }
  .snr-line {
    display:flex; align-items:center; gap:8px; padding:5px 4px; font-size:12px;
    border-bottom:1px solid rgba(255,255,255,.05);
  }
  .snr-line:last-child { border-bottom:none; }
  .snr-line .dot { width:9px;height:9px;border-radius:50%;background:#6b7280;flex:0 0 auto; }
  .snr-line .dot.ok  { background:#4caf50; box-shadow:0 0 5px #4caf50; }
  .snr-line .dot.bad { background:#e05555; }
  .snr-line .dot.wait{ background:#d0a24c; }
  .snr-line a.snr-act { cursor:pointer; text-decoration:none; }
  .snr-line a.snr-act:hover { text-decoration:underline; }
  .snr-line .snr-sub { color:#8b95a5; font-size:11px; margin-left:auto; }
  .snr-line.busy { opacity:.6; }

  /* add-confirm modal reuses sonarr-ov styles via shared classes */
  #sonarr-add-ov {
    position: fixed; inset: 0; background: rgba(0,0,0,.6);
    z-index: 99999; display: none; align-items: flex-start; justify-content: center;
    font-family: Verdana, Arial, sans-serif;
  }
  #sonarr-add-ov.open { display:flex; }
  .snr-addhead { display:flex; gap:14px; padding:16px 20px; border-bottom:1px solid #333a45; background:#232833; }
  .snr-addhead img { width:80px; height:auto; border-radius:4px; flex:0 0 auto; background:#12151b; }
  .snr-addhead .meta h3 { margin:0 0 4px; font-size:16px; color:#fff; }
  .snr-addhead .meta .sub { color:#9aa4b2; font-size:12px; }
  .snr-addhead .meta .srv { margin-top:8px; font-size:12px; color:#b7d2ec; }
  `;

  function injectStyle() {
    if (document.getElementById('sonarr-style')) return;
    const st = document.createElement('style');
    st.id = 'sonarr-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* =========================================================================
   * Modal UI
   * =======================================================================*/
  let servers = loadServers();
  let activeTab = 0; // index into servers, or -1 for none

  function buildModalSkeleton() {
    if (document.getElementById('sonarr-ov')) return;
    const ov = document.createElement('div');
    ov.id = 'sonarr-ov';
    ov.innerHTML = `
      <div id="sonarr-modal">
        <div class="snr-head">
          <h3>Sonarr Servers</h3>
          <button class="snr-x" title="Close">&times;</button>
        </div>
        <div class="snr-tabs"></div>
        <div class="snr-body"></div>
        <div class="snr-foot">
          <button class="snr-btn danger" data-act="delete">Delete this server</button>
          <div class="right">
            <button class="snr-btn" data-act="close">Close</button>
            <button class="snr-btn primary" data-act="save">Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);

    ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
    ov.querySelector('.snr-x').addEventListener('click', closeModal);
    ov.querySelector('[data-act="close"]').addEventListener('click', closeModal);
    ov.querySelector('[data-act="save"]').addEventListener('click', onSaveClick);
    ov.querySelector('[data-act="delete"]').addEventListener('click', onDeleteClick);
  }

  function openModal() {
    buildModalSkeleton();
    servers = loadServers();
    if (servers.length === 0) { servers.push(blankServer()); activeTab = 0; }
    if (activeTab < 0 || activeTab >= servers.length) activeTab = 0;
    renderTabs();
    renderBody();
    document.getElementById('sonarr-ov').classList.add('open');
  }
  function closeModal() {
    const ov = document.getElementById('sonarr-ov');
    if (ov) ov.classList.remove('open');
    // refresh status colour + card after any edits
    refreshLinkStatus();
    renderPanel();
  }

  function renderTabs() {
    const tabs = document.querySelector('#sonarr-modal .snr-tabs');
    tabs.innerHTML = '';
    servers.forEach((s, i) => {
      const t = document.createElement('div');
      t.className = 'snr-tab' + (i === activeTab ? ' active' : '');
      const dotCls = s._live === true ? 'ok' : (s._live === false ? 'bad' : '');
      t.innerHTML = `<span class="dot ${dotCls}"></span><span>${escapeHtml(s.name || ('Server ' + (i + 1)))}</span>`;
      t.addEventListener('click', () => { commitCurrentForm(); activeTab = i; renderTabs(); renderBody(); });
      tabs.appendChild(t);
    });
    const add = document.createElement('div');
    add.className = 'snr-tab snr-tab-add';
    add.innerHTML = '<span>+ Add</span>';
    add.title = 'Add another server';
    add.addEventListener('click', () => {
      commitCurrentForm();
      servers.push(blankServer());
      activeTab = servers.length - 1;
      renderTabs(); renderBody();
    });
    tabs.appendChild(add);
  }

  function renderBody() {
    const body = document.querySelector('#sonarr-modal .snr-body');
    const s = servers[activeTab];
    if (!s) { body.innerHTML = '<div class="snr-empty">No server selected.</div>'; return; }

    body.innerHTML = `
      <div class="snr-field">
        <label>Server name</label>
        <input type="text" data-f="name" placeholder="e.g. Home Sonarr" value="${escapeAttr(s.name)}">
      </div>
      <div class="snr-field">
        <label>URL</label>
        <input type="text" data-f="url" placeholder="http://192.168.1.50:8989" value="${escapeAttr(s.url)}">
        <div class="snr-hint">Include http/https, host and port. Add a base path if Sonarr sits behind a reverse proxy (e.g. https://host/sonarr).</div>
      </div>
      <div class="snr-field">
        <label>API Key</label>
        <div class="snr-inline">
          <input type="password" data-f="apiKey" placeholder="Sonarr → Settings → General → API Key" value="${escapeAttr(s.apiKey)}">
          <button class="snr-btn" data-act="reveal" type="button">Show</button>
          <button class="snr-btn primary" data-act="test" type="button">Test</button>
        </div>
      </div>

      <div class="snr-status" data-el="status"></div>

      <div class="snr-row">
        <div class="snr-field">
          <label>Quality Profile</label>
          <select data-f="qualityProfileId"><option value="">— test connection first —</option></select>
        </div>
        <div class="snr-field">
          <label>Root Folder</label>
          <select data-f="rootFolderPath"><option value="">— test connection first —</option></select>
        </div>
      </div>
      <div class="snr-row">
        <div class="snr-field" data-el="langWrap" style="display:none;">
          <label>Language Profile</label>
          <select data-f="languageProfileId"></select>
        </div>
        <div class="snr-field">
          <label>Default monitor</label>
          <select data-f="monitor">
            ${['all','future','missing','existing','firstSeason','lastSeason','pilot','none']
              .map(v=>`<option value="${v}" ${s.monitor===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="snr-field">
        <label class="snr-toggle"><input type="checkbox" data-f="seasonFolder" ${s.seasonFolder?'checked':''}> Use season folders</label>
      </div>
      <div class="snr-field">
        <label class="snr-toggle"><input type="checkbox" data-f="searchOnAdd" ${s.searchOnAdd?'checked':''}> Search for missing episodes on add</label>
        <div class="snr-hint">When adding a show, tell Sonarr to immediately start searching indexers for episodes.</div>
      </div>
    `;

    // wire field inputs -> live object
    body.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f;
      const handler = () => {
        if (el.type === 'checkbox') s[f] = el.checked;
        else if (f === 'qualityProfileId' || f === 'languageProfileId') s[f] = el.value ? Number(el.value) : null;
        else s[f] = el.value;
      };
      el.addEventListener('change', handler);
      el.addEventListener('input', handler);
    });

    // reveal api key
    body.querySelector('[data-act="reveal"]').addEventListener('click', (e) => {
      const inp = body.querySelector('[data-f="apiKey"]');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      e.target.textContent = show ? 'Hide' : 'Show';
    });
    // test
    body.querySelector('[data-act="test"]').addEventListener('click', () => testAndPopulate(s));

    // auto test when both url + key filled and dropdowns empty
    const urlEl = body.querySelector('[data-f="url"]');
    const keyEl = body.querySelector('[data-f="apiKey"]');
    const maybeAuto = () => {
      if (urlEl.value.trim() && keyEl.value.trim() && (!s._profiles || !s._profiles.length)) testAndPopulate(s);
    };
    urlEl.addEventListener('blur', maybeAuto);
    keyEl.addEventListener('blur', maybeAuto);

    // if we already have cached lookups, render them
    if (s._profiles && s._profiles.length) fillProfiles(s);
    if (s._rootFolders && s._rootFolders.length) fillRootFolders(s);
    if (s._languageProfiles && s._languageProfiles.length) fillLanguageProfiles(s);
    if (s._live === true) setStatus('ok', `Connected — Sonarr v${s._version || '?'}`);
  }

  function commitCurrentForm() {
    const body = document.querySelector('#sonarr-modal .snr-body');
    if (!body) return;
    const s = servers[activeTab];
    if (!s) return;
    body.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f;
      if (el.type === 'checkbox') s[f] = el.checked;
      else if (f === 'qualityProfileId' || f === 'languageProfileId') s[f] = el.value ? Number(el.value) : null;
      else s[f] = el.value;
    });
  }

  function setStatus(kind, html) {
    const el = document.querySelector('#sonarr-modal [data-el="status"]');
    if (!el) return;
    el.className = 'snr-status show ' + kind;
    el.innerHTML = (kind === 'info' ? '<span class="snr-spin"></span>' : '') + html;
  }

  function fillProfiles(s) {
    const sel = document.querySelector('#sonarr-modal [data-f="qualityProfileId"]');
    if (!sel) return;
    sel.innerHTML = '<option value="">— select —</option>' +
      s._profiles.map(p => `<option value="${p.id}" ${s.qualityProfileId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
  }
  function fillRootFolders(s) {
    const sel = document.querySelector('#sonarr-modal [data-f="rootFolderPath"]');
    if (!sel) return;
    sel.innerHTML = '<option value="">— select —</option>' +
      s._rootFolders.map(r => {
        const free = r.freeSpace ? ' (' + bytes(r.freeSpace) + ' free)' : '';
        return `<option value="${escapeAttr(r.path)}" ${s.rootFolderPath===r.path?'selected':''}>${escapeHtml(r.path)}${free}</option>`;
      }).join('');
  }
  function fillLanguageProfiles(s) {
    const wrap = document.querySelector('#sonarr-modal [data-el="langWrap"]');
    const sel = document.querySelector('#sonarr-modal [data-f="languageProfileId"]');
    if (!wrap || !sel) return;
    if (!s._languageProfiles.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    sel.innerHTML = s._languageProfiles.map(p => `<option value="${p.id}" ${s.languageProfileId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
  }

  async function testAndPopulate(s) {
    commitCurrentForm();
    if (!s.url || !s.url.trim()) { setStatus('bad', 'Enter a URL first.'); return; }
    if (!s.apiKey || !s.apiKey.trim()) { setStatus('bad', 'Enter an API key first.'); return; }
    setStatus('info', 'Testing connection…');
    try {
      const st = await SonarrAPI.status(s);
      s._live = true;
      s._version = st.data && st.data.version;
      if (!s.name) { s.name = (st.data && st.data.instanceName) || hostFrom(s.url); }
      // fetch profiles + root folders in parallel
      const [qp, rf] = await Promise.all([
        SonarrAPI.qualityProfiles(s).catch(() => ({ data: [] })),
        SonarrAPI.rootFolders(s).catch(() => ({ data: [] }))
      ]);
      s._profiles = qp.data || [];
      s._rootFolders = rf.data || [];
      // language profiles are v3-only; ignore failures silently
      try { const lp = await SonarrAPI.languageProfiles(s); s._languageProfiles = lp.data || []; }
      catch (e) { s._languageProfiles = []; }

      fillProfiles(s); fillRootFolders(s); fillLanguageProfiles(s);
      // default selections if none chosen
      if (!s.qualityProfileId && s._profiles[0]) { s.qualityProfileId = s._profiles[0].id; fillProfiles(s); }
      if (!s.rootFolderPath && s._rootFolders[0]) { s.rootFolderPath = s._rootFolders[0].path; fillRootFolders(s); }

      const nameField = document.querySelector('#sonarr-modal [data-f="name"]');
      if (nameField && !nameField.value) nameField.value = s.name;

      setStatus('ok', `Connected — Sonarr v${s._version || '?'}. Loaded ${s._profiles.length} profile(s), ${s._rootFolders.length} root folder(s).`);
      renderTabs();
    } catch (err) {
      s._live = false;
      setStatus('bad', 'Failed: ' + escapeHtml(err.message || 'unknown error'));
      renderTabs();
    }
  }

  function onSaveClick() {
    commitCurrentForm();
    // drop entirely-empty servers
    const clean = servers.filter(s => (s.url && s.url.trim()) || (s.name && s.name.trim()));
    // strip volatile cache before persisting live flag but keep lookups for convenience
    saveServers(clean);
    servers = loadServers();
    if (activeTab >= servers.length) activeTab = servers.length - 1;
    setStatus('ok', 'Saved.');
    renderTabs();
    refreshLinkStatus();
  }

  function onDeleteClick() {
    if (!servers[activeTab]) return;
    const s = servers[activeTab];
    if (!confirm('Delete server "' + (s.name || 'Server ' + (activeTab + 1)) + '"?')) return;
    servers.splice(activeTab, 1);
    if (servers.length === 0) servers.push(blankServer());
    activeTab = Math.max(0, activeTab - 1);
    saveServers(servers.filter(x => (x.url && x.url.trim())));
    renderTabs(); renderBody();
    refreshLinkStatus();
  }

  /* =========================================================================
   * Linkbox injection + status colour
   * =======================================================================*/
  function getLinkbox() {
    const link = [...document.querySelectorAll('div.linkbox a, .linkbox a')]
      .find(a => /Add to Favorites|Notify of New Uploads|Autofill Actors|View history/i.test(a.textContent));
    return link ? link.parentElement : document.querySelector('div.linkbox');
  }

  function injectLink() {
    if (document.getElementById('sonarr-linkbox-link')) return true;
    const box = getLinkbox();
    if (!box) return false;
    box.appendChild(document.createTextNode('\n    '));
    const a = document.createElement('a');
    a.id = 'sonarr-linkbox-link';
    a.href = 'javascript:void(0)';
    a.textContent = '[Sonarr]';
    a.title = 'Sonarr integration';
    a.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    box.appendChild(a);
    return true;
  }

  function setLink(color, title) {
    const a = document.getElementById('sonarr-linkbox-link');
    if (!a) return;
    // BTN forces link colour via its stylesheet, so override with !important
    a.style.setProperty('color', color, 'important');
    a.style.setProperty('font-weight', '600', 'important');
    a.title = title;
  }

  async function refreshLinkStatus() {
    try {
      const list = loadServers().filter(s => s.url && s.url.trim() && s.apiKey && s.apiKey.trim());
      if (list.length === 0) {
        setLink('#e05555', 'No Sonarr server configured — click to set one up');
        return;
      }
      setLink('#d0a24c', 'Checking Sonarr connection…');
      const results = await Promise.all(list.map(s =>
        SonarrAPI.status(s).then(r => ({ ok: true, name: s.name, v: r.data && r.data.version }))
                           .catch(e => ({ ok: false, name: s.name, err: (e && e.message) || 'error' }))
      ));
      const okCount = results.filter(r => r.ok).length;
      const tip = results.map(r => (r.ok ? '✓ ' + (r.name || 'Sonarr') + ' (v' + (r.v || '?') + ')'
                                          : '✗ ' + (r.name || 'Sonarr') + ' — ' + r.err)).join('\n');
      if (okCount === list.length) setLink('#4caf50', tip);          // all good -> green
      else if (okCount > 0)        setLink('#8fbf5a', tip);          // some good -> light green
      else                         setLink('#e05555', tip);          // none      -> red
    } catch (e) {
      console.warn('[BTN-Sonarr] refreshLinkStatus failed', e);
    }
  }

  /* =========================================================================
   * Utils
   * =======================================================================*/
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s){ return escapeHtml(s); }
  function hostFrom(u){ try { return new URL(normBase(u)).host; } catch(e){ return 'Sonarr'; } }
  function bytes(n){ if(!n) return '0 B'; const u=['B','KB','MB','GB','TB','PB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return n.toFixed(1)+' '+u[i]; }

  /* =========================================================================
   * Left-column card ("View on…" / "Add to…" per server)
   * =======================================================================*/
  function injectPanel() {
    if (document.getElementById('sonarr-card')) return true;
    const sb = document.querySelector('.sidebar');
    const firstBox = sb && sb.querySelector(':scope > .box');
    if (!sb || !firstBox) return false;
    const card = document.createElement('div');
    card.className = 'box';
    card.id = 'sonarr-card';
    card.innerHTML = '<div class="head"><strong>Sonarr</strong></div>' +
                     '<div class="body"><div style="padding:8px;color:#8b95a5;font-size:12px;">Loading…</div></div>';
    sb.insertBefore(card, firstBox);
    return true;
  }

  function renderPanel() {
    const body = document.querySelector('#sonarr-card .body');
    if (!body) return;
    let list;
    try { list = loadServers().filter(s => s.url && s.url.trim() && s.apiKey && s.apiKey.trim()); }
    catch (e) { console.warn('[BTN-Sonarr] renderPanel load failed', e); return; }
    body.innerHTML = '';
    if (list.length === 0) {
      const line = document.createElement('div');
      line.className = 'snr-line';
      line.innerHTML = '<span class="dot bad"></span>';
      const a = document.createElement('a');
      a.className = 'snr-act'; a.href = 'javascript:void(0)'; a.textContent = 'Configure Sonarr…';
      a.style.setProperty('color', '#e05555', 'important');
      a.addEventListener('click', openModal);
      line.appendChild(a); body.appendChild(line);
      return;
    }
    const info = seriesInfo();
    list.forEach(s => {
      const line = document.createElement('div');
      line.className = 'snr-line busy';
      line.innerHTML = '<span class="dot wait"></span>' +
                       '<span>' + escapeHtml(s.name || hostFrom(s.url)) + '</span>' +
                       '<span class="snr-sub">checking…</span>';
      body.appendChild(line);
      resolveServerLine(s, info, line);
    });
  }

  async function resolveServerLine(s, info, line) {
    try {
      await SonarrAPI.status(s);
      let existing = null;
      if (info.tvdbId) {
        try { const r = await SonarrAPI.seriesByTvdb(s, info.tvdbId); existing = (r.data && r.data[0]) || null; } catch (e) {}
      }
      line.classList.remove('busy');
      line.innerHTML = '<span class="dot ok"></span>';
      const a = document.createElement('a');
      a.className = 'snr-act';
      a.style.setProperty('color', '#4caf50', 'important');
      if (existing) {
        a.href = normBase(s.url) + '/series/' + encodeURIComponent(existing.titleSlug);
        a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'View on ' + (s.name || hostFrom(s.url));
        line.appendChild(a);
        const sub = document.createElement('span'); sub.className = 'snr-sub'; sub.textContent = 'in library';
        line.appendChild(sub);
      } else {
        a.href = 'javascript:void(0)';
        a.textContent = 'Add to ' + (s.name || hostFrom(s.url));
        a.addEventListener('click', () => openAddModal(s, info));
        line.appendChild(a);
      }
    } catch (err) {
      line.classList.remove('busy');
      line.innerHTML = '<span class="dot bad"></span>';
      const span = document.createElement('span');
      span.textContent = 'Add to ' + (s.name || hostFrom(s.url));
      span.style.setProperty('color', '#e05555', 'important');
      span.title = 'Offline: ' + (err.message || 'unreachable');
      line.appendChild(span);
      const sub = document.createElement('span'); sub.className = 'snr-sub'; sub.textContent = 'offline';
      line.appendChild(sub);
    }
  }

  /* =========================================================================
   * Add-to-Sonarr confirm modal
   * =======================================================================*/
  let addState = null;

  function buildAddSkeleton() {
    if (document.getElementById('sonarr-add-ov')) return;
    const ov = document.createElement('div');
    ov.id = 'sonarr-add-ov';
    ov.innerHTML = `
      <div id="sonarr-modal" style="width:560px;">
        <div class="snr-addhead">
          <img data-el="poster" alt="">
          <div class="meta">
            <h3 data-el="title">…</h3>
            <div class="sub" data-el="sub"></div>
            <div class="srv" data-el="srv"></div>
          </div>
        </div>
        <div class="snr-body">
          <div class="snr-status" data-el="status"></div>
          <div class="snr-row">
            <div class="snr-field"><label>Quality Profile</label><select data-f="qualityProfileId"></select></div>
            <div class="snr-field"><label>Root Folder</label><select data-f="rootFolderPath"></select></div>
          </div>
          <div class="snr-row">
            <div class="snr-field" data-el="langWrap" style="display:none;"><label>Language Profile</label><select data-f="languageProfileId"></select></div>
            <div class="snr-field"><label>Monitor</label><select data-f="monitor">
              ${['all','future','missing','existing','firstSeason','lastSeason','pilot','none'].map(v=>`<option value="${v}">${v}</option>`).join('')}
            </select></div>
          </div>
          <div class="snr-field"><label class="snr-toggle"><input type="checkbox" data-f="seasonFolder"> Use season folders</label></div>
          <div class="snr-field"><label class="snr-toggle"><input type="checkbox" data-f="searchOnAdd"> Search for missing episodes on add</label></div>
        </div>
        <div class="snr-foot">
          <button class="snr-btn" data-act="cancel">Cancel</button>
          <div class="right"><button class="snr-btn good" data-act="add">Add to Sonarr</button></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); });
    ov.querySelector('[data-act="cancel"]').addEventListener('click', () => ov.classList.remove('open'));
  }

  async function openAddModal(server, info) {
    buildAddSkeleton();
    const ov = document.getElementById('sonarr-add-ov');
    ov.classList.add('open');
    const q = (sel) => ov.querySelector(sel);
    const setStat = (k, h) => { const el = q('[data-el="status"]'); el.className = 'snr-status show ' + k; el.innerHTML = (k === 'info' ? '<span class="snr-spin"></span>' : '') + h; };
    const hideStat = () => { q('[data-el="status"]').className = 'snr-status'; };

    q('[data-el="srv"]').textContent = 'Server: ' + (server.name || hostFrom(server.url));
    q('[data-el="title"]').textContent = info.title || 'Resolving…';
    q('[data-el="sub"]').textContent = '';
    q('[data-el="poster"]').src = '';
    const addBtn = q('[data-act="add"]'); addBtn.disabled = true;
    setStat('info', 'Resolving series & loading options…');

    try {
      const term = info.tvdbId ? ('tvdb:' + info.tvdbId) : info.title;
      const [qp, rf, lk] = await Promise.all([
        SonarrAPI.qualityProfiles(server),
        SonarrAPI.rootFolders(server),
        SonarrAPI.lookup(server, term)
      ]);
      let lang = [];
      try { const lp = await SonarrAPI.languageProfiles(server); lang = lp.data || []; } catch (e) {}
      const profiles = qp.data || [], roots = rf.data || [];
      const found = (lk.data || []).find(x => String(x.tvdbId) === String(info.tvdbId)) || (lk.data || [])[0];
      if (!found) { setStat('bad', 'Could not find this series in Sonarr’s lookup.'); return; }
      addState = { server, lookup: found };

      q('[data-el="title"]').textContent = (found.title || info.title) + (found.year ? (' (' + found.year + ')') : '');
      q('[data-el="sub"]').textContent = [found.network, found.status,
        (found.seasons ? found.seasons.filter(se => se.seasonNumber > 0).length + ' seasons' : '')].filter(Boolean).join(' · ');
      const poster = (found.images || []).find(i => i.coverType === 'poster');
      if (poster) q('[data-el="poster"]').src = poster.remoteUrl || poster.url;

      q('[data-f="qualityProfileId"]').innerHTML = profiles.map(p =>
        `<option value="${p.id}" ${server.qualityProfileId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
      q('[data-f="rootFolderPath"]').innerHTML = roots.map(r =>
        `<option value="${escapeAttr(r.path)}" ${server.rootFolderPath===r.path?'selected':''}>${escapeHtml(r.path)}${r.freeSpace?(' ('+bytes(r.freeSpace)+' free)'):''}</option>`).join('');
      const langWrap = q('[data-el="langWrap"]');
      if (lang.length) {
        langWrap.style.display = '';
        q('[data-f="languageProfileId"]').innerHTML = lang.map(p =>
          `<option value="${p.id}" ${server.languageProfileId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
      } else { langWrap.style.display = 'none'; }
      q('[data-f="monitor"]').value = server.monitor || 'all';
      q('[data-f="seasonFolder"]').checked = server.seasonFolder !== false;
      q('[data-f="searchOnAdd"]').checked = server.searchOnAdd !== false;

      hideStat();
      addBtn.disabled = false;
      addBtn.onclick = () => doAdd(ov, q, setStat, addBtn);
    } catch (err) {
      setStat('bad', 'Error: ' + escapeHtml(err.message || 'unknown'));
    }
  }

  async function doAdd(ov, q, setStat, addBtn) {
    if (!addState) return;
    const { server, lookup } = addState;
    const qpId = Number(q('[data-f="qualityProfileId"]').value) || null;
    const rootPath = q('[data-f="rootFolderPath"]').value;
    const langWrap = q('[data-el="langWrap"]');
    const langId = (langWrap.style.display !== 'none' && q('[data-f="languageProfileId"]').value)
      ? Number(q('[data-f="languageProfileId"]').value) : null;
    const monitor = q('[data-f="monitor"]').value;
    const seasonFolder = q('[data-f="seasonFolder"]').checked;
    const searchOnAdd = q('[data-f="searchOnAdd"]').checked;
    if (!qpId) { setStat('bad', 'Pick a quality profile.'); return; }
    if (!rootPath) { setStat('bad', 'Pick a root folder.'); return; }

    const payload = Object.assign({}, lookup, {
      qualityProfileId: qpId,
      rootFolderPath: rootPath,
      monitored: true,
      seasonFolder: seasonFolder,
      addOptions: { monitor: monitor, searchForMissingEpisodes: searchOnAdd, searchForCutoffUnmetEpisodes: false }
    });
    if (langId) payload.languageProfileId = langId;

    addBtn.disabled = true;
    setStat('info', 'Adding to ' + (server.name || 'Sonarr') + '…');
    try {
      await SonarrAPI.addSeries(server, payload);
      setStat('ok', 'Added! ' + (searchOnAdd ? 'Sonarr is searching for episodes.' : 'Monitoring set.'));
      setTimeout(() => { ov.classList.remove('open'); renderPanel(); }, 1300);
    } catch (err) {
      addBtn.disabled = false;
      setStat('bad', 'Add failed: ' + escapeHtml(err.message || 'unknown'));
    }
  }

  /* =========================================================================
   * Boot
   * =======================================================================*/
  let booted = false;
  function attemptInject() {
    if (booted) return true;
    try {
      injectStyle();
      const a = injectLink();
      const b = injectPanel();
      if (a && b) {
        booted = true;
        // Fire-and-forget; both are fully self-contained and swallow their own errors,
        // but guard here too so nothing can ever escape into the page / other userscripts.
        Promise.resolve().then(refreshLinkStatus).catch(e => console.warn('[BTN-Sonarr] status', e));
        Promise.resolve().then(renderPanel).catch(e => console.warn('[BTN-Sonarr] panel', e));
      }
    } catch (e) {
      console.warn('[BTN-Sonarr] inject attempt failed', e);
    }
    return booted;
  }

  function boot() {
    console.log('%c[BTN-Sonarr] loaded', 'color:#4caf50;font-weight:bold', location.href);
    if (attemptInject()) return;
    // linkbox / sidebar can render slightly late — retry on a bounded timer only.
    // (No MutationObserver: on these busy pages a subtree observer added needless load,
    //  and a bounded timer is enough and can't run away.)
    let tries = 0;
    const iv = setInterval(() => {
      try { if (attemptInject() || ++tries > 25) clearInterval(iv); }
      catch (e) { clearInterval(iv); console.warn('[BTN-Sonarr] boot retry failed', e); }
    }, 400);
  }

  // expose series info for the add flow
  window.__btnSeries = seriesInfo();

  (async () => {
    try { await initStorage(); }
    catch (e) { console.error('[BTN-Sonarr] storage init error', e); }
    try { boot(); }
    catch (e) { console.error('[BTN-Sonarr] boot error', e); }
  })();
});


/* =============================================================================
 * 11. BTN TMDB Enricher  (v1.5.0)
 *     Enriches series.php pages with TMDB metadata: PTP-style hero banner,
 *     extra Series Info pills, overview, actor cards, seasons, written
 *     reviews, BTN-linked recommendations, and a trailer link with modal popup.
 *     Also fixes YouTube "Error 153". Artwork/watch-providers remain available
 *     via the SHOW toggles.
 *
 *     Runs LAST so the Declutter module's `.btn-tmdb-info` grid already exists.
 * ========================================================================== */
mod('tmdb_enricher', 'TMDB Enricher', onSeries, function () {

  /* ============================================================
   *  CONFIG
   *  You can use EITHER:
   *    • a v3 API key (32-char hex)
   *    • a v4 read access token ("eyJ..." )
   *  Only one is required. If you set both, the bearer is used.
   *  Set these at runtime via the Tampermonkey menu commands below.
   * ============================================================ */
  let TMDB_API_KEY = getStoredTmdbApiKey();
  let TMDB_BEARER  = getStoredTmdbBearer(); // optional v4 token

  // How much to show. Flip any of these on/off to taste.
  const SHOW = {
    heroBanner:     true,   // PTP-style hero block banner at the top of the page
    extraInfoPills: true,   // extra pills appended to the existing Series Info grid
    tagline:        true,
    overview:       true,   // full TMDB overview (in case BTN's summary is short/missing)
    cast:           true,   // BTN-linked top-billed cast with photos
    createdBy:      true,
    seasons:        true,   // season posters + episode counts
    trailer:        false,  // in-box "Watch Trailer" button (off; use the [YouTube] linkbar link)
    artwork:        false,  // backdrop / poster gallery  (off per request)
    keywords:       true,
    watchProviders: false,  // "where to stream"  (off per request)
    writtenReviews: true,   // TMDB written reviews panel
    recommendations:true,   // BTN-linked TMDB recommendations panel
    linkbarTrailer: true,   // "[YouTube]" trailer link in the top action bar
    hideRequestsTable: true // remove the Requests table above the TMDB box
  };
  const WATCH_REGION = 'US'; // change to GB, AU, etc.
  // If your browser blocks autoplay-with-sound and the big center play button
  // still lingers, set this to true to start the trailer muted (guaranteed autoplay).
  const TRAILER_MUTED = false;

  /* ============================================================
   *  Nothing below here needs editing.
   * ============================================================ */

  GM_registerMenuCommand('Set TMDB API key (v3)', () => {
    const v = prompt('Paste your TMDB v3 API key (32-char hex):', TMDB_API_KEY);
    if (v != null) { GM_setValue(TMDB_API_KEY_STORAGE, v.trim()); TMDB_API_KEY = v.trim(); location.reload(); }
  });
  GM_registerMenuCommand('Set TMDB v4 bearer token', () => {
    const v = prompt('Paste your TMDB v4 read access token (eyJ...):', TMDB_BEARER);
    if (v != null) { GM_setValue(TMDB_BEARER_STORAGE, v.trim()); TMDB_BEARER = v.trim(); location.reload(); }
  });

  const IMG = 'https://image.tmdb.org/t/p/';
  const img = (path, size) => path ? IMG + size + path : null;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const btnSeriesUrl = name => 'https://broadcasthe.net/series.php?name=' + encodeURIComponent(String(name || '').trim());
  const btnSearchLink = (href, label, cls) => `<a class="${cls || ''}" href="${esc(href)}">${esc(label)}</a>`;

  function keyMissing() {
    return (!TMDB_BEARER) && !TMDB_API_KEY;
  }

  // -------- TMDB request via GM_xmlhttpRequest (bypasses page CSP/CORS) --------
  function tmdb(pathAndQuery) {
    return new Promise((resolve, reject) => {
      const sep = pathAndQuery.includes('?') ? '&' : '?';
      let url = 'https://api.themoviedb.org/3' + pathAndQuery;
      const headers = { 'Accept': 'application/json' };
      if (TMDB_BEARER) headers['Authorization'] = 'Bearer ' + TMDB_BEARER;
      else url += sep + 'api_key=' + encodeURIComponent(TMDB_API_KEY);
      GM_xmlhttpRequest({
        method: 'GET', url, headers, timeout: 20000,
        onload: r => {
          try {
            const j = JSON.parse(r.responseText);
            if (r.status >= 200 && r.status < 300) resolve(j);
            else reject(new Error('TMDB ' + r.status + ': ' + (j.status_message || r.statusText)));
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error('Network error contacting TMDB')),
        ontimeout: () => reject(new Error('TMDB request timed out')),
      });
    });
  }

  // -------- Pull identifiers off the BTN page --------
  function pageIdentifiers() {
    const links = [...document.querySelectorAll('a[href]')];
    const grab = re => { for (const a of links) { const m = a.href.match(re); if (m) return m[1]; } return null; };
    const title = (document.title.split('::')[0] || '').trim() ||
      ($('.thin')?.textContent || '').trim();
    // year from the existing "FIRST AIRED" pill if present
    let year = null;
    document.querySelectorAll('.btn-info-item').forEach(it => {
      if (/FIRST AIRED/i.test(it.textContent)) { const m = it.textContent.match(/(\d{4})/); if (m) year = m[1]; }
    });
    return {
      tmdb: grab(/themoviedb\.org\/tv\/(\d+)/),
      imdb: grab(/imdb\.com\/title\/(tt\d+)/),
      tvdbId: grab(/thetvdb\.com\/.*?[?&]id=(\d+)/),
      title, year,
    };
  }

  async function resolveTmdbId(ids) {
    if (ids.tmdb) return ids.tmdb;
    if (ids.imdb) {
      const f = await tmdb('/find/' + ids.imdb + '?external_source=imdb_id');
      if (f.tv_results && f.tv_results[0]) return f.tv_results[0].id;
    }
    if (ids.tvdbId) {
      const f = await tmdb('/find/' + ids.tvdbId + '?external_source=tvdb_id');
      if (f.tv_results && f.tv_results[0]) return f.tv_results[0].id;
    }
    if (ids.title) {
      const q = '/search/tv?query=' + encodeURIComponent(ids.title) +
        (ids.year ? '&first_air_date_year=' + ids.year : '');
      const s = await tmdb(q);
      if (s.results && s.results[0]) return s.results[0].id;
    }
    return null;
  }

  function fetchEverything(id) {
    const append = [
      'external_ids', 'content_ratings', 'credits', 'aggregate_credits',
      'images', 'videos', 'keywords', 'recommendations', 'reviews',
      'watch/providers'
    ].join(',');
    return tmdb('/tv/' + id +
      '?append_to_response=' + append +
      '&include_image_language=en,null');
  }

  // ============================ RENDERING ============================

  function pill(label, valueHTML, accent) {
    if (valueHTML == null || valueHTML === '') return '';
    return `<div class="btn-info-item"><div class="btn-info-label">${esc(label)}</div>` +
      `<span class="btn-info-pill${accent ? ' accent' : ''}">${valueHTML}</span></div>`;
  }

  function addInfoPills(d) {
    const grid = $('.btn-tmdb-info .btn-info-grid');
    if (!grid || grid.dataset.tmdbxDone) return;
    const genres = (d.genres || []).map(g => g.name).join(', ');
    const created = (d.created_by || []).map(c => c.name).join(', ');
    const langs = (d.spoken_languages || []).map(l => l.english_name || l.name).join(', ');
    const nextEp = d.next_episode_to_air;
    const lastEp = d.last_episode_to_air;
    const vote = d.vote_average ? `${d.vote_average.toFixed(1)}<span class="tmx-sub"> /10 · ${(d.vote_count || 0).toLocaleString()} votes</span>` : null;

    const html = [
      SHOW.extraInfoPills && pill('TMDB RATING', vote, true),
      SHOW.extraInfoPills && pill('POPULARITY', d.popularity ? Math.round(d.popularity).toLocaleString() : null),
      SHOW.extraInfoPills && pill('GENRES', genres ? esc(genres) : null),
      SHOW.extraInfoPills && pill('EPISODES', d.number_of_episodes ? `${d.number_of_episodes} across ${d.number_of_seasons} seasons` : null),
      SHOW.extraInfoPills && pill('ORIG. LANGUAGE', langs ? esc(langs) : (d.original_language || '').toUpperCase()),
      SHOW.extraInfoPills && pill('TYPE', d.type ? esc(d.type) : null),
      SHOW.extraInfoPills && pill('IN PRODUCTION', d.in_production != null ? (d.in_production ? 'Yes' : 'No') : null),
      SHOW.extraInfoPills && created && pill('CREATED BY', esc(created)),
      SHOW.extraInfoPills && nextEp && pill('NEXT EPISODE', `${esc(nextEp.air_date || 'TBA')} · S${nextEp.season_number}E${nextEp.episode_number}`, true),
      SHOW.extraInfoPills && lastEp && pill('LATEST EPISODE', `${esc(lastEp.air_date || '')} · S${lastEp.season_number}E${lastEp.episode_number}`),
      SHOW.extraInfoPills && d.homepage && pill('HOMEPAGE', `<a href="${esc(d.homepage)}" target="_blank" rel="noopener">Official site ↗</a>`),
    ].filter(Boolean).join('');

    grid.insertAdjacentHTML('beforeend', html);
    grid.dataset.tmdbxDone = '1';
  }

  function sectionBox(title, innerHTML) {
    const box = el('div', 'box tmx-box');
    box.innerHTML = `<div class="head"><strong>${esc(title)}</strong>` +
      `<span class="tmx-badge">TMDB</span></div>` +
      `<div class="tmx-body">${innerHTML}</div>`;
    return box;
  }

  function buildOverviewSection(d) {
    const parts = [];
    if (SHOW.tagline && d.tagline) parts.push(`<p class="tmx-tagline">“${esc(d.tagline)}”</p>`);
    if (SHOW.overview && d.overview) parts.push(`<p class="tmx-overview">${esc(d.overview)}</p>`);

    const meta = [];
    if (SHOW.createdBy && d.created_by && d.created_by.length) {
      meta.push('Created by ' + d.created_by
        .map(c => esc(c.name))
        .join(', '));
    }
    if (d.networks && d.networks.length) meta.push('Network: ' + d.networks.map(n => esc(n.name)).join(', '));
    if (meta.length) parts.push(`<p class="tmx-meta">${meta.join(' &nbsp;·&nbsp; ')}</p>`);

    const kws = d.keywords && (d.keywords.results || d.keywords.keywords);
    if (SHOW.keywords && kws && kws.length) {
      parts.push(`<div class="tmx-block"><h4>Keywords</h4><div class="tmx-tags">` +
        kws.slice(0, 30).map(k => `<span class="tmx-tag">${esc(k.name)}</span>`).join('') + `</div></div>`);
    }

    if (SHOW.watchProviders && d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results[WATCH_REGION]) {
      const wp = d['watch/providers'].results[WATCH_REGION];
      const buckets = [['flatrate', 'Stream'], ['free', 'Free'], ['ads', 'With ads'], ['rent', 'Rent'], ['buy', 'Buy']];
      let rows = '';
      buckets.forEach(([k, lbl]) => {
        if (wp[k] && wp[k].length) {
          rows += `<div class="tmx-wp-row"><span class="tmx-wp-lbl">${lbl}</span>` +
            wp[k].map(p => `<img class="tmx-wp-logo" title="${esc(p.provider_name)}" src="${img(p.logo_path, 'w45')}" alt="${esc(p.provider_name)}">`).join('') +
            `</div>`;
        }
      });
      if (rows) parts.push(`<div class="tmx-block"><h4>Where to watch (${WATCH_REGION})</h4>${rows}</div>`);
    }

    if (SHOW.trailer) {
      const v = pickTrailer(d);
      if (v) parts.push(`<div class="tmx-block"><h4>Trailer</h4>` +
        `<button type="button" class="tmx-yt-btn" data-yt="${esc(v.key)}" data-title="${esc(v.name || (d.name + ' — Trailer'))}">` +
        `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>` +
        `<span>Watch Trailer</span></button></div>`);
    }

    if (SHOW.artwork && d.images) {
      const backs = (d.images.backdrops || []).slice(0, 8)
        .map(b => `<a href="${img(b.file_path, 'original')}" target="_blank" rel="noopener"><img src="${img(b.file_path, 'w300')}" loading="lazy" alt="backdrop"></a>`).join('');
      const posters = (d.images.posters || []).slice(0, 8)
        .map(p => `<a href="${img(p.file_path, 'original')}" target="_blank" rel="noopener"><img src="${img(p.file_path, 'w185')}" loading="lazy" alt="poster"></a>`).join('');
      if (backs || posters) parts.push(`<div class="tmx-block"><h4>Artwork</h4>` +
        (backs ? `<div class="tmx-scroll tmx-art">${backs}</div>` : '') +
        (posters ? `<div class="tmx-scroll tmx-art">${posters}</div>` : '') + `</div>`);
    }

    if (!parts.length) return null;
    return sectionBox('TMDB Overview', parts.join(''));
  }

  function buildCastSection(d) {
    const cast = (d.credits && d.credits.cast) || (d.aggregate_credits && d.aggregate_credits.cast) || [];
    if (!SHOW.cast || !cast.length) return null;
    const cards = cast.slice(0, 24).map(c => {
      const role = c.character || (c.roles && c.roles[0] && c.roles[0].character) || '';
      const photo = img(c.profile_path, 'w185');
      return `<div class="tmx-cast">` +
        (photo ? `<img src="${photo}" alt="${esc(c.name)}" loading="lazy">` : `<div class="tmx-noimg">${esc(c.name.slice(0,1))}</div>`) +
        `<div class="tmx-cast-name">${esc(c.name)}</div>` +
        `<div class="tmx-cast-role">${esc(role)}</div></div>`;
    }).join('');
    return sectionBox('Actors', `<div class="tmx-scroll">${cards}</div>`);
  }

  function buildSeasonsSection(d) {
    if (!SHOW.seasons || !d.seasons || !d.seasons.length) return null;
    const cards = d.seasons.map(s => {
      const poster = img(s.poster_path, 'w185');
      return `<div class="tmx-season">` +
        (poster ? `<img src="${poster}" alt="${esc(s.name)}" loading="lazy">` : `<div class="tmx-noimg">${esc(s.name)}</div>`) +
        `<div class="tmx-cast-name">${esc(s.name)}</div>` +
        `<div class="tmx-cast-role">${s.episode_count || 0} eps${s.air_date ? ' · ' + s.air_date.slice(0,4) : ''}` +
        (s.vote_average ? ` · ★${s.vote_average.toFixed(1)}` : '') + `</div></div>`;
    }).join('');
    return sectionBox('Seasons', `<div class="tmx-scroll">${cards}</div>`);
  }

  function buildReviewsSection(d) {
    const reviews = (d.reviews && d.reviews.results) || [];
    if (!SHOW.writtenReviews || !reviews.length) return null;
    const cards = reviews.slice(0, 4).map(r => {
      const content = r.content.length > 900 ? r.content.slice(0, 900) + '…' : r.content;
      const rating = r.author_details && r.author_details.rating;
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      return `<article class="tmx-review-card">` +
        `<div class="tmx-review-head"><strong>${esc(r.author || 'TMDB user')}</strong>` +
        `<span>${rating ? `★ ${esc(rating)}/10` : ''}${rating && date ? ' · ' : ''}${esc(date)}</span></div>` +
        `<div class="tmx-review">${esc(content)}</div></article>`;
    }).join('');
    return sectionBox('Written Reviews', `<div class="tmx-review-list">${cards}</div>`);
  }

  function buildRecommendationsSection(d) {
    const recs = (d.recommendations && d.recommendations.results) || [];
    if (!SHOW.recommendations || !recs.length) return null;
    const cards = recs.slice(0, 18).map(s => {
      const poster = img(s.poster_path, 'w185');
      const year = (s.first_air_date || '').slice(0, 4);
      return `<a class="tmx-rec" href="${esc(btnSeriesUrl(s.name))}">` +
        (poster ? `<img src="${poster}" alt="${esc(s.name)}" loading="lazy">` : `<div class="tmx-noimg">${esc(s.name.slice(0,1))}</div>`) +
        `<div class="tmx-cast-name">${esc(s.name)}</div>` +
        `<div class="tmx-cast-role">${year ? esc(year) : 'BTN search'}${s.vote_average ? ` · ★${s.vote_average.toFixed(1)}` : ''}</div></a>`;
    }).join('');
    return sectionBox('Recommended Shows', `<div class="tmx-scroll">${cards}</div>`);
  }

  function buildRichSections(d) {
    return [
      buildOverviewSection(d),
      buildCastSection(d),
      buildSeasonsSection(d),
      buildReviewsSection(d),
      buildRecommendationsSection(d),
    ].filter(Boolean);
  }

  // ---------- PTP-style hero banner ----------
  function certFor(d, region) {
    const cr = (d.content_ratings && d.content_ratings.results) || [];
    const hit = cr.find(x => x.iso_3166_1 === region) || cr.find(x => x.iso_3166_1 === 'US') || cr[0];
    return hit && hit.rating ? hit.rating : null;
  }
  function scoreColor(pct) { return pct >= 70 ? '#21d07a' : pct >= 40 ? '#d2d531' : '#db2360'; }
  function ratingRing(pct) {
    const R = 26, C = 2 * Math.PI * R, off = C * (1 - pct / 100), col = scoreColor(pct);
    return `<svg class="tmx-ring" viewBox="0 0 60 60" width="60" height="60">` +
      `<circle cx="30" cy="30" r="${R}" fill="#081c22" stroke="#204529" stroke-width="4"/>` +
      `<circle cx="30" cy="30" r="${R}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" ` +
      `stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 30 30)"/>` +
      `<text x="30" y="34" text-anchor="middle" class="tmx-ring-txt">${pct}<tspan class="tmx-ring-pct">%</tspan></text></svg>`;
  }
  function starRow(voteAvg) {
    const full = Math.round(voteAvg); // out of 10
    let s = '';
    for (let i = 1; i <= 10; i++) s += `<span class="tmx-star${i <= full ? ' on' : ''}">★</span>`;
    return s;
  }
  function buildHero(d) {
    const backdrop = (d.images && d.images.backdrops && d.images.backdrops[0] && d.images.backdrops[0].file_path) || d.backdrop_path;
    const poster = d.poster_path;
    const year = (d.first_air_date || '').slice(0, 4);
    const pct = d.vote_average ? Math.round(d.vote_average * 10) : null;
    const cert = certFor(d, WATCH_REGION);
    const runtime = (d.episode_run_time && d.episode_run_time[0]) ? d.episode_run_time[0] + 'm' : null;
    const genres = (d.genres || []).map(g => g.name).join(' · ');
    const meta = [
      cert ? `<span class="tmx-cert">${esc(cert)}</span>` : '',
      runtime ? `<span>${esc(runtime)}</span>` : '',
      d.first_air_date ? `<span>${esc(d.first_air_date)}</span>` : '',
      d.number_of_seasons ? `<span>${d.number_of_seasons} season${d.number_of_seasons > 1 ? 's' : ''}</span>` : '',
      d.popularity ? `<span class="tmx-flame">🔥 ${Math.round(d.popularity).toLocaleString()}</span>` : '',
    ].filter(Boolean).join('<span class="tmx-dot">•</span>');

    const hero = el('div', 'tmx-hero');
    hero.innerHTML =
      `<div class="tmx-hero-bg"${backdrop ? ` style="background-image:url(${IMG}w1280${backdrop})"` : ''}></div>` +
      `<div class="tmx-hero-inner">` +
        (poster ? `<img class="tmx-hero-poster" src="${img(poster, 'w342')}" alt="${esc(d.name || '')}" loading="lazy">` : '') +
        `<div class="tmx-hero-main">` +
          `<div class="tmx-hero-title">${esc(d.name || '')}${year ? ` <span class="tmx-hero-year">(${year})</span>` : ''}</div>` +
          (d.tagline ? `<div class="tmx-hero-tag">“${esc(d.tagline)}”</div>` : '') +
          `<div class="tmx-hero-meta">${meta}</div>` +
          (genres ? `<div class="tmx-hero-genres">${esc(genres)}</div>` : '') +
          (d.overview ? `<div class="tmx-hero-overview">${esc(d.overview)}</div>` : '') +
        `</div>` +
        `<div class="tmx-hero-ratings">` +
          (pct != null ? `<div class="tmx-rate-block">${ratingRing(pct)}<div class="tmx-rate-cap">TMDB<br><span>${(d.vote_count || 0).toLocaleString()} votes</span></div></div>` : '') +
          (d.vote_average ? `<div class="tmx-stars">${starRow(d.vote_average)}</div>` : '') +
          (d.vote_average ? `<div class="tmx-rate-avg">Average: ${pct}% (${(d.vote_count || 0).toLocaleString()} votes)</div>` : '') +
        `</div>` +
      `</div>`;
    return hero;
  }
  function insertHero(d) {
    if (!SHOW.heroBanner || document.querySelector('.tmx-hero')) return;
    const thin = document.querySelector('#content .thin') || document.querySelector('.thin');
    if (!thin || !thin.parentElement) return;
    // Insert ABOVE the whole float context (.thin holds floated sidebar + main_column),
    // otherwise the banner gets squeezed into a column.
    thin.parentElement.insertBefore(buildHero(d), thin);
  }

  // Insert the rich section directly ABOVE the big fanart box.
  function insertAboveFanart(node) {
    // Fanart is the large centered image in the main column
    let fanart = [...document.querySelectorAll('.main_column img, #content img')]
      .filter(i => i.offsetWidth > 500)
      .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
    let anchorBox = fanart;
    while (anchorBox && !anchorBox.classList?.contains('box')) anchorBox = anchorBox.parentElement;

    if (anchorBox && anchorBox.parentElement) {
      anchorBox.parentElement.insertBefore(node, anchorBox);
    } else {
      // Fallback: after the existing Series Info panel, else top of main column
      const info = $('.btn-tmdb-info');
      const mc = $('.main_column') || $('#content');
      if (info && info.parentElement) info.parentElement.insertBefore(node, info.nextSibling);
      else if (mc) mc.insertBefore(node, mc.firstChild);
    }
  }

  function toast(msg, isErr) {
    const t = el('div', 'tmx-toast' + (isErr ? ' err' : ''), esc(msg));
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, isErr ? 8000 : 3500);
  }

  // -------- Trailer modal (popup player) --------
  // Uses the standard youtube.com/embed host WITH referrerpolicy, which is the
  // combination that plays despite this site's <meta name="referrer" content="never">
  // (that meta is what causes YouTube "Error 153"). youtube-nocookie does NOT work here.
  function closeTrailer() {
    const ov = document.getElementById('tmx-modal-ov');
    if (ov) ov.remove();
    document.removeEventListener('keydown', onEscKey);
  }
  function onEscKey(e) { if (e.key === 'Escape') closeTrailer(); }
  function openTrailer(key, title) {
    closeTrailer();
    // controls=0 hides the control bar; autoplay=1 (+ forced play below) makes the
    // big center play button disappear. enablejsapi lets us postMessage "playVideo".
    const params = new URLSearchParams({
      autoplay: '1', controls: '0', rel: '0', modestbranding: '1',
      playsinline: '1', fs: '1', enablejsapi: '1', origin: location.origin
    });
    if (TRAILER_MUTED) params.set('mute', '1');
    const ov = el('div', '', '');
    ov.id = 'tmx-modal-ov';
    ov.innerHTML =
      `<div class="tmx-modal" role="dialog" aria-label="Trailer">` +
        `<div class="tmx-modal-head">` +
          `<span class="tmx-modal-title">${esc(title || 'Trailer')}</span>` +
          `<a class="tmx-modal-link" href="https://www.youtube.com/watch?v=${esc(key)}" target="_blank" rel="noopener">Open on YouTube ↗</a>` +
          `<button type="button" class="tmx-modal-x" aria-label="Close">✕</button>` +
        `</div>` +
        `<div class="tmx-modal-body">` +
          `<iframe src="https://www.youtube.com/embed/${esc(key)}?${params.toString()}" ` +
            `referrerpolicy="strict-origin-when-cross-origin" ` +
            `allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>` +
        `</div>` +
      `</div>`;
    ov.addEventListener('click', e => { if (e.target === ov) closeTrailer(); });
    ov.querySelector('.tmx-modal-x').addEventListener('click', closeTrailer);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onEscKey);

    // Force playback once the frame loads (postMessage to the enablejsapi player).
    // This dismisses the center play overlay when the URL autoplay is throttled.
    const frame = ov.querySelector('iframe');
    const play = () => { try {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    } catch (e) {} };
    frame.addEventListener('load', () => { play(); setTimeout(play, 350); setTimeout(play, 1000); });
  }

  // Delegate clicks from any trailer trigger (the red button OR the linkbar link).
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-yt]');
    if (b) { e.preventDefault(); openTrailer(b.dataset.yt, b.dataset.title); }
  });

  function pickEmbeddedTrailer(d) {
    const v = INITIAL_PAGE_YOUTUBE_TRAILER || findPageYoutubeTrailer();
    if (!v) return null;
    return Object.assign({}, v, {
      name: v.name || ((d && d.name ? d.name + ' — ' : '') + 'Trailer')
    });
  }

  // Pick the best YouTube trailer from TMDB's videos list, falling back to
  // BTN's own embedded trailer when TMDB has no video entry for the show.
  function pickTrailer(d) {
    const vids = (d && d.videos && d.videos.results) || [];
    return vids.find(x => /^YouTube$/i.test(x.site) && x.type === 'Trailer' && x.official) ||
           vids.find(x => /^YouTube$/i.test(x.site) && x.type === 'Trailer') ||
           vids.find(x => /^YouTube$/i.test(x.site) && x.type === 'Teaser') ||
           vids.find(x => /^YouTube$/i.test(x.site)) ||
           pickEmbeddedTrailer(d);
  }

  function getTrailerLinkbox() {
    const sonarr = document.getElementById('sonarr-linkbox-link');
    if (sonarr && sonarr.parentElement) return sonarr.parentElement;

    const direct = document.querySelector('#series .thin > .linkbox, #content .thin > .linkbox, .thin > .linkbox');
    if (direct) return direct;

    const link = [...document.querySelectorAll('div.linkbox a, .linkbox a')]
      .find(a => /Add to Favorites|Notify of New Uploads|Autofill Actors|View history|Sonarr/i.test(a.textContent));
    return link ? link.parentElement : document.querySelector('#series .linkbox, #content .linkbox, div.linkbox, .linkbox');
  }

  // Add a "[YouTube]" trailer link into the top action bar (.linkbox),
  // styled to match the other items with a red "Y" for eye-catch.
  function addLinkbarTrailer(d) {
    if (!SHOW.linkbarTrailer) return true;
    if (document.querySelector('.tmx-yt-link')) return true;
    const v = pickTrailer(d);
    if (!v || !v.key) return false;
    const bar = getTrailerLinkbox();
    if (!bar) return false;
    const a = el('a', 'tmx-yt-link');
    a.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.key);
    a.dataset.yt = v.key;
    a.dataset.title = v.name || ((d && d.name ? d.name + ' — ' : '') + 'Trailer');
    a.title = 'Watch the trailer';
    a.innerHTML = '[<span class="tmx-yt-y">Y</span><span class="tmx-yt-rest">ouTube</span>]';
    bar.appendChild(document.createTextNode('  '));
    bar.appendChild(a);
    return true;
  }

  function watchTrailerLink(d) {
    let tries = 0;
    const iv = setInterval(() => {
      addLinkbarTrailer(d);
      if (document.querySelector('.tmx-yt-link') || ++tries > 30) clearInterval(iv);
    }, 500);
  }

  // Remove the "Requests" table (REQUEST NAME / VOTE / BOUNTY / ...) that sits
  // above the TMDB box. Matched by its header cells, not just class, to be safe.
  function removeRequestsTable() {
    [...document.querySelectorAll('table.border, .main_column table')].forEach(t => {
      const head = (t.querySelector('tr') || {}).innerText || '';
      if (/REQUEST NAME/i.test(head) && /BOUNTY/i.test(head) && !t.classList.contains('torrent_table')) {
        t.remove();
      }
    });
  }

  // -------- Fix ANY YouTube iframe already on the page (e.g. BTN's own
  // "Youtube Trailer" box) so it stops throwing Error 153. --------
  function fixYtIframe(f) {
    if (!f || f.dataset.tmxFixed) return;
    if (!/youtube(?:-nocookie)?\.com\/embed\//.test(f.src)) return;
    f.dataset.tmxFixed = '1';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    try {
      const u = new URL(f.src);
      u.hostname = 'www.youtube.com'; // nocookie fails on this site; force standard host
      f.src = u.toString();           // reassigning src forces a reload with the new policy
    } catch (e) { /* ignore */ }
  }
  function scanYtIframes(root) {
    (root.querySelectorAll ? root.querySelectorAll('iframe') : []).forEach(fixYtIframe);
    if (root.tagName === 'IFRAME') fixYtIframe(root);
  }
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scanYtIframes(n); }));
  }).observe(document.documentElement, { childList: true, subtree: true });
  scanYtIframes(document);

  // ============================ STYLES ============================
  GM_addStyle(`
    /* ---- Hero banner ---- */
    .tmx-hero { position:relative; overflow:hidden; border-radius:10px; margin:0 0 14px;
      min-height:230px; display:flex; align-items:stretch; padding:0 !important; }
    .tmx-hero-bg { position:absolute; inset:0; background-size:cover; background-position:center 20%;
      filter:saturate(1.05); }
    .tmx-hero-bg::after { content:''; position:absolute; inset:0;
      background:linear-gradient(90deg, rgba(8,10,14,.97) 0%, rgba(8,10,14,.86) 42%, rgba(8,10,14,.55) 100%),
        linear-gradient(0deg, rgba(8,10,14,.85) 0%, rgba(8,10,14,0) 45%); }
    .tmx-hero-inner { position:relative; z-index:1; display:flex; gap:22px; padding:22px 26px; width:100%; align-items:center; color:#fff; }
    .tmx-hero-poster { width:132px; min-width:132px; height:auto; border-radius:8px; align-self:center;
      box-shadow:0 6px 22px rgba(0,0,0,.55); }
    .tmx-hero-main { flex:1; min-width:0; }
    .tmx-hero-title { font-size:30px; font-weight:800; line-height:1.1; text-shadow:0 2px 8px rgba(0,0,0,.6); }
    .tmx-hero-year { font-weight:400; opacity:.7; font-size:22px; }
    .tmx-hero-tag { font-style:italic; opacity:.9; margin:4px 0 10px; }
    .tmx-hero-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:13px; opacity:.92; }
    .tmx-hero-meta .tmx-dot { opacity:.5; }
    .tmx-cert { border:1px solid rgba(255,255,255,.5); border-radius:4px; padding:0 6px; font-weight:700; font-size:12px; }
    .tmx-flame { font-weight:600; }
    .tmx-hero-genres { margin:8px 0 6px; font-size:13px; font-weight:600; color:#01b4e4; }
    .tmx-hero-overview { font-size:13px; line-height:1.5; opacity:.92; max-width:70ch;
      display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .tmx-hero-ratings { display:flex; flex-direction:column; align-items:center; gap:6px; min-width:150px; }
    .tmx-rate-block { display:flex; align-items:center; gap:8px; }
    .tmx-ring-txt { fill:#fff; font-size:18px; font-weight:800; }
    .tmx-ring-pct { font-size:10px; }
    .tmx-rate-cap { font-size:11px; font-weight:700; line-height:1.2; }
    .tmx-rate-cap span { font-weight:400; opacity:.7; }
    .tmx-stars { letter-spacing:1px; font-size:15px; }
    .tmx-star { color:rgba(255,255,255,.28); }
    .tmx-star.on { color:#f5c518; }
    .tmx-rate-avg { font-size:12px; opacity:.85; }
    @media (max-width:820px){ .tmx-hero-inner{flex-wrap:wrap} .tmx-hero-ratings{min-width:0} }
    /* ---- rest ---- */
    .tmx-box .head { display:flex; align-items:center; justify-content:space-between; }
    .tmx-badge { font-size:10px; font-weight:700; letter-spacing:.5px; background:#01b4e4; color:#fff;
      padding:1px 6px; border-radius:3px; }
    .tmx-body { padding:10px 12px; }
    .tmx-tagline { font-style:italic; opacity:.85; margin:4px 0 10px; font-size:14px; }
    .tmx-overview { margin:0 0 10px; line-height:1.5; }
    .tmx-meta { font-size:12px; opacity:.8; margin:0 0 10px; }
    .tmx-block { margin:14px 0; }
    .tmx-block h4 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.6px; opacity:.7; }
    .tmx-scroll { display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; scrollbar-width:thin; }
    .tmx-cast, .tmx-season, .tmx-rec { flex:0 0 92px; width:92px; text-align:center; font-size:11px; }
    a.tmx-cast, a.tmx-rec { display:block; color:inherit !important; text-decoration:none !important; }
    a.tmx-cast:hover .tmx-cast-name, a.tmx-rec:hover .tmx-cast-name { color:#01b4e4; text-decoration:underline; }
    .tmx-cast img, .tmx-season img, .tmx-rec img { width:92px; height:138px; object-fit:cover; border-radius:6px; display:block; }
    .tmx-noimg { width:92px; height:138px; border-radius:6px; display:flex; align-items:center; justify-content:center;
      background:rgba(127,127,127,.25); font-size:20px; font-weight:700; }
    .tmx-cast-name { font-weight:600; margin-top:4px; line-height:1.2; }
    .tmx-cast-role { opacity:.65; line-height:1.2; }
    .tmx-art a { flex:0 0 auto; }
    .tmx-art img { height:110px; width:auto; border-radius:6px; display:block; }
    .tmx-yt-link { cursor:pointer; font-weight:700 !important; text-decoration:none; white-space:nowrap; }
    .tmx-yt-link .tmx-yt-y { color:#ff0000 !important; }
    .tmx-yt-link .tmx-yt-rest { color:#ffffff !important; }
    .tmx-yt-link:hover .tmx-yt-rest { text-decoration:underline; }
    .tmx-yt-btn { display:inline-flex; align-items:center; gap:8px; cursor:pointer;
      background:#ff0000; color:#fff; border:0; border-radius:8px; padding:8px 16px;
      font-size:14px; font-weight:700; line-height:1; transition:filter .15s; }
    .tmx-yt-btn:hover { filter:brightness(1.12); }
    .tmx-yt-btn svg { display:block; }
    #tmx-modal-ov { position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,.8);
      display:flex; align-items:center; justify-content:center; padding:24px; }
    .tmx-modal { width:min(900px,95vw); background:#0d0d0f; border-radius:12px; overflow:hidden;
      box-shadow:0 20px 60px rgba(0,0,0,.6); }
    .tmx-modal-head { display:flex; align-items:center; gap:14px; padding:10px 14px;
      background:#161619; border-bottom:1px solid rgba(255,255,255,.08); }
    .tmx-modal-title { font-weight:700; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tmx-modal-link { font-size:12px; font-weight:600; color:#01b4e4; text-decoration:none; white-space:nowrap; }
    .tmx-modal-link:hover { text-decoration:underline; }
    .tmx-modal-x { cursor:pointer; background:transparent; border:0; color:#fff; font-size:18px;
      line-height:1; padding:2px 6px; border-radius:6px; }
    .tmx-modal-x:hover { background:rgba(255,255,255,.12); }
    .tmx-modal-body { position:relative; width:100%; aspect-ratio:16/9; background:#000; }
    .tmx-modal-body iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
    .tmx-tags { display:flex; flex-wrap:wrap; gap:6px; }
    .tmx-tag { background:rgba(1,180,228,.15); border:1px solid rgba(1,180,228,.4); color:inherit;
      padding:2px 8px; border-radius:12px; font-size:11px; }
    .tmx-wp-row { display:flex; align-items:center; gap:6px; margin:4px 0; flex-wrap:wrap; }
    .tmx-wp-lbl { font-size:11px; opacity:.7; width:64px; }
    .tmx-wp-logo { width:32px; height:32px; border-radius:6px; }
    .tmx-btn-link { font-weight:700; }
    .tmx-review-list {
      display:grid !important;
      gap:12px !important;
      height:auto !important;
      min-height:0 !important;
      margin:0 !important;
      overflow:visible !important;
    }
    .tmx-review-card {
      display:flex !important;
      flex-direction:column !important;
      gap:8px !important;
      height:auto !important;
      min-height:0 !important;
      margin:0 !important;
      padding:0 !important;
      overflow:visible !important;
      contain:none !important;
    }
    .tmx-review-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px 10px; margin:0; font-size:12px; }
    .tmx-review-head span { opacity:.66; white-space:nowrap; }
    .tmx-review {
      display:block !important;
      position:static !important;
      float:none !important;
      clear:none !important;
      box-sizing:border-box !important;
      width:100% !important;
      height:auto !important;
      min-height:0 !important;
      max-height:none !important;
      margin:0 !important;
      padding:10px 12px !important;
      border:1px solid rgba(1,180,228,.18) !important;
      border-left:3px solid #01b4e4 !important;
      border-radius:0 6px 6px 0 !important;
      background:rgba(127,127,127,.08) !important;
      color:inherit !important;
      opacity:.9;
      line-height:1.5;
      white-space:pre-wrap;
      overflow:visible !important;
    }
    .tmx-sub { font-weight:400; opacity:.6; font-size:11px; }
    .tmx-toast { position:fixed; bottom:20px; right:20px; z-index:99999; background:#01b4e4; color:#fff;
      padding:10px 16px; border-radius:8px; font-size:13px; box-shadow:0 4px 16px rgba(0,0,0,.3);
      opacity:0; transform:translateY(10px); transition:.35s; max-width:340px; }
    .tmx-toast.err { background:#c0392b; }
    .tmx-toast.show { opacity:1; transform:none; }
  `);

  // ============================ MAIN ============================
  let DATA = null; // cached TMDB response for this page load

  async function loadData() {
    if (DATA) return DATA;
    const ids = pageIdentifiers();
    const id = await resolveTmdbId(ids);
    if (!id) throw new Error('could not match this show on TMDB');
    const ckey = 'tmdbx_' + id;
    let data;
    const cached = sessionStorage.getItem(ckey);
    if (cached) { try { data = JSON.parse(cached); } catch (e) {} }
    if (!data) { data = await fetchEverything(id); try { sessionStorage.setItem(ckey, JSON.stringify(data)); } catch (e) {} }
    DATA = data;
    return data;
  }

  async function run() {
    const pageTrailerReady = addLinkbarTrailer(null);
    if (keyMissing()) {
      toast('TMDB Enricher: add your API key via the Tampermonkey menu → "Set TMDB API key".', true);
      return pageTrailerReady; // keep retrying briefly if only the linkbox is late
    }
    try {
      if (SHOW.hideRequestsTable) removeRequestsTable();
      const data = await loadData();
      // 0) Hero banner at the very top (idempotent).
      insertHero(data);
      // 1) Append pills to the existing Series Info grid (idempotent).
      addInfoPills(data);
      // 2) "[YouTube]" trailer link in the top action bar (idempotent).
      const trailerReady = addLinkbarTrailer(data);
      watchTrailerLink(data);
      // 3) Insert the rich TMDB panels above the fanart (idempotent).
      if (!document.querySelector('.tmx-box')) {
        const frag = document.createDocumentFragment();
        buildRichSections(data).forEach(node => frag.appendChild(node));
        if (frag.childNodes.length) insertAboveFanart(frag);
        toast('TMDB Enricher: added details for “' + (data.name || '') + '”.');
      }
      // Done only once both parts are placed.
      const gridReady = !$('.btn-tmdb-info .btn-info-grid') || $('.btn-tmdb-info .btn-info-grid[data-tmdbx-done]');
      return !!(document.querySelector('.tmx-box') && gridReady && trailerReady);
    } catch (e) {
      console.error('[BTN TMDB Enricher]', e);
      toast('TMDB Enricher error: ' + e.message, true);
      return true; // don't spam retries on a hard error
    }
  }

  // The existing Series Info panel may be injected by another script slightly
  // late, so retry a few times until both injection points are satisfied.
  let tries = 0;
  (async function attempt() {
    const done = await run();
    if (!done && tries++ < 12) setTimeout(attempt, 700);
  })();
});


})();
