#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
let matter;
let marked;
try {
  matter = require('gray-matter');
} catch {
  matter = (input) => {
    const match = input.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: input };
    const data = {};
    for (const line of match[1].split('\n')) {
      const i = line.indexOf(':');
      if (i === -1) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
      data[key] = value;
    }
    return { data, content: match[2] };
  };
}
try {
  ({ marked } = require('marked'));
} catch {
  marked = { parse: (md) => md };
}

const CATEGORY_LABELS = {
  process: 'CNC Processes',
  materials: 'Materials',
  design: 'Design & Tolerances',
  sourcing: 'Sourcing & Procurement',
  industry: 'Industries',
  quality: 'Quality & Inspection'
};
const REQUIRED_FIELDS = ['title', 'date', 'preview', 'category', 'slug'];
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'articles');
const BLOG_DIR = path.join(ROOT, 'blog');
const ARTICLE_TEMPLATE = fs.readFileSync(path.join(ROOT, 'scripts', 'templates', 'article.html'), 'utf8');

if (typeof marked.setOptions === 'function') marked.setOptions({ gfm: true, breaks: false });

const escapeHtml = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const titleCase = (slug) => slug.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
const formatDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const normalizeCategory = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');
const categoryLabel = (value) => CATEGORY_LABELS[value] || titleCase(value);

function getMdxFiles() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx')).map((f) => path.join(CONTENT_DIR, f));
}

function deriveSlug(filePath) {
  return path.basename(filePath, '.mdx')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function cleanText(input) {
  return String(input || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function derivePreview(content) {
  const lines = String(content || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('|')) continue;
    const plain = cleanText(trimmed);
    if (plain.length < 24) continue;
    return plain.length > 220 ? `${plain.slice(0, 217)}...` : plain;
  }
  return 'Read the full article.';
}

function normalizeArticle(data, content, filePath) {
  const normalized = { ...data };
  normalized.slug = normalized.slug || deriveSlug(filePath);
  normalized.date = normalized.date || normalized.publishedAt;
  normalized.category = normalizeCategory(normalized.category);
  normalized.preview = normalized.preview || normalized.description || derivePreview(content);
  normalized.description = normalized.description || normalized.preview;
  normalized.h1 = normalized.h1 || normalized.title;
  normalized.icon = normalized.icon || 'default';
  return normalized;
}

function validateArticle(data, filePath, seenSlugs) {
  for (const field of REQUIRED_FIELDS) {
    if (!data[field]) throw new Error(`Missing required frontmatter field "${field}" in ${path.relative(ROOT, filePath)}`);
  }
  if (Number.isNaN(new Date(data.date).getTime())) {
    throw new Error(`Invalid date "${data.date}" in ${path.relative(ROOT, filePath)}. Use YYYY-MM-DD.`);
  }
  if (seenSlugs.has(data.slug)) throw new Error(`Duplicate slug "${data.slug}" detected.`);
  seenSlugs.add(data.slug);
}

function renderArticlePage(article) {
  const replacements = {
    '{{TITLE}}': escapeHtml(article.title),
    '{{DESCRIPTION}}': escapeHtml(article.description || article.preview),
    '{{DATE_LABEL}}': escapeHtml(formatDate(article.date)),
    '{{CATEGORY}}': escapeHtml(categoryLabel(article.category)),
    '{{H1}}': escapeHtml(article.h1 || article.title),
    '{{PREVIEW}}': escapeHtml(article.preview),
    '{{BREADCRUMB}}': escapeHtml(titleCase(article.slug)),
    '{{BODY}}': article.bodyHtml.trim() ? `\n${article.bodyHtml}\n` : '\n'
  };
  let html = ARTICLE_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) html = html.replace(key, value);
  return html;
}

function renderBlogIndex(articles, categories) {
  const categoryButtons = ['All', ...categories].map((c) => `<button class="filter-btn${c === 'All' ? ' active' : ''}" data-category="${c}">${c === 'All' ? 'All' : categoryLabel(c)}</button>`).join('');
  const cards = articles.map((a) => `<a class="article-card" data-category="${a.category}" href="/blog/${a.slug}/">
      <div class="article-icon">${iconSvg(a.icon)}</div>
      <div class="article-body">
        <div class="article-meta">${formatDate(a.date)} · ${categoryLabel(a.category)}</div>
        <div class="article-title">${escapeHtml(a.title)}</div>
        <div class="article-preview">${escapeHtml(a.preview)}</div>
      </div>
      <div class="article-cta">Read more &nbsp;&rsaquo;</div>
    </a>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>Blog — Precision Machining Co.</title>
  <meta name="description" content="Insights on CNC machining, tolerances, materials, and precision manufacturing sourcing." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    :root { --c50:#F5F4F0; --c100:#ECEAE6; --c200:#D5D1CB; --c400:#9E978D; --c500:#857F77; --c600:#665F57; --c900:#1C1917; --white:#FFFFFF; --accent:#0A1930; --mono:'IBM Plex Mono', monospace; }
    body { font-family: var(--mono); background: var(--c50); color: var(--c900); line-height: 1.6; -webkit-font-smoothing: antialiased; }
    .grid-bg { background-image: linear-gradient(rgba(28,25,23,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(28,25,23,.04) 1px, transparent 1px); background-size: 44px 44px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 48px; }
    .section-label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.68rem; font-weight: 500; color: var(--accent); text-transform: uppercase; letter-spacing: 0.18em; border-bottom: 1px solid var(--accent); padding-bottom: 2px; }
    nav { position: fixed; top: 0; left: 0; right: 0; z-index: 200; background: rgba(245,244,240,.96); backdrop-filter: blur(10px); border-bottom: 1px solid var(--c200); height: 64px; }
    .nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 48px; height: 100%; display: flex; align-items: center; justify-content: space-between; }
    .logo { font-size: 0.82rem; font-weight: 600; color: var(--c900); text-decoration: none; letter-spacing: 0.16em; text-transform: uppercase; }
    .nav-links { display: flex; align-items: center; gap: 36px; }
    .nav-links a:not(.nav-cta) { font-size: 0.68rem; font-weight: 500; color: var(--c600); text-decoration: none; text-transform: uppercase; letter-spacing: 0.14em; transition: color .15s; }
    .nav-links a:not(.nav-cta):hover { color: var(--c900); }
    .nav-cta { font-size: 0.68rem; font-weight: 600; background: var(--accent); color: var(--white); padding: 10px 22px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.12em; border: 1px solid var(--accent); transition: background .15s; display: flex; align-items: center; gap: 8px; }
    .page-header { padding: 112px 0 56px; border-bottom: 1px solid var(--c200); }
    .page-header h1 { font-size: clamp(2rem, 4vw, 3.2rem); font-weight: 300; letter-spacing: -0.02em; margin-top: 24px; margin-bottom: 12px; }
    .page-header p { font-size: 0.85rem; color: var(--c500); max-width: 560px; }
    .filters { padding: 24px 0 8px; display: flex; flex-wrap: wrap; gap: 10px; }
    .filter-btn { font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; border: 1px solid var(--c200); background: transparent; color: var(--c600); padding: 8px 12px; cursor: pointer; }
    .filter-btn.active { background: var(--accent); color: var(--white); border-color: var(--accent); }
    .articles-section { padding: 24px 0 80px; }
    .article-card { display: grid; grid-template-columns: 56px 1fr auto; align-items: start; gap: 24px; padding: 28px 0; border-bottom: 1px solid var(--c200); text-decoration: none; color: inherit; }
    .article-card:first-child { border-top: 1px solid var(--c200); }
    .article-icon { width:48px; height:48px; border:1px solid var(--c200); display:flex; align-items:center; justify-content:center; color:var(--c500); }
    .article-icon svg { width:22px; height:22px; }
    .article-meta { font-size: 0.65rem; color: var(--c400); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px; }
    .article-title { font-size: 1rem; font-weight: 500; line-height: 1.3; margin-bottom: 10px; }
    .article-preview { font-size: 0.78rem; color: var(--c500); line-height: 1.65; max-width: 680px; }
    .article-cta { font-size: 0.72rem; font-weight: 600; color: var(--c600); text-transform: uppercase; letter-spacing: 0.12em; white-space: nowrap; padding-top: 4px; }
    .article-card.hidden { display: none; }
    footer { background: var(--c900); padding: 56px 0 32px; }
    .footer-top { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 0; padding-bottom: 48px; border-bottom: 1px solid rgba(255,255,255,.08); margin-bottom: 28px; }
    .footer-col { padding-right: 40px; }
    .footer-logo { font-size: 0.82rem; font-weight: 600; color: var(--white); letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 10px; display: block; }
    .footer-tagline { font-size: 0.75rem; color: var(--c500); line-height: 1.65; max-width: 220px; }
    .footer-col-head { font-size: 0.65rem; font-weight: 600; color: var(--c500); text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 14px; }
    .footer-col a, .footer-col p { font-size: 0.75rem; color: var(--c400); display: block; text-decoration: none; margin-bottom: 7px; line-height: 1.5; }
    .footer-bottom { display: flex; justify-content: space-between; align-items: center; font-size: 0.65rem; color: var(--c600); flex-wrap: wrap; gap: 8px; letter-spacing: 0.06em; }
    @media (max-width: 960px) { .container,.nav-inner { padding: 0 28px; } .nav-links a { display: none; } .article-card { grid-template-columns: 48px 1fr; } .article-cta { display: none; } .footer-top { grid-template-columns: 1fr 1fr; gap: 32px; } }
    @media (max-width: 640px) { .article-card { grid-template-columns: 1fr; gap: 12px; } .article-icon { display: none; } .footer-top { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<nav><div class="nav-inner"><a href="/" class="logo">Precision Machining Co.</a><div class="nav-links"><a href="/#process">Process</a><a href="/#capabilities">Capabilities</a><a href="/#why">Why Us</a><a href="/blog/">Blog</a>
  <a href="/about/">About</a><a href="/#rfq" class="nav-cta">Contact Us →</a></div></div></nav>
<div class="page-header grid-bg"><div class="container"><span class="section-label">// knowledge base</span><h1><strong>Machining</strong> Insights</h1><p>Practical guides on CNC processes, tolerances, materials, and sourcing for engineers.</p></div></div>
<section class="articles-section"><div class="container"><div class="filters" id="filters">${categoryButtons}</div><div id="article-list">${cards}</div></div></section>
<footer><div class="container"><div class="footer-top"><div class="footer-col"><span class="footer-logo">Precision Machining Co.</span><p class="footer-tagline">US machined &amp; turned parts sourcing. RFQ to delivery, handled.</p></div><div class="footer-col"><div class="footer-col-head">Processes</div><a href="/#capabilities">CNC Milling</a><a href="/#capabilities">CNC Turning</a><a href="/#capabilities">Mill-Turn</a><a href="/#capabilities">Swiss Machining</a></div><div class="footer-col"><div class="footer-col-head">Industries</div><a href="/#capabilities">Aerospace</a><a href="/#capabilities">Defense / ITAR</a><a href="/#capabilities">Medical Devices</a><a href="/#capabilities">Robotics</a></div><div class="footer-col"><div class="footer-col-head">Contact</div><a href="mailto:rfq@precisionmachining.co">rfq@precisionmachining.co</a><p>+1 312-579-0808</p><p>Wilmington, DE</p><p>United States</p></div></div><div class="footer-bottom"><span>© <span class="copyright-year"></span> Advanced Tech Solutions LLC. All rights reserved.</span><span>Privacy Policy · Terms of Service</span></div></div></footer>
<script>
  document.querySelectorAll('.copyright-year').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
  const buttons = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.article-card');
  buttons.forEach((btn) => btn.addEventListener('click', () => {
    buttons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const selected = btn.dataset.category;
    cards.forEach((card) => card.classList.toggle('hidden', selected !== 'All' && card.dataset.category !== selected));
  }));
</script>
</body>
</html>`;
}

function iconSvg(icon) {
  const icons = {
    lathe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6M12 3v6M12 15v6"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 0 0 4.93 19.07M4.93 4.93a10 10 0 0 0 14.14 14.14"/></svg>',
    default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 21V9"/></svg>'
  };
  return icons[icon] || icons.default;
}

function cleanupStaleArticleDirs(slugs) {
  const keep = new Set(slugs);
  for (const name of fs.readdirSync(BLOG_DIR)) {
    const dirPath = path.join(BLOG_DIR, name);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    if (keep.has(name)) continue;
    if (name === 'index.html' || name === 'articles.json') continue;
    const indexPath = path.join(dirPath, 'index.html');
    if (fs.existsSync(indexPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function main() {
  const files = getMdxFiles();
  const seenSlugs = new Set();
  const categoryCount = {};
  const articles = files.map((filePath) => {
    const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
    const normalized = normalizeArticle(data, content, filePath);
    validateArticle(normalized, filePath, seenSlugs);
    categoryCount[normalized.category] = (categoryCount[normalized.category] || 0) + 1;
    return { ...normalized, bodyHtml: marked.parse(content) };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  const categories = Object.keys(categoryCount).sort();

  cleanupStaleArticleDirs(articles.map((a) => a.slug));
  for (const article of articles) {
    const outDir = path.join(BLOG_DIR, article.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), renderArticlePage(article));
  }

  const listing = articles.map(({ slug, title, date, preview, icon, category }) => ({ slug, title, date, preview, icon, category }));
  fs.writeFileSync(path.join(BLOG_DIR, 'articles.json'), `${JSON.stringify(listing, null, 2)}\n`);
  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), renderBlogIndex(listing, categories));

  console.log(`Built ${articles.length} articles.`);
  for (const c of categories) console.log(` - ${c}: ${categoryCount[c]}`);
}

try { main(); } catch (error) { console.error(`Build failed: ${error.message}`); process.exit(1); }
