/* Piston Kings - ride cards + rendezvous island
   Renders ride cards from a Google Sheet tab into any element with class
   "pk-rides". Each element chooses its own tab:

       <div class="pk-rides" data-tab="Meet"></div>

   Optional per-element overrides:
       data-origin="H1"    cell holding the departure Maps link ("" to switch off)
       data-sheet="..."    a different sheet ID for that block

   Rendezvous island (optional, one per page, place it above the cards):

       <div class="pk-island" data-tab="Rendezvous"></div>

   Reads point names + Maps links (or lat/lng) from that tab and shows them
   as tappable chips. The first point is picked by default. Picking a point
   recalculates every card's distance and time from that point. When the
   island is on the page it replaces the data-origin cell, and its estimates
   replace any distance/time typed into the ride sheet.
   On scroll it shrinks to a floating pill showing only the picked point;
   tap it to open the full list again.
*/
(function(){
  "use strict";

  var SHEET_ID    = "12xZb-sJPaJZq1qhLIeYXt1yx1mu_rBidwbJ1CapyC5Y";
  var ORIGIN_CELL = "H1";

  // --- palette ----------------------------------------------------------
  var STAR   = "#FC9201";   // rating stars + picked rendezvous point
  var TEXT   = "#D1C0AE";   // card title + button text/border
  var MUTED  = "#8a8078";   // area label, empty/error messages
  var DIM    = "#a89c90";   // distance / time / road tags
  var FAINT  = "#6b625a";   // loading message
  var LINE   = "#3a342e";   // card border (warm, to match TEXT)
  var CARD   = "#000";      // card background
  var FRAME  = "#111";      // photo frame background
  // ----------------------------------------------------------------------

  // Injected once. Beats Odoo's theme CSS, which sets heading, link and
  // button colours with !important on some themes.
  var CSS = ""
    + ".pk-rides h3            { color: " + TEXT + " !important; }"
    + ".pk-rides a             { color: " + TEXT + " !important;"
    + "                          border-color: " + TEXT + " !important;"
    + "                          background-color: transparent !important;"
    + "                          text-decoration: none !important;"
    + "                          transition: background-color .18s ease, color .18s ease,"
    + "                                      border-color .18s ease !important; }"
    + ".pk-rides a:hover,"
    + ".pk-rides a:focus-visible { background-color: " + TEXT + " !important;"
    + "                          color: #000 !important;"
    + "                          border-color: " + TEXT + " !important; }"
    + ".pk-rides a:active      { background-color: " + STAR + " !important;"
    + "                          border-color: " + STAR + " !important;"
    + "                          color: #000 !important; }"
    + ".pk-rides .pk-area      { color: " + MUTED + " !important; }"
    + ".pk-rides .pk-tags      { color: " + DIM + " !important; transition: opacity .2s ease; }"
    + ".pk-rides .pk-stars     { color: " + STAR + " !important; }"
    + ".pk-rides .pk-msg       { color: " + MUTED + " !important; }"
    + ".pk-rides .pk-msg-faint { color: " + FAINT + " !important; }"

    // --- island ---
    + ".pk-island              { display: block; margin: 0 0 24px; }"
    + ".pk-island-bar          { display: flex; align-items: center; gap: 12px; box-sizing: border-box;"
    + "                          width: max-content; max-width: 100%; margin: 0 auto;"
    + "                          padding: 6px 6px 6px 18px; background: " + CARD + ";"
    + "                          border: 1px solid " + LINE + "; border-radius: 999px;"
    + "                          font-family: inherit;"
    + "                          transition: box-shadow .25s ease, padding .25s ease; }"
    + ".pk-island-label        { flex: 0 0 auto; font-size: 11px; letter-spacing: .14em;"
    + "                          text-transform: uppercase; white-space: nowrap;"
    + "                          color: " + MUTED + " !important; }"
    + ".pk-island-chips        { position: relative; display: flex; gap: 6px; min-width: 0;"
    + "                          overflow-x: auto; scrollbar-width: none;"
    + "                          -webkit-overflow-scrolling: touch; }"
    + ".pk-island-chips::-webkit-scrollbar { display: none; }"
    + ".pk-island .pk-chip     { -webkit-appearance: none; appearance: none; flex: 0 0 auto; margin: 0;"
    + "                          font-family: inherit; font-size: 11px !important; line-height: 1.2;"
    + "                          letter-spacing: .12em; text-transform: uppercase; white-space: nowrap;"
    + "                          padding: 10px 16px !important; cursor: pointer;"
    + "                          border: 1px solid " + TEXT + " !important; border-radius: 999px !important;"
    + "                          background-color: transparent !important; color: " + TEXT + " !important;"
    + "                          box-shadow: none !important;"
    + "                          transition: background-color .18s ease, color .18s ease,"
    + "                                      border-color .18s ease; }"
    + ".pk-island .pk-chip:hover,"
    + ".pk-island .pk-chip:focus-visible { background-color: " + TEXT + " !important; color: #000 !important; }"
    + ".pk-island .pk-chip.pk-on { background-color: " + STAR + " !important;"
    + "                          border-color: " + STAR + " !important; color: #000 !important; }"
    + ".pk-island-caret        { display: none; flex: 0 0 auto; padding-right: 10px;"
    + "                          font-size: 12px; color: " + MUTED + " !important; }"

    // floating (scrolled past) state
    + ".pk-island.pk-stuck .pk-island-bar { position: fixed; left: 50%; top: var(--pk-top, 12px);"
    + "                          transform: translateX(-50%); z-index: 1000;"
    + "                          max-width: calc(100vw - 24px);"
    + "                          box-shadow: 0 10px 30px rgba(0,0,0,.55); }"
    + ".pk-island.pk-stuck:not(.pk-open) .pk-island-bar   { cursor: pointer; padding-left: 14px; }"
    + ".pk-island.pk-stuck:not(.pk-open) .pk-chip:not(.pk-on) { display: none; }"
    + ".pk-island.pk-stuck:not(.pk-open) .pk-island-caret { display: block; }"
    + "@media (prefers-reduced-motion: reduce) {"
    + "  .pk-island-bar, .pk-island .pk-chip, .pk-rides .pk-tags { transition: none !important; } }";

  function injectcss(){
    if (document.getElementById("pk-rides-css")) return;
    var el = document.createElement("style");
    el.id = "pk-rides-css";
    el.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(el);
  }

  var ALIAS = {
    name:     ["name","title","place","spot","ride","location","ridename","point","rendezvous","meetingpoint"],
    link:     ["link","url","maps","maplink","mapslink","googlemaps","googlemapslink","googlemap","locationlink"],
    area:     ["area","city","region","emirate","neighbourhood","neighborhood","zone"],
    lat:      ["lat","latitude"],
    lng:      ["lng","lon","long","longitude"],
    distance: ["distance","dist","km","kms"],
    time:     ["time","duration","ridetime","traveltime"],
    road:     ["road","roadtype","type","terrain","difficulty"],
    rating:   ["rating","stars","score","rate","roadrating"],
    photo:    ["photo","image","picture","img","photourl","imageurl","pic"],
    waze:     ["waze","wazelink","wazeurl"]
  };

  function key(s){ return String(s||"").toLowerCase().replace(/[^a-z]/g,""); }

  function parsecsv(t){
    var rows=[], row=[], f="", q=false;
    for (var i=0;i<t.length;i++){ var c=t[i];
      if(q){ if(c=='"'){ if(t[i+1]=='"'){f+='"';i++;} else q=false; } else f+=c; }
      else if(c=='"') q=true;
      else if(c==",") { row.push(f); f=""; }
      else if(c=="\n"){ row.push(f); rows.push(row); row=[]; f=""; }
      else if(c!="\r") f+=c;
    }
    row.push(f); rows.push(row); return rows;
  }

  function cellref(ref){                 // "H1" becomes { row:0, col:7 }
    var m = String(ref||"").match(/^([A-Za-z]+)(\d+)$/);
    if (!m) return null;
    var col = 0, s = m[1].toUpperCase();
    for (var i=0;i<s.length;i++) col = col*26 + (s.charCodeAt(i)-64);
    return { row: parseInt(m[2],10) - 1, col: col - 1 };
  }

  function mapheaders(hdr){
    var idx = {};
    hdr.forEach(function(h, i){
      var k = key(h);
      for (var field in ALIAS) {
        if (idx[field] === undefined && ALIAS[field].indexOf(k) !== -1) { idx[field] = i; return; }
      }
    });
    return idx;
  }

  function stars(v){
    var s = String(v == null ? "" : v).trim();
    if (!s) return "";
    var typed = (s.match(/\u2605/g) || []).length;
    var num   = s.match(/-?\d+(\.\d+)?/);
    if (!typed && !num) return "";        // "N/A", "-", "TBC" etc.
    var n = typed ? typed : parseFloat(num[0]);
    n = Math.max(0, Math.min(5, Math.round(n || 0)));
    return "\u2605\u2605\u2605\u2605\u2605\u2606\u2606\u2606\u2606\u2606".slice(5-n, 10-n);
  }

  function llfrom(lat, lng, link){
    var a = parseFloat(lat), b = parseFloat(lng);
    if (!isNaN(a) && !isNaN(b)) return [a, b];
    var s = String(link||"");
    var m = s.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/)
         || s.match(/@(-?[\d.]+),(-?[\d.]+)/)
         || s.match(/[?&]q=(-?[\d.]+),(-?[\d.]+)/)
         || s.match(/[?&]ll=(-?[\d.]+),(-?[\d.]+)/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  }

  function crow(a, b){                   // great-circle km
    var R = 6371, rad = Math.PI/180;
    var dlat = (b[0]-a[0])*rad, dlng = (b[1]-a[1])*rad;
    var h = Math.sin(dlat/2)*Math.sin(dlat/2)
          + Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlng/2)*Math.sin(dlng/2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function estimate(origin, dest){
    if (!origin || !dest) return { d:"", t:"" };
    var km = crow(origin, dest) * 1.25;
    if (km < 1) return { d:"", t:"" };
    var kph = km < 30 ? 45 : km < 120 ? 75 : 85;
    var mins = Math.round(km / kph * 60);
    var t = mins < 70 ? "~" + (Math.round(mins/5)*5) + " min"
          : "~" + Math.floor(mins/60) + " h" + (Math.round(mins%60/15)*15 ? " " + (Math.round(mins%60/15)*15) + " min" : "");
    return { d: "~" + Math.round(km/5)*5 + " km", t: t };
  }

  // --- shared origin ----------------------------------------------------
  // Set by the island. Every card block listens and re-tags when it changes.
  var PICKED = null;                     // [lat, lng] of the picked rendezvous point
  var islandReady = null;                // resolves once the island has picked its default
  var listeners = [];
  function setorigin(ll){
    PICKED = ll;
    listeners.forEach(function(fn){ fn(); });
  }
  // ----------------------------------------------------------------------

  // --- photo handling ---------------------------------------------------
  // Rewrites a googleusercontent URL to the size we want. Maps embeds a tiny
  // "=w203-h172-k-no" thumbnail; strip that tail and ask for something usable.
  function sized(u, w, h){
    u = u.split("#")[0].replace(/=[-\w]*$/, "");
    return u + "=w" + (w || 1200) + "-h" + (h || 900) + "-k-no";
  }

  function pic(p){
    p = String(p||"").trim();
    if (!p || p.indexOf("\u2026") !== -1) return "";

    // Full Maps place link with a photo open in the viewer. The image URL sits
    // inside the data= parameter as  !6shttps%3A%2F%2Flh3.googleusercontent...
    var m = p.match(/!6s(https?(?::|%3A)[^!]+)/i);
    if (m) {
      var u = m[1];
      try { u = decodeURIComponent(u); } catch(e){}
      return sized(u);
    }

    // Google Drive file link
    var d = p.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
    if (d) return "https://drive.google.com/thumbnail?id=" + d[1] + "&sz=w1200";

    // Bare googleusercontent link pasted straight from "Copy image address"
    if (/googleusercontent\.com/.test(p)) return sized(p);

    // Odoo-hosted image, or any other direct URL
    if (/^\/web\/image\//.test(p) || /^https?:\/\//.test(p)) return p;
    return "";
  }
  // ----------------------------------------------------------------------

  function esc(s){
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // o = { ll: [lat,lng] | null, live: true when it came from the island }
  // Live estimates win over typed distance/time; otherwise typed values win.
  function tagsfor(r, o){
    var dest = llfrom(r.lat, r.lng, r.link);
    var live = o.live && dest;
    var est  = (live || !r.distance || !r.time) ? estimate(o.ll, dest) : { d:"", t:"" };
    var dist = live ? est.d : (r.distance || est.d);
    var time = live ? est.t : (r.time || est.t);
    return [dist, time, r.road].filter(function(x){ return String(x||"").trim(); }).join(" \u00b7 ");
  }

  function card(r, o){
    var dest = llfrom(r.lat, r.lng, r.link);
    var ll   = dest ? dest[0] + "," + dest[1] : "";
    var rate = stars(r.rating);

    var gmap = ll ? "https://www.google.com/maps/dir/?api=1&destination=" + ll + "&travelmode=driving"
             : r.link ? r.link
             : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.name);
    var waze = r.waze ? r.waze
             : ll ? "https://www.waze.com/ul?ll=" + ll + "&navigate=yes&zoom=17"
             : "https://www.waze.com/ul?q=" + encodeURIComponent(r.name) + "&navigate=yes";

    var tags = tagsfor(r, o);
    var img  = pic(r.photo);
    var btn  = "flex:1;text-align:center;font-family:inherit;font-size:11px;letter-spacing:.12em;"
             + "text-transform:uppercase;border:1px solid "+TEXT+";padding:11px 4px;color:"+TEXT+";"
             + "background-color:transparent;text-decoration:none;"
             + "transition:background-color .18s ease,color .18s ease,border-color .18s ease";

    return '<article style="border:1px solid '+LINE+';background:'+CARD+';overflow:hidden;'
      + 'display:flex;flex-direction:column;height:100%">'
      + '<div style="position:relative;width:100%;aspect-ratio:16/9;background:'+FRAME+';flex:0 0 auto;overflow:hidden">'
      +   (img ? '<img src="'+esc(img)+'" alt="'+esc(r.name)+'" loading="lazy"'
              + ' referrerpolicy="no-referrer"'
              + ' onerror="this.style.display=\'none\'"'
              + ' style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block">' : '')
      + '</div>'
      + '<div style="padding:18px;display:flex;flex-direction:column;flex:1 1 auto">'
      +   '<h3 style="margin:0;font-size:22px;line-height:1.2;min-height:2.4em;color:'+TEXT+'">'+esc(r.name)+'</h3>'
      +   (String(r.area||"").trim()
            ? '<div class="pk-area" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:'+MUTED+';margin:6px 0 10px">'+esc(r.area)+'</div>'
            : '<div style="height:10px"></div>')
      +   (rate ? '<div class="pk-stars" style="color:'+STAR+';font-size:16px;letter-spacing:.1em">'+rate+'</div>' : '')
      // Always rendered (even empty) so the island can update it in place.
      +   '<div class="pk-tags" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:'+DIM+';margin:10px 0 16px;min-height:1.3em">'+esc(tags)+'</div>'
      +   '<div style="display:flex;gap:8px;margin-top:auto">'
      +     '<a href="'+esc(gmap)+'" target="_blank" rel="noopener" style="'+btn+'">Google Maps</a>'
      +     '<a href="'+esc(waze)+'" target="_blank" rel="noopener" style="'+btn+'">Waze</a>'
      +   '</div>'
      + '</div></article>';
  }

  // One fetch per sheet+tab combination, shared by every block using it.
  var pending = {};
  function sheet(id, tab){
    var k = id + "\u0000" + tab;
    if (!pending[k]) {
      var src = "https://docs.google.com/spreadsheets/d/" + id +
                "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(tab);
      pending[k] = fetch(src).then(function(res){ return res.text(); }).then(parsecsv);
    }
    return pending[k];
  }

  // --- rendezvous island ------------------------------------------------
  function headerbottom(){
    // Odoo's header is often fixed/sticky; float the island just below it.
    var h = document.querySelector("header#top") || document.querySelector("header");
    if (!h) return 0;
    if (!/fixed|sticky/.test(getComputedStyle(h).position)) return 0;
    var b = h.getBoundingClientRect().bottom;
    return b > 0 ? b : 0;
  }

  function island(host){
    if (host.getAttribute("data-pk-done")) return null;
    host.setAttribute("data-pk-done", "1");

    var tab = host.getAttribute("data-tab") || "Rendezvous";
    var id  = host.getAttribute("data-sheet") || SHEET_ID;

    return sheet(id, tab).then(function(rows){
      var idx = mapheaders(rows[0] || []);
      function g(row, f){ return idx[f] === undefined ? "" : (row[idx[f]] || "").trim(); }
      var pts = rows.slice(1).map(function(row){
        return { name: g(row,"name"), ll: llfrom(g(row,"lat"), g(row,"lng"), g(row,"link")) };
      }).filter(function(p){ return p.name && p.ll; });

      if (!pts.length) { host.style.display = "none"; return; }

      host.innerHTML = '<div class="pk-island-bar" role="group" aria-label="Rendezvous point">'
        + '<span class="pk-island-label">Riding from</span>'
        + '<div class="pk-island-chips">'
        +   pts.map(function(p, i){
              return '<button type="button" class="pk-chip" data-i="'+i+'" aria-pressed="false">'+esc(p.name)+'</button>';
            }).join("")
        + '</div>'
        + '<span class="pk-island-caret" aria-hidden="true">\u25BE</span>'
        + '</div>';

      var bar   = host.querySelector(".pk-island-bar");
      var strip = host.querySelector(".pk-island-chips");
      var chips = host.querySelectorAll(".pk-chip");

      function pick(i){
        for (var j=0;j<chips.length;j++){
          var on = j === i;
          chips[j].classList.toggle("pk-on", on);
          chips[j].setAttribute("aria-pressed", on ? "true" : "false");
        }
        var c = chips[i];
        strip.scrollTo({ left: c.offsetLeft - strip.clientWidth/2 + c.offsetWidth/2, behavior: "smooth" });
        setorigin(pts[i].ll);
      }

      bar.addEventListener("click", function(e){
        var compact = host.classList.contains("pk-stuck") && !host.classList.contains("pk-open");
        if (compact) { host.classList.add("pk-open"); return; }
        var chip = e.target.closest(".pk-chip");
        if (chip) { pick(+chip.getAttribute("data-i")); host.classList.remove("pk-open"); }
      });
      document.addEventListener("click", function(e){
        if (!host.contains(e.target)) host.classList.remove("pk-open");
      });

      // Float as a compact pill once scrolled past; hold its space so nothing jumps.
      var stuck = false, ticking = false;
      function check(){
        ticking = false;
        var top = headerbottom() + 12;
        var past = host.getBoundingClientRect().top < top;
        host.style.setProperty("--pk-top", top + "px");
        if (past && !stuck) {
          host.style.height = host.offsetHeight + "px";
          host.classList.add("pk-stuck");
          stuck = true;
        } else if (!past && stuck) {
          host.classList.remove("pk-stuck", "pk-open");
          host.style.height = "";
          stuck = false;
        }
      }
      function onscroll(){ if (!ticking) { ticking = true; requestAnimationFrame(check); } }
      window.addEventListener("scroll", onscroll, { passive: true });
      window.addEventListener("resize", onscroll);
      check();

      pick(0);                             // first point is the default
    }).catch(function(){
      host.style.display = "none";         // no island: cards fall back to data-origin
    });
  }
  // ----------------------------------------------------------------------

  function render(host){
    if (host.getAttribute("data-pk-done")) return;
    host.setAttribute("data-pk-done", "1");

    var tab    = host.getAttribute("data-tab") || "Meet";
    var id     = host.getAttribute("data-sheet") || SHEET_ID;
    var ocell  = host.hasAttribute("data-origin") ? host.getAttribute("data-origin") : ORIGIN_CELL;

    host.innerHTML = '<p class="pk-msg-faint" style="font-size:13px;font-family:inherit">Loading rides\u2026</p>';

    Promise.all([sheet(id, tab), islandReady]).then(function(res){
      var rows = res[0];
      if (!rows.length) throw new Error("empty");

      var fallback = null, ref = cellref(ocell);
      if (ref && rows[ref.row]) fallback = llfrom("", "", rows[ref.row][ref.col]);
      function origin(){ return PICKED ? { ll: PICKED, live: true } : { ll: fallback, live: false }; }

      var idx = mapheaders(rows[0]);
      if (idx.name === undefined) idx = { link:0, name:1, area:2, lat:3, lng:4,
                                          distance:5, time:6, road:7, rating:8, photo:9 };
      function get(row, f){ return idx[f] === undefined ? "" : (row[idx[f]] || "").trim(); }

      var items = rows.slice(1).filter(function(row){ return get(row,"name"); }).map(function(row){
        return {
          name:get(row,"name"), link:get(row,"link"), area:get(row,"area"),
          lat:get(row,"lat"), lng:get(row,"lng"), distance:get(row,"distance"),
          time:get(row,"time"), road:get(row,"road"), rating:get(row,"rating"),
          photo:get(row,"photo"), waze:get(row,"waze")
        };
      });

      var o = origin();
      var cards = items.map(function(r){ return card(r, o); }).join("");

      host.innerHTML = cards
        ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px;align-items:stretch;font-family:inherit">' + cards + '</div>'
        : '<p class="pk-msg" style="font-size:13px">No rides in the <b>'+esc(tab)+'</b> tab yet.</p>';

      // Island changed point: update only the distance/time line, so photos don't reload.
      listeners.push(function(){
        var now = origin(), els = host.querySelectorAll(".pk-tags");
        items.forEach(function(r, i){ if (els[i]) els[i].textContent = tagsfor(r, now); });
      });
    }).catch(function(){
      host.innerHTML = '<p class="pk-msg" style="font-size:13px">Could not read the <b>'+esc(tab)
        + '</b> tab. Check the tab name and that the sheet is published to the web.</p>';
    });
  }

  function start(){
    injectcss();
    var isl = document.querySelector(".pk-island");
    if (isl) islandReady = island(isl);
    var hosts = document.querySelectorAll(".pk-rides");
    for (var i=0;i<hosts.length;i++) render(hosts[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
