/**
 * MODULE: LOGGING & DIAGNOSTICS
 * intent: sammelt UI-/Runtime-Diagnosen, zeigt Fehler an, speist das Touch-Log
 * contracts: stellt diag-Logger, perfStats-Snapshots, uiError/uiInfo fuer UI-Module bereit
 * exports: diag, recordPerfStat, uiError, uiInfo
 * notes: unveraenderte Logik, aus index.html extrahiert
 */

/* ===== Fehlerbox ===== */
// SUBMODULE: unhandled rejection sink @internal - pipes promise rejections to inline toast
window.addEventListener('unhandledrejection', (e) => {
  try {
    const msg =
      'Fehler: ' + (e.reason?.message || e.reason || 'Unbekannter Fehler');
    const box = document.getElementById('err');
    if (box) {
      box.style.display = 'block';
      box.textContent = msg;
    } else {
      console.error(msg);
    }
    if (typeof e?.preventDefault === 'function') e.preventDefault();
  } catch (_) {}
});

/* ===== Diagnostics ===== */
// SUBMODULE: perfStats sampler @internal - records timing buckets for perf telemetry
const perfStats = (() => {
  const buckets = Object.create(null);
  const add = (k, ms) => (buckets[k] ??= []).push(ms);
  const pct = (arr, p) => {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const i = Math.ceil((p / 100) * a.length) - 1;
    return a[Math.max(0, Math.min(i, a.length - 1))];
  };
  const snap = (k) => {
    const arr = buckets[k] || [];
    return {
      count: arr.length,
      p50: pct(arr, 50),
      p90: pct(arr, 90),
      p95: pct(arr, 95),
      p99: pct(arr, 99)
    };
  };
  return { add, snap };
})();

function recordPerfStat(key, startedAt) {
  if (startedAt == null) return;
  const hasPerf =
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function';
  if (!hasPerf) return;
  try {
    perfStats?.add?.(key, Math.max(0, performance.now() - startedAt));
    const snap = perfStats?.snap?.(key);
    if (snap && snap.count % 25 === 0) {
      try {
        diag.add?.(
          `[perf] ${key} p50=${snap.p50 | 0}ms p90=${snap.p90 | 0}ms ` +
            `p95=${snap.p95 | 0}ms`
        );
      } catch (_) {}
    }
  } catch (_) {}
}

const diag = {
  el: null,
  logEl: null,
  open: false,
  lines: [],
  add(msg) {
    const t = new Date().toLocaleTimeString();
    this.lines.unshift(`[${t}] ${msg}`);
    this.lines = this.lines.slice(0, 80);
    if (this.logEl) {
      this.logEl.textContent = this.lines.join('\n');
    }
  },
  init() {
    this.el = document.getElementById('diag');
    this.logEl = document.getElementById('diagLog');
    if (this.logEl && this.lines.length) {
      this.logEl.textContent = this.lines.join('\n');
    }
    const t1 = document.getElementById('diagToggle');
    const t2 = document.getElementById('diagToggleFab');
    const close = document.getElementById('diagClose');
    const toggle = () => {
      this.open = !this.open;
      if (this.open) {
        this.show();
      } else {
        this.hide();
      }
    };
    t1.addEventListener('click', toggle);
    if (t2) t2.addEventListener('click', toggle);
    close.addEventListener('click', () => {
      this.hide();
    });
  },
  show() {
    if (!this.el) return;
    this.el.style.display = 'block';
    focusTrap.activate(this.el);
    this.open = true;
  },
  hide() {
    if (!this.el) return;
    this.el.style.display = 'none';
    focusTrap.deactivate();
    this.open = false;
  }
};

/* ===== UI Utils ===== */
function uiError(msg) {
  const box = document.getElementById('err');
  if (box) {
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.textContent = String(msg || 'Fehler');
    box.style.display = 'block';
    setTimeout(() => {
      box.style.display = 'none';
    }, 5000);
  } else {
    alert(msg);
  }
}

function uiInfo(msg) {
  const box = document.getElementById('err');
  if (box) {
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.textContent = String(msg || 'OK');
    box.style.display = 'block';
    setTimeout(() => {
      box.style.display = 'none';
    }, 2000);
  } else {
    console.log(msg);
  }
}
