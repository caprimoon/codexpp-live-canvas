codexPlus.extension((ctx) => {
  'use strict';
  const ID = 'live-wallpaper-studio';
  const $ = (tag, cls, value) => {
    const e = document.createElement(tag);
    e.setAttribute('data-codex-plus-ext', ID);
    if (cls) e.className = cls;
    if (value != null) e.textContent = value;
    return e;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
  const friendlyError = error => String(error?.message || error || '未知错误').split('\n')[0].replace(/^Error:\s*/, '').slice(0, 220);
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1"/><path d="m5 17 5-5 4 4 2-2 3 3"/></svg>';
  const sourceNames = { all: '全部数据源', mixkit: 'Mixkit', moe: 'MoeWalls', motion: 'MotionBgs', waifu: 'WallpaperWaifu', free: 'LiveWallpapers4Free' };
  const topics = [
    { id: 'all', label: '全部分类', routes: { mixkit: '', moe: '', motion: '', waifu: '', free: '' } },
    { id: 'nature', label: '自然风景', routes: { mixkit: 'nature', moe: 'landscape', motion: 'nature', waifu: 'landscape', free: 'nature-live-wallpapers' } },
    { id: 'human', label: '人文 / 生活', routes: { mixkit: 'people', moe: 'lifestyle', waifu: 'lifestyle', free: 'people-live-wallpapers' } },
    { id: 'city', label: '城市 / 建筑', routes: { mixkit: 'city', motion: 'city', free: 'world-live-wallpapers' } },
    { id: 'abstract', label: '抽象 / 几何', routes: { mixkit: 'abstract', moe: 'abstract', motion: 'abstract', waifu: 'abstract', free: 'abstract-live-wallpapers' } },
    { id: 'anime', label: '动漫 / 二次元', routes: { moe: 'anime', motion: 'anime', waifu: 'anime', free: 'anime-live-wallpapers' } },
    { id: 'games', label: '游戏', routes: { moe: 'games', motion: 'games', waifu: 'games', free: 'games-live-wallpapers' } },
    { id: 'fantasy', label: '幻想 / 科幻', routes: { moe: 'fantasy', motion: 'space', waifu: 'fantasy', free: 'fantasy-live-wallpapers' } },
    { id: 'pixel', label: '像素艺术', routes: { moe: 'pixel-art', waifu: 'pixel-art' } }
  ];
  const sourceLabels = [
    ['all', '全部数据源 · 聚合'],
    ['mixkit', 'Mixkit · 实拍 / 抽象素材'],
    ['moe', 'MoeWalls · 动态壁纸'],
    ['motion', 'MotionBgs · HD / 4K'],
    ['waifu', 'WallpaperWaifu · 动态壁纸'],
    ['free', 'LiveWallpapers4Free · HD / 4K']
  ];
  function normalizeHexColor(raw, fallback = '#232323') {
    const text = String(raw || '').trim();
    const short = text.match(/^#?([0-9a-f]{3})$/i);
    if (short) {
      const [r, g, b] = short[1].toLowerCase().split('');
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    const full = text.match(/^#?([0-9a-f]{6})$/i);
    return full ? `#${full[1].toLowerCase()}` : fallback;
  }
  function hexToRgb(hex, fallback = '#232323') {
    const clean = normalizeHexColor(hex, fallback);
    return [
      parseInt(clean.slice(1, 3), 16),
      parseInt(clean.slice(3, 5), 16),
      parseInt(clean.slice(5, 7), 16),
    ];
  }
  function deriveUserBubbleRgb([r, g, b]) {
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const mix = (a, target, t) => Math.round(a + (target - a) * t);
    return lum < 0.72
      ? [mix(r, 255, 0.14), mix(g, 255, 0.14), mix(b, 255, 0.14)]
      : [mix(r, 0, 0.10), mix(g, 0, 0.10), mix(b, 0, 0.10)];
  }
  const SETTINGS_FIELDS = [
    {
      key: 'dim', type: 'range', min: 0, max: 85, step: 1, unit: '%', default: 30,
      title: '背景遮罩（%）',
      description: '在壁纸画面上方叠加半透明黑色遮罩。数值越高背景越暗、代码与对话文字越清晰；设为 0% 显示壁纸原始亮度。'
    },
    {
      key: 'blur', type: 'range', min: 0, max: 18, step: 1, unit: 'px', default: 0,
      title: '背景模糊（px）',
      description: '对壁纸画面本身做高斯模糊，仅柔化视觉效果，不改变视频原分辨率。适当模糊可减弱复杂背景对阅读的干扰。'
    },
    {
      key: 'splitPanels', type: 'boolean', default: false,
      title: '1/2/3 三区独立调节遮罩与模糊',
      description: '关闭时三区统一调节面板遮罩与玻璃模糊；开启后可为 1 左侧栏、2 对话内容区、3 底部输入框分别微调。'
    },
    {
      key: 'glass', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 50, onlyWhen: s => !s.splitPanels,
      title: '面板遮罩（%）',
      description: '统一控制左侧栏、对话内容区与底部输入框的背景不透明度（0%–100%）。0% 完全透明，100% 完全不透明。'
    },
    {
      key: 'glassBlur', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 12, onlyWhen: s => !s.splitPanels,
      title: '玻璃模糊（px）',
      description: '统一控制左侧栏、对话内容区与底部输入框背后的毛玻璃虚化强度（backdrop-filter）。设为 0px 可关闭磨砂效果并降低 GPU 占用。'
    },
    {
      key: 'color1', type: 'color', default: '#232323',
      title: '1 · 左侧栏颜色',
      description: '选择左侧项目栏的背景底色，配合左侧栏遮罩（0%–100%）实时预览。'
    },
    {
      key: 'glass1', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 50, onlyWhen: s => !!s.splitPanels,
      title: '1 · 左侧栏遮罩（%）',
      description: '单独调节左侧栏的背景不透明度（0%–100%）。'
    },
    {
      key: 'glassBlur1', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 12, onlyWhen: s => !!s.splitPanels,
      title: '1 · 左侧栏模糊（px）',
      description: '单独调节左侧栏背后的毛玻璃虚化强度（0px 关闭）。'
    },
    {
      key: 'color2', type: 'color', default: '#232323',
      title: '2 · 对话内容区颜色',
      description: '选择对话回复卡片底色；你发送的消息气泡会自动基于此颜色微调对比度以保持区分。'
    },
    {
      key: 'glass2', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 50, onlyWhen: s => !!s.splitPanels,
      title: '2 · 对话区遮罩（%）',
      description: '单独调节对话回复卡片与消息气泡的不透明度（0%–100%）。'
    },
    {
      key: 'glassBlur2', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 12, onlyWhen: s => !!s.splitPanels,
      title: '2 · 对话区模糊（px）',
      description: '单独调节对话回复卡片与消息气泡背后的毛玻璃虚化强度（0px 关闭）。'
    },
    {
      key: 'color3', type: 'color', default: '#4a4a4a',
      title: '3 · 底部输入框颜色',
      description: '选择底部输入框卡片底色（默认 #4A4A4A），配合遮罩调整输入区质感。'
    },
    {
      key: 'glass3', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 50, onlyWhen: s => !!s.splitPanels,
      title: '3 · 输入框遮罩（%）',
      description: '单独调节底部输入框的不透明度（0%–100%）。'
    },
    {
      key: 'glassBlur3', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 12, onlyWhen: s => !!s.splitPanels,
      title: '3 · 输入框模糊（px）',
      description: '单独调节底部输入框背后的毛玻璃虚化强度（0px 关闭）。'
    },
    {
      key: 'fit', type: 'select', default: 'cover',
      title: '画面适配',
      description: '壁纸与窗口比例不一致时的缩放方式。推荐“填满整窗”：按最短边等比放大铺满全屏，不会留黑边（长边超出部分居中裁切）。',
      options: [
        { value: 'cover', label: '填满整窗 · 按最短边等比铺满（不留黑边）' },
        { value: 'contain', label: '完整显示 · 保持比例不裁切（可能留黑边）' },
        { value: 'fill', label: '拉伸铺满 · 强制铺满（可能变形）' }
      ]
    },
    {
      key: 'focalX', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 50, onlyWhen: s => s.fit === 'cover',
      title: '主体横向位置（%）',
      description: '仅在“填满整窗”模式下生效，当画面横向被裁切时，调整画面水平对齐重心（50% 为居中）。'
    },
    {
      key: 'focalY', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 50, onlyWhen: s => s.fit === 'cover',
      title: '主体纵向位置（%）',
      description: '仅在“填满整窗”模式下生效，当画面纵向被裁切时，调整画面垂直对齐重心（50% 为居中）。'
    },
    {
      key: 'quality', type: 'select', default: 'auto',
      title: '视频画质',
      description: '在线图库视频的优先清晰度。高清地址仅在原站提供且可访问时生效，不可用时自动回退预览版；本地视频与内置场景不受影响。',
      options: [
        { value: 'auto', label: '自动 · 优先 1080p 原版' },
        { value: 'preview', label: '预览 · 加载更快更省流量' },
        { value: 'hd', label: '1080p 原版（若原站提供）' },
        { value: '2k', label: '2K 原版（若原站提供）' },
        { value: '4k', label: '4K 原版（若原站提供）' }
      ]
    },
    {
      key: 'speed', type: 'select', numeric: true, default: 1,
      title: '播放速度',
      description: '调整动态视频壁纸的播放倍速。放慢速度可带来更舒缓的背景氛围。',
      options: [
        { value: 0.5, label: '0.5× · 舒缓' },
        { value: 0.75, label: '0.75×' },
        { value: 1, label: '1× · 原速' },
        { value: 1.25, label: '1.25×' },
        { value: 1.5, label: '1.5×' }
      ]
    },
    {
      key: 'interval', type: 'select', numeric: true, default: 0,
      title: '自动轮换',
      description: '按固定间隔自动随机切换下一张壁纸（优先从“我的收藏”中选取，无收藏时使用内置场景）。',
      options: [
        { value: 0, label: '关闭' },
        { value: 5, label: '每 5 分钟' },
        { value: 15, label: '每 15 分钟' },
        { value: 30, label: '每 30 分钟' }
      ]
    },
    {
      key: 'pauseHidden', type: 'boolean', default: true,
      title: '窗口不可见时暂停播放',
      description: '切换至其他应用或最小化 Codex 时自动暂停动态壁纸与动画渲染，切回时自动恢复播放，降低后台 CPU/GPU 占用。'
    },
    {
      key: 'respectMotion', type: 'boolean', default: true,
      title: '尊重系统减少动态效果',
      description: '开启后，当系统启用了“减弱动态效果”时壁纸默认保持静止；点击上方“仍然播放”或手动应用壁纸后可恢复动画。'
    }
  ];
  const fitLabels = { cover: '填满整窗（按最短边铺满）', contain: '完整显示（可能留黑边）', fill: '拉伸铺满' };
  const qualityLabels = { auto: '自动 1080p', preview: '预览', hd: '1080p', '2k': '2K', '4k': '4K' };
  const defaults = {
    enabled: true, dim: 30, blur: 0,
    splitPanels: false, glass: 50, glassBlur: 12,
    color1: '#232323', glass1: 50, glassBlur1: 12,
    color2: '#232323', glass2: 50, glassBlur2: 12,
    color3: '#4a4a4a', glass3: 50, glassBlur3: 12,
    fit: 'cover', quality: 'auto', focalX: 50, focalY: 50, speed: 1,
    paused: false, pauseHidden: true, respectMotion: true, motionConsent: false, interval: 0
  };
  function normalizeFieldValue(field, raw) {
    if (field.type === 'range') {
      const n = Number(raw);
      return Number.isFinite(n) ? clamp(Math.round(n), field.min, field.max) : field.default;
    }
    if (field.type === 'color') return normalizeHexColor(raw, field.default);
    if (field.type === 'select') {
      const val = field.numeric ? Number(raw) : raw;
      return field.options.some(o => o.value === val) ? val : field.default;
    }
    if (field.type === 'boolean') return typeof raw === 'boolean' ? raw : field.default;
    return field.default;
  }
  function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = { ...defaults, ...src };
    for (const field of SETTINGS_FIELDS) out[field.key] = normalizeFieldValue(field, out[field.key]);
    for (const zone of [1, 2, 3]) {
      if (!Object.hasOwn(src, 'glass' + zone)) out['glass' + zone] = out.glass;
      if (!Object.hasOwn(src, 'glassBlur' + zone)) out['glassBlur' + zone] = out.glassBlur;
    }
    out.enabled = out.enabled !== false;
    out.paused = !!out.paused;
    out.motionConsent = !!out.motionConsent;
    return out;
  }
  const savedRaw = ctx.storage.get('settings', {});
  let settings = normalizeSettings(savedRaw);
  if (!ctx.storage.get('unifiedSettingsV2', false)) {
    ctx.storage.set('unifiedSettingsV2', true);
    if (!savedRaw || !Object.hasOwn(savedRaw, 'fit')) settings.fit = 'cover';
    ctx.storage.set('settings', settings);
  }
  let favorites = ctx.storage.get('favorites', []), locals = ctx.storage.get('locals', []);
  const builtins = [
    { id: 'builtin:rain', source: 'builtin', title: '深蓝雨幕', scene: 'rain', kind: 'scene' },
    { id: 'builtin:stars', source: 'builtin', title: '远航星空', scene: 'stars', kind: 'scene' },
    { id: 'builtin:matrix', source: 'builtin', title: '代码之雨', scene: 'matrix', kind: 'scene' }
  ];
  let current = ctx.storage.get('current', null), activeMedia = null, activeBlob = '', loadVersion = 0, busy = false, playback = '等待选择', lastError = '', disposed = false;
  let root, layer, canvas, shade, mediaBox, style;
  let uiListeners = new Set(), fpsAt = 0, frame = 0, raf = 0, lastFrame = 0, motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let drawerOpen = false, drawerEl = null, drawerCleanup = null;
  const marked = new Set(), glassOverrides = new Map();
  const topClearNodes = new Set(), pseudoClearNodes = new Set(), shadowClearNodes = new Set();
  let topScanQueued = 0;
  const thumbPromises = new Map(); let thumbnailQueue = [], thumbnailWorkers = 0, playbackRevision = 0;
  const thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const image = entry.target; thumbnailObserver.unobserve(image);
      thumbnail(image.dataset.thumbnail).then(src => { if (image.isConnected) image.src = src; }).catch(() => { if (image.isConnected) { image.parentElement.prepend($('div', 'lws-scene-art', '▷')); image.remove(); } });
    }
  }, { rootMargin: '160px' });
  function thumbnail(url) {
    if (!thumbPromises.has(url)) {
      thumbPromises.set(url, new Promise((resolve, reject) => { thumbnailQueue.push({ url, resolve, reject }); pumpThumbnails(); }));
    }
    return thumbPromises.get(url);
  }
  function pumpThumbnails() {
    while (!disposed && thumbnailWorkers < 3 && thumbnailQueue.length) {
      const task = thumbnailQueue.shift(); thumbnailWorkers++;
      ctx.backend.call('thumbnail', { url: task.url }, { timeout: 24000 }).then(task.resolve, error => { thumbPromises.delete(task.url); task.reject(error); }).finally(() => { thumbnailWorkers--; pumpThumbnails(); });
    }
  }
  const storeSettings = () => ctx.storage.set('settings', settings);
  const storeList = () => { ctx.storage.set('favorites', favorites); ctx.storage.set('locals', locals); };
  const notify = () => { if (layer) { layer.dataset.playback = playback; layer.dataset.wallpaper = current?.title || '未选择'; layer.dataset.busy = String(busy); } for (const fn of [...uiListeners]) fn(); };
  const reduced = () => settings.respectMotion && motionQuery.matches && !settings.motionConsent;
  const shouldPause = () => settings.paused || !settings.enabled || (settings.pauseHidden && document.hidden) || reduced();
  function saveSettings() { storeSettings(); applyAppearance(); syncPlayback(); notify(); }
  const button = (label, fn, cls = '') => { const b = $('button', 'lws-btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  function stateLine(message, error = false) { playback = message; lastError = error ? message : ''; notify(); }

  function syncOwnRailActive(active) {
    for (const node of document.querySelectorAll('[data-codex-plus-ext-rail][data-codex-plus-ext*="live-wallpaper-studio"]')) {
      if (active) node.setAttribute('data-codex-plus-ext-rail-active', 'true');
      else node.removeAttribute('data-codex-plus-ext-rail-active');
      const btn = node.querySelector('button') || node;
      if (!btn) continue;
      btn.dataset.active = active ? 'true' : 'false';
      if (active) {
        btn.setAttribute('data-selected', '');
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('data-selected');
        btn.removeAttribute('aria-current');
      }
    }
  }

  function syncDrawerLayout() {
    if (!drawerOpen || !document.documentElement) return;
    const width = Math.round(clamp(innerWidth / 3, 340, 520));
    const main = document.querySelector('main[data-app-shell-main-surface]');
    const row = document.querySelector('[data-app-shell-workspace-row]');
    const mainTop = main?.getBoundingClientRect?.().top;
    const rowRect = row?.getBoundingClientRect?.();
    const top = Number.isFinite(mainTop) && mainTop > 0 ? Math.round(mainTop)
      : Number.isFinite(rowRect?.top) && rowRect.top > 0 ? Math.round(rowRect.top) : 44;
    const right = rowRect && rowRect.width > 0 ? Math.max(0, Math.round(innerWidth - rowRect.right)) : 0;
    const bottom = rowRect && rowRect.height > 0 ? Math.max(0, Math.round(innerHeight - rowRect.bottom)) : 0;
    const docStyle = document.documentElement.style;
    docStyle.setProperty('--lws-drawer-width', width + 'px');
    docStyle.setProperty('--lws-drawer-top', top + 'px');
    docStyle.setProperty('--lws-drawer-right', right + 'px');
    docStyle.setProperty('--lws-drawer-bottom', bottom + 'px');
  }

  function closeDrawer() {
    if (!drawerOpen && !drawerEl) return;
    drawerOpen = false;
    drawerCleanup?.();
    drawerCleanup = null;
    drawerEl?.remove();
    drawerEl = null;
    document.documentElement.removeAttribute('data-lws-drawer');
    for (const k of ['--lws-drawer-width', '--lws-drawer-top', '--lws-drawer-right', '--lws-drawer-bottom']) {
      document.documentElement.style.removeProperty(k);
    }
    syncOwnRailActive(false);
  }

  function openDrawer() {
    if (disposed) return;
    const existingOverlay = document.querySelector('.codex-plus-page-overlay');
    if (existingOverlay) {
      const backBtn = document.querySelector('[class*="ApplicationMenuTopBar"] button, .app-header-tint button');
      const arrowBtn = [...document.querySelectorAll('button')].find(b => b.querySelector('svg:not([class~="-scale-x-100"]) path[d^="M6.96231"]'));
      (arrowBtn || backBtn)?.click?.();
    }
    if (drawerOpen && drawerEl) {
      if (!drawerEl.isConnected) document.body.append(drawerEl);
      syncDrawerLayout();
      syncOwnRailActive(true);
      return;
    }
    drawerOpen = true;
    document.documentElement.setAttribute('data-lws-drawer', 'open');
    syncDrawerLayout();
    drawerEl = $('aside', 'lws-drawer');
    drawerEl.id = 'lws-drawer';
    drawerEl.setAttribute('role', 'complementary');
    drawerEl.setAttribute('aria-label', '动态壁纸');
    const head = $('div', 'lws-drawer-head');
    const headTitle = $('span', 'lws-drawer-title', '动态壁纸');
    const closeBtn = $('button', 'lws-drawer-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    closeBtn.onclick = () => closeDrawer();
    head.append(headTitle, closeBtn);
    const body = $('div', 'lws-drawer-body');
    drawerEl.append(head, body);
    document.body.append(drawerEl);
    drawerCleanup = render({ container: body, close: closeDrawer });
    syncOwnRailActive(true);
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  }

  ctx.effect(() => {
    style = $('style'); style.id = 'codex-plus-ext-live-wallpaper-studio-style';
    style.textContent = `
      html[data-live-wallpaper="on"] body{isolation:isolate}
      #lws-background{position:fixed;inset:0;z-index:0;pointer-events:none!important;overflow:hidden;background:#07111d;contain:strict}
      #lws-background>*{position:absolute;inset:0;width:100%;height:100%;pointer-events:none!important}
      #lws-media>*{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:var(--lws-fit,cover)!important;object-position:var(--lws-x,50%) var(--lws-y,50%)!important;filter:blur(var(--lws-blur,0px));transform:none}
      #lws-canvas{filter:blur(var(--lws-blur,0px))}
      #lws-shade{background:rgba(0,0,0,var(--lws-dim,.30))}
      html[data-live-wallpaper="on"] #root{position:relative;z-index:1;background:transparent!important}
      html[data-live-wallpaper="on"] #root:before,html[data-live-wallpaper="on"] #root:after{background:none!important;background-image:none!important}
      html[data-live-wallpaper="on"] [data-lws-clear="true"]{background:transparent!important;background-image:none!important}
      html[data-live-wallpaper="on"] [data-app-shell-frame="true"],html[data-live-wallpaper="on"] [data-app-shell-workspace-row="true"],html[data-live-wallpaper="on"] [data-app-shell-main-surface],html[data-live-wallpaper="on"] [data-app-shell-main-content-layout],html[data-live-wallpaper="on"] [data-app-shell-thread-edge-divider],html[data-live-wallpaper="on"] [data-ds-part="thread"],html[data-live-wallpaper="on"] [data-app-shell-page-surface="true"],html[data-live-wallpaper="on"] [data-app-shell-pane-frame]{background:transparent!important;background-image:none!important;box-shadow:none!important}
      html[data-live-wallpaper="on"] [data-app-shell-main-surface]:before,html[data-live-wallpaper="on"] [data-app-shell-main-surface]:after,
      html[data-live-wallpaper="on"] [data-app-shell-page-surface="true"]::before,html[data-live-wallpaper="on"] [data-app-shell-page-surface="true"]::after,
      html[data-live-wallpaper="on"] [data-app-shell-pane-frame]::before,html[data-live-wallpaper="on"] [data-app-shell-pane-frame]::after,
      html[data-live-wallpaper="on"] [data-app-shell-main-content-layout]::before,html[data-live-wallpaper="on"] [data-app-shell-main-content-layout]::after,
      html[data-live-wallpaper="on"] [data-app-shell-main-content-top-fade]::before,html[data-live-wallpaper="on"] [data-app-shell-main-content-top-fade]::after{background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important}
      html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) :is(.app-shell-main-content-top-fade,[data-app-shell-main-content-top-fade]:not(:has(*)),[class*="_MainContentTopFade_"]){display:none!important;background:transparent!important;background-image:none!important}
      html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) .app-shell-main-content-frame{border-top:0!important;box-shadow:none!important}
      html[data-live-wallpaper="on"] [data-app-shell-main-surface] > header,
      html[data-live-wallpaper="on"] [data-app-shell-focus-area="main"] > header,
      html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) :is(header.app-header-tint,header[data-app-shell-header-edge-scroll],header[class*="_Header_"],[data-app-shell-header-layout],[data-app-shell-header-edge-scroll],.sticky:not(:has([data-ds-part="composer"],[data-codex-composer-root])),[data-sticky]:not(:has([data-ds-part="composer"],[data-codex-composer-root]))),
      html[data-live-wallpaper="on"] [data-app-shell-focus-area] > .bg-surface,
      html[data-live-wallpaper="on"] [data-app-shell-pane-frame] > .bg-surface,
      html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) :is([class*="bg-linear-to-b"],[class*="bg-gradient-to-b"]):not(:has(button,a,input,textarea)),
      html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) .pointer-events-none:is([aria-hidden="true"],[class*="top-0"],[class*="-top-"],[style*="linear-gradient"]):not(svg,img,button,:has(button,a,input,textarea),[data-local-conversation-final-assistant],[data-local-conversation-final-assistant] *,[data-user-message-bubble],[data-user-message-bubble] *){background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-bottom:0!important}
      @layer theme{
        html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"],[data-app-shell-main-content-layout],[data-app-shell-main-content-top-fade],[data-ds-part="thread"],.thread-scroll-container,[data-app-action-timeline-scroll]){background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important}
        html[data-live-wallpaper="on"] [data-app-shell-main-surface] > header,
        html[data-live-wallpaper="on"] [data-app-shell-focus-area="main"] > header,
        html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) :is(header.app-header-tint,header[data-app-shell-header-edge-scroll],header[class*="_Header_"],[data-app-shell-header-layout],[data-app-shell-header-edge-scroll],.sticky:not(:has([data-ds-part="composer"],[data-codex-composer-root])),[data-sticky]:not(:has([data-ds-part="composer"],[data-codex-composer-root])),.app-shell-main-content-frame):not([data-ds-part="composer"],[data-ds-part="composer"] *,[data-codex-composer-root],[data-codex-composer-root] *,[role="dialog"],[role="dialog"] *,[role="menu"],[role="menu"] *,[data-slot="popover-content"],[data-slot="popover-content"] *){background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;border-top:0!important;border-bottom:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) :is([data-app-shell-page-surface="true"],[data-app-shell-pane-frame],[data-app-shell-focus-area] > .bg-surface,[data-app-shell-pane-frame] > .bg-surface,[class~="bg-token-main-surface-primary"][class~="h-full"][class~="w-full"],[class~="h-full"][class~="electron:bg-surface"],.app-shell-main-content-top-fade,[class*="_MainContentTopFade_"],[class*="_topFade_"],[class*="_TopFade_"],[class*="_scrollFade_"],[class*="_ScrollFade_"],[class*="bg-linear-to-b"]:not(:has(button,a,input,textarea)),[class*="bg-gradient-to-b"]:not(:has(button,a,input,textarea)),.pointer-events-none:is([aria-hidden="true"],[class*="top-0"],[class*="-top-"],[class*="to-transparent"],[style*="linear-gradient"]):not(:has(button,a,input,textarea))):not([data-ds-part="composer"],[data-ds-part="composer"] *,[data-codex-composer-root],[data-codex-composer-root] *,[role="dialog"],[role="dialog"] *,[role="menu"],[role="menu"] *,[data-slot="popover-content"],[data-slot="popover-content"] *,[data-local-conversation-final-assistant],[data-local-conversation-final-assistant] *,[data-user-message-bubble],[data-user-message-bubble] *,button,button *,svg,img){background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"],[data-app-shell-page-surface="true"],[data-app-shell-pane-frame],[data-app-shell-main-content-layout],[data-app-shell-main-content-top-fade])::before,
        html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"],[data-app-shell-page-surface="true"],[data-app-shell-pane-frame],[data-app-shell-main-content-layout],[data-app-shell-main-content-top-fade])::after,
        html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) :is(header,.app-header-tint,[class*="_Header_"],[data-app-shell-page-surface="true"],[data-app-shell-pane-frame],[data-app-shell-main-content-layout],[data-app-shell-main-content-top-fade],[data-app-shell-header-layout],[data-app-shell-header-edge-scroll],.sticky:not(:has([data-ds-part="composer"],[data-codex-composer-root])),[data-sticky]:not(:has([data-ds-part="composer"],[data-codex-composer-root])),[class*="after:bg-linear-to-"],[class*="after:bg-gradient-to-"],[class*="before:bg-linear-to-"],[class*="before:bg-gradient-to-"],[class*="from-surface"],[class*="from-token-"]):not([data-ds-part="composer"],[data-ds-part="composer"] *,[data-codex-composer-root],[data-codex-composer-root] *,[role="dialog"],[role="dialog"] *,[role="menu"],[role="menu"] *,[data-slot="popover-content"],[data-slot="popover-content"] *,[data-local-conversation-final-assistant],[data-local-conversation-final-assistant] *,[data-user-message-bubble],[data-user-message-bubble] *)::before,
        html[data-live-wallpaper="on"] :is([data-app-shell-main-surface],[data-app-shell-focus-area="main"]) :is(header,.app-header-tint,[class*="_Header_"],[data-app-shell-page-surface="true"],[data-app-shell-pane-frame],[data-app-shell-main-content-layout],[data-app-shell-main-content-top-fade],[data-app-shell-header-layout],[data-app-shell-header-edge-scroll],.sticky:not(:has([data-ds-part="composer"],[data-codex-composer-root])),[data-sticky]:not(:has([data-ds-part="composer"],[data-codex-composer-root])),[class*="after:bg-linear-to-"],[class*="after:bg-gradient-to-"],[class*="before:bg-linear-to-"],[class*="before:bg-gradient-to-"],[class*="from-surface"],[class*="from-token-"]):not([data-ds-part="composer"],[data-ds-part="composer"] *,[data-codex-composer-root],[data-codex-composer-root] *,[role="dialog"],[role="dialog"] *,[role="menu"],[role="menu"] *,[data-slot="popover-content"],[data-slot="popover-content"] *,[data-local-conversation-final-assistant],[data-local-conversation-final-assistant] *,[data-user-message-bubble],[data-user-message-bubble] *)::after{background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        html[data-live-wallpaper="on"] [data-app-action-timeline-scroll] > [class~="pointer-events-none"][class~="absolute"]:has(:is(.composer-surface-chrome,[class*="_ComposerLayoutRoot_"],[data-composer-surface-variant],[data-ds-part="composer"])) > [class~="pointer-events-none"][class~="absolute"][class~="bg-surface"],
        html[data-live-wallpaper="on"] [data-thread-scroll-footer] > [aria-hidden="true"],
        html[data-live-wallpaper="on"] .thread-scroll-container .pointer-events-none.sticky > [aria-hidden="true"].pointer-events-none.absolute.bg-gradient-to-t.from-surface,
        html[data-live-wallpaper="on"] [data-composer-surface-variant][data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"]){background:transparent!important;background-color:transparent!important;background-image:none!important}
        html[data-live-wallpaper="on"] :is([data-composer-surface-variant],[class*="_ComposerLayoutRoot_"],.composer-surface-chrome) :is([data-ds-part="composer"],[data-composer-footer-responsive],[class*="_ComposerLayoutFooter_"],.composer-footer),
        html[data-live-wallpaper="on"] [data-composer-surface-variant]:not([data-composer-utility-bar-variant="home"]) [class*="ComposerLayoutBody"]{background:transparent!important;background-color:transparent!important;backdrop-filter:none!important}
        html[data-live-wallpaper="on"] [data-lws-top-clear="true"]{background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;border-top:0!important;border-bottom:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        html[data-live-wallpaper="on"] [data-lws-top-clear="true"]::before,html[data-live-wallpaper="on"] [data-lws-top-clear="true"]::after,html[data-live-wallpaper="on"] [data-lws-pseudo-clear="true"]::before,html[data-live-wallpaper="on"] [data-lws-pseudo-clear="true"]::after{background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;border-top:0!important;border-bottom:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        html[data-live-wallpaper="on"] [data-lws-shadow-clear="true"]{box-shadow:none!important}
        html[data-live-wallpaper="on"] body #root aside[data-app-shell-left-panel-appearance]{background-color:var(--lws-bg-1,rgba(35,35,35,.50))!important;backdrop-filter:blur(var(--lws-glass-blur-1,12px))!important}
        html[data-live-wallpaper="on"] body #root :is([data-composer-surface-variant]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),[data-composer-surface-variant][data-composer-utility-bar-variant="home"] [class*="ComposerLayoutBody"],[class*="_ComposerLayoutRoot_"]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),.composer-surface-chrome,[data-ds-part="composer"]):not(:is([data-composer-surface-variant]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),[data-composer-surface-variant][data-composer-utility-bar-variant="home"] [class*="ComposerLayoutBody"],[class*="_ComposerLayoutRoot_"]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),.composer-surface-chrome,[data-ds-part="composer"]) *),
        html[data-live-wallpaper="on"] body #root :is([class*="_homeUtilityBar_"],[class*="_ComposerHomeUtilityBar_"]){background-color:var(--lws-bg-3,rgba(74,74,74,.50))!important;backdrop-filter:blur(var(--lws-glass-blur-3,12px))!important}
        html[data-live-wallpaper="on"] [data-local-conversation-final-assistant="true"]{background-color:var(--lws-bg-2,rgba(35,35,35,.50))!important;backdrop-filter:blur(var(--lws-glass-blur-2,12px))!important}
        html[data-live-wallpaper="on"] body #root [data-user-message-bubble]{background-color:var(--lws-bg-2-user,rgba(66,66,66,.50))!important;backdrop-filter:blur(var(--lws-glass-blur-2,12px))!important}
      }
      html[data-live-wallpaper="on"] body #root :is([data-composer-surface-variant]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),[data-composer-surface-variant][data-composer-utility-bar-variant="home"] [class*="ComposerLayoutBody"],[class*="_ComposerLayoutRoot_"]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),.composer-surface-chrome,[data-ds-part="composer"]):not(:is([data-composer-surface-variant]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),[data-composer-surface-variant][data-composer-utility-bar-variant="home"] [class*="ComposerLayoutBody"],[class*="_ComposerLayoutRoot_"]:not([data-composer-utility-bar-variant="home"]:has([class*="ComposerLayoutBody"])),.composer-surface-chrome,[data-ds-part="composer"]) *),
      html[data-live-wallpaper="on"] body #root :is([class*="_homeUtilityBar_"],[class*="_ComposerHomeUtilityBar_"]){border:1px solid rgba(225,238,250,.19)!important;border-radius:22px!important;box-shadow:0 8px 32px #0002!important}
      html[data-live-wallpaper="on"] [data-local-conversation-final-assistant="true"]{border:1px solid rgba(200,221,240,.14)!important;border-radius:18px!important;padding:18px!important}
      html[data-live-wallpaper="on"] [data-app-shell-titlebar="true"]{background:rgba(9,13,20,.18)!important}
      html[data-lws-drawer="open"] main[data-app-shell-main-surface]{margin-right:var(--lws-drawer-width,440px)!important}
      .lws-drawer{position:fixed;right:var(--lws-drawer-right,0px);bottom:var(--lws-drawer-bottom,0px);top:var(--lws-drawer-top,44px);width:var(--lws-drawer-width,440px);z-index:40;display:flex;flex-direction:column;min-height:0;background:color-mix(in srgb,var(--color-token-main-surface-primary,var(--codex-plus-bg-primary,#121720)) 88%,transparent);backdrop-filter:blur(18px);color:var(--codex-plus-text,var(--color-token-text-primary,#eef3f8));border-left:1px solid var(--codex-plus-border-subtle,rgba(255,255,255,.12));box-sizing:border-box}
      .lws-drawer-head{display:flex;align-items:center;gap:8px;height:42px;padding:0 10px 0 16px;flex:none;border-bottom:1px solid var(--codex-plus-border-subtle,rgba(255,255,255,.1))}
      .lws-drawer-title{flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lws-drawer-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--codex-plus-text-secondary,currentColor);cursor:pointer}
      .lws-drawer-close:hover{background:var(--codex-plus-bg-hover,rgba(128,128,128,.16))}
      .lws-drawer-body{flex:1;min-height:0;overflow:auto;padding:14px 16px 24px}
      .lws{font:13px/1.55 var(--font-sans,system-ui,sans-serif);color:var(--codex-plus-text,#e9eef5);box-sizing:border-box;overflow-x:hidden}
      .lws *{box-sizing:border-box}.lws h2,.lws h3,.lws p{margin:0}.lws h2{font-size:17px;letter-spacing:.02em;font-weight:650}.lws h3{font-size:13px;font-weight:600}
      .lws-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.lws-kicker{font-size:10px;letter-spacing:.16em;color:var(--codex-plus-text-tertiary,#87a1b6);margin-bottom:2px}.lws-sub{font-size:12px;color:var(--codex-plus-text-secondary,#9aa8b7)}
      .lws-btn{font:inherit;color:inherit;border:1px solid var(--codex-plus-border,rgba(128,128,128,.26));border-radius:9px;background:var(--codex-plus-bg-hover,rgba(128,128,128,.1));padding:6px 10px;cursor:pointer;min-height:32px;transition:background .15s,border-color .15s;white-space:nowrap}
      .lws-btn:hover{background:color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 20%,transparent);border-color:color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 45%,transparent)}.lws-btn:disabled{opacity:.4;cursor:wait}.lws button:focus-visible,.lws input:focus-visible,.lws select:focus-visible,.lws summary:focus-visible{outline:2px solid var(--codex-plus-switch-on,#3485ff);outline-offset:2px}
      .lws-small{font-size:12px;padding:4px 9px;min-height:29px}
      .lws-now{display:flex;gap:12px;align-items:flex-start;border-bottom:1px solid var(--codex-plus-border-subtle,rgba(128,128,128,.2));padding-bottom:14px;margin-bottom:14px}
      .lws-now-art{width:84px;height:52px;object-fit:cover;border-radius:7px;background:linear-gradient(130deg,#0a344a,#1e243e);flex:none}
      .lws-now-meta{flex:1;min-width:0}.lws-current-title{font-weight:600;font-size:13px;overflow-wrap:anywhere}.lws-status{font-size:12px;color:var(--codex-plus-switch-on,#53b3cb);overflow-wrap:anywhere;margin-top:2px}.lws-status[data-error="true"]{color:var(--codex-plus-danger,#e06c5c)}
      .lws-controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}
      .lws-summary-line{font-size:11px;color:var(--codex-plus-text-secondary,#9aa8b7);margin-top:7px;overflow-wrap:anywhere;line-height:1.45}
      .lws-motion{padding:9px 11px;background:color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 14%,transparent);border:1px solid color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 32%,transparent);border-radius:8px;margin-bottom:12px;font-size:12px;display:flex;align-items:center;gap:8px}.lws-motion span{flex:1}
      .lws-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 12px}.lws-tab{border-color:transparent;background:transparent;color:var(--codex-plus-text-secondary,#9eacb8);font-size:12px}.lws-tab[aria-pressed="true"]{color:var(--codex-plus-text,inherit);background:color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 18%,transparent);border-color:color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 45%,transparent)}
      .lws-search{display:flex;gap:6px;margin-top:8px}.lws input[type="search"],.lws input[type="text"],.lws select{font:inherit;background:var(--codex-plus-bg-secondary,rgba(128,128,128,.08));color:var(--codex-plus-text,inherit);border:1px solid var(--codex-plus-border,rgba(128,128,128,.28));padding:6px 9px;border-radius:8px;min-width:0;max-width:100%;height:34px}.lws input[type="search"]{flex:1;width:100%}.lws select{width:100%}
      .lws option{background:var(--color-token-main-surface-primary,#141a22);color:var(--codex-plus-text,#eef3f8)}
      .lws-source-note{font-size:11px;color:var(--codex-plus-text-tertiary,#8f9da9);margin:7px 0 0}.lws-result-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;min-height:30px;color:var(--codex-plus-text-secondary,#a8b7c4);margin:4px 0 10px;overflow-wrap:anywhere}.lws-result-status[data-error="true"]{color:var(--codex-plus-danger,#e06c5c)}
      .lws-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 10px}.lws-card{min-width:0;position:relative}
      .lws-card-cover{width:100%;border:1px solid var(--codex-plus-border-subtle,rgba(128,128,128,.22));border-radius:9px;padding:0;overflow:hidden;display:block;background:#0d1c2b;cursor:pointer;aspect-ratio:16/9;position:relative;color:#fff}.lws-card-cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .2s}.lws-card-cover:hover img{transform:scale(1.045)}.lws-card[data-active="true"] .lws-card-cover{outline:2px solid var(--codex-plus-switch-on,#3485ff);outline-offset:2px}
      .lws-play{position:absolute;right:6px;bottom:5px;padding:2px 6px;border-radius:5px;background:#08121bbb;color:#f3fbff;font-size:10px}.lws-card-title{font-size:12px;font-weight:500;margin:6px 0 1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;overflow-wrap:anywhere;padding-right:24px;min-height:33px}.lws-credit{font-size:10px;color:var(--codex-plus-text-tertiary,#91a3af)}.lws-fav{position:absolute;right:0;bottom:14px;background:transparent;border:0;color:var(--codex-plus-switch-on,#69b4d8);cursor:pointer;font-size:18px;padding:3px;line-height:1;min-width:26px;min-height:28px}
      .lws-scene-art{width:100%;height:100%;background:radial-gradient(ellipse at 70% 0,#2c6d8250,transparent 65%),linear-gradient(150deg,#071422,#163b50 60%,#111a30);display:flex;align-items:center;justify-content:center;color:#bfe9f8;font-size:24px;letter-spacing:.2em}
      .lws-empty{grid-column:1/-1;padding:22px 12px;text-align:center;color:var(--codex-plus-text-secondary,#a7b8c7);border:1px dashed var(--codex-plus-border,rgba(128,128,128,.28));border-radius:10px}
      .lws-pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin:16px 0}
      .lws details{margin:14px 0;border-top:1px solid var(--codex-plus-border-subtle,rgba(128,128,128,.2));padding-top:10px}.lws summary{cursor:pointer;font-size:13px;font-weight:500;padding:4px 0;list-style-position:inside}
      .lws-import{display:flex;flex-direction:column;gap:8px;margin-top:10px}.lws-import input{width:100%}
      .lws a,.lws-origin{color:var(--color-text-link,var(--color-token-text-link,var(--codex-plus-switch-on,#69b4d8)));text-decoration:none;font-size:12px}.lws a:hover,.lws-origin:hover{text-decoration:underline}
      .lws-foot{font-size:11px;color:var(--codex-plus-text-tertiary,#899ba8);line-height:1.65;margin-top:16px;border-top:1px solid var(--codex-plus-border-subtle,rgba(128,128,128,.2));padding-top:10px}.lws-foot a{margin-right:10px}
      .lws-filter-section{margin:10px 0}.lws-filter-section h3{margin-bottom:8px}.lws-filter-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lws-filter-field{display:flex;min-width:0;flex-direction:column;gap:4px;font-size:11px;color:var(--codex-plus-text-secondary,#a9b8c5)}
      .lws-category-chips{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}.lws-category-chip[aria-pressed="true"]{background:color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 18%,transparent);border-color:color-mix(in srgb,var(--codex-plus-switch-on,#3485ff) 45%,transparent);color:var(--codex-plus-text,inherit)}
      .lws-partial{font-size:11px;color:#e5c88c}
      .lws-settings-panel{display:grid;gap:2px}
      .lws-settings-row{display:grid;grid-template-columns:1fr;gap:7px;padding:11px 0;border-bottom:1px solid var(--codex-plus-border-subtle,rgba(128,128,128,.18))}
      .lws-settings-row-inline{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .lws-settings-title{font-size:13px;font-weight:500;line-height:19px;display:block}
      .lws-settings-desc{font-size:12px;line-height:17px;color:var(--codex-plus-text-tertiary,#9aa8b7);margin-top:2px}
      .lws-settings-control{display:flex;align-items:center;min-width:0}
      .lws-ext-range-wrap{display:flex;align-items:center;gap:10px;width:100%}
      .lws-ext-range{flex:1 1 auto;min-width:120px;accent-color:var(--codex-plus-switch-on,#3485ff);cursor:pointer;height:20px}
      .lws-ext-range-val{min-width:44px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:var(--codex-plus-text-secondary,#9aa8b7)}
      .lws-settings-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;flex-wrap:wrap}
      .lws-color-picker-wrap{display:inline-flex;align-items:center;gap:8px;flex-shrink:0}
      .lws-color-hex{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--codex-plus-text-secondary,#9aa8b7);text-transform:uppercase;min-width:56px;text-align:right}
      .lws-color-input{-webkit-appearance:none;appearance:none;width:44px;height:26px;padding:2px;border-radius:8px;border:1px solid var(--codex-plus-border,rgba(255,255,255,.2));background:transparent;cursor:pointer}
      .lws-color-input::-webkit-color-swatch-wrapper{padding:0}
      .lws-color-input::-webkit-color-swatch{border:0;border-radius:5px}
      .lws-color-reset{font-size:11px;padding:2px 7px;min-height:24px}
      .lws-toggle-btn{flex:0 0 34px;width:34px;height:20px;border-radius:999px;border:0;padding:2px;background:var(--codex-plus-switch-off,rgba(128,128,128,.45));cursor:pointer;display:inline-flex;align-items:center;transition:background .15s}
      .lws-toggle-btn span{width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.22);transition:transform .15s;display:block}
      .lws-toggle-btn[data-enabled="true"]{background:var(--codex-plus-switch-on,#3485ff)}
      .lws-toggle-btn[data-enabled="true"] span{transform:translateX(14px)}
      @media(prefers-reduced-motion:reduce){.lws *{transition:none!important}}
      .lws [hidden]{display:none!important}
    `;
    document.head.append(style);
    layer = $('div'); layer.id = 'lws-background'; layer.setAttribute('aria-hidden', 'true');
    canvas = $('canvas'); canvas.id = 'lws-canvas';
    mediaBox = $('div'); mediaBox.id = 'lws-media'; shade = $('div'); shade.id = 'lws-shade';
    layer.append(canvas, mediaBox, shade); document.body.prepend(layer);
    return () => {
      closeDrawer();
      restoreGlass();
      restoreTopChrome();
      disposed = true;
      loadVersion++;
      playbackRevision++;
      thumbnailObserver.disconnect();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(topScanQueued);
      topScanQueued = 0;
      activeMedia?.pause?.();
      if (activeBlob) URL.revokeObjectURL(activeBlob);
      mediaBox.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
      layer.remove();
      style.remove();
      document.documentElement.removeAttribute('data-live-wallpaper');
      for (const e of marked) { if (e.getAttribute('data-lws-clear') === 'true') e.removeAttribute('data-lws-clear'); }
      for (const k of ['--lws-dim', '--lws-blur', '--lws-glass', '--lws-fit', '--lws-glass-blur', '--lws-bg-1', '--lws-bg-2', '--lws-bg-2-user', '--lws-bg-3', '--lws-glass-blur-1', '--lws-glass-blur-2', '--lws-glass-blur-3', '--lws-x', '--lws-y']) document.documentElement.style.removeProperty(k);
      uiListeners.clear();
    };
  });

  const GLASS_PROPS = ['backdrop-filter', 'background-color'];
  function restoreNodeGlass(node, record) {
    for (const prop of GLASS_PROPS) {
      const entry = record[prop];
      if (!entry) continue;
      if (node.style.getPropertyValue(prop) === entry.applied) {
        if (entry.value) node.style.setProperty(prop, entry.value, entry.priority);
        else node.style.removeProperty(prop);
      }
    }
  }
  function applyGlassProp(node, record, prop, value) {
    if (!record[prop]) {
      record[prop] = {
        value: node.style.getPropertyValue(prop),
        priority: node.style.getPropertyPriority(prop),
        applied: value,
      };
    }
    record[prop].applied = value;
    if (node.style.getPropertyValue(prop) !== value || node.style.getPropertyPriority(prop) !== 'important') {
      node.style.setProperty(prop, value, 'important');
    }
  }
  function restoreGlass() {
    for (const [node, record] of glassOverrides) restoreNodeGlass(node, record);
    glassOverrides.clear();
  }
  function resolveComposerNodes() {
    const raw = [...document.querySelectorAll('[data-composer-surface-variant],[class*="_ComposerLayoutRoot_"],.composer-surface-chrome,[data-ds-part="composer"]')];
    const resolved = [];
    for (const node of raw) {
      const isHomeVariant = node.getAttribute?.('data-composer-utility-bar-variant') === 'home';
      const target = isHomeVariant ? (node.querySelector?.('[class*="ComposerLayoutBody"]') || node) : node;
      if (target && !resolved.includes(target)) resolved.push(target);
    }
    return resolved.filter((node) => !resolved.some((other) => other !== node && other.contains?.(node)));
  }
  function resolvePanelStyle(zone) {
    const colorKeys = { 1: 'color1', 2: 'color2', 3: 'color3' };
    const colorDefaults = { 1: '#232323', 2: '#232323', 3: '#4a4a4a' };
    const split = !!settings.splitPanels;
    const opacityPct = clamp(split ? settings['glass' + zone] : settings.glass, 0, 100);
    const blurPx = clamp(split ? settings['glassBlur' + zone] : settings.glassBlur, 0, 24);
    const rgb = hexToRgb(settings[colorKeys[zone]], colorDefaults[zone]);
    const alpha = opacityPct / 100;
    const alphaText = alpha.toFixed(3);
    const bg = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alphaText})`;
    const userRgb = zone === 2 ? deriveUserBubbleRgb(rgb) : rgb;
    const userBg = `rgba(${userRgb[0]},${userRgb[1]},${userRgb[2]},${alphaText})`;
    return { opacityPct, blurPx, blurValue: blurPx > 0 ? `blur(${blurPx}px)` : 'none', alpha, bg, userBg };
  }
  function syncGlass() {
    if (!settings.enabled) { restoreGlass(); return; }
    // Inline important overrides both cascade-layer utilities and theme rules; restore cleanly on disable/unload.
    const p1 = resolvePanelStyle(1);
    const p2 = resolvePanelStyle(2);
    const p3 = resolvePanelStyle(3);
    const composerNodes = resolveComposerNodes();
    const utilityNodes = [...document.querySelectorAll('[class*="_homeUtilityBar_"],[class*="_ComposerHomeUtilityBar_"]')]
      .filter((node) => !composerNodes.some((composer) => composer === node || composer.contains?.(node)));
    const targets = [];
    const pushGroup = (nodes, bg, blurValue) => {
      for (const node of nodes) {
        if (node) targets.push([node, bg, blurValue]);
      }
    };
    pushGroup(document.querySelectorAll('aside[data-app-shell-left-panel-appearance]'), p1.bg, p1.blurValue);
    pushGroup(document.querySelectorAll('[data-local-conversation-final-assistant="true"]'), p2.bg, p2.blurValue);
    pushGroup(document.querySelectorAll('[data-user-message-bubble]'), p2.userBg, p2.blurValue);
    pushGroup(composerNodes, p3.bg, p3.blurValue);
    pushGroup(utilityNodes, p3.bg, p3.blurValue);
    const activeNodes = new Set(targets.map(([node]) => node));
    for (const [node, record] of glassOverrides) {
      if (!node.isConnected || !activeNodes.has(node)) {
        restoreNodeGlass(node, record);
        glassOverrides.delete(node);
      }
    }
    for (const [node, bg, blurValue] of targets) {
      if (!glassOverrides.has(node)) glassOverrides.set(node, {});
      const record = glassOverrides.get(node);
      applyGlassProp(node, record, 'backdrop-filter', blurValue);
      applyGlassProp(node, record, 'background-color', bg);
    }
  }
  function clearTopAttrSet(set, attr) {
    for (const el of set) {
      if (el.getAttribute?.(attr) === 'true') el.removeAttribute(attr);
    }
    set.clear();
  }
  function restoreTopChrome() {
    clearTopAttrSet(topClearNodes, 'data-lws-top-clear');
    clearTopAttrSet(pseudoClearNodes, 'data-lws-pseudo-clear');
    clearTopAttrSet(shadowClearNodes, 'data-lws-shadow-clear');
  }
  function isTransparentCssColor(color) {
    return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)'
      || /^rgba\([^)]+,\s*0(?:\.0+)?\)$/i.test(color)
      || /^oklch\([^)]*\/\s*0(?:\.0+)?%?\)$/i.test(color);
  }
  function styleHasTopPaint(cs, includeBorders) {
    if (!cs) return false;
    return !isTransparentCssColor(cs.backgroundColor)
      || (cs.backgroundImage && cs.backgroundImage !== 'none')
      || (cs.boxShadow && cs.boxShadow !== 'none')
      || (cs.backdropFilter && cs.backdropFilter !== 'none')
      || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')
      || (includeBorders && (
        (parseFloat(cs.borderBottomWidth || '0') > 0 && !isTransparentCssColor(cs.borderBottomColor))
        || (parseFloat(cs.borderTopWidth || '0') > 0 && !isTransparentCssColor(cs.borderTopColor))
      ));
  }
  function pseudoHasTopPaint(el, pseudo) {
    const ps = getComputedStyle(el, pseudo);
    if (!ps || ps.content === 'none') return false;
    if (!styleHasTopPaint(ps, true)) return false;
    const h = parseFloat(ps.height || '0');
    return ps.height === 'auto' || !Number.isFinite(h) || h <= 120 || String(ps.backgroundImage || '').includes('gradient');
  }
  const TOP_CHROME_SKIP_SELECTOR = '#lws-drawer,[data-codex-plus-ext],[data-codex-plus-image-native],aside,[data-ds-part="composer"],[data-codex-composer-root],[data-composer-surface-variant],[class*="_ComposerLayoutRoot_"],.composer-surface-chrome,[class*="_homeUtilityBar_"],[class*="_ComposerHomeUtilityBar_"],[data-local-conversation-final-assistant],[data-user-message-bubble],[data-message-author-role],[data-ds-part="message"],[data-response-annotation-conversation],[class~="rounded-2xl"][class~="border"],[class~="rounded-xl"][class~="border"],[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-slot="popover-content"],[data-radix-popper-content-wrapper],[data-sonner-toast],button,a,input,textarea,select,svg,img,video,canvas,[role="button"],[contenteditable]';
  function markTopAttr(set, attr, el) {
    if (!set.has(el)) {
      el.setAttribute(attr, 'true');
      set.add(el);
    }
  }
  function scanTopChrome() {
    if (!settings.enabled) { restoreTopChrome(); return; }
    if (typeof getComputedStyle !== 'function') return;
    for (const set of [topClearNodes, pseudoClearNodes, shadowClearNodes]) {
      for (const el of set) if (!el.isConnected) set.delete(el);
    }
    const roots = [];
    for (const r of document.querySelectorAll('main[data-app-shell-main-surface],[data-app-shell-focus-area="main"],[data-ds-part="main"],[data-app-shell-workspace-row] > :not(aside)')) {
      if (r && !roots.includes(r)) roots.push(r);
    }
    const inspectNode = (el, rootRect) => {
      if (!el || el.nodeType !== 1 || el.matches?.(TOP_CHROME_SKIP_SELECTOR)) return false;
      const rect = el.getBoundingClientRect?.();
      if (!rect || !rect.width || !rect.height) return false;
      if (rect.top > rootRect.top + 100 || rect.bottom < rootRect.top - 10) return false;
      if (rect.width >= rootRect.width * 0.65 && rect.top <= rootRect.top + 80) {
        const cs = getComputedStyle(el);
        const radius = parseFloat(cs?.borderRadius || '0');
        if (radius < 6) {
          if (rect.height <= 96 && !el.querySelector?.('input,textarea,select') && styleHasTopPaint(cs, true)) {
            markTopAttr(topClearNodes, 'data-lws-top-clear', el);
          } else {
            if (cs?.boxShadow && cs.boxShadow !== 'none') markTopAttr(shadowClearNodes, 'data-lws-shadow-clear', el);
            if (pseudoHasTopPaint(el, '::before') || pseudoHasTopPaint(el, '::after')) {
              markTopAttr(pseudoClearNodes, 'data-lws-pseudo-clear', el);
            }
          }
        }
      }
      return true;
    };
    for (const paneRoot of roots) {
      if (paneRoot.matches?.(TOP_CHROME_SKIP_SELECTOR)) continue;
      const rootRect = paneRoot.getBoundingClientRect?.();
      if (!rootRect || rootRect.width < 120 || rootRect.height < 80) continue;
      const walk = (el) => {
        if (!inspectNode(el, rootRect)) return;
        for (const child of el.children || []) walk(child);
      };
      walk(paneRoot);
    }
  }
  function scheduleTopChromeScan() {
    if (disposed || !settings.enabled || topScanQueued) return;
    topScanQueued = requestAnimationFrame(() => {
      topScanQueued = 0;
      if (!disposed && settings.enabled) scanTopChrome();
    });
  }
  function clearSurface(e) { if (!e || e === document.body || e === document.documentElement || marked.has(e)) return; e.setAttribute('data-lws-clear', 'true'); marked.add(e); }
  function scanSurfaces() {
    for (const selector of ['[data-ds-part="main"]', '[data-ds-part="thread"]', '[data-app-shell-main-surface]', '[data-app-shell-page-surface="true"]', '[data-app-shell-header-layout]', '[data-app-shell-header-edge-scroll]', '[data-app-shell-left-panel-appearance]']) {
      const el = document.querySelector(selector); let e = selector.includes('left-panel') ? el?.parentElement : el;
      while (e && e !== document.body && e !== document.documentElement) { clearSurface(e); e = e.parentElement; }
    }
    // The native composer keeps its own glass; only ancestors outside the outermost composer root are cleared.
    for (const composerNode of document.querySelectorAll('[data-codex-composer-root],[data-composer-surface-variant],[class*="_ComposerLayoutRoot_"],.composer-surface-chrome,[data-ds-part="composer"]')) {
      const outerComposer = composerNode?.closest?.('[data-codex-composer-root]') || composerNode;
      let e = outerComposer?.parentElement;
      while (e && e !== document.body && e !== document.documentElement) { clearSurface(e); e = e.parentElement; }
    }
    scanTopChrome();
  }
  ctx.onScan(() => {
    scanSurfaces();
    syncGlass();
    if (drawerOpen) {
      if (document.querySelector('.codex-plus-page-overlay') || document.documentElement.hasAttribute('data-codex-plus-side-panel-open')) {
        closeDrawer();
      } else {
        syncDrawerLayout();
        syncOwnRailActive(true);
      }
    } else {
      syncOwnRailActive(false);
    }
  });
  scanSurfaces(); syncGlass();
  function applyAppearance() {
    root = document.documentElement; root.setAttribute('data-live-wallpaper', settings.enabled ? 'on' : 'off');
    const p1 = resolvePanelStyle(1), p2 = resolvePanelStyle(2), p3 = resolvePanelStyle(3);
    root.style.setProperty('--lws-dim', clamp(settings.dim, 0, 85) / 100);
    root.style.setProperty('--lws-blur', clamp(settings.blur, 0, 18) + 'px');
    root.style.setProperty('--lws-glass', clamp(settings.glass, 0, 100) / 100);
    root.style.setProperty('--lws-glass-blur', clamp(settings.glassBlur, 0, 24) + 'px');
    root.style.setProperty('--lws-bg-1', p1.bg);
    root.style.setProperty('--lws-bg-2', p2.bg);
    root.style.setProperty('--lws-bg-2-user', p2.userBg);
    root.style.setProperty('--lws-bg-3', p3.bg);
    root.style.setProperty('--lws-glass-blur-1', p1.blurPx + 'px');
    root.style.setProperty('--lws-glass-blur-2', p2.blurPx + 'px');
    root.style.setProperty('--lws-glass-blur-3', p3.blurPx + 'px');
    root.style.setProperty('--lws-fit', ['cover', 'contain', 'fill'].includes(settings.fit) ? settings.fit : 'cover');
    syncGlass();
    if (settings.enabled) scanTopChrome();
    else restoreTopChrome();
    root.style.setProperty('--lws-x', clamp(settings.focalX, 0, 100) + '%');
    root.style.setProperty('--lws-y', clamp(settings.focalY, 0, 100) + '%');
    layer.hidden = !settings.enabled;
    if (activeMedia?.tagName === 'VIDEO') activeMedia.playbackRate = clamp(settings.speed, .25, 2);
  }
  let w = 1, h = 1, points = [];
  function resize() {
    w = innerWidth; h = innerHeight;
    const d = Math.min(devicePixelRatio || 1, 1.4);
    canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    canvas.getContext('2d')?.setTransform(d, 0, 0, d, 0, 0);
    points = Array.from({ length: 90 }, () => ({ x: Math.random() * w, y: Math.random() * h, z: .2 + Math.random() * .8, length: 8 + Math.random() * 25 }));
    drawScene(0);
    if (drawerOpen) syncDrawerLayout();
    scheduleTopChromeScan();
    notify();
  }
  function drawScene(dt) {
    const c = canvas.getContext('2d'); if (!c) return;
    const scene = current?.scene || 'rain';
    c.fillStyle = scene === 'matrix' ? '#031011' : '#071321'; c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(w * .72, h * .22, 0, w * .7, h * .35, w * .8); glow.addColorStop(0, scene === 'matrix' ? '#0c363b' : '#15394e'); glow.addColorStop(1, '#030914'); c.fillStyle = glow; c.fillRect(0, 0, w, h);
    for (let i = 0; i < points.length; i++) {
      const p = points[i]; if (dt) { p.y += (scene === 'stars' ? 4 : 120) * p.z * dt / 1000; if (p.y > h + 30) p.y = -30; }
      if (scene === 'stars') { c.fillStyle = `rgba(199,229,248,${p.z * .8})`; c.beginPath(); c.arc(p.x, p.y, p.z * 1.5, 0, Math.PI * 2); c.fill(); }
      else if (scene === 'matrix') { c.font = `${12 + p.z * 7}px monospace`; c.fillStyle = `rgba(80,211,203,${p.z * .55})`; c.fillText('01<>/{}'[Math.floor((i + frame / 15) % 7)], p.x, p.y); }
      else { c.strokeStyle = `rgba(127,202,236,${p.z * .45})`; c.lineWidth = p.z; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 3, p.y + p.length); c.stroke(); }
    }
  }
  function tick(now) { raf = 0; if (disposed || shouldPause() || activeMedia || !settings.enabled) return; if (now - lastFrame >= 40) { drawScene(Math.min(80, now - lastFrame)); lastFrame = now; frame++; } raf = requestAnimationFrame(tick); }
  function syncPlayback() {
    const revision = ++playbackRevision, target = activeMedia;
    cancelAnimationFrame(raf); raf = 0;
    if (activeMedia?.tagName === 'VIDEO') {
      if (shouldPause()) { activeMedia.pause(); stateLine(reduced() ? '已按系统“减少动态效果”暂停' : settings.enabled ? '已暂停' : '壁纸已关闭'); }
      else { activeMedia.play().then(() => { if (!disposed && revision === playbackRevision && activeMedia === target && !shouldPause()) stateLine('静音循环播放'); }).catch(() => { if (!disposed && revision === playbackRevision && !shouldPause()) stateLine('播放被阻止，请点击“播放”重试', true); }); }
    } else if (activeMedia) stateLine(settings.enabled ? '图片壁纸' : '壁纸已关闭');
    else if (settings.enabled) { stateLine(shouldPause() ? reduced() ? '已按系统“减少动态效果”暂停' : '已暂停' : '内置动态场景 · 低负载'); drawScene(0); if (!shouldPause()) { lastFrame = performance.now(); raf = requestAnimationFrame(tick); } }
    else stateLine('壁纸已关闭');
  }
  ctx.listen(window, 'resize', resize); ctx.listen(document, 'scroll', scheduleTopChromeScan, true); ctx.listen(document, 'visibilitychange', syncPlayback); ctx.listen(motionQuery, 'change', syncPlayback); resize();
  function acceptMotion() { settings.motionConsent = true; settings.paused = false; storeSettings(); }
  async function localBlobUrl(localId, version) {
    let offset = 0, total = 1, type = '', chunks = [];
    while (offset < total) {
      if (disposed || version !== loadVersion) throw new Error('已切换其他壁纸');
      const r = await ctx.backend.call('mediaChunk', { localId, offset }, { timeout: 24000 }); total = r.total; type = r.type;
      if (total > 256 * 1024 * 1024) throw new Error('当前页面本地播放上限 256 MB，请先压缩视频');
      const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0)); chunks.push(bytes); offset += r.bytesRead;
      if (!r.bytesRead && offset < total) throw new Error('媒体文件读取不完整');
    }
    return URL.createObjectURL(new Blob(chunks, { type }));
  }
  async function choose(item, userGesture = true) {
    const version = ++loadVersion; playbackRevision++; const previous = current; busy = true; lastError = ''; if (userGesture) acceptMotion(); stateLine('正在准备壁纸，保留当前画面…');
    let candidateBlob = '';
    try {
      if (item.kind === 'scene') {
        activeMedia?.pause?.(); mediaBox.replaceChildren(); activeMedia = null; if (activeBlob) URL.revokeObjectURL(activeBlob); activeBlob = ''; current = { ...item }; canvas.hidden = false;
      } else {
        let resource = item;
        if (resource.page && sourceNames[resource.source] && resource.resolvedQuality !== settings.quality) {
          const resolved = await ctx.backend.call('resolve', { source: resource.source, page: resource.page, quality: settings.quality }, { timeout: 24000 });
          resource = { ...resource, ...resolved }; delete resource.localId;
        } else if (!resource.url && !resource.localId) resource = { ...resource, ...(await ctx.backend.call('resolve', { source: item.source, page: item.page, quality: settings.quality }, { timeout: 24000 })) };
        if (disposed || version !== loadVersion) return;
        // Remote videos stream directly; local files and restricted sources use cached Blob media.
        let playbackUrl = resource.url;
        if (resource.localId) playbackUrl = candidateBlob = await localBlobUrl(resource.localId, version);
        const makeMedia = url => new Promise((resolve, reject) => {
          const isVideo = resource.kind !== 'image', m = $(isVideo ? 'video' : 'img');
          if (isVideo) { m.muted = true; m.defaultMuted = true; m.loop = true; m.playsInline = true; m.preload = 'auto'; m.playbackRate = clamp(settings.speed, .25, 2); }
          m.style.opacity = '0'; mediaBox.append(m); let timer;
          const done = error => { clearTimeout(timer); m.onload = m.onloadeddata = m.onerror = null; if (error) { m.pause?.(); m.remove(); reject(error); } else resolve(m); };
          m.onload = m.onloadeddata = () => done(); m.onerror = () => done(new Error('该视频暂时无法播放')); timer = setTimeout(() => done(new Error('视频加载超时')), 18000); m.src = url;
        });
        let m;
        try { m = await makeMedia(playbackUrl); } catch (firstError) {
          if (disposed || version !== loadVersion) return;
          stateLine('直连失败，正在通过本地缓存重试…');
          if (resource.localId) throw firstError;
          try {
            const cached = await ctx.backend.call('prepare', { url: resource.url }, { timeout: 24000 }); resource.localId = cached.localId; candidateBlob = await localBlobUrl(cached.localId, version); m = await makeMedia(candidateBlob);
          } catch (cacheError) {
            const preview = resource.variants?.find(x => x.quality === 'preview');
            if (!preview || resource.selectedQuality === 'preview') throw cacheError;
            if (disposed || version !== loadVersion) throw Error('已切换其他壁纸');
            if (candidateBlob) URL.revokeObjectURL(candidateBlob); candidateBlob = '';
            resource = { ...resource, url: preview.url, selectedQuality: 'preview', qualityLabel: '预览', qualityNotice: '高清版本未能播放，已回退预览：' + friendlyError(cacheError) }; delete resource.localId;
            stateLine('高清未能播放，正在回退预览…'); m = await makeMedia(resource.url);
          }
        }
        if (disposed || version !== loadVersion) { m.pause?.(); m.remove(); return; }
        activeMedia?.pause?.(); for (const old of [...mediaBox.children]) if (old !== m) { old.pause?.(); old.remove(); }
        if (activeBlob) URL.revokeObjectURL(activeBlob); activeBlob = candidateBlob; candidateBlob = ''; activeMedia = m; m.style.opacity = '1'; canvas.hidden = true; current = resource;
        if (m.tagName === 'VIDEO') m.addEventListener('error', () => { if (activeMedia === m) stateLine('视频连接中断，请重试或换一张壁纸', true); });
      }
      if (userGesture) settings.enabled = true; ctx.storage.set('current', current); storeSettings(); applyAppearance(); resize(); syncPlayback();
      if (userGesture) ctx.toast('已应用：' + item.title, { type: 'success' });
    } catch (e) { if (version === loadVersion && !disposed) { current = previous; stateLine('加载失败：' + friendlyError(e), true); ctx.toast('壁纸加载失败，已保留原背景', { type: 'error' }); } }
    finally { if (candidateBlob) URL.revokeObjectURL(candidateBlob); if (version === loadVersion) { busy = false; notify(); } }
  }
  function mediaDiagnostics() {
    const vw = activeMedia?.videoWidth || activeMedia?.naturalWidth || 0, vh = activeMedia?.videoHeight || activeMedia?.naturalHeight || 0;
    if (!vw || !vh) return { text: current?.kind === 'scene' ? '内置实时场景 · 始终铺满整窗' : '读取媒体尺寸…', hint: '背景模糊影响壁纸自身；玻璃模糊仅影响侧栏、输入框与消息气泡。' };
    const bw = layer.clientWidth || innerWidth, bh = layer.clientHeight || innerHeight;
    const fit = settings.fit, scale = fit === 'contain' ? Math.min(bw / vw, bh / vh) : Math.max(bw / vw, bh / vh);
    const cropX = fit === 'cover' ? Math.max(0, 1 - bw / (vw * scale)) * 100 : 0, cropY = fit === 'cover' ? Math.max(0, 1 - bh / (vh * scale)) * 100 : 0;
    const factor = (fit === 'fill' ? Math.max(bw / vw, bh / vh) : scale) * (devicePixelRatio || 1);
    let hint = fit === 'cover' ? '按最短边等比填满整窗（不留黑边）：横向裁切约 ' + cropX.toFixed(1) + '%，纵向裁切约 ' + cropY.toFixed(1) + '%。' : fit === 'fill' ? '强制拉伸铺满整窗（不留黑边），窗口比例不同时画面可能变形。' : '保持原比例完整显示，不裁切画面；窗口比例不同时上下或左右可能留黑边。';
    if (factor > 1.05) hint += ' 当前原片需放大约 ' + factor.toFixed(2) + '×（含屏幕缩放），建议换高清原片。';
    if (settings.blur > 0) hint += ' 背景模糊 ' + settings.blur + 'px。';
    if (current?.qualityNotice) hint += ' ' + current.qualityNotice;
    return { width: vw, height: vh, scale: factor, cropX, cropY, text: vw + ' × ' + vh + ' · ' + (current?.qualityLabel || '原始媒体') + ' · 窗口 ' + bw + ' × ' + bh, hint };
  }
  function isFavorite(item) { return favorites.some(x => x.id === item.id); }
  function toggleFavorite(item) { if (isFavorite(item)) favorites = favorites.filter(x => x.id !== item.id); else favorites = [...favorites, { ...item }].slice(-200); storeList(); notify(); }
  function randomWallpaper(items) { const pool = (items?.length ? items : favorites.length ? favorites : builtins).filter(x => x.id !== current?.id); if (pool.length) choose(pool[Math.floor(Math.random() * pool.length)]); }
  ctx.setInterval(() => { if (!settings.interval || shouldPause() || busy) return; if (Date.now() - fpsAt < settings.interval * 60000) return; fpsAt = Date.now(); randomWallpaper(favorites.length ? favorites : builtins); }, 15000);

  function buildSettingsTab(container) {
    const wrap = $('div', 'lws-settings-panel');
    const syncers = [];
    for (const [index, field] of SETTINGS_FIELDS.entries()) {
      const id = 'lws-cfg-' + index;
      const row = $('div', 'lws-settings-row');
      const labelCol = $('div');
      const label = $('label', 'lws-settings-title', field.title);
      label.htmlFor = id;
      labelCol.append(label, $('div', 'lws-settings-desc', field.description));
      const ctrlCol = $('div', 'lws-settings-control');

      if (field.type === 'range') {
        const box = $('div', 'lws-ext-range-wrap');
        const input = $('input', 'lws-ext-range');
        input.id = id; input.type = 'range'; input.min = String(field.min); input.max = String(field.max);
        input.step = String(field.step || 1); input.value = String(settings[field.key]);
        input.dataset.setting = field.key;
        input.setAttribute('aria-label', field.title);
        const out = $('output', 'lws-ext-range-val', settings[field.key] + field.unit);
        input.oninput = () => {
          settings[field.key] = normalizeFieldValue(field, input.value);
          if (field.key === 'glass' || field.key === 'glassBlur') {
            for (const zone of [1, 2, 3]) settings[field.key + zone] = settings[field.key];
          }
          out.textContent = settings[field.key] + field.unit;
          saveSettings();
        };
        box.append(input, out); ctrlCol.append(box);
        row.append(labelCol, ctrlCol);
        syncers.push(() => {
          if (document.activeElement !== input) input.value = String(settings[field.key]);
          out.textContent = settings[field.key] + field.unit;
          row.hidden = field.onlyWhen ? !field.onlyWhen(settings) : false;
        });
      } else if (field.type === 'color') {
        const inline = $('div', 'lws-settings-row-inline');
        const pickerWrap = $('div', 'lws-color-picker-wrap');
        const hexLabel = $('span', 'lws-color-hex', settings[field.key].toUpperCase());
        const input = $('input', 'lws-color-input');
        input.id = id; input.type = 'color'; input.value = settings[field.key];
        input.dataset.setting = field.key;
        input.setAttribute('aria-label', field.title);
        const resetColorBtn = button('默认', () => {
          settings[field.key] = field.default;
          input.value = field.default;
          hexLabel.textContent = field.default.toUpperCase();
          saveSettings();
        }, 'lws-small lws-color-reset');
        input.oninput = () => {
          settings[field.key] = normalizeFieldValue(field, input.value);
          hexLabel.textContent = settings[field.key].toUpperCase();
          saveSettings();
        };
        pickerWrap.append(hexLabel, input, resetColorBtn);
        inline.append(labelCol, pickerWrap);
        row.append(inline);
        syncers.push(() => {
          const val = normalizeFieldValue(field, settings[field.key]);
          if (document.activeElement !== input) input.value = val;
          hexLabel.textContent = val.toUpperCase();
          resetColorBtn.hidden = val === field.default;
          row.hidden = field.onlyWhen ? !field.onlyWhen(settings) : false;
        });
      } else if (field.type === 'select') {
        const select = $('select');
        select.id = id; select.dataset.setting = field.key; select.setAttribute('aria-label', field.title);
        for (const opt of field.options) {
          const o = $('option', '', opt.label);
          o.value = JSON.stringify(opt.value);
          select.append(o);
        }
        select.value = JSON.stringify(settings[field.key]);
        select.onchange = () => {
          const prevQuality = settings.quality;
          settings[field.key] = normalizeFieldValue(field, JSON.parse(select.value));
          if (field.key === 'interval') fpsAt = Date.now();
          saveSettings();
          if (field.key === 'quality' && settings.quality !== prevQuality && current?.page && sourceNames[current.source]) {
            choose(current, false);
          }
        };
        ctrlCol.append(select);
        row.append(labelCol, ctrlCol);
        syncers.push(() => {
          select.value = JSON.stringify(settings[field.key]);
          row.hidden = field.onlyWhen ? !field.onlyWhen(settings) : false;
        });
      } else {
        const inline = $('div', 'lws-settings-row-inline');
        const toggle = $('button', 'lws-toggle-btn');
        toggle.id = id; toggle.type = 'button'; toggle.dataset.setting = field.key;
        toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', field.title);
        toggle.append($('span'));
        toggle.onclick = () => {
          const prev = settings[field.key];
          settings[field.key] = !prev;
          if (field.key === 'respectMotion' && !prev && settings.respectMotion) settings.motionConsent = false;
          saveSettings();
        };
        inline.append(labelCol, toggle);
        row.append(inline);
        syncers.push(() => {
          toggle.dataset.enabled = String(!!settings[field.key]);
          toggle.setAttribute('aria-checked', String(!!settings[field.key]));
          row.hidden = field.onlyWhen ? !field.onlyWhen(settings) : false;
        });
      }
      wrap.append(row);
    }

    const foot = $('div', 'lws-settings-foot');
    const tip = $('span', 'lws-sub', '修改滑块或开关后左侧实时预览并自动保存。');
    const resetBtn = button('恢复默认设置', () => {
      const prevQuality = settings.quality;
      const keepEnabled = settings.enabled;
      const keepPaused = settings.paused;
      settings = { ...defaults, enabled: keepEnabled, paused: keepPaused };
      fpsAt = Date.now();
      saveSettings();
      if (settings.quality !== prevQuality && current?.page && sourceNames[current.source]) choose(current, false);
    }, 'lws-small');
    foot.append(tip, resetBtn);
    wrap.append(foot);
    container.append(wrap);
    return () => { for (const fn of syncers) fn(); };
  }

  function render({ container }) {
    container.replaceChildren(); const ui = $('div', 'lws'); ui.id = 'lws-panel'; container.append(ui);
    const savedFilters = ctx.storage.get('browseFilters', {}); let source = savedFilters.source || 'all'; if (!sourceNames[source]) source = 'all';
    let tab = 'gallery', category = savedFilters.topic || 'nature', page = 1, cursor = '', cursors = [''], query = savedFilters.query || '', resultItems = [], next = '', request = 0, browsing = false;

    const now = $('div', 'lws-now'), thumb = $('img', 'lws-now-art'); thumb.alt = '';
    const meta = $('div', 'lws-now-meta'), title = $('div', 'lws-current-title'), status = $('div', 'lws-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const playbackControls = $('div', 'lws-controls');
    const play = button('暂停', null, 'lws-small'); play.dataset.action = 'playback';
    play.onclick = () => { const wasPaused = shouldPause(); acceptMotion(); settings.paused = !wasPaused; saveSettings(); };
    const random = button('随机一张', () => randomWallpaper(tab === 'gallery' ? resultItems : tab === 'favorites' ? favorites : builtins), 'lws-small');
    const off = button('关闭壁纸', () => { settings.enabled = !settings.enabled; saveSettings(); }, 'lws-small');
    const retryCurrent = button('重试', () => current && choose(current), 'lws-small');
    const originalLink = $('a', 'lws-origin', '打开原站 ↗'); originalLink.target = '_blank'; originalLink.rel = 'noopener noreferrer';
    playbackControls.append(play, random, off, retryCurrent, originalLink);
    const diagnostic = $('div', 'lws-summary-line');
    const configSummary = $('div', 'lws-summary-line');
    meta.append(title, status, playbackControls, diagnostic, configSummary);
    now.append(thumb, meta); ui.append(now);

    const motionBox = $('div', 'lws-motion'), motionText = $('span', '', '系统开启了“减少动态效果”，壁纸默认静止。');
    motionBox.append(motionText, button('仍然播放', () => { acceptMotion(); saveSettings(); }, 'lws-small'));
    ui.append(motionBox);

    const tabs = $('div', 'lws-tabs'), tabButtons = [];
    const filterArea = $('section', 'lws-filter-section'); filterArea.id = 'lws-filter-section'; filterArea.setAttribute('aria-label', '视频源与分类筛选');
    filterArea.append($('h3', '', '筛选视频壁纸'));
    const fields = $('div', 'lws-filter-fields');
    const sourceSelect = $('select'); sourceSelect.setAttribute('aria-label', '壁纸数据源');
    for (const [value, label] of sourceLabels) { const o = $('option', '', label); o.value = value; sourceSelect.append(o); }
    sourceSelect.value = source;
    const categorySelect = $('select'); categorySelect.setAttribute('aria-label', '壁纸分类');
    const fieldRow = (label, input) => { const row = $('label', 'lws-filter-field'); row.append($('span', '', label), input); fields.append(row); };
    fieldRow('视频数据源', sourceSelect); fieldRow('内容分类', categorySelect); filterArea.append(fields);
    const chips = $('div', 'lws-category-chips'); chips.setAttribute('aria-label', '常用分类'); const chipButtons = [];
    function fillCategories() {
      categorySelect.replaceChildren();
      const available = topics.filter(t => source === 'all' || Object.hasOwn(t.routes, source));
      if (!available.some(t => t.id === category)) category = available.find(t => t.id === 'nature')?.id || available[0].id;
      for (const t of available) { const o = $('option', '', t.label); o.value = t.id; categorySelect.append(o); }
      categorySelect.value = category;
      for (const [id, b] of chipButtons) { b.hidden = !available.some(t => t.id === id); b.setAttribute('aria-pressed', String(id === category)); }
    }
    for (const [id, label] of [['nature', '自然风景'], ['human', '人文生活'], ['city', '城市建筑'], ['abstract', '抽象几何'], ['anime', '动漫']]) {
      const b = button(label, () => { category = id; query = ''; search.value = ''; fillCategories(); resetBrowse(); }, 'lws-small lws-category-chip');
      b.dataset.category = id; chips.append(b); chipButtons.push([id, b]);
    }
    filterArea.append(chips); fillCategories();
    const searchForm = $('form', 'lws-search'), search = $('input'); search.type = 'search'; search.value = query;
    search.placeholder = '搜索：forest / street / abstract'; search.setAttribute('aria-label', '搜索壁纸，英文关键词');
    const submit = button('搜索', null, 'lws-small'); submit.type = 'submit';
    const reset = button('重置', () => { source = 'all'; category = 'nature'; query = ''; search.value = ''; sourceSelect.value = source; fillCategories(); resetBrowse(); }, 'lws-small');
    searchForm.append(search, submit, reset); filterArea.append(searchForm);
    const sourceNote = $('div', 'lws-source-note'); filterArea.append(sourceNote);
    function filterNote() {
      const name = topics.find(t => t.id === category)?.label || '全部分类';
      sourceNote.textContent = query ? '关键词搜索覆盖所选源的全站内容；选择分类会清空关键词。' : source === 'mixkit' ? 'Mixkit 提供实拍与抽象素材；部分短片并非无缝循环，许可以原站为准。' : source === 'all' ? '跨源浏览 · Mixkit 优先展示实拍 / 素材 · 其他源的风景与生活分类可能包含插画。' : name + ' · 按原站分类，可能包含插画；真实风景、人文推荐选择 Mixkit。';
    }
    function persistFilters() { ctx.storage.set('browseFilters', { source, topic: category, query }); ctx.storage.set('browseSource', source === 'all' ? 'moe' : source); filterNote(); }
    ui.append(tabs, filterArea); filterNote();

    const catalogStatus = $('div', 'lws-result-status'); catalogStatus.setAttribute('role', 'status'); catalogStatus.setAttribute('aria-live', 'polite');
    let committed = { page: 1, cursor: '', next: '', items: [] };
    const grid = $('div', 'lws-grid'); grid.setAttribute('aria-label', '壁纸图库');
    const pagination = $('div', 'lws-pagination');
    const prev = button('上一页', () => { if (page > 1) { page--; cursor = cursors[page - 1] || ''; browse(); } }, 'lws-small');
    const pageLabel = $('span', 'lws-sub');
    const nextButton = button('下一页', () => { if (next) { cursors[page] = next; cursor = next; page++; browse(); } }, 'lws-small');
    pagination.append(prev, pageLabel, nextButton);
    const settingsSection = $('section'); settingsSection.id = 'lws-settings-tab'; settingsSection.hidden = true;
    const syncSettingsTab = buildSettingsTab(settingsSection);
    ui.append(catalogStatus, grid, pagination, settingsSection);

    function drawGrid(items) {
      grid.querySelectorAll('img[data-thumbnail]').forEach(i => thumbnailObserver.unobserve(i));
      grid.replaceChildren();
      if (!items.length) {
        const empty = $('div', 'lws-empty', browsing ? '正在读取图库…' : tab === 'favorites' ? '还没有收藏。点击壁纸旁的 ☆ 加入。' : tab === 'local' ? '还没有本地壁纸。在下方选择视频或填写文件路径。' : '没有找到结果，换个关键词试试。');
        grid.append(empty);
        return;
      }
      for (const item of items) {
        const card = $('div', 'lws-card'); card.dataset.active = String(current?.id === item.id); card.dataset.wallpaperId = item.id;
        const cover = button('', () => choose(item), 'lws-card-cover'); cover.className = 'lws-card-cover'; cover.setAttribute('aria-label', '应用壁纸：' + item.title);
        if (item.thumb) {
          const image = $('img'); image.alt = item.title; image.loading = 'lazy'; image.dataset.thumbnail = item.thumb; image.style.opacity = '0';
          image.onload = () => { image.style.opacity = '1'; };
          image.onerror = () => { if (image.isConnected) { cover.prepend($('div', 'lws-scene-art', '▷')); image.remove(); } };
          cover.append(image); thumbnailObserver.observe(image);
        } else cover.append($('div', 'lws-scene-art', item.scene === 'stars' ? '✦ · ✧' : item.scene === 'matrix' ? '01 /' : '╱ ╱ ╱'));
        cover.append($('span', 'lws-play', current?.id === item.id ? '使用中' : item.kind === 'scene' ? '内置' : '▷ 应用'));
        const name = $('div', 'lws-card-title', item.title); name.title = item.title;
        const credit = $('div', 'lws-credit', sourceNames[item.source] ? sourceNames[item.source] + (item.source === 'mixkit' ? ' · 实拍 / 素材' : ['motion', 'free'].includes(item.source) ? ' · HD / 4K 可选' : ' · 公开预览') : item.source === 'local' ? '本地资源' : item.source === 'custom' ? '自定义媒体' : '内置 · 离线可用');
        const fav = button(isFavorite(item) ? '★' : '☆', () => toggleFavorite(item), 'lws-fav'); fav.className = 'lws-fav';
        fav.setAttribute('aria-label', (isFavorite(item) ? '取消收藏：' : '收藏：') + item.title); fav.setAttribute('aria-pressed', String(isFavorite(item)));
        card.append(cover, name, credit, fav); grid.append(card);
      }
    }
    async function browse(refresh = false) {
      const seq = ++request, targetPage = page, targetCursor = cursor; browsing = true; ui.setAttribute('aria-busy', 'true');
      catalogStatus.dataset.error = 'false'; catalogStatus.replaceChildren($('span', '', '正在连接 ' + sourceNames[source] + '…'));
      drawGrid(resultItems); prev.disabled = nextButton.disabled = true;
      try {
        const r = await ctx.backend.call('browseCatalog', { source, topic: category, query, page, cursor, refresh }, { timeout: 24000 });
        if (!container.isConnected || seq !== request || tab !== 'gallery') return;
        resultItems = r.items; next = r.next; committed = { page, cursor, next, items: resultItems };
        catalogStatus.replaceChildren($('span', '', r.stale ? `第 ${page} 页 · 网络异常，正在显示上次缓存。` : `${r.items.length} 个视频 · ${sourceNames[source]} · ${topics.find(t => t.id === category)?.label || ''} · 第 ${page} 页${r.cached ? ' · 缓存' : ''}`));
        if (r.partial) catalogStatus.append($('span', 'lws-partial', '部分源暂不可用：' + r.warnings.map(w => w.name).join('、')));
        if (r.stale || r.partial) catalogStatus.append(button('重试', () => browse(true), 'lws-small'));
        filterNote();
      } catch (e) {
        if (!container.isConnected || seq !== request || tab !== 'gallery') return;
        page = committed.page; cursor = committed.cursor; next = committed.next; resultItems = committed.items;
        catalogStatus.dataset.error = 'true';
        catalogStatus.replaceChildren($('span', '', '第 ' + targetPage + ' 页加载失败：' + e.message), button('重试', () => { page = targetPage; cursor = targetCursor; browse(true); }, 'lws-small'));
      } finally {
        if (seq === request && tab === 'gallery' && container.isConnected) {
          browsing = false; ui.setAttribute('aria-busy', 'false'); drawGrid(resultItems);
          prev.disabled = page <= 1; nextButton.disabled = !next; pageLabel.textContent = '第 ' + page + ' 页';
        }
      }
    }
    function showTab(t) {
      tab = t; request++; browsing = false;
      for (const [key, b] of tabButtons) b.setAttribute('aria-pressed', String(t === key));
      filterArea.hidden = t !== 'gallery';
      sourceNote.hidden = t !== 'gallery';
      catalogStatus.hidden = t === 'settings';
      grid.hidden = t === 'settings';
      pagination.hidden = t !== 'gallery';
      settingsSection.hidden = t !== 'settings';
      imports.hidden = t === 'settings';
      foot.hidden = t === 'settings';
      if (t === 'local') imports.open = true;
      catalogStatus.textContent = t === 'favorites' ? `${favorites.length} 张收藏 · 随机切换优先使用收藏` : t === 'local' ? `${locals.length} 个本地资源` : t === 'builtin' ? '离线可用 · 无需下载' : '';
      catalogStatus.dataset.error = 'false';
      if (t === 'gallery') browse();
      else if (t === 'settings') syncSettingsTab();
      else drawGrid(t === 'favorites' ? favorites : t === 'local' ? locals : builtins);
    }
    for (const [t, name] of [['gallery', '在线图库'], ['favorites', '我的收藏'], ['builtin', '内置场景'], ['local', '本地壁纸'], ['settings', '显示设置']]) {
      const b = button(name, () => showTab(t), 'lws-tab');
      b.setAttribute('aria-pressed', String(tab === t));
      tabs.append(b); tabButtons.push([t, b]);
    }
    function resetBrowse() { persistFilters(); page = 1; cursor = ''; cursors = ['']; resultItems = []; next = ''; committed = { page: 1, cursor: '', next: '', items: [] }; browse(); }
    sourceSelect.onchange = () => { source = sourceSelect.value; fillCategories(); resetBrowse(); };
    categorySelect.onchange = () => { category = categorySelect.value; query = ''; search.value = ''; fillCategories(); resetBrowse(); };
    searchForm.onsubmit = e => { e.preventDefault(); query = search.value.trim(); if (query) category = 'all'; fillCategories(); resetBrowse(); };

    const imports = $('details'); imports.append($('summary', '', '导入本地视频 / 视频直链')); const importBox = $('div', 'lws-import');
    const localInput = $('input'); localInput.type = 'file'; localInput.accept = 'video/mp4,video/webm,image/gif,image/png,image/jpeg,image/webp'; localInput.hidden = true;
    localInput.onchange = async () => {
      const file = localInput.files?.[0]; if (!file) return;
      if (file.path) { await importPath(file.path); return; }
      let upload;
      try {
        selectFile.disabled = true; importFeedback.textContent = '正在导入 0%…';
        upload = await ctx.backend.call('beginUpload', { name: file.name, size: file.size });
        for (let offset = 0; offset < file.size; offset += 192 * 1024) {
          const chunk = file.slice(offset, offset + 192 * 1024);
          const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('读取本地文件失败')); reader.readAsDataURL(chunk); });
          await ctx.backend.call('uploadChunk', { id: upload.id, offset, base64: data });
          importFeedback.textContent = '正在导入 ' + Math.round(Math.min(file.size, offset + chunk.size) / file.size * 100) + '%…';
        }
        const item = await ctx.backend.call('finishUpload', { id: upload.id }); locals = [...locals.filter(x => x.id !== item.id), item]; storeList(); await choose(item); importFeedback.textContent = '已保存到壁纸库，重启后仍可使用'; showTab('local');
      } catch (e) { importFeedback.textContent = '导入失败：' + e.message; if (upload) ctx.backend.call('cancelUpload', { id: upload.id }).catch(() => {}); }
      finally { selectFile.disabled = false; localInput.value = ''; }
    };
    const selectFile = button('选择视频 / GIF 文件', () => localInput.click());
    const pathInput = $('input'); pathInput.type = 'text'; pathInput.placeholder = '完整本地路径，例如 D:\\Wallpapers\\rain.mp4'; pathInput.setAttribute('aria-label', '本地壁纸完整路径');
    async function importPath(input) {
      importFeedback.textContent = '正在复制到壁纸库…';
      try { const item = await ctx.backend.call('importLocal', { path: input }, { timeout: 24000 }); locals = [...locals.filter(x => x.id !== item.id), item]; storeList(); await choose(item); importFeedback.textContent = '已导入，重启后仍可使用'; showTab('local'); }
      catch (e) { importFeedback.textContent = e.message; }
    }
    const importPathButton = button('导入并记住', () => importPath(pathInput.value));
    const urlInput = $('input'); urlInput.type = 'text'; urlInput.placeholder = 'https://…/wallpaper.mp4 或 .webm'; urlInput.setAttribute('aria-label', '自定义壁纸媒体直链');
    const urlButton = button('应用直链', async () => {
      try {
        const r = await ctx.backend.call('resolve', { url: urlInput.value.trim() });
        const ext = new URL(r.url).pathname.split('.').pop().toLowerCase();
        const item = { id: r.url, source: 'custom', title: decodeURIComponent(new URL(r.url).pathname.split('/').pop()) || '自定义壁纸', kind: ['mp4', 'webm'].includes(ext) ? 'video' : 'image', url: r.url };
        await choose(item); if (current?.id === item.id && !isFavorite(item)) toggleFavorite(item);
      } catch (e) { importFeedback.textContent = e.message; }
    });
    const importFeedback = $('div', 'lws-sub'); importFeedback.setAttribute('role', 'status');
    importBox.append(selectFile, localInput, pathInput, importPathButton, urlInput, urlButton, importFeedback);
    imports.append(importBox); ui.append(imports);

    const foot = $('div', 'lws-foot');
    foot.append($('div', '', '已接入 5 家视频源（Mixkit 提供实拍与抽象素材；其余为动态壁纸站）。搜索支持英文关键词，覆盖全站分类。MP4 / WebM 解码取决于内置浏览器支持；本地导入上限 256 MB，不转码、不压缩。'));
    for (const [label, url] of [['Mixkit ↗', 'https://mixkit.co/free-stock-video/'], ['MoeWalls ↗', 'https://moewalls.com/'], ['MotionBgs ↗', 'https://motionbgs.com/'], ['WallpaperWaifu ↗', 'https://wallpaperwaifu.com/'], ['LiveWallpapers4Free ↗', 'https://livewallpapers4free.com/']]) {
      const a = $('a', '', label); a.href = url; a.target = '_blank'; a.rel = 'noreferrer noopener'; foot.append(a);
    }
    ui.append(foot);

    let previousCurrent = '';
    function update() {
      if (!container.isConnected) { uiListeners.delete(update); return; }
      const d = mediaDiagnostics();
      diagnostic.textContent = d.text + ' · ' + d.hint;
      const panelModeText = settings.splitPanels
        ? `独立面板 ${settings.glass1}%/${settings.glass2}%/${settings.glass3}%`
        : `面板 ${settings.glass}% · 模糊 ${settings.glassBlur}px`;
      configSummary.textContent = `当前显示：${fitLabels[settings.fit] || settings.fit} · 画质 ${qualityLabels[settings.quality] || settings.quality} · 背景 ${settings.dim}%/${settings.blur}px · ${panelModeText}`;
      syncSettingsTab();
      originalLink.hidden = !current?.page; originalLink.href = current?.page || '#';
      title.textContent = current?.title || '深蓝雨幕';
      status.textContent = busy ? playback : lastError || playback;
      status.dataset.error = String(!!lastError);
      play.textContent = shouldPause() ? '播放' : '暂停';
      off.textContent = settings.enabled ? '关闭壁纸' : '开启壁纸';
      retryCurrent.hidden = !lastError;
      motionBox.hidden = !reduced();
      if (current?.thumb && thumb.dataset.original !== current.thumb) {
        thumb.dataset.original = current.thumb;
        thumbnail(current.thumb).then(src => { if (thumb.isConnected) thumb.src = src; }).catch(() => {});
      }
      thumb.hidden = !current?.thumb;
      const key = current?.id + ':' + favorites.map(x => x.id).join('|');
      if (key !== previousCurrent) {
        previousCurrent = key;
        if (tab !== 'gallery' || resultItems.length) drawGrid(tab === 'gallery' ? resultItems : tab === 'favorites' ? favorites : tab === 'local' ? locals : builtins);
      }
    }
    uiListeners.add(update); persistFilters(); update(); browse();
    const stop = ctx.setInterval(() => {
      if (!container.isConnected) { cleanupPage(); }
    }, 2000);
    function cleanupPage() {
      uiListeners.delete(update);
      request++;
      stop();
      grid.querySelectorAll('img[data-thumbnail]').forEach(i => thumbnailObserver.unobserve(i));
    }
    return cleanupPage;
  }

  ctx.listen(document, 'click', (event) => {
    if (!drawerOpen) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    if (target.closest('[data-codex-plus-ext-rail][data-codex-plus-ext*="live-wallpaper-studio"]')) return;
    if (target.closest('nav[data-app-navigation-rail] button, nav[data-app-navigation-rail] a, #codex-plus-rail-nav, #codex-plus-rail-extensions')) {
      closeDrawer();
    }
  }, true);

  ctx.registerNavEntry({
    label: '动态壁纸',
    icon,
    onActivate: () => toggleDrawer()
  });

  applyAppearance();
  if (!current || current.url?.startsWith('blob:')) current = builtins[0];
  choose(current, false);
});
