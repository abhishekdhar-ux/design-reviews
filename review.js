/*  ═══════════════════════════════════════════════════════════════
    review.js — Drop-in artifact review layer
    
    Usage: Add this ONE line to any HTML file:
    <script src="https://YOUR-SITE.github.io/review.js"></script>
    
    That's it. Pins, comments, threads, Firebase sync — all automatic.
    ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  // ─── Firebase REST config ───
  var FB = "https://artifact-reviews-default-rtdb.firebaseio.com";

  // ─── Auto-generate slug from current page URL ───
  var SLUG = location.pathname.replace(/^\/|\/$/g, "").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-") || "index";
  var DBPATH = "reviews/" + SLUG + "/threads";

  // ─── Firebase REST helpers ───
  function fbGet(p) { return fetch(FB + "/" + p + ".json").then(function (r) { return r.json(); }).catch(function () { return null; }); }
  function fbPut(p, d) { return fetch(FB + "/" + p + ".json", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).catch(function () { }); }
  function fbLoad() { return fbGet(DBPATH).then(function (v) { return v ? Object.values(v) : []; }); }
  function fbSave(threads) { var o = {}; threads.forEach(function (t) { o[t.id] = t; }); return fbPut(DBPATH, o); }

  // ─── Identity (localStorage) ───
  function ldId() { try { return localStorage.getItem("review_identity"); } catch (e) { return null; } }
  function svId(n) { try { localStorage.setItem("review_identity", n); } catch (e) { } }

  // ─── Helpers ───
  function timeAgo(ts) { var d = Date.now() - ts, m = Math.floor(d / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; var h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; }
  function hue(n) { var h = 0; for (var i = 0; i < n.length; i++) h += n.charCodeAt(i); return h % 360; }
  function ini(n) { return n.split(" ").map(function (w) { return w[0]; }).join("").toUpperCase().slice(0, 2); }
  function esc(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : ""; }

  // ─── State ───
  var S = { threads: [], identity: ldId(), showId: false, pinMode: false, active: null, showRes: true, loaded: false, pend: null, showGen: false, toast: null, idCb: null };
  function up(p) { for (var k in p) S[k] = p[k]; draw(); }
  function toast(m, t) { up({ toast: { msg: m, type: t || "info" } }); setTimeout(function () { up({ toast: null }); }, 3500); }
  function persist(t) { S.threads = t; fbSave(t); draw(); }
  function needId(cb) { if (S.identity) { cb(); return; } S.idCb = cb; up({ showId: true }); }

  // Expose minimal API to inline handlers
  window._rv = {
    up: up, needId: needId, toast: toast, persist: persist,
    subId: function (n) { S.identity = n; svId(n); S.showId = false; if (S.idCb) { S.idCb(); S.idCb = null; } draw(); },
    pinC: function (text) {
      var mx = S.threads.reduce(function (m, t) { return t.pinNumber ? Math.max(m, t.pinNumber) : m; }, 0);
      var now = Date.now();
      var nt = { id: "t_" + now, type: "pinned", pinX: S.pend.x, pinY: S.pend.y, pinNumber: mx + 1, resolved: false, comments: [{ id: "c_" + now, author: S.identity, text: text, timestamp: now }] };
      persist(S.threads.concat([nt])); toast("Comment pinned", "success");
      S.pend = null; S.active = nt.id; S.pinMode = false; draw();
    },
    genC: function (text) {
      var now = Date.now();
      var nt = { id: "t_" + now, type: "general", pinX: null, pinY: null, pinNumber: null, resolved: false, comments: [{ id: "c_" + now, author: S.identity, text: text, timestamp: now }] };
      persist(S.threads.concat([nt])); toast("Comment added", "success");
      S.showGen = false; S.active = nt.id; draw();
    },
    rply: function (tid, text) {
      var now = Date.now();
      persist(S.threads.map(function (t) { return t.id === tid ? Object.assign({}, t, { comments: t.comments.concat([{ id: "c_" + now, author: S.identity, text: text, timestamp: now }]) }) : t; }));
    },
    rslv: function (tid) { persist(S.threads.map(function (t) { return t.id === tid ? Object.assign({}, t, { resolved: !t.resolved }) : t; })); },
    doExp: function () {
      var b = new Blob([JSON.stringify({ threads: S.threads, exportedAt: new Date().toISOString(), artifact: SLUG }, null, 2)], { type: "application/json" });
      var u = URL.createObjectURL(b); var a = document.createElement("a"); a.href = u; a.download = "review-" + SLUG + ".json"; a.click(); URL.revokeObjectURL(u);
      toast("Exported " + S.threads.length + " threads", "success");
    },
    doImp: function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function (ev) { try { var imp = JSON.parse(ev.target.result).threads || []; var ids = {}; S.threads.forEach(function (t) { ids[t.id] = true; }); persist(S.threads.concat(imp.filter(function (t) { return !ids[t.id]; }))); toast("Imported", "success"); } catch (er) { toast("Invalid file", "error"); } };
      r.readAsText(f); e.target.value = "";
    },
    S: S
  };

  // ─── Inject CSS ───
  var style = document.createElement("style");
  style.textContent = '\
.rv-toast{position:fixed;top:16px;right:16px;z-index:10002;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;font-family:system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.1);animation:rv-si .25s}\
.rv-tok{background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0}\
.rv-terr{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA}\
.rv-tinfo{background:#FFFBEB;color:#92400E;border:1px solid #FDE68A}\
.rv-id-o{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;animation:rv-fi .2s}\
.rv-id-c{background:#fff;border-radius:14px;padding:28px;width:340px;box-shadow:0 12px 48px rgba(0,0,0,.2);font-family:system-ui,sans-serif}\
.rv-id-c h3{font-size:17px;font-weight:700;color:#1E293B;margin-bottom:6px}\
.rv-id-c p{font-size:13px;color:#64748B;margin-bottom:18px;line-height:1.4}\
.rv-id-c input{width:100%;padding:10px 14px;font-size:14px;border:1.5px solid #CBD5E1;border-radius:10px;outline:none;box-sizing:border-box}\
.rv-id-c input:focus{border-color:#2563EB}\
.rv-id-c button{margin-top:14px;width:100%;padding:10px;background:#2563EB;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}\
.rv-id-c button:hover{background:#1D4ED8}\
.rv-bar{position:fixed;bottom:16px;right:16px;display:flex;gap:6px;z-index:9998;flex-wrap:wrap;justify-content:flex-end;align-items:center;font-family:system-ui,sans-serif;transition:right .2s}\
.rv-bar.shifted{right:356px}\
.rv-tb{padding:8px 14px;border-radius:20px;background:#fff;color:#475569;border:1px solid #E2E8F0;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08);user-select:none;transition:all .15s}\
.rv-tb:hover{box-shadow:0 4px 14px rgba(0,0,0,.12)}\
.rv-tb.on{background:#2563EB;color:#fff;border-color:#2563EB}\
.rv-tb.ro{background:#F0FDF4;color:#16A34A;border-color:#BBF7D0}\
.rv-mp{padding:6px 12px;border-radius:20px;background:#fff;border:1px solid #E2E8F0;font-size:11px;font-weight:600;color:#16A34A;box-shadow:0 2px 8px rgba(0,0,0,.06);display:flex;align-items:center;gap:5px}\
.rv-md{width:6px;height:6px;border-radius:50%;background:#16A34A}\
.rv-ob{padding:8px 12px;border-radius:20px;background:#EF4444;color:#fff;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.1)}\
.rv-banner{position:fixed;top:0;left:0;right:0;padding:8px 16px;background:#2563EB;color:#fff;font-size:13px;font-weight:600;text-align:center;z-index:9998;font-family:system-ui,sans-serif;animation:rv-sd .2s}\
.rv-banner span{opacity:.8;cursor:pointer;text-decoration:underline}\
.rv-pin{position:absolute;width:28px;height:28px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;cursor:pointer;transform:translate(-50%,-50%);z-index:100;transition:box-shadow .15s,transform .15s;font-family:system-ui,sans-serif}\
.rv-pin:hover{transform:translate(-50%,-50%) scale(1.15)}\
.rv-pin.bl{background:#2563EB;box-shadow:0 2px 8px rgba(37,99,235,.3)}\
.rv-pin.gr{background:#16A34A;box-shadow:0 2px 8px rgba(22,163,74,.3)}\
.rv-pin.sel{box-shadow:0 0 0 3px rgba(37,99,235,.35),0 2px 10px rgba(0,0,0,.2)!important}\
.rv-pend{position:absolute;transform:translate(-50%,16px);z-index:200;animation:rv-fi .15s}\
.rv-pdot{width:8px;height:8px;border-radius:50%;background:#2563EB;margin:0 auto -4px;box-shadow:0 0 0 3px rgba(37,99,235,.3)}\
.rv-pcard{background:#fff;border-radius:12px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.15);width:260px;margin-top:8px;font-family:system-ui,sans-serif}\
.rv-pcard textarea,.rv-gp textarea{width:100%;padding:10px;font-size:13px;border:1.5px solid #CBD5E1;border-radius:8px;outline:none;resize:none;font-family:inherit;box-sizing:border-box}\
.rv-pcard textarea:focus,.rv-gp textarea:focus{border-color:#2563EB}\
.rv-br{display:flex;justify-content:flex-end;gap:6px;margin-top:10px}\
.rv-bs{padding:5px 14px;font-size:12px;border-radius:8px;cursor:pointer;font-weight:500}\
.rv-bc{background:#fff;border:1px solid #E2E8F0;color:#64748B}\
.rv-bp{background:#2563EB;border:none;color:#fff}\
.rv-gp{position:absolute;bottom:44px;right:0;width:290px;background:#fff;border-radius:12px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.15);z-index:10001;animation:rv-fi .15s;font-family:system-ui,sans-serif}\
.rv-sb{position:fixed;top:0;right:0;bottom:0;width:340px;background:#F8FAFC;border-left:1px solid #E2E8F0;z-index:9999;display:flex;flex-direction:column;box-shadow:-4px 0 28px rgba(0,0,0,.08);font-family:system-ui,sans-serif;animation:rv-slin .2s}\
.rv-sbh{padding:14px 16px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between}\
.rv-sbh .tt{font-size:14px;font-weight:700;color:#1E293B}\
.rv-sbh .res{color:#16A34A;margin-left:6px;font-size:12px}\
.rv-sbb{flex:1;overflow-y:auto;padding:10px 16px}\
.rv-sbf{padding:12px 16px;border-top:1px solid #E2E8F0;display:flex;gap:8px}\
.rv-sbf textarea{flex:1;padding:8px 12px;font-size:13px;border:1.5px solid #CBD5E1;border-radius:10px;outline:none;resize:none;font-family:inherit;box-sizing:border-box}\
.rv-sbf textarea:focus{border-color:#2563EB}\
.rv-sbf button{align-self:flex-end;padding:8px 16px;background:#2563EB;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer}\
.rv-sbf button:hover{background:#1D4ED8}\
.rv-cb{display:flex;gap:10px;padding:10px 0}\
.rv-av{border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}\
.rv-ca{font-size:13px;font-weight:600;color:#1E293B}\
.rv-ct{font-size:11px;color:#94A3B8;margin-left:6px}\
.rv-cx{margin:3px 0 0;font-size:13px;color:#475569;line-height:1.5;word-break:break-word}\
@keyframes rv-fi{from{opacity:0}to{opacity:1}}\
@keyframes rv-si{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}\
@keyframes rv-sd{from{transform:translateY(-100%)}to{transform:translateY(0)}}\
@keyframes rv-slin{from{transform:translateX(100%)}to{transform:translateX(0)}}';
  document.head.appendChild(style);

  // ─── Inject containers ───
  var rvRoot = document.createElement("div");
  rvRoot.id = "rv-root";
  document.body.appendChild(rvRoot);

  var fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = ".json"; fileInput.style.display = "none"; fileInput.id = "rv-fi";
  fileInput.addEventListener("change", function (e) { window._rv.doImp(e); });
  document.body.appendChild(fileInput);

  // Make body the pin target
  document.body.style.position = "relative";

  // ─── Draw ───
  function draw() {
    var pins = S.threads.filter(function (t) { return t.type === "pinned" && (S.showRes || !t.resolved); });
    var open = S.threads.filter(function (t) { return !t.resolved; }).length;
    var cur = S.threads.find(function (t) { return t.id === S.active; });
    var hasSb = S.active && cur;
    if (!S.loaded) return;

    document.body.style.cursor = S.pinMode ? "crosshair" : "";
    document.body.style.marginRight = hasSb ? "340px" : "";
    document.body.style.transition = "margin-right .2s";

    var h = "";

    // Toast
    if (S.toast) h += '<div class="rv-toast rv-t' + (S.toast.type === "success" ? "ok" : S.toast.type === "error" ? "err" : "info") + '">' + esc(S.toast.msg) + '</div>';

    // Identity modal
    if (S.showId) {
      h += '<div class="rv-id-o" onclick="if(event.target===this)_rv.up({showId:false})"><div class="rv-id-c">';
      h += "<h3>What's your name?</h3><p>This will appear on your comments.</p>";
      h += '<input id="rv-id-in" autofocus placeholder="Your name\u2026" onkeydown="if(event.key===\'Enter\'&&this.value.trim())_rv.subId(this.value.trim())" />';
      h += '<button onclick="var v=document.getElementById(\'rv-id-in\').value.trim();if(v)_rv.subId(v)">Continue</button>';
      h += '</div></div>';
    }

    // Pin mode banner
    if (S.pinMode) h += '<div class="rv-banner">Click anywhere to drop a pin \u00b7 <span onclick="_rv.up({pinMode:false,pend:null})">Cancel</span></div>';

    // Toolbar
    h += '<div class="rv-bar' + (hasSb ? ' shifted' : '') + '">';
    h += '<div class="rv-mp"><span class="rv-md"></span>\u2601 Firebase</div>';
    h += '<div class="rv-tb' + (S.pinMode ? ' on' : '') + '" onclick="_rv.up({pinMode:!_rv.S.pinMode,pend:null})">' + (S.pinMode ? '\uD83D\uDCCC Click to Pin' : '\uD83D\uDCCC Comment') + '</div>';
    h += '<div style="position:relative"><div class="rv-tb" onclick="_rv.needId(function(){_rv.up({showGen:!_rv.S.showGen})})">\uD83D\uDCAC General</div>';
    if (S.showGen) {
      h += '<div class="rv-gp"><textarea id="rv-gen-ta" autofocus rows="3" placeholder="General comment\u2026" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();var v=this.value.trim();if(v)_rv.genC(v)}if(event.key===\'Escape\')_rv.up({showGen:false})"></textarea>';
      h += '<div class="rv-br"><div class="rv-bs rv-bc" onclick="_rv.up({showGen:false})">Cancel</div><div class="rv-bs rv-bp" onclick="var v=document.getElementById(\'rv-gen-ta\').value.trim();if(v)_rv.genC(v)">Post</div></div></div>';
    }
    h += '</div>';
    h += '<div class="rv-tb' + (S.showRes ? ' ro' : '') + '" onclick="_rv.up({showRes:!_rv.S.showRes})">' + (S.showRes ? '\u2713 Resolved' : '\u25CB Resolved') + '</div>';
    h += '<div class="rv-tb" onclick="_rv.doExp()">\u2193 Save</div>';
    h += '<div class="rv-tb" onclick="document.getElementById(\'rv-fi\').click()">\u2191 Load</div>';
    if (open > 0) h += '<div class="rv-ob">' + open + ' open</div>';
    h += '</div>';

    rvRoot.innerHTML = h;

    // ─── Pins (injected into body) ───
    document.querySelectorAll(".rv-pin,.rv-pend").forEach(function (el) { el.remove(); });

    pins.forEach(function (t) {
      var d = document.createElement("div");
      d.className = "rv-pin " + (t.resolved ? "gr" : "bl") + (S.active === t.id ? " sel" : "");
      d.style.left = t.pinX + "%"; d.style.top = t.pinY + "%";
      d.textContent = t.pinNumber;
      d.addEventListener("click", function (e) { e.stopPropagation(); up({ active: S.active === t.id ? null : t.id }); });
      document.body.appendChild(d);
    });

    // ─── Pending popover ───
    if (S.pend) {
      var pw = document.createElement("div"); pw.className = "rv-pend";
      pw.style.left = S.pend.x + "%"; pw.style.top = S.pend.y + "%";
      pw.innerHTML = '<div class="rv-pdot"></div><div class="rv-pcard"><textarea id="rv-pin-ta" autofocus rows="3" placeholder="Add a comment\u2026" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();var v=this.value.trim();if(v)_rv.pinC(v)}if(event.key===\'Escape\')_rv.up({pend:null})"></textarea><div class="rv-br"><div class="rv-bs rv-bc" onclick="_rv.up({pend:null})">Cancel</div><div class="rv-bs rv-bp" onclick="var v=document.getElementById(\'rv-pin-ta\').value.trim();if(v)_rv.pinC(v)">Pin Comment</div></div></div>';
      document.body.appendChild(pw);
    }

    // ─── Sidebar ───
    document.querySelectorAll(".rv-sb").forEach(function (el) { el.remove(); });
    if (hasSb) {
      var t = cur;
      var sb = document.createElement("div"); sb.className = "rv-sb";
      var ch = '<div class="rv-sbh"><span class="tt">' + (t.type === "pinned" ? "Pin #" + t.pinNumber : "General Comment") + (t.resolved ? '<span class="res">\u2713 Resolved</span>' : '') + '</span>';
      ch += '<div style="display:flex;gap:4px"><div class="rv-bs" style="border:1px solid #E2E8F0;background:' + (t.resolved ? '#F0FDF4' : '#fff') + ';color:' + (t.resolved ? '#16A34A' : '#64748B') + '" onclick="_rv.rslv(\'' + t.id + '\')">' + (t.resolved ? 'Unresolve' : 'Resolve') + '</div>';
      ch += '<div style="padding:4px 8px;font-size:16px;cursor:pointer;color:#94A3B8" onclick="_rv.up({active:null})">\u2715</div></div></div>';
      ch += '<div class="rv-sbb">';
      t.comments.forEach(function (c) {
        ch += '<div class="rv-cb"><div class="rv-av" style="width:28px;height:28px;font-size:11px;background:hsl(' + hue(c.author) + ',55%,55%)">' + ini(c.author) + '</div>';
        ch += '<div style="flex:1;min-width:0"><div><span class="rv-ca">' + esc(c.author) + '</span><span class="rv-ct">' + timeAgo(c.timestamp) + '</span></div>';
        ch += '<p class="rv-cx">' + esc(c.text) + '</p></div></div>';
      });
      ch += '</div>';
      ch += '<div class="rv-sbf"><textarea id="rv-rep-ta" rows="2" placeholder="Reply\u2026" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();var v=this.value.trim();if(v){_rv.rply(\'' + t.id + '\',v);this.value=\'\'}}"></textarea>';
      ch += '<button onclick="var ta=document.getElementById(\'rv-rep-ta\');var v=ta.value.trim();if(v){_rv.rply(\'' + t.id + '\',v);ta.value=\'\'}">Send</button></div>';
      sb.innerHTML = ch;
      document.body.appendChild(sb);
    }

    // Autofocus
    var el = document.getElementById("rv-pin-ta") || document.getElementById("rv-gen-ta") || document.getElementById("rv-id-in");
    if (el) el.focus();
  }

  // ─── Click handler for pin placement ───
  document.body.addEventListener("click", function (e) {
    if (!S.pinMode) return;
    if (e.target.closest && (e.target.closest(".rv-pin") || e.target.closest(".rv-bar") || e.target.closest(".rv-pend") || e.target.closest(".rv-gp") || e.target.closest(".rv-sb") || e.target.closest(".rv-id-o") || e.target.closest("#rv-root"))) return;
    var bw = document.body.scrollWidth, bh = document.body.scrollHeight;
    var x = ((e.pageX) / bw) * 100;
    var y = ((e.pageY) / bh) * 100;
    needId(function () { up({ pend: { x: x, y: y } }); });
  });

  // ─── Keyboard ───
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") up({ pinMode: false, pend: null, showGen: false }); });

  // ─── Init: load from Firebase ───
  fbLoad().then(function (t) { up({ threads: t || [], loaded: true }); });

  // ─── Auto-poll every 8s ───
  setInterval(function () {
    if (!S.loaded) return;
    fbLoad().then(function (r) {
      if (!r) return;
      var ids = {}; r.forEach(function (t) { ids[t.id] = true; });
      S.threads = r.concat(S.threads.filter(function (t) { return !ids[t.id]; }));
      draw();
    });
  }, 8000);

})();
