/* ============ 站点脚本（docs/assets/site.js） ============
 * 1) 顶栏全文搜索：读根路径 search.json（由 Jekyll 构建），中文子串命中，
 *    结果含上下文摘录；回车/点击跳转，并带 ?q= 参数。
 * 2) 落页定位：带 ?q= 打开的页面自动滚动到正文首个命中段落并高亮闪烁。
 * 3) 移动端侧栏开合。
 */
(function () {
  'use strict';

  var body = document.body;
  var base = (body.getAttribute('data-base') || '').replace(/\/$/, '');

  /* ---------------- 全文搜索 ---------------- */
  var input = document.getElementById('searchInput');
  var panel = document.getElementById('searchResults');
  var docsCache = null;
  var activeIdx = -1;

  function loadIndex(cb) {
    if (docsCache) { cb(docsCache); return; }
    fetch(base + '/search.json', { cache: 'no-cache' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        docsCache = JSON.parse(t);
        cb(docsCache);
      })
      .catch(function (e) { console.error('搜索索引加载失败：', e); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rxEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function splitTerms(q) {
    return q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function highlight(escapedHtml, terms) {
    if (!terms.length) return escapedHtml;
    var rx = new RegExp('(' + terms.map(rxEscape).join('|') + ')', 'gi');
    return escapedHtml.replace(rx, '<mark>$1</mark>');
  }

  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var pos = -1;
    for (var i = 0; i < terms.length; i++) {
      var p = lower.indexOf(terms[i]);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
    if (pos < 0) return '';
    var start = Math.max(0, pos - 34);
    var s = text.substr(start, 110).replace(/\s+/g, ' ');
    if (start > 0) s = '…' + s;
    if (start + 110 < text.length) s = s + '…';
    return s;
  }

  function search(q) {
    var terms = splitTerms(q);
    // 单个纯英文/数字词至少 2 字符才触发（中文单字即可搜）
    if (!terms.length) return [];
    if (terms.length === 1 && !/[\u4e00-\u9fff]/.test(terms[0]) && terms[0].length < 2) return [];
    var out = [];
    for (var i = 0; i < docsCache.length; i++) {
      var d = docsCache[i];
      var title = (d.t || '').toLowerCase();
      var text = (d.x || '').toLowerCase();
      var score = 0, ok = true;
      for (var j = 0; j < terms.length; j++) {
        var t = terms[j];
        if (title.indexOf(t) >= 0) score += 8;
        var n = text.split(t).length - 1;
        if (n > 0) score += Math.min(n, 5);
        if (title.indexOf(t) < 0 && n === 0) { ok = false; break; }
      }
      if (ok) out.push({ d: d, score: score });
    }
    out.sort(function (a, b) { return b.score - a.score || (a.d.t || '').localeCompare(b.d.t || ''); });
    return out.slice(0, 12).map(function (x) { return x.d; });
  }

  function render(q) {
    var terms = splitTerms(q);
    var hits = search(q);
    var html = '';
    for (var i = 0; i < hits.length; i++) {
      var d = hits[i];
      var snip = snippet(d.x || '', terms);
      html += '<a href="' + base + d.u + '?q=' + encodeURIComponent(q) + '">' +
        '<div class="r-title">' + highlight(esc(d.t), terms) + '</div>' +
        (snip ? '<div class="r-snip">' + highlight(esc(snip), terms) + '</div>' : '') +
        '</a>';
    }
    if (!html) {
      html = '<div class="r-empty">未命中「' + esc(q) + '」。可尝试：术语（封板/门控/回撤）、实验编号（E25 / v1.6 / exp39）。</div>';
    }
    panel.innerHTML = html;
    activeIdx = -1;
  }

  function openPanel() { panel.hidden = false; }
  function closePanel() { panel.hidden = true; activeIdx = -1; }

  if (input && panel) {
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (!q) { closePanel(); return; }
      loadIndex(function () { render(q); openPanel(); });
    });
    input.addEventListener('focus', function () {
      if (input.value.trim() && panel.innerHTML) openPanel();
    });
    input.addEventListener('keydown', function (e) {
      var links = panel.querySelectorAll('a');
      if (e.key === 'Enter') {
        var target = (activeIdx >= 0 && links[activeIdx]) ? links[activeIdx] : links[0];
        if (target) { e.preventDefault(); location.href = target.getAttribute('href'); }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!links.length) return;
        e.preventDefault();
        activeIdx = e.key === 'ArrowDown'
          ? (activeIdx + 1) % links.length
          : (activeIdx - 1 + links.length) % links.length;
        for (var k = 0; k < links.length; k++) links[k].classList.toggle('active', k === activeIdx);
      } else if (e.key === 'Escape') {
        closePanel();
        input.blur();
      }
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest && !e.target.closest('.searchbox')) closePanel();
    });
  }

  /* ---------------- 落页定位（?q=） ---------------- */
  var qm = /(?:^|[?&])q=([^&]*)/.exec(location.search);
  if (qm) {
    var q2 = decodeURIComponent(qm[1].replace(/\+/g, ' ')).trim();
    var terms2 = splitTerms(q2);
    if (terms2.length) {
      var main = document.querySelector('.markdown-body');
      if (main) {
        var els = main.querySelectorAll('h1,h2,h3,h4,h5,p,li,td,th,blockquote,pre,dt,dd');
        for (var i2 = 0; i2 < els.length; i2++) {
          var txt = els[i2].textContent.toLowerCase();
          var hit = true;
          for (var j2 = 0; j2 < terms2.length; j2++) {
            if (txt.indexOf(terms2[j2]) < 0) { hit = false; break; }
          }
          if (hit) {
            els[i2].classList.add('search-flash');
            els[i2].scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          }
        }
      }
    }
  }

  /* ---------------- 移动端侧栏 ---------------- */
  var navToggle = document.getElementById('navToggle');
  if (navToggle) {
    navToggle.addEventListener('click', function () { body.classList.toggle('nav-open'); });
    var side = document.getElementById('sidebar');
    if (side) {
      side.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) body.classList.remove('nav-open');
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') body.classList.remove('nav-open');
    });
  }
})();
