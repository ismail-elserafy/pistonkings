/* Piston Kings - back to top
   Appears only after scrolling down past one full screen, and only while
   scrolling upward. Fades out when scrolling down or near the top.
   Drop one <script src="..."> per page; it builds its own button.
*/
(function(){
  "use strict";

  // --- tweakables -------------------------------------------------------
  var TEXT   = "#D1C0AE";   // border + arrow
  var STAR   = "#FC9201";   // pressed state
  var FOLD   = 1.0;         // screens to scroll before it may appear
  var JITTER = 6;           // px of movement ignored, stops flicker
  // ----------------------------------------------------------------------

  if (document.getElementById("pk-top")) return;

  var CSS = ""
    + "#pk-top{position:fixed;left:50%;bottom:28px;z-index:1080;"
    + "width:48px;height:48px;line-height:46px;text-align:center;"
    + "font-size:20px;font-family:inherit;cursor:pointer;"
    + "border:1px solid " + TEXT + ";color:" + TEXT + " !important;"
    + "background:rgba(0,0,0,.72);text-decoration:none !important;"
    + "-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);"
    + "opacity:0;pointer-events:none;"
    + "transform:translateX(-50%) translateY(10px);"
    + "transition:opacity .22s ease,transform .22s ease,"
    + "background-color .18s ease,color .18s ease,border-color .18s ease}"
    + "#pk-top.pk-on{opacity:1;pointer-events:auto;"
    + "transform:translateX(-50%) translateY(0)}"
    + "#pk-top:hover{background:" + TEXT + ";color:#000 !important}"
    + "#pk-top:active{background:" + STAR + ";border-color:" + STAR + ";"
    + "color:#000 !important}"
    + "@media (prefers-reduced-motion:reduce){#pk-top{transition:opacity .01s}}";

  function start(){
    var style = document.createElement("style");
    style.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(style);

    var btn = document.createElement("a");
    btn.id = "pk-top";
    btn.href = "#";
    btn.setAttribute("aria-label", "Back to top");
    btn.innerHTML = "\u2191";
    document.body.appendChild(btn);

    btn.addEventListener("click", function(e){
      e.preventDefault();
      var reduce = window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });

    var last = window.pageYOffset || 0;
    var on   = false;

    function update(){
      var y    = window.pageYOffset || 0;
      var move = y - last;

      if (Math.abs(move) < JITTER) return;   // ignore tiny wobbles

      var up   = move < 0;
      var past = y > window.innerHeight * FOLD;
      var want = up && past;

      if (want !== on) {
        on = want;
        btn.className = on ? "pk-on" : "";
      }
      last = y;
    }

    var queued = false;
    window.addEventListener("scroll", function(){
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function(){ queued = false; update(); });
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
