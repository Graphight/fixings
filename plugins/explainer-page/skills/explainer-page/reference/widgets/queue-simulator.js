// Arrival/service queue: particles pile up in front of a gate with N permits.
// Teaches: where a bottleneck forms, and that throughput flatlines while latency climbs.
// Gotcha: pick the service speed so capacity straddles the slider's default. Get this
// wrong and it saturates at every setting — the 'keeping up' state becomes unreachable
// and the widget silently argues the opposite of what the caption says.
// Cap the visible queue and label the readout '48+' rather than drowning the canvas.

/* ── request flow simulator ──────────────────────────── */
(function () {
  var cv = document.getElementById('fl-canvas');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var running = !reduced;
  var rateEl = document.getElementById('fl-rate'), semEl = document.getElementById('fl-sem');

  var GATE = 980, GPU_END = 1520, SPEED = 14, GPU_SPEED = 26;
  var QCAP = 48;   // stop spawning past this so the canvas stays legible
  var MS_PER_FRAME = 16;

  var parts = [], permits = 2, free = 2, frame = 0;
  var waits = [], finishes = [];

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function rr(c, x, y, w, h, r) {
    // arcTo throws IndexSizeError on a negative radius, and the throw happens inside
    // requestAnimationFrame — one bad frame kills the loop for good. Clamp, don't trust.
    w = Math.max(0, w); h = Math.max(0, h);
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function draw() {
    var line = css('--line'), faint = css('--ink-faint'), ground = css('--ground');
    var flame = css('--flame'), patina = css('--patina'), sage = css('--sage'), ember = css('--ember');
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    var top = 70, band = 160;

    // zones
    function zone(x0, x1, label, col) {
      ctx.fillStyle = ground; rr(ctx, x0, top, x1 - x0, band, 8); ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col; ctx.font = '600 17px "JetBrains Mono", monospace';
      ctx.fillText(label, x0 + 16, top - 16);
    }
    zone(12, GATE - 46, 'THREADPOOL — UNBOUNDED, BY DESIGN', patina);
    zone(GATE + 4, GPU_END + 8, 'GPU — CHUNK OF 32 ROWS', flame);
    zone(GPU_END + 24, W - 12, 'DONE', sage);

    // the gate
    var over = parts.filter(function (p) { return p.s === 'queue'; }).length;
    ctx.fillStyle = over > 6 ? ember : flame;
    rr(ctx, GATE - 40, top - 4, 40, band + 8, 5); ctx.fill();
    ctx.fillStyle = ground; ctx.font = '700 15px "JetBrains Mono", monospace';
    for (var s = 0; s < permits; s++) {
      ctx.fillRect(GATE - 32, top + 14 + s * 26, 24, 14);
    }
    ctx.fillStyle = over > 6 ? ember : flame;
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText('SEMAPHORE(' + permits + ')', GATE - 150, top + band + 30);

    // particles
    parts.forEach(function (p, idx) {
      var c = p.s === 'queue' ? (over > 6 ? ember : faint) : p.s === 'run' ? flame : sage;
      var y = p.y;
      if (p.s === 'queue') {
        var qi = parts.filter(function (o, j) { return o.s === 'queue' && j < idx; }).length;
        p.x = GATE - 60 - (qi % 12) * 26;
        y = top + 18 + Math.floor(qi / 12) * 26;
      }
      ctx.fillStyle = c;
      ctx.globalAlpha = p.s === 'exit' ? .5 : .95;
      ctx.beginPath(); ctx.arc(p.x, y, 8, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = faint; ctx.font = '15px "JetBrains Mono", monospace';
    ctx.fillText('arrivals →', 20, top + band + 30);
  }

  function readouts() {
    var q = parts.filter(function (p) { return p.s === 'queue'; }).length;
    var f = parts.filter(function (p) { return p.s === 'run'; }).length;
    var mw = waits.length ? waits.reduce(function (a, b) { return a + b; }, 0) / waits.length : 0;

    document.getElementById('fl-rate-v').textContent = rateEl.value;
    document.getElementById('fl-sem-v').textContent = semEl.value;

    var qe = document.getElementById('fl-queue');
    qe.textContent = q >= 48 ? '48+' : q; qe.className = q > 12 ? 'hot' : q > 4 ? 'warm' : 'good';
    document.getElementById('fl-flight').textContent = f + ' / ' + semEl.value;
    var we = document.getElementById('fl-wait');
    we.textContent = Math.round(mw) + ' ms';
    we.className = mw > 900 ? 'hot' : mw > 250 ? 'warm' : 'good';
    document.getElementById('fl-tput').textContent = finishes.length;

    var v = document.getElementById('fl-verdict');
    if (q > 12) v.innerHTML = '<strong>Saturated.</strong> Throughput has stopped rising — the pile is all upstream of the gate, exactly where you want it. Note the wait climbing into seconds: with <code>semaphore_timeout: None</code> those threads wait forever rather than shedding.';
    else if (q > 4) v.innerHTML = '<strong>At the knee.</strong> Arrivals are outrunning the permits. Throughput is flat now; every extra request buys latency, not work.';
    else v.innerHTML = '<strong>Keeping up.</strong> Requests clear the gate about as fast as they arrive, so the wait stays near zero. Push arrivals up and watch where the pile forms.';
  }

  function loop() { if (running) { step(); draw(); readouts(); } requestAnimationFrame(loop); }

  [rateEl, semEl].forEach(function (el) { el.addEventListener('input', readouts); });
  var play = document.getElementById('fl-play');
  play.addEventListener('click', function () {
    running = !running;
    play.textContent = running ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(running));
  });
  play.textContent = running ? 'Pause' : 'Play';

  draw(); readouts(); requestAnimationFrame(loop);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
