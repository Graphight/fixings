// Round-robin timeline with 'juicy' hit feedback at a judgement line.
// Teaches: turn-taking, per-turn overhead, and a shared resource filling up.
// Gotcha: detect the hit by tracking a phase variable and its wrap, NOT by
// comparing pixel positions — a fast loop skips frames and misses the crossing.
// Verify: simulate N frames, assert each lane fires exactly once per cycle.

/* ── slice simulator ─────────────────────────────────── */
(function () {
  var cv = document.getElementById('ts-canvas');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pods = 3;
  var running = !reduced;
  var t = 0, prevU = 0, done = 0;
  var bursts = [];

  var QUANTUM = 70;   // px of timeline one pod owns per turn
  var SWITCH  = 9;    // px lost swapping context — illustrative, not measured
  var SPEED   = 0.9;  // px per frame

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function tone(i) { return css(['--flame', '--patina', '--sage', '--mauve'][i % 4]); }

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

  function geom() {
    var padL = 96, laneH = 56, gap = 10;
    var barTop = H - 76;
    var top = Math.max(30, (barTop - 30 - pods * (laneH + gap)) / 2);
    return { padL: padL, laneH: laneH, gap: gap, barTop: barTop, top: top,
             trackW: W - padL - 24, cycle: pods * (QUANTUM + SWITCH) };
  }

  /* A pod's block reaches the judgement line when u passes p*(QUANTUM+SWITCH). */
  function detectHits(u, g) {
    if (reduced) return;
    var wrapped = u < prevU;
    for (var p = 0; p < pods; p++) {
      var target = p * (QUANTUM + SWITCH);
      var crossed = wrapped
        ? (target >= prevU || target < u)
        : (target >= prevU && target < u);
      if (crossed) {
        done++;
        bursts.push({ pod: p, life: 1, y: g.top + p * (g.laneH + g.gap) + g.laneH / 2 });
      }
    }
    prevU = u;
  }

  function drawBursts(g) {
    for (var i = bursts.length - 1; i >= 0; i--) {
      var b = bursts[i];
      b.life -= 0.045;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }

      var e = 1 - b.life;            // 0 → 1 as it ages
      var col = tone(b.pod);
      ctx.save();
      ctx.translate(g.padL, b.y);

      // shockwave ring
      ctx.globalAlpha = b.life * 0.85;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 * b.life + 1;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + e * 46, 0, Math.PI * 2);
      ctx.stroke();

      // spokes firing back down the lane
      ctx.globalAlpha = b.life * 0.9;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (var k = -2; k <= 2; k++) {
        var ang = Math.PI + k * 0.42;
        var r0 = 12 + e * 26, r1 = r0 + 16 * b.life;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.stroke();
      }

      // the judgement line itself lights up
      ctx.globalAlpha = b.life;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -g.laneH / 2 + 6);
      ctx.lineTo(0, g.laneH / 2 - 6);
      ctx.stroke();

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    var faint = css('--ink-faint'), line = css('--line'), ground = css('--ground');
    var g = geom();
    var u = (t * SPEED) % g.cycle;
    ctx.clearRect(0, 0, W, H);

    detectHits(u, g);

    var stackTop = g.top, stackH = pods * (g.laneH + g.gap) - g.gap;

    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';

    // lanes + blocks
    for (var p = 0; p < pods; p++) {
      var y = g.top + p * (g.laneH + g.gap);

      ctx.fillStyle = faint;
      ctx.fillText('pod ' + String.fromCharCode(65 + p), 16, y + g.laneH / 2);

      ctx.fillStyle = ground;
      ctx.fillRect(g.padL, y, g.trackW, g.laneH);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.strokeRect(g.padL + .5, y + .5, g.trackW - 1, g.laneH - 1);

      ctx.save();
      ctx.beginPath(); ctx.rect(g.padL, y, g.trackW, g.laneH); ctx.clip();
      ctx.fillStyle = tone(p);
      ctx.globalAlpha = .9;
      for (var x = -u - g.cycle; x < g.trackW + g.cycle; x += g.cycle) {
        rr(ctx, g.padL + x + p * (QUANTUM + SWITCH), y + 8, QUANTUM, g.laneH - 16, 4);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // context-switch slivers — span every lane, because they are nobody's work
    if (pods > 1) {
      ctx.save();
      ctx.beginPath(); ctx.rect(g.padL, stackTop, g.trackW, stackH); ctx.clip();
      ctx.fillStyle = faint;
      for (var xs = -u - g.cycle; xs < g.trackW + g.cycle; xs += g.cycle) {
        for (var m = 0; m < pods; m++) {
          var gx = g.padL + xs + m * (QUANTUM + SWITCH) + QUANTUM;
          ctx.globalAlpha = .34;
          ctx.fillRect(gx, stackTop, SWITCH, stackH);
          ctx.globalAlpha = .13;
          ctx.fillRect(gx - 3, stackTop, 3, stackH);
          ctx.fillRect(gx + SWITCH, stackTop, 3, stackH);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      ctx.fillStyle = faint;
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillText('grey = context switch · nobody’s work', g.padL, stackTop + stackH + 18);
    }

    // judgement line — where a kernel lands
    ctx.strokeStyle = css('--flame');
    ctx.globalAlpha = .55; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(g.padL, stackTop - 10); ctx.lineTo(g.padL, stackTop + stackH + 4); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = css('--flame');
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillText('RETIRE', g.padL - 78, stackTop - 14);

    drawBursts(g);

    // memory bar — shared in space, not time
    var my = g.barTop, barW = W - 32, seg = (barW - 4) / 4;
    ctx.fillStyle = faint;
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.fillText('GPU MEMORY — ONE POOL, NO PARTITION', 16, my - 16);

    ctx.fillStyle = ground; rr(ctx, 16, my, barW, 34, 5); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 1; rr(ctx, 16.5, my + .5, barW - 1, 33, 5); ctx.stroke();
    for (var mm = 0; mm < pods; mm++) {
      ctx.fillStyle = tone(mm); ctx.globalAlpha = .85;
      rr(ctx, 18 + mm * seg, my + 2, seg - 3, 30, 4); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (pods < 4) {
      ctx.strokeStyle = css('--ember'); ctx.setLineDash([7, 5]); ctx.lineWidth = 1.5;
      rr(ctx, 18 + pods * seg, my + 2, (4 - pods) * seg - 3, 30, 4); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css('--ember'); ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillText('headroom', 30 + pods * seg, my + 17);
    } else {
      ctx.fillStyle = css('--ember'); ctx.font = '600 16px "JetBrains Mono", monospace';
      ctx.fillText('no headroom left', 24, my + 54);
    }

    var dn = document.getElementById('ro-done');
    if (dn) dn.textContent = done;
  }

  function readouts() {
    var ovh = (SWITCH / (QUANTUM + SWITCH)) * 100;
    document.getElementById('ro-share').textContent = (100 / pods).toFixed(0) + '%';
    document.getElementById('ro-lat').textContent = pods.toFixed(1) + '×';
    document.getElementById('ro-ovh').textContent = (pods > 1 ? ovh : 0).toFixed(0) + '%';
    var mem = document.getElementById('ro-mem');
    mem.textContent = pods + ' / 3';
    mem.className = pods > 3 ? 'hot' : (pods === 3 ? 'warm' : 'good');

    var v = document.getElementById('ts-verdict');
    if (pods === 1) v.innerHTML = '<strong>One tenant.</strong> The whole card, no switching, no neighbour to poison your memory — and mostly idle between requests. This is the waste time-slicing exists to fix.';
    else if (pods === 3) v.innerHTML = '<strong>What we actually run.</strong> A third of the clock each, and one memory pool with no referee. Three times the utilisation, three times the ways to die.';
    else if (pods === 4) v.innerHTML = '<strong>Past our config.</strong> Latency is 4&times; the solo case and the pool has no slack — the first pod to grow its arena kills a neighbour that did nothing wrong.';
    else v.innerHTML = '<strong>Two tenants.</strong> Utilisation nearly doubles, switching costs little, and there is still headroom. Cheap — but a third pod is where the money is, which is why we take the risk.';
  }

  function frame() { if (running) { t += 1; draw(); } requestAnimationFrame(frame); }

  Array.prototype.forEach.call(document.querySelectorAll('#ts-n button'), function (b) {
    b.addEventListener('click', function () {
      pods = +b.dataset.n; bursts = [];
      prevU = (t * SPEED) % (pods * (QUANTUM + SWITCH));
      Array.prototype.forEach.call(document.querySelectorAll('#ts-n button'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      readouts(); draw();
    });
  });

  var play = document.getElementById('ts-play');
  play.textContent = running ? 'Pause' : 'Play';
  play.addEventListener('click', function () {
    running = !running;
    play.textContent = running ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(running));
  });

  readouts(); draw(); requestAnimationFrame(frame);
  window.addEventListener('resize', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
})();
