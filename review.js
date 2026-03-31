/*  ═══════════════════════════════════════════════════════════════
    review.js — Drop-in artifact review layer
    
    Usage: Add this ONE line to any HTML file:
    <script src="review.js"></script>
    ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var FB = "https://artifact-reviews-default-rtdb.firebaseio.com";
  var SLUG = location.pathname.replace(/^\/|\/$/g, "").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-") || "index";
  var DBPATH = "reviews/" + SLUG + "/threads";

  // ─── Firebase REST ───
  function fbGet(p) { return fetch(FB + "/" + p + ".json").then(function (r) { return r.json(); }).catch(function () { return null; }); }
  function fbPut(p, d) { return fetch(FB + "/" + p + ".json", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).catch(function () { }); }
  function fbLoad() { return fbGet(DBPATH).then(function (v) { return v ? Object.values(v) : []; }); }
  function fbSave(threads) { var o = {}; threads.forEach(function (t) { o[t.id] = t; }); return fbPut(DBPATH, o); }
  function ldId() { try { return localStorage.getItem("review_identity"); } catch (e) { return null; } }
  function svId(n) { try { localStorage.setItem("review_identity", n); } catch (e) { } }

  // ─── Helpers ───
  function timeAgo(ts) { var d = Date.now() - ts, m = Math.floor(d / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; var h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; }
  function hue(n) { var h = 0; for (var i = 0; i < n.length; i++) h += n.charCodeAt(i); return h % 360; }
  function ini(n) { return n.split(" ").map(function (w) { return w[0]; }).join("").toUpperCase().slice(0, 2); }
  function esc(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : ""; }

  // SVG icons
  var ICO_EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICO_EYE_OFF = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  var ICO_UP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
  var ICO_DOWN = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var ICO_TRASH = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

  // ─── State ───
  var S = { threads: [], identity: ldId(), showId: false, pinMode: false, activePin: null, loaded: false, pend: null, idCb: null, showAnnotations: true, stripCollapsed: false };
  var _dragging = false;

  function up(p) { for (var k in p) S[k] = p[k]; draw(); }
  function persist(t) { S.threads = t; fbSave(t); draw(); }
  function needId(cb) { if (S.identity) { cb(); return; } S.idCb = cb; up({ showId: true }); }

  // ─── Expose for inline handlers ───
  window._rv = {
    S: S, up: up, persist: persist, needId: needId,
    subId: function (n) {
      S.identity = n; svId(n); S.showId = false;
      if (S.idCb) { S.idCb(); S.idCb = null; } draw();
    },
    pinC: function (text) {
      var mx = S.threads.reduce(function (m, t) { return t.pinNumber ? Math.max(m, t.pinNumber) : m; }, 0);
      var now = Date.now();
      var nt = { id: "t_" + now, type: "pinned", pinX: S.pend.x, pinY: S.pend.y, pinNumber: mx + 1, resolved: false, comments: [{ id: "c_" + now, author: S.identity, text: text, timestamp: now }] };
      persist(S.threads.concat([nt]));
      S.pend = null; S.activePin = null; S.showAnnotations = true; draw();
    },
    rply: function (tid, text) {
      var now = Date.now();
      persist(S.threads.map(function (t) {
        return t.id === tid ? Object.assign({}, t, { comments: t.comments.concat([{ id: "c_" + now, author: S.identity, text: text, timestamp: now }]) }) : t;
      }));
    },
    rslv: function (tid) {
      persist(S.threads.map(function (t) { return t.id === tid ? Object.assign({}, t, { resolved: !t.resolved }) : t; }));
    },
    delC: function (tid, cid) {
      var updated = [];
      S.threads.forEach(function (t) {
        if (t.id !== tid) { updated.push(t); return; }
        var remaining = t.comments.filter(function (c) { return c.id !== cid; });
        if (remaining.length > 0) {
          updated.push(Object.assign({}, t, { comments: remaining }));
        }
        // If no comments left, the thread is dropped entirely
      });
      // Re-number pins sequentially
      var n = 1;
      updated.forEach(function (t) { if (t.type === "pinned") t.pinNumber = n++; });
      // If the deleted comment's thread is gone, close the popover
      if (!updated.some(function (t) { return t.id === tid; })) S.activePin = null;
      persist(updated);
    },
    toggleAnnotations: function () {
      S.showAnnotations = !S.showAnnotations;
      if (!S.showAnnotations) S.activePin = null;
      draw();
    },
    togglePin: function () {
      S.pinMode = !S.pinMode; S.pend = null; S.activePin = null; draw();
    },
    collapseStrip: function () {
      S.stripCollapsed = true;
      strip.classList.add("collapsed");
      tab.classList.add("show");
      document.body.classList.remove("rv-strip-open");
    },
    expandStrip: function () {
      S.stripCollapsed = false;
      strip.classList.remove("collapsed");
      tab.classList.remove("show");
      document.body.classList.add("rv-strip-open");
    }
  };

  // ─── Inject CSS ───
  var css = document.createElement("style");
  css.textContent = '\
/* Strip */\
.rv-strip{position:fixed;top:0;left:0;right:0;height:40px;background:#111;display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.3);transition:transform .25s ease}\
.rv-strip.collapsed{transform:translateY(-100%)}\
.rv-strip-left{display:flex;align-items:center;gap:10px}\
.rv-strip-dot{width:7px;height:7px;border-radius:50%;background:#22C55E;animation:rv-pulse 2s infinite}\
.rv-strip-status{font-size:11px;color:rgba(255,255,255,0.5);font-weight:500;letter-spacing:0.3px}\
.rv-strip-right{display:flex;align-items:center;gap:6px}\
.rv-strip-count{font-size:11px;color:rgba(255,255,255,0.4);font-weight:500}\
.rv-strip-sep{width:1px;height:16px;background:rgba(255,255,255,0.12);margin:0 2px}\
.rv-strip-open{padding-top:40px !important}\
/* Buttons */\
.rv-btn{padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:none;transition:all .15s;font-family:inherit;display:flex;align-items:center;gap:5px}\
.rv-btn-ghost{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7)}\
.rv-btn-ghost:hover{background:rgba(255,255,255,0.14)}\
.rv-btn-ghost.active{background:rgba(255,255,255,0.16);color:#fff}\
.rv-btn-primary{background:#2563EB;color:#fff}\
.rv-btn-primary:hover{background:#1D4ED8}\
.rv-btn-primary.on{background:#DC2626;color:#fff}\
.rv-btn-primary.on:hover{background:#B91C1C}\
.rv-btn-hide{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.45);cursor:pointer;font-size:11px;font-weight:500;padding:4px 10px;border-radius:6px;display:flex;align-items:center;gap:4px;font-family:inherit;transition:all .15s}\
.rv-btn-hide:hover{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7)}\
/* Collapsed tab */\
.rv-tab{position:fixed;top:0;right:20px;z-index:9999;background:#111;padding:6px 14px;border-radius:0 0 8px 8px;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-family:system-ui,sans-serif;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(-4px);pointer-events:none}\
.rv-tab.show{opacity:1;transform:translateY(0);pointer-events:auto}\
.rv-tab:hover{background:#222}\
.rv-tab-dot{width:6px;height:6px;border-radius:50%;background:#22C55E}\
.rv-tab-label{font-size:11px;color:rgba(255,255,255,0.6);font-weight:500}\
.rv-tab-count{font-size:11px;color:rgba(255,255,255,0.35);font-weight:500}\
.rv-tab-chevron{color:rgba(255,255,255,0.3);display:flex;align-items:center}\
/* Identity */\
.rv-id-o{position:fixed;inset:0;z-index:10010;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:rv-fi .2s}\
.rv-id-c{background:#fff;border-radius:14px;padding:28px;width:320px;box-shadow:0 16px 48px rgba(0,0,0,0.25);font-family:system-ui,sans-serif}\
.rv-id-c h3{font-size:16px;font-weight:700;color:#1E293B;margin-bottom:4px}\
.rv-id-c p{font-size:13px;color:#64748B;margin-bottom:16px;line-height:1.4}\
.rv-id-c input{width:100%;padding:10px 12px;font-size:14px;border:1.5px solid #CBD5E1;border-radius:8px;outline:none;box-sizing:border-box}\
.rv-id-c input:focus{border-color:#2563EB}\
.rv-id-c button{margin-top:12px;width:100%;padding:10px;background:#2563EB;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}\
.rv-id-c button:hover{background:#1D4ED8}\
/* Banner */\
.rv-banner{position:fixed;top:40px;left:0;right:0;padding:6px 16px;background:#2563EB;color:#fff;font-size:12px;font-weight:600;text-align:center;z-index:9998;font-family:system-ui,sans-serif;animation:rv-sd .15s}\
.rv-banner span{opacity:.7;cursor:pointer;margin-left:8px;text-decoration:underline}\
/* Pins */\
.rv-pin{position:absolute;width:26px;height:26px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:grab;transform:translate(-50%,-50%);z-index:100;font-family:system-ui,sans-serif;transition:transform .12s,box-shadow .12s,opacity .2s}\
.rv-pin:hover{transform:translate(-50%,-50%) scale(1.15)}\
.rv-pin:active{cursor:grabbing}\
.rv-pin.bl{background:#2563EB;box-shadow:0 2px 6px rgba(37,99,235,0.35)}\
.rv-pin.gr{background:#22C55E;box-shadow:0 2px 6px rgba(34,197,94,0.35)}\
.rv-pin.sel{box-shadow:0 0 0 3px rgba(37,99,235,0.3),0 2px 8px rgba(0,0,0,0.2)!important}\
.rv-pin.hidden{opacity:0;pointer-events:none}\
/* Popover */\
.rv-popover{position:absolute;z-index:200;width:300px;animation:rv-fi .12s;font-family:system-ui,-apple-system,sans-serif}\
.rv-popover-card{background:#fff;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,0.14),0 0 0 1px rgba(0,0,0,0.04);overflow:hidden;max-height:420px;display:flex;flex-direction:column}\
.rv-po-header{padding:10px 14px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;background:#FAFBFC}\
.rv-po-header .tt{font-size:12px;font-weight:600;color:#1E293B}\
.rv-po-actions{display:flex;gap:4px;align-items:center}\
.rv-po-btn{padding:3px 8px;font-size:11px;border-radius:5px;cursor:pointer;font-weight:500;border:1px solid #E2E8F0;background:#fff;color:#64748B;font-family:inherit;transition:all .12s}\
.rv-po-btn:hover{background:#F8FAFC}\
.rv-po-btn.res{background:#F0FDF4;color:#16A34A;border-color:#BBF7D0}\
.rv-po-close{background:none;border:none;font-size:14px;cursor:pointer;color:#94A3B8;padding:2px 4px;line-height:1}\
.rv-po-close:hover{color:#64748B}\
.rv-po-body{flex:1;overflow-y:auto;padding:6px 0}\
.rv-po-comment{display:flex;gap:8px;padding:8px 14px}\
.rv-po-av{width:24px;height:24px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}\
.rv-po-meta{display:flex;align-items:baseline;gap:5px}\
.rv-po-name{font-size:12px;font-weight:600;color:#1E293B}\
.rv-po-time{font-size:10px;color:#94A3B8}\
.rv-po-del{background:none;border:none;color:#CBD5E1;cursor:pointer;padding:1px 3px;margin-left:auto;border-radius:4px;display:flex;align-items:center;line-height:1;transition:color .12s,background .12s;opacity:0}\
.rv-po-comment:hover .rv-po-del{opacity:1}\
.rv-po-del:hover{color:#EF4444;background:rgba(239,68,68,0.08)}\
.rv-po-text{font-size:13px;color:#334155;line-height:1.45;margin-top:2px;word-break:break-word}\
.rv-po-footer{padding:8px 10px;border-top:1px solid #F1F5F9;display:flex;gap:6px;background:#FAFBFC}\
.rv-po-footer textarea{flex:1;padding:7px 10px;font-size:12px;border:1.5px solid #E2E8F0;border-radius:7px;outline:none;resize:none;font-family:inherit;box-sizing:border-box;min-height:32px;max-height:80px}\
.rv-po-footer textarea:focus{border-color:#2563EB}\
.rv-po-footer button{padding:6px 14px;background:#2563EB;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;align-self:flex-end;font-family:inherit;white-space:nowrap}\
.rv-po-footer button:hover{background:#1D4ED8}\
/* New pin */\
.rv-new-pin{position:absolute;z-index:250;animation:rv-fi .12s;font-family:system-ui,sans-serif}\
.rv-np-dot{width:8px;height:8px;border-radius:50%;background:#2563EB;margin:0 auto;box-shadow:0 0 0 3px rgba(37,99,235,0.3)}\
.rv-np-card{background:#fff;border-radius:10px;padding:12px;box-shadow:0 4px 24px rgba(0,0,0,0.14),0 0 0 1px rgba(0,0,0,0.04);width:260px;margin-top:6px}\
.rv-np-card textarea{width:100%;padding:8px 10px;font-size:13px;border:1.5px solid #E2E8F0;border-radius:7px;outline:none;resize:none;font-family:inherit;box-sizing:border-box}\
.rv-np-card textarea:focus{border-color:#2563EB}\
.rv-np-row{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}\
.rv-np-cancel{padding:5px 12px;font-size:12px;border-radius:6px;cursor:pointer;background:#fff;border:1px solid #E2E8F0;color:#64748B;font-family:inherit}\
.rv-np-submit{padding:5px 12px;font-size:12px;border-radius:6px;cursor:pointer;background:#2563EB;border:none;color:#fff;font-weight:600;font-family:inherit}\
@keyframes rv-fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}\
@keyframes rv-sd{from{transform:translateY(-100%)}to{transform:translateY(0)}}\
@keyframes rv-pulse{0%,100%{opacity:1}50%{opacity:.5}}';
  document.head.appendChild(css);

  // ─── Create strip + collapsed tab ───
  var strip = document.createElement("div");
  strip.className = "rv-strip";
  strip.id = "rv-strip";
  document.body.prepend(strip);

  var tab = document.createElement("div");
  tab.className = "rv-tab";
  tab.id = "rv-tab";
  tab.onclick = function () { window._rv.expandStrip(); };
  tab.innerHTML = '<div class="rv-tab-dot"></div><span class="rv-tab-label">Review</span><span class="rv-tab-count" id="rv-tab-count"></span><span class="rv-tab-chevron">' + ICO_DOWN + '</span>';
  document.body.prepend(tab);

  document.body.style.position = "relative";
  document.body.classList.add("rv-strip-open");

  // ─── Draw ───
  function draw() {
    if (!S.loaded) return;
    if (_dragging) return;

    var open = S.threads.filter(function (t) { return !t.resolved; }).length;
    var total = S.threads.length;

    // ── Tab count ──
    var tabCount = document.getElementById("rv-tab-count");
    if (tabCount) tabCount.textContent = open > 0 ? open + " open" : "";

    // ── Strip ──
    var sh = '<div class="rv-strip-left"><div class="rv-strip-dot"></div><span class="rv-strip-status">Connected to Firebase</span></div>';
    sh += '<div class="rv-strip-right">';
    if (total > 0) sh += '<span class="rv-strip-count">' + open + ' open \u00b7 ' + total + ' total</span>';
    sh += '<div class="rv-strip-sep"></div>';
    sh += '<button class="rv-btn rv-btn-ghost' + (S.showAnnotations ? ' active' : '') + '" onclick="_rv.toggleAnnotations()">' + (S.showAnnotations ? ICO_EYE : ICO_EYE_OFF) + '&nbsp;Annotations</button>';
    sh += '<button class="rv-btn rv-btn-primary' + (S.pinMode ? ' on' : '') + '" onclick="_rv.togglePin()">' + (S.pinMode ? '\u2715 Cancel' : '+ Comment') + '</button>';
    sh += '<button class="rv-btn-hide" onclick="_rv.collapseStrip()">' + ICO_UP + 'Hide</button>';
    sh += '</div>';
    strip.innerHTML = sh;

    // ── Clear overlays ──
    document.querySelectorAll(".rv-pin,.rv-new-pin,.rv-popover,.rv-id-o,.rv-banner").forEach(function (el) { el.remove(); });

    document.body.style.cursor = S.pinMode ? "crosshair" : "";

    // ── Pin mode banner ──
    if (S.pinMode) {
      var banner = document.createElement("div");
      banner.className = "rv-banner";
      banner.innerHTML = 'Click anywhere to place a comment<span onclick="_rv.togglePin()">Cancel</span>';
      document.body.appendChild(banner);
    }

    // ── Identity modal ──
    if (S.showId) {
      var idm = document.createElement("div");
      idm.className = "rv-id-o";
      idm.onclick = function (e) { if (e.target === idm) up({ showId: false }); };
      idm.innerHTML = '<div class="rv-id-c"><h3>Your name</h3><p>Shown next to your comments</p><input id="rv-id-in" autofocus placeholder="Enter your name\u2026" onkeydown="if(event.key===\'Enter\'&&this.value.trim())_rv.subId(this.value.trim())" /><button onclick="var v=document.getElementById(\'rv-id-in\').value.trim();if(v)_rv.subId(v)">Continue</button></div>';
      document.body.appendChild(idm);
      setTimeout(function () { var el = document.getElementById("rv-id-in"); if (el) el.focus(); }, 50);
    }

    // ── Pins (draggable) ──
    S.threads.filter(function (t) { return t.type === "pinned"; }).forEach(function (t) {
      var d = document.createElement("div");
      d.className = "rv-pin " + (t.resolved ? "gr" : "bl") + (S.activePin === t.id ? " sel" : "") + (!S.showAnnotations ? " hidden" : "");
      d.style.left = t.pinX + "%"; d.style.top = t.pinY + "%";
      d.textContent = t.pinNumber;
      d.setAttribute("data-rv", "1");

      // Drag state
      var dragState = { dragging: false, startX: 0, startY: 0 };

      d.addEventListener("mousedown", function (e) {
        if (S.pinMode) return;
        e.preventDefault();
        e.stopPropagation();
        dragState = { dragging: false, startX: e.clientX, startY: e.clientY };

        function onMove(ev) {
          var dx = ev.clientX - dragState.startX, dy = ev.clientY - dragState.startY;
          if (!dragState.dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            dragState.dragging = true;
            _dragging = true;
            d.style.zIndex = "999";
            // Close popover while dragging
            document.querySelectorAll(".rv-popover").forEach(function (el) { el.remove(); });
          }
          if (dragState.dragging) {
            var bw = document.body.scrollWidth, bh = document.body.scrollHeight;
            var nx = ((ev.pageX) / bw) * 100;
            var ny = ((ev.pageY) / bh) * 100;
            nx = Math.max(1, Math.min(99, nx));
            ny = Math.max(1, Math.min(99, ny));
            d.style.left = nx + "%";
            d.style.top = ny + "%";
            t._dragX = nx;
            t._dragY = ny;
          }
        }

        function onUp(ev) {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          if (dragState.dragging) {
            // Save new position
            t.pinX = t._dragX;
            t.pinY = t._dragY;
            delete t._dragX;
            delete t._dragY;
            d.style.zIndex = "";
            _dragging = false;
            persist(S.threads);
          } else {
            // It was a click, not a drag
            up({ activePin: S.activePin === t.id ? null : t.id, pend: null, pinMode: false });
          }
        }

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });

      // Touch support for mobile
      d.addEventListener("touchstart", function (e) {
        if (S.pinMode) return;
        var touch = e.touches[0];
        dragState = { dragging: false, startX: touch.clientX, startY: touch.clientY };

        function onTouchMove(ev) {
          var tc = ev.touches[0];
          var dx = tc.clientX - dragState.startX, dy = tc.clientY - dragState.startY;
          if (!dragState.dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            dragState.dragging = true;
            _dragging = true;
            d.style.zIndex = "999";
            document.querySelectorAll(".rv-popover").forEach(function (el) { el.remove(); });
          }
          if (dragState.dragging) {
            ev.preventDefault();
            var bw = document.body.scrollWidth, bh = document.body.scrollHeight;
            var nx = ((tc.pageX) / bw) * 100;
            var ny = ((tc.pageY) / bh) * 100;
            nx = Math.max(1, Math.min(99, nx));
            ny = Math.max(1, Math.min(99, ny));
            d.style.left = nx + "%";
            d.style.top = ny + "%";
            t._dragX = nx; t._dragY = ny;
          }
        }

        function onTouchEnd() {
          document.removeEventListener("touchmove", onTouchMove);
          document.removeEventListener("touchend", onTouchEnd);
          if (dragState.dragging) {
            t.pinX = t._dragX; t.pinY = t._dragY;
            delete t._dragX; delete t._dragY;
            d.style.zIndex = "";
            _dragging = false;
            persist(S.threads);
          } else {
            up({ activePin: S.activePin === t.id ? null : t.id, pend: null, pinMode: false });
          }
        }

        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
      }, { passive: true });

      document.body.appendChild(d);
    });

    // ── Active pin → inline Figma-style popover ──
    if (S.activePin && S.showAnnotations) {
      var thread = S.threads.find(function (t) { return t.id === S.activePin; });
      if (thread) {
        var pop = document.createElement("div");
        pop.className = "rv-popover";
        pop.setAttribute("data-rv", "1");
        if (parseFloat(thread.pinX) > 65) {
          pop.style.right = (100 - parseFloat(thread.pinX) + 2) + "%";
        } else {
          pop.style.left = (parseFloat(thread.pinX) + 2) + "%";
        }
        pop.style.top = thread.pinY + "%";

        var ph = '<div class="rv-popover-card"><div class="rv-po-header"><span class="tt">#' + thread.pinNumber + '</span><div class="rv-po-actions">';
        ph += '<button class="rv-po-btn' + (thread.resolved ? ' res' : '') + '" onclick="_rv.rslv(\'' + thread.id + '\')">' + (thread.resolved ? '\u2713 Resolved' : 'Resolve') + '</button>';
        ph += '<button class="rv-po-close" onclick="_rv.up({activePin:null})">\u2715</button></div></div>';
        ph += '<div class="rv-po-body">';
        thread.comments.forEach(function (c) {
          var isOwn = S.identity && c.author === S.identity;
          ph += '<div class="rv-po-comment"><div class="rv-po-av" style="background:hsl(' + hue(c.author) + ',50%,50%)">' + ini(c.author) + '</div>';
          ph += '<div style="flex:1;min-width:0"><div class="rv-po-meta"><span class="rv-po-name">' + esc(c.author) + '</span><span class="rv-po-time">' + timeAgo(c.timestamp) + '</span>';
          if (isOwn) ph += '<button class="rv-po-del" title="Delete comment" onclick="if(confirm(\'Delete this comment?\')){_rv.delC(\'' + thread.id + '\',\'' + c.id + '\')}">' + ICO_TRASH + '</button>';
          ph += '</div>';
          ph += '<div class="rv-po-text">' + esc(c.text) + '</div></div></div>';
        });
        ph += '</div>';
        ph += '<div class="rv-po-footer"><textarea id="rv-rep-ta" rows="1" placeholder="Reply\u2026" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();var v=this.value.trim();if(v){_rv.rply(\'' + thread.id + '\',v);this.value=\'\'}}" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,80)+\'px\'"></textarea>';
        ph += '<button onclick="var ta=document.getElementById(\'rv-rep-ta\');var v=ta.value.trim();if(v){_rv.rply(\'' + thread.id + '\',v);ta.value=\'\';ta.style.height=\'auto\'}">Reply</button></div></div>';
        pop.innerHTML = ph;
        document.body.appendChild(pop);
      }
    }

    // ── Pending new pin ──
    if (S.pend) {
      var np = document.createElement("div");
      np.className = "rv-new-pin";
      np.setAttribute("data-rv", "1");
      np.style.left = S.pend.x + "%"; np.style.top = S.pend.y + "%";
      np.style.transform = "translate(-50%, 8px)";
      np.innerHTML = '<div class="rv-np-dot"></div><div class="rv-np-card"><textarea id="rv-pin-ta" autofocus rows="2" placeholder="Leave a comment\u2026" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();var v=this.value.trim();if(v)_rv.pinC(v)}if(event.key===\'Escape\')_rv.up({pend:null})"></textarea><div class="rv-np-row"><button class="rv-np-cancel" onclick="_rv.up({pend:null})">Cancel</button><button class="rv-np-submit" onclick="var v=document.getElementById(\'rv-pin-ta\').value.trim();if(v)_rv.pinC(v)">Comment</button></div></div>';
      document.body.appendChild(np);
      setTimeout(function () { var el = document.getElementById("rv-pin-ta"); if (el) el.focus(); }, 50);
    }
  }

  // ─── Click handler ───
  document.body.addEventListener("click", function (e) {
    if (S.activePin && !S.pinMode) {
      if (!e.target.closest("[data-rv]") && !e.target.closest(".rv-strip")) {
        up({ activePin: null }); return;
      }
    }
    if (!S.pinMode) return;
    if (e.target.closest("[data-rv]") || e.target.closest(".rv-strip") || e.target.closest(".rv-id-o") || e.target.closest(".rv-banner") || e.target.closest(".rv-tab")) return;
    var bw = document.body.scrollWidth, bh = document.body.scrollHeight;
    var x = (e.pageX / bw) * 100, y = (e.pageY / bh) * 100;
    needId(function () { up({ pend: { x: x, y: y }, activePin: null }); });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") up({ pinMode: false, pend: null, activePin: null });
  });

  // ─── Init ───
  fbLoad().then(function (t) { up({ threads: t || [], loaded: true }); });
  setInterval(function () {
    if (!S.loaded || _dragging) return;
    fbLoad().then(function (r) {
      if (!r) return;
      var ids = {}; r.forEach(function (t) { ids[t.id] = true; });
      var merged = r.concat(S.threads.filter(function (t) { return !ids[t.id]; }));
      // Only re-render if data actually changed
      if (JSON.stringify(merged) === JSON.stringify(S.threads)) return;
      S.threads = merged;
      draw();
    });
  }, 8000);

})();
