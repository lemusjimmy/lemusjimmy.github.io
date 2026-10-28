// Fills the page from the Markdown files in content/<lang>/.
// Elements opt in with data-md="path.md" and optionally data-layout="hero|cards|certs|timeline|footer".
// Supported Markdown: "# Title", "## Item", "_meta_", "- list", "---", **bold**, _italic_, [text](url).
(function () {
  const el = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    kids.flat().forEach(k => n.append(k));
    return n;
  };

  const safeUrl = u => (/^\s*(javascript|data|vbscript):/i.test(u) ? '#' : u);

  // Inline Markdown -> DOM nodes (never innerHTML, so content cannot inject markup).
  function inline(text) {
    const out = [];
    const re = /\*\*([^*]+)\*\*|(?<!\w)_([^_]+)_(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      if (m[1]) out.push(el('strong', '', m[1]));
      else if (m[2]) out.push(el('em', '', m[2]));
      else {
        const a = el('a', '', m[3]);
        a.href = safeUrl(m[4]);
        if (/^https?:/i.test(m[4])) a.rel = 'me noopener';
        out.push(a);
      }
      last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function parse(md) {
    const blocks = [];
    let para = [];
    let list = null;
    const flush = () => { if (para.length) { blocks.push({ t: 'p', text: para.join(' ') }); para = []; } };
    for (const raw of md.split(/\r?\n/)) {
      const line = raw.trim();
      let m;
      if (!line) { flush(); list = null; }
      else if ((m = line.match(/^(#{1,2})\s+(.*)$/))) { flush(); list = null; blocks.push({ t: 'h' + m[1].length, text: m[2] }); }
      else if (line === '---') { flush(); list = null; blocks.push({ t: 'hr' }); }
      else if ((m = line.match(/^[-*]\s+(.*)$/))) {
        flush();
        if (!list) { list = { t: 'ul', items: [] }; blocks.push(list); }
        list.items.push(m[1]);
      }
      else if (/^_[^_]+_$/.test(line)) { flush(); list = null; blocks.push({ t: 'em', text: line.slice(1, -1) }); }
      else { list = null; para.push(line); }
    }
    flush();
    return blocks;
  }

  // { title, intro: [blocks], items: [{ title, now, meta, body: [blocks] }], after: [blocks] }
  function structure(blocks) {
    const doc = { title: '', intro: [], items: [], after: [] };
    let target = 'intro', item = null;
    for (const b of blocks) {
      if (b.t === 'h1' && !doc.title) doc.title = b.text;
      else if (b.t === 'hr') { target = 'after'; item = null; }
      else if (b.t === 'h2' && target === 'intro') {
        item = { title: b.text.replace(/\s*\{now\}\s*$/, ''), now: /\{now\}\s*$/.test(b.text), meta: '', body: [] };
        doc.items.push(item);
      }
      else if (item && b.t === 'em' && !item.meta && !item.body.length) item.meta = b.text;
      else if (item) item.body.push(b);
      else doc[target].push(b);
    }
    return doc;
  }

  const paragraphs = (blocks, cls) => blocks
    .filter(b => b.t === 'p')
    .map(b => el('p', cls, inline(b.text)));

  function renderProse(blocks, { lead, list }) {
    return blocks.map(b => {
      if (b.t === 'p') return el('p', lead, inline(b.text));
      if (b.t === 'ul') return el('ul', list, b.items.map(i => el('li', '', inline(i))));
      if (b.t === 'em') return el('p', 'muted', inline(b.text));
      return '';
    });
  }

  const layouts = {
    cards: doc => el('div', 'cards', doc.items.map(i =>
      el('article', 'card', el('h3', '', inline(i.title)), paragraphs(i.body)))),
    certs: doc => el('ul', 'certs', doc.items.map(i =>
      el('li', i.now ? 'now' : '', el('strong', '', inline(i.title)), el('span', '', inline(i.meta))))),
    timeline: doc => el('ol', 'timeline', doc.items.map(i =>
      el('li', '', el('h3', '', inline(i.title)), el('span', 'when', inline(i.meta)), paragraphs(i.body)))),
  };

  function renderSection(node, doc) {
    const layout = node.dataset.layout;
    const box = el('div', 'md',
      el('h2', '', inline(doc.title)),
      renderProse(doc.intro, { lead: 'lead', list: 'contact-list' }),
      layouts[layout] ? layouts[layout](doc) : '',
      renderProse(doc.after, { lead: 'muted', list: 'tags' }));
    node.prepend(box);
  }

  function renderHero(node, doc) {
    const target = node.querySelector('.hero-text');
    const eyebrow = doc.intro.find(b => b.t === 'em');
    const ps = doc.intro.filter(b => b.t === 'p');
    const links = doc.intro.find(b => b.t === 'ul');
    const buttons = (links ? links.items : []).map((t, i) => {
      const [a] = inline(t);
      a.className = 'btn ' + (i === 0 ? 'primary' : 'ghost');
      return a;
    });
    target.replaceChildren(
      ...(eyebrow ? [el('p', 'eyebrow', inline(eyebrow.text))] : []),
      el('h1', '', inline(doc.title)),
      ...(ps[0] ? [el('p', 'role', inline(ps[0].text))] : []),
      ...(ps[1] ? [el('p', 'pitch', inline(ps[1].text))] : []),
      ...buttons);
  }

  function renderFooter(node, doc) {
    const text = doc.intro.find(b => b.t === 'p');
    node.querySelector('.wrap').replaceChildren(text ? inline(text.text) : '');
  }

  function render(node, doc) {
    if (node.dataset.layout === 'hero') renderHero(node, doc);
    else if (node.dataset.layout === 'footer') renderFooter(node, doc);
    else renderSection(node, doc);
  }

  const nodes = [...document.querySelectorAll('[data-md]')];
  Promise.allSettled(nodes.map(node =>
    fetch(node.dataset.md)
      .then(res => { if (!res.ok) throw new Error(node.dataset.md + ': ' + res.status); return res.text(); })
      .then(md => { const doc = structure(parse(md)); render(node, doc); return { node, doc }; })
  )).then(results => {
    results.forEach(r => { if (r.status === 'rejected') console.error('Content load error:', r.reason); });

    // Navigation is built from the section titles, in page order.
    const links = document.querySelector('.topnav .links');
    if (links) {
      links.replaceChildren(...results
        .filter(r => r.status === 'fulfilled' && r.value.node.matches('main section[id]'))
        .map(r => {
          const a = el('a', '', r.value.doc.title);
          a.href = '#' + r.value.node.id;
          return a;
        }));
    }
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  });
})();
