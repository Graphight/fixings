// Sliders -> a derived number the reader did not expect, plus a tile per unit.
// Teaches: a hidden multiplier. Best widget when the point is 'you typed X, you got X*N'.
// Pure DOM, no canvas. Colour the readout good/warm/hot as it crosses real thresholds.

/* ── concurrency calculator ──────────────────────────── */
(function () {
  var pods = document.getElementById('cc-pods');
  if (!pods) return;
  var sem = document.getElementById('cc-sem'), chunk = document.getElementById('cc-chunk');
  var grid = document.getElementById('cc-grid');

  function render() {
    var p = +pods.value, s = +sem.value, c = +chunk.value;
    var passes = p * s, rows = passes * c;

    document.getElementById('cc-pods-v').textContent = p;
    document.getElementById('cc-sem-v').textContent = s;
    document.getElementById('cc-chunk-v').textContent = c;

    var pn = document.getElementById('cc-passes');
    pn.textContent = passes;
    pn.className = passes > 9 ? 'hot' : passes > 6 ? 'warm' : 'good';

    var rn = document.getElementById('cc-rows');
    rn.textContent = rows;
    rn.className = rows > 384 ? 'hot' : rows > 192 ? 'warm' : 'good';

    document.getElementById('cc-mult').textContent = '×' + p;

    grid.textContent = '';
    var cls = ['a', 'b', 'c'];
    for (var i = 0; i < p; i++) {
      for (var j = 0; j < s; j++) {
        var d = document.createElement('div');
        d.className = 'pass ' + cls[i % 3];
        d.textContent = String.fromCharCode(65 + i);
        d.title = 'pod ' + String.fromCharCode(65 + i) + ', permit ' + (j + 1);
        grid.appendChild(d);
      }
    }

    var v = document.getElementById('cc-verdict');
    if (p === 1) {
      v.innerHTML = 'One pod on the card, so <strong>the number you typed is the number you get</strong>. This is the mental model everyone has, and it is wrong in production.';
    } else if (s === 2 && p === 3 && c === 32) {
      v.innerHTML = 'Today’s defaults. You wrote <strong>2</strong> in a config file; the card is running <strong>6</strong>.';
    } else {
      v.innerHTML = 'You wrote <strong>' + s + '</strong>. The card runs <strong>' + passes + '</strong> — ' +
        rows + ' rows of activations in flight, from ' + p + ' processes that cannot see each other’s memory usage.';
    }
  }

  [pods, sem, chunk].forEach(function (el) { el.addEventListener('input', render); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
    b.addEventListener('click', function () {
      var ci = b.dataset.preset === 'ci';
      pods.value = 3; sem.value = ci ? 3 : 2; chunk.value = 32;
      render();
    });
  });

  render();
})();
