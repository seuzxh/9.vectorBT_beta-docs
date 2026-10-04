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

  /* ---------------- 版本记录表格速览 ----------------
   * 适用于「实验版本记录」类长文档：h3 版本块（vX.Y · EXX 主题（日期…））自动解析为
   * 速览表（按时间倒序），可随时切回全文；点「详见」跳回全文对应小节锚点。
   * 触发条件：文中 v 开头的 h3 版本块 ≥ 5 个（其他文档不受影响）。
   */
  (function () {
    var article = document.querySelector('article.markdown-body');
    if (!article) return;

    var blocks = [], cur = null, anchor = null;
    Array.prototype.forEach.call(article.children, function (el) {
      if (/^H[12]$/.test(el.tagName)) { cur = null; anchor = null; return; }
      var am = el.querySelector && el.querySelector('a[id^="sec-"]');
      if (am) anchor = am.id;
      if (el.tagName === 'H3') {
        var txt = el.textContent.trim();
        var m = /^(v[\d.]+(?:\s?(?:补充|修正|附注补|附注|附二|附))?)\s*(?:·|－|—|-)?\s*(.*)$/.exec(txt);
        if (m) {
          cur = { ver: m[1], rest: m[2], anchor: anchor, lis: [], codes: [], idx: blocks.length };
          blocks.push(cur);
        } else {
          cur = null;
        }
        return;
      }
      if (cur) {
        var lis = el.querySelectorAll ? el.querySelectorAll('li') : [];
        Array.prototype.forEach.call(lis, function (li) {
          cur.lis.push(li.textContent.trim());
          Array.prototype.forEach.call(li.querySelectorAll('code'), function (c) {
            var t = c.textContent.trim();
            if (t && cur.codes.indexOf(t) < 0) cur.codes.push(t);
          });
        });
      }
    });
    if (blocks.length < 5) return;

    blocks.forEach(function (b) {
      var rest = b.rest || '';
      var em = /(E\d+[A-Za-z]*(?:[-~－]\s*E?\d+[A-Za-z]*)?)/.exec(rest);
      b.exp = em ? em[1] : '';
      var dm = /(\d{4}-\d{2}-\d{2})/.exec(rest);
      b.date = dm ? dm[1] : '';
      b.topic = rest
        .replace(/（[^）]*）/g, '')
        .replace(em ? em[1] : '@@N@@', '')
        .replace(/^[ ·,，、\-]+|[ ·,，、\-]+$/g, '')
        .replace(/\s{2,}/g, ' ');
      var concl = [], arts = [];
      b.lis.forEach(function (t) {
        if (/^(结论|结果|判决)/.test(t)) concl.push(t);
        if (/^产物/.test(t)) arts.push(t);
      });
      b.concl = concl.length ? concl.join(' ') : (b.lis[0] || '');
      // 产物名提取：优先 li 内 <code>（md 反引号渲染结果），回退到文件名正则（无反引号的行）
      var seen = {};
      var names = b.codes.slice();
      names.forEach(function (n) { seen[n] = 1; });
      var rxFile = /[A-Za-z0-9_\-./]+\.(?:csv|png|md|parquet|py|json|html|ipynb|txt)/g;
      arts.join(' ').replace(rxFile, function (n) {
        if (!seen[n]) { seen[n] = 1; names.push(n); }
        return n;
      });
      b.arts = names;
    });

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function clip(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

    // DOM：开关按钮 + 全文容器 + 表格容器
    var full = document.createElement('div');
    full.id = 'tvFull';
    while (article.firstChild) full.appendChild(article.firstChild);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tv-toggle';
    btn.textContent = '📋 表格速览';

    var tv = document.createElement('div');
    tv.id = 'tvTable';
    tv.hidden = true;

    var sorted = blocks.slice().sort(function (a, b2) {
      var d = (b2.date || '').localeCompare(a.date || '');
      return d !== 0 ? d : (b2.idx - a.idx);  // 同日按文档出现顺序倒排（新写的在上）
    });
    var rows = sorted.map(function (b) {
      var arts = b.arts.slice(0, 3).map(esc).join('、') + (b.arts.length > 3 ? ' +' + (b.arts.length - 3) : '');
      var jump = b.anchor
        ? '<a class="tv-jump" data-anchor="' + esc(b.anchor) + '" href="#' + esc(b.anchor) + '">详见↗</a>'
        : '';
      return '<tr>' +
        '<td class="tv-ver">' + esc(b.ver) + '</td>' +
        '<td class="tv-date">' + esc(b.date || '—') + '</td>' +
        '<td class="tv-exp">' + (b.exp ? esc(b.exp) : '—') + '</td>' +
        '<td class="tv-topic">' + esc(b.topic || '—') + '</td>' +
        '<td class="tv-concl" title="' + esc(clip(b.concl, 500)) + '">' + esc(clip(b.concl, 150)) + '</td>' +
        '<td class="tv-arts">' + (arts ? '<code>' + arts + '</code>' : '—') + '</td>' +
        '<td>' + jump + '</td>' +
        '</tr>';
    }).join('');

    tv.innerHTML = '<p class="tv-note">共 ' + blocks.length + ' 个版本块，按时间倒序排列；'
      + '「关键结论」为该块首条结论的截断摘录，悬停可见更长内容；点「详见↗」跳回全文对应小节。</p>'
      + '<table class="tv-table"><colgroup>'
      + '<col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:17%">'
      + '<col style="width:36%"><col style="width:17%"><col style="width:4%">'
      + '</colgroup><thead><tr>'
      + '<th>版本</th><th>日期</th><th>实验</th><th>主题</th><th>关键结论（截断）</th><th>产物</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>';

    article.appendChild(btn);
    article.appendChild(full);
    article.appendChild(tv);

    var mode = 'full';
    function show(which) {
      mode = which;
      full.hidden = which !== 'full';
      tv.hidden = which !== 'table';
      btn.textContent = which === 'full' ? '📋 表格速览' : '← 返回全文';
      btn.classList.toggle('active', which === 'table');
    }
    btn.addEventListener('click', function () { show(mode === 'full' ? 'table' : 'full'); });
    tv.addEventListener('click', function (e) {
      var j = e.target.closest && e.target.closest('.tv-jump');
      if (!j) return;
      e.preventDefault();
      var id = j.getAttribute('data-anchor');
      show('full');
      var target = id && document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  })();

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
