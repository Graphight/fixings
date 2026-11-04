// Two-column stepper: 'what the dashboard shows' vs 'what is actually true'.
// Teaches: a failure whose symptom and cause live in different places.
// The layout IS the argument — keep the two columns.
// Always label it a reconstruction of the failure mode, never a real transcript.

/* ── incident trace stepper ──────────────────────────── */
(function () {
  var host = document.getElementById('tr-pods');
  if (!host) return;

  var STEPS = [
    { clock: 'T+0',
      mem: [.52, .48, .55], state: ['ok', 'ok', 'ok'],
      obs: 'Three pods green. Latency flat, <code>semaphore_wait_time</code> near zero, card at roughly 60% memory. Nobody is looking at this dashboard.',
      tru: 'Genuinely fine. Each pod holds its weights plus an arena sized to the biggest batch it has seen so far. There is real headroom.' },

    { clock: 'T+2m',
      mem: [.74, .48, .55], state: ['grow', 'ok', 'ok'],
      obs: 'Pod A’s <code>batch_padded_token_width</code> jumps from 128 to 512. No alert fires — there is no threshold on it. Pod A’s latency ticks up slightly.',
      tru: 'A caller sent a batch containing one very long message. Every row in that chunk padded up to match it, so the activation tensors are four times their usual size and ORT grows pod A’s arena to fit.' },

    { clock: 'T+2m 10s',
      mem: [.74, .48, .55], state: ['grow', 'ok', 'ok'],
      obs: 'Pod A finishes the batch. Latency returns to normal. Pod A is, by every metric it reports, completely healthy again.',
      tru: '<strong>The arena does not shrink.</strong> <code>kSameAsRequested</code> stops it grabbing more than asked, but it still holds its high-water mark. Free memory on the card is now permanently lower — and no per-pod metric shows it.' },

    { clock: 'T+3m',
      mem: [.74, .48, .74], state: ['grow', 'ok', 'grow'],
      obs: 'Pod C takes an entirely ordinary request. 32 rows, short messages, nothing unusual in its logs.',
      tru: 'Pod C asks CUDA for a few hundred megabytes it has successfully allocated a thousand times today. The card no longer has it to give.' },

    { clock: 'T+3m 01s',
      mem: [.74, .48, .0], state: ['grow', 'ok', 'dead'],
      obs: '<strong>Pod C 500s.</strong> <code>CUDA out of memory</code> in the logs. You are paged for pod C. Pod C’s own charts — batch size, token width, wait time — are all unremarkable.',
      tru: 'Pod C is the victim, not the cause. It did nothing wrong, and everything it reports about itself will tell you it did nothing wrong. The pod that caused this is still green.' },

    { clock: 'The lesson',
      mem: [.74, .48, .30], state: ['grow', 'ok', 'ok'],
      obs: 'You spend the first twenty minutes reading pod C’s metrics, because that is the pod that paged you. Everything there looks fine, because it is fine.',
      tru: 'Two changes end this class of incident. Roll GPU metrics up by <strong>card and host</strong>, not by service, so you can see a neighbour eating the pool. And set <code>gpu_mem_limit</code>, so pod A fails <em>itself</em> at the moment it overreaches, instead of leaving a landmine for whoever allocates next.' }
  ];

  var i = 0;
  var names = ['pod A', 'pod B', 'pod C'], cls = ['a', 'b', 'c'];
  var labels = { ok: 'nominal', grow: 'arena grown', dead: 'CUDA OOM' };

  host.innerHTML = names.map(function (n, k) {
    return '<div class="podrow"><span class="pname">' + n + '</span>' +
           '<span class="podbar ' + cls[k] + '" id="pb' + k + '"><i style="width:0"></i></span>' +
           '<span class="pstate ok" id="ps' + k + '"></span></div>';
  }).join('');

  var dots = document.getElementById('tr-dots');
  dots.innerHTML = STEPS.map(function (_, k) {
    return '<button type="button" data-i="' + k + '" aria-label="Step ' + (k + 1) + '"></button>';
  }).join('');

  function render() {
    var st = STEPS[i];
    document.getElementById('tr-clock').textContent = st.clock;
    document.getElementById('tr-obs').innerHTML = st.obs;
    document.getElementById('tr-tru').innerHTML = st.tru;
    for (var k = 0; k < 3; k++) {
      var bar = document.getElementById('pb' + k);
      bar.className = 'podbar ' + cls[k] + (st.state[k] === 'dead' ? ' dead' : '');
      bar.firstChild.style.width = (st.mem[k] * 100) + '%';
      var ps = document.getElementById('ps' + k);
      ps.className = 'pstate ' + st.state[k];
      ps.textContent = labels[st.state[k]];
    }
    Array.prototype.forEach.call(dots.children, function (b, k) {
      b.setAttribute('aria-current', String(k === i));
    });
    document.getElementById('tr-prev').disabled = i === 0;
    document.getElementById('tr-next').disabled = i === STEPS.length - 1;
  }

  document.getElementById('tr-prev').addEventListener('click', function () { if (i > 0) { i--; render(); } });
  document.getElementById('tr-next').addEventListener('click', function () { if (i < STEPS.length - 1) { i++; render(); } });
  Array.prototype.forEach.call(dots.children, function (b) {
    b.addEventListener('click', function () { i = +b.dataset.i; render(); });
  });

  render();
})();
