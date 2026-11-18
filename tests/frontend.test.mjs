import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function createMockDom() {
  const listeners = new Map();
  const makeStyle = () => {
    const map = new Map();
    return {
      setProperty(k, v, p = '') { map.set(k, { v: String(v), p }); },
      removeProperty(k) { map.delete(k); },
      getPropertyValue(k) { return map.get(k)?.v || ''; },
      getPropertyPriority(k) { return map.get(k)?.p || ''; },
    };
  };
  const makeNode = (tagName) => {
    const attrs = new Map();
    const node = {
      nodeType: 1,
      tagName: String(tagName).toUpperCase(),
      children: [],
      parentElement: null,
      style: makeStyle(),
      dataset: {},
      className: '',
      id: '',
      hidden: false,
      value: '',
      min: '',
      max: '',
      step: '',
      type: '',
      disabled: false,
      _textContent: '',
      isConnected: true,
      get textContent() { return this._textContent; },
      set textContent(v) { this._textContent = String(v ?? ''); },
      get nextSibling() {
        if (!this.parentElement) return null;
        const i = this.parentElement.children.indexOf(this);
        return i >= 0 ? this.parentElement.children[i + 1] || null : null;
      },
      setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') this.id = String(v); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute(k) { return attrs.has(k); },
      append(...nodes) {
        for (const n of nodes) {
          if (typeof n === 'string') continue;
          n.parentElement = this;
          this.children.push(n);
        }
      },
      prepend(...nodes) {
        for (const n of [...nodes].reverse()) {
          if (typeof n === 'string') continue;
          n.parentElement = this;
          this.children.unshift(n);
        }
      },
      replaceChildren(...nodes) {
        for (const c of this.children) c.parentElement = null;
        this.children = [];
        this.append(...nodes);
      },
      remove() {
        if (!this.parentElement) return;
        const idx = this.parentElement.children.indexOf(this);
        if (idx >= 0) this.parentElement.children.splice(idx, 1);
        this.parentElement = null;
      },
      contains(other) {
        for (let cur = other; cur; cur = cur.parentElement) if (cur === this) return true;
        return false;
      },
      getBoundingClientRect() { return { top: 44, right: 1280, bottom: 800, width: 1220, height: 756 }; },
      matches(sel) {
        return sel.split(',').map(s => s.trim()).filter(Boolean).some((part) => {
          if (part.includes('nav[data-app-navigation-rail]')) {
            return (this.tagName === 'BUTTON' || this.tagName === 'A') && Boolean(this.parentElement?.hasAttribute?.('data-mock-rail'));
          }
          let rest = part;
          const idMatch = rest.match(/#([A-Za-z0-9_-]+)/);
          if (idMatch) {
            if (this.id !== idMatch[1]) return false;
            rest = rest.replace(idMatch[0], '');
          }
          for (const attr of [...rest.matchAll(/\[([^\]=*~^$|]+)(?:([*~]?=)"([^"]*)")?\]/g)]) {
            const [, name, op, val] = attr;
            const camel = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()) : '';
            const actual = name === 'class'
              ? (this.getAttribute('class') ?? this.className ?? '')
              : (this.getAttribute(name) ?? (camel && this.dataset[camel] !== undefined ? String(this.dataset[camel]) : null));
            if (!op) { if (actual === null) return false; }
            else if (op === '=') { if (actual !== val) return false; }
            else if (op === '*=') { if (actual === null || !String(actual).includes(val)) return false; }
            else if (op === '~=') { if (actual === null || !String(actual).split(/\s+/).includes(val)) return false; }
            rest = rest.replace(attr[0], '');
          }
          for (const cls of [...rest.matchAll(/\.([A-Za-z0-9_-]+)/g)]) {
            if (!String(this.className || '').split(/\s+/).includes(cls[1])) return false;
            rest = rest.replace(cls[0], '');
          }
          const tag = rest.trim();
          if (tag && tag !== '*' && this.tagName !== tag.toUpperCase()) return false;
          return Boolean(part);
        });
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (cur.matches(sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      addEventListener(type, fn, capture = false) {
        const key = `${type}:${Boolean(capture)}`;
        if (!listeners.has(key)) listeners.set(key, []);
        listeners.get(key).push({ target: this, fn });
      },
      removeEventListener() {},
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      getContext() {
        return {
          setTransform() {}, fillRect() {}, createRadialGradient() { return { addColorStop() {} }; },
          beginPath() {}, arc() {}, fill() {}, fillText() {}, moveTo() {}, lineTo() {}, stroke() {}
        };
      },
      pause() {}, play() { return Promise.resolve(); }, load() {}, click() {}
    };
    return node;
  };
  const head = makeNode('head');
  const body = makeNode('body');
  const documentElement = makeNode('html');
  documentElement.append(head, body);
  const document = {
    head,
    body,
    documentElement,
    hidden: false,
    activeElement: null,
    createElement: makeNode,
    querySelector: sel => documentElement.querySelector(sel),
    querySelectorAll: sel => documentElement.querySelectorAll(sel),
    addEventListener(type, fn, capture = false) {
      const key = `${type}:${Boolean(capture)}`;
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push({ target: document, fn });
    },
    removeEventListener() {},
  };
  const dispatchDocClick = (target) => {
    const event = { target, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
    for (const entry of listeners.get('click:true') || []) entry.fn(event);
    return event;
  };
  return { document, makeNode, dispatchDocClick };
}

function loadRenderer({ storedSettings = {}, getComputedStyle } = {}) {
  const { document, makeNode, dispatchDocClick } = createMockDom();
  const registrations = {
    pages: [],
    settingsPanels: [],
    sidePanels: [],
    navEntries: [],
    menuItems: [],
    commands: [],
    shortcuts: [],
    configHandlers: [],
    scanHandlers: [],
    eventHandlers: new Map(),
    effects: [],
  };
  const storageMap = new Map();
  storageMap.set('settings', storedSettings);

  const ctx = {
    config: {},
    storage: {
      get(k, fallback) { return storageMap.has(k) ? storageMap.get(k) : fallback; },
      set(k, v) { storageMap.set(k, v); },
    },
    backend: {
      async call(method) {
        if (method === 'browseCatalog') return { items: [], next: '', cached: false, stale: false, partial: false, warnings: [] };
        return {};
      },
    },
    effect(fn) { registrations.effects.push(fn()); },
    onScan(fn) { registrations.scanHandlers.push(fn); },
    on(evt, fn) {
      const list = registrations.eventHandlers.get(evt) || [];
      list.push(fn);
      registrations.eventHandlers.set(evt, list);
      return () => {
        const cur = registrations.eventHandlers.get(evt);
        if (cur) registrations.eventHandlers.set(evt, cur.filter(f => f !== fn));
      };
    },
    listen(target, type, fn, opts) { target.addEventListener?.(type, fn, opts); },
    setInterval() { return () => {}; },
    setTimeout() { return () => {}; },
    toast() {},
    registerPage(def) { registrations.pages.push(def); },
    registerSettingsPanel(def) { registrations.settingsPanels.push(def); },
    registerSidePanel(def) { registrations.sidePanels.push(def); return { open() {}, close() {}, toggle() {} }; },
    registerNavEntry(def) { registrations.navEntries.push(def); },
    registerMenuItem(def) { registrations.menuItems.push(def); },
    registerCommand(def) { registrations.commands.push(def); },
    registerShortcut(def) { registrations.shortcuts.push(def); },
    onConfigUpdate(fn) { registrations.configHandlers.push(fn); },
  };

  class ElementMock {}
  const winListeners = new Map();
  const windowObj = {
    addEventListener(type, fn) {
      const list = winListeners.get(type) || [];
      list.push(fn);
      winListeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = winListeners.get(type);
      if (list) winListeners.set(type, list.filter(f => f !== fn));
    },
    dispatchEvent(ev) {
      for (const fn of winListeners.get(ev.type) || []) fn(ev);
    },
  };
  const sandbox = {
    document,
    Element: ElementMock,
    window: windowObj,
    innerWidth: 1380,
    innerHeight: 880,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    ...(getComputedStyle ? { getComputedStyle } : {}),
    performance: { now: () => 0 },
    URL,
    Blob,
    setTimeout,
    clearTimeout,
    codexPlus: {
      extension(factory) { factory(ctx); }
    }
  };
  vm.runInNewContext(read('renderer.js'), sandbox, { filename: 'renderer.js' });
  return { document, window: windowObj, makeNode, dispatchDocClick, registrations, ctx, storageMap, ElementMock };
}

test('manifest keeps configuration unified inside extension with branded name, description, and icon', () => {
  const manifest = JSON.parse(read('codexpp.json'));
  assert.equal(manifest.id, 'live-wallpaper-studio');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.author, 'caprimoon');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository, 'https://github.com/caprimoon/codexpp-live-canvas');
  assert.equal(manifest.name, 'LiveCanvas · 动态壁纸与毛玻璃');
  assert.equal(manifest.icon, 'assets/icon.svg');
  assert.match(manifest.description, /毛玻璃/);
  assert.equal(manifest.config, undefined);
  assert.equal(manifest.settings, undefined);
  assert.equal(fs.existsSync(path.join(root, 'settings.html')), false);
  const iconSvg = read('assets/icon.svg');
  assert.match(iconSvg, /<svg[^>]*viewBox="0 0 128 128"/);
});

test('renderer registers only navEntry (no top-right sidePanel) and clears native top-fade CSS', () => {
  const { registrations, document } = loadRenderer();
  assert.equal(registrations.sidePanels.length, 0);
  assert.equal(registrations.pages.length, 0);
  assert.equal(registrations.menuItems.length, 0);
  assert.equal(registrations.commands.length, 0);
  assert.equal(registrations.shortcuts.length, 0);
  assert.equal(registrations.settingsPanels.length, 0);
  assert.equal(registrations.navEntries.length, 1);

  const styleText = document.head.children[0].textContent;
  assert.match(styleText, /#lws-media>\*\{[^}]*object-fit:var\(--lws-fit,cover\)!important/);
  assert.match(styleText, /html\[data-lws-drawer="open"\] main\[data-app-shell-main-surface\]\{margin-right:var\(--lws-drawer-width,440px\)!important\}/);
  assert.match(styleText, /\[data-app-shell-main-content-top-fade\]::before/);
  assert.match(styleText, /@layer theme\{[\s\S]*from-token-/);
  assert.match(styleText, /@layer theme\{[\s\S]*\[data-sticky\][^}]*backdrop-filter:none!important/);
  assert.match(styleText, /@layer theme\{[\s\S]*\[data-local-conversation-final-assistant="true"\][^}]*backdrop-filter:blur\(var\(--lws-glass-blur-2,12px\)\)!important/);
  assert.match(styleText, /@layer theme\{[\s\S]*\[data-composer-surface-variant\]/);
  const afterTheme = styleText.split(/@layer theme\{[\s\S]*?\n\s{6}\}/)[1] || '';
  assert.match(afterTheme, /\[data-local-conversation-final-assistant="true"\]\{border:1px solid rgba\(200,221,240,\.14\)!important;border-radius:18px!important;padding:18px!important\}/);
});

test('left rail navEntry toggles 1/3 right drawer open/closed and clears highlight on close or navigation', () => {
  const { document, makeNode, dispatchDocClick, registrations, ElementMock } = loadRenderer();
  const railWrapper = makeNode('div');
  railWrapper.setAttribute('data-codex-plus-ext-rail', 'user:live-wallpaper-studio:navEntry:1');
  railWrapper.setAttribute('data-codex-plus-ext', 'user:live-wallpaper-studio');
  const railBtn = makeNode('button');
  railWrapper.append(railBtn);
  const otherNav = makeNode('nav');
  otherNav.setAttribute('data-mock-rail', 'true');
  const otherBtn = makeNode('button');
  Object.setPrototypeOf(otherBtn, ElementMock.prototype);
  otherNav.append(otherBtn);
  document.body.append(railWrapper, otherNav);

  // First click opens 1/3 right drawer and highlights left rail button.
  registrations.navEntries[0].onActivate();
  assert.equal(document.documentElement.getAttribute('data-lws-drawer'), 'open');
  assert.equal(document.documentElement.style.getPropertyValue('--lws-drawer-width'), '460px');
  assert(document.querySelector('#lws-drawer'));
  assert.equal(railWrapper.getAttribute('data-codex-plus-ext-rail-active'), 'true');
  assert.equal(railBtn.dataset.active, 'true');
  assert.equal(railBtn.hasAttribute('data-selected'), true);
  assert.equal(railBtn.getAttribute('aria-current'), 'page');

  // Second click toggles drawer closed and turns off rail highlight.
  registrations.navEntries[0].onActivate();
  assert.equal(document.documentElement.hasAttribute('data-lws-drawer'), false);
  assert.equal(document.querySelector('#lws-drawer'), null);
  assert.equal(railWrapper.hasAttribute('data-codex-plus-ext-rail-active'), false);
  assert.equal(railBtn.dataset.active, 'false');
  assert.equal(railBtn.hasAttribute('data-selected'), false);
  assert.equal(railBtn.hasAttribute('aria-current'), false);

  // Re-open, then click another rail icon -> drawer closes cleanly and dims icon.
  registrations.navEntries[0].onActivate();
  assert.equal(document.documentElement.getAttribute('data-lws-drawer'), 'open');
  dispatchDocClick(otherBtn);
  assert.equal(document.documentElement.hasAttribute('data-lws-drawer'), false);
  assert.equal(railBtn.dataset.active, 'false');
});

test('unified 显示设置 tab inside 1/3 drawer renders sliders, descriptions, and updates CSS live', () => {
  const { document, registrations, storageMap } = loadRenderer();
  registrations.navEntries[0].onActivate();
  const drawer = document.querySelector('#lws-drawer');
  assert(drawer);

  const tabBtns = drawer.querySelectorAll('.lws-tab');
  assert.deepEqual(tabBtns.map(b => b.textContent), ['在线图库', '我的收藏', '内置场景', '本地壁纸', '显示设置']);

  const settingsTabBtn = tabBtns.find(b => b.textContent === '显示设置');
  settingsTabBtn.onclick();

  const settingsContainer = drawer.children[1].children[0].children.find(n => n.id === 'lws-settings-tab');
  assert.equal(settingsContainer.hidden, false);

  const allInputs = settingsContainer.querySelectorAll('input');
  const rangeInputs = allInputs.filter(i => i.type === 'range');
  const colorInputs = allInputs.filter(i => i.type === 'color');
  const textInputs = allInputs.filter(i => i.type === 'text');
  assert.equal(rangeInputs.length, 12);
  assert.equal(colorInputs.length, 3);
  assert.equal(textInputs.length, 0);
  const descs = settingsContainer.querySelectorAll('.lws-settings-desc');
  assert.equal(descs.length, 23);
  for (const d of descs) assert(d.textContent.length > 8);
  assert.equal(colorInputs.find(i => i.dataset.setting === 'color1').value, '#232323');
  assert.equal(colorInputs.find(i => i.dataset.setting === 'color2').value, '#232323');
  assert.equal(colorInputs.find(i => i.dataset.setting === 'color3').value, '#4a4a4a');

  const dimSlider = rangeInputs.find(i => i.dataset.setting === 'dim');
  dimSlider.value = '18';
  dimSlider.oninput();
  assert.equal(document.documentElement.style.getPropertyValue('--lws-dim'), '0.18');
  assert.equal(storageMap.get('settings').dim, 18);

  const fitSelect = settingsContainer.querySelectorAll('select').find(s => s.dataset.setting === 'fit');
  fitSelect.value = JSON.stringify('contain');
  fitSelect.onchange();
  assert.equal(document.documentElement.style.getPropertyValue('--lws-fit'), 'contain');

  const focalRow = settingsContainer.querySelectorAll('.lws-settings-row').find(r => r.querySelectorAll('input').some(i => i.dataset.setting === 'focalX'));
  assert.equal(focalRow.hidden, true);

  const resetBtn = settingsContainer.querySelectorAll('button').find(b => b.textContent === '恢复默认设置');
  resetBtn.onclick();
  assert.equal(document.documentElement.style.getPropertyValue('--lws-fit'), 'cover');
  assert.equal(document.documentElement.style.getPropertyValue('--lws-dim'), '0.3');
  assert.equal(document.documentElement.style.getPropertyValue('--lws-glass'), '0.5');
  assert.equal(document.documentElement.style.getPropertyValue('--lws-glass-blur'), '12px');
  assert.equal(focalRow.hidden, false);
});

test('panel glass (0-100% opaque) and glassBlur apply across sidebar, messages, and modern composer and restore cleanly', () => {
  const { document, makeNode, registrations } = loadRenderer();

  // Mount Areas 1 (sidebar), 2 (assistant turn & user bubble), and 3 (thread + home composers).
  const root = makeNode('div');
  root.id = 'root';

  const sidebar = makeNode('aside');
  sidebar.setAttribute('data-app-shell-left-panel-appearance', 'true');

  const assistantCard = makeNode('div');
  assistantCard.setAttribute('data-local-conversation-final-assistant', 'true');
  assistantCard.style.setProperty('backdrop-filter', 'saturate(1.1)');

  const userBubble = makeNode('div');
  userBubble.setAttribute('data-user-message-bubble', 'true');

  const composerRoot = makeNode('div');
  composerRoot.setAttribute('data-codex-composer-root', 'true');
  const threadComposer = makeNode('div');
  threadComposer.setAttribute('data-composer-surface-variant', 'default');
  const nestedInnerComposer = makeNode('div');
  nestedInnerComposer.setAttribute('data-ds-part', 'composer');
  threadComposer.append(nestedInnerComposer);
  composerRoot.append(threadComposer);

  const homeComposerWrapper = makeNode('div');
  homeComposerWrapper.setAttribute('data-composer-surface-variant', 'home');
  homeComposerWrapper.setAttribute('data-composer-utility-bar-variant', 'home');
  const homeUtilityBar = makeNode('div');
  homeUtilityBar.className = '_homeUtilityBar_abc';
  const homeComposerBody = makeNode('div');
  homeComposerBody.className = '_ComposerLayoutBody_abc';
  homeComposerWrapper.append(homeUtilityBar, homeComposerBody);

  root.append(sidebar, assistantCard, userBubble, composerRoot, homeComposerWrapper);
  document.body.append(root);

  registrations.navEntries[0].onActivate();
  const drawer = document.querySelector('#lws-drawer');
  drawer.querySelectorAll('.lws-tab').find(b => b.textContent === '显示设置').onclick();
  const settingsContainer = drawer.children[1].children[0].children.find(n => n.id === 'lws-settings-tab');
  const rangeInputs = settingsContainer.querySelectorAll('input').filter(i => i.type === 'range');
  const glassInput = rangeInputs.find(i => i.dataset.setting === 'glass');
  const glassBlurInput = rangeInputs.find(i => i.dataset.setting === 'glassBlur');

  assert.equal(glassInput.min, '0');
  assert.equal(glassInput.max, '100');

  // At 100%, all three areas reach alpha 1.000 (completely opaque) with active backdrop blur.
  glassInput.value = '100';
  glassInput.oninput();
  glassBlurInput.value = '12';
  glassBlurInput.oninput();

  assert.equal(document.documentElement.style.getPropertyValue('--lws-glass'), '1');
  assert.equal(document.documentElement.style.getPropertyValue('--lws-glass-blur'), '12px');

  for (const [node, expectedBg] of [
    [sidebar, 'rgba(35,35,35,1.000)'],
    [assistantCard, 'rgba(35,35,35,1.000)'],
    [userBubble, 'rgba(66,66,66,1.000)'],
    [threadComposer, 'rgba(74,74,74,1.000)'],
    [homeComposerBody, 'rgba(74,74,74,1.000)'],
    [homeUtilityBar, 'rgba(74,74,74,1.000)'],
  ]) {
    assert.equal(node.style.getPropertyValue('background-color'), expectedBg);
    assert.equal(node.style.getPropertyPriority('background-color'), 'important');
    assert.equal(node.style.getPropertyValue('backdrop-filter'), 'blur(12px)');
    assert.equal(node.style.getPropertyPriority('backdrop-filter'), 'important');
  }
  // Inner composer child and outer home wrapper stay un-painted to avoid double stacking.
  assert.equal(nestedInnerComposer.style.getPropertyValue('background-color'), '');
  assert.equal(homeComposerWrapper.style.getPropertyValue('background-color'), '');

  // At 0% opacity and 0px blur, alpha is 0.000 and backdrop-filter is none across all three areas.
  glassInput.value = '0';
  glassInput.oninput();
  glassBlurInput.value = '0';
  glassBlurInput.oninput();

  assert.equal(sidebar.style.getPropertyValue('background-color'), 'rgba(35,35,35,0.000)');
  assert.equal(assistantCard.style.getPropertyValue('background-color'), 'rgba(35,35,35,0.000)');
  assert.equal(threadComposer.style.getPropertyValue('background-color'), 'rgba(74,74,74,0.000)');
  assert.equal(assistantCard.style.getPropertyValue('backdrop-filter'), 'none');
  assert.equal(threadComposer.style.getPropertyValue('backdrop-filter'), 'none');

  // Disabling wallpaper restores prior inline styles cleanly.
  const toggleBtn = drawer.querySelectorAll('button').find(b => b.textContent === '关闭壁纸');
  toggleBtn.onclick();
  assert.equal(assistantCard.style.getPropertyValue('backdrop-filter'), 'saturate(1.1)');
  assert.equal(assistantCard.style.getPropertyValue('background-color'), '');
  assert.equal(threadComposer.style.getPropertyValue('backdrop-filter'), '');
  assert.equal(threadComposer.style.getPropertyValue('background-color'), '');
});

test('top chrome scanner clears sticky grey headers and scroll fades while sparing content cards', () => {
  const styles = new Map();
  const baseStyle = (over = {}) => ({
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    boxShadow: 'none',
    backdropFilter: 'none',
    webkitBackdropFilter: 'none',
    borderTopWidth: '0px',
    borderBottomWidth: '0px',
    borderRadius: '0px',
    height: 'auto',
    content: 'none',
    ...over,
  });
  const getComputedStyle = (el, pseudo) => styles.get(`${el._key || ''}:${pseudo || ''}`) || baseStyle();
  const { document, makeNode, registrations } = loadRenderer({ getComputedStyle });

  const main = makeNode('main');
  main._key = 'main';
  main.setAttribute('data-app-shell-main-surface', 'true');
  main.getBoundingClientRect = () => ({ top: 32, left: 240, width: 1000, height: 800, bottom: 832 });

  const settingsHeaderBar = makeNode('div');
  settingsHeaderBar._key = 'settingsHeader';
  settingsHeaderBar.getBoundingClientRect = () => ({ top: 32, left: 240, width: 1000, height: 24, bottom: 56 });
  styles.set('settingsHeader:', baseStyle({ backgroundColor: 'rgba(30, 34, 42, 0.4)', backdropFilter: 'blur(8px)', borderBottomWidth: '1px', borderBottomColor: 'rgba(255,255,255,0.1)' }));

  const scrollFadeBand = makeNode('div');
  scrollFadeBand._key = 'scrollFade';
  scrollFadeBand.getBoundingClientRect = () => ({ top: 68, left: 240, width: 980, height: 28, bottom: 96 });
  styles.set('scrollFade:', baseStyle({ backgroundImage: 'linear-gradient(to bottom, #000, transparent)' }));

  const scrollerWrapper = makeNode('div');
  scrollerWrapper._key = 'scroller';
  scrollerWrapper.getBoundingClientRect = () => ({ top: 32, left: 240, width: 1000, height: 760, bottom: 792 });
  styles.set('scroller:::after', baseStyle({ content: '""', height: '28px', backgroundImage: 'linear-gradient(to bottom, #000, transparent)' }));

  const settingsCard = makeNode('div');
  settingsCard._key = 'settingsCard';
  settingsCard.className = 'rounded-2xl border';
  settingsCard.getBoundingClientRect = () => ({ top: 60, left: 320, width: 800, height: 64, bottom: 124 });
  styles.set('settingsCard:', baseStyle({ backgroundColor: 'rgb(28, 30, 36)', borderRadius: '16px' }));

  const assistantCard = makeNode('div');
  assistantCard._key = 'assistantCard';
  assistantCard.setAttribute('data-local-conversation-final-assistant', 'true');
  assistantCard.getBoundingClientRect = () => ({ top: 70, left: 320, width: 800, height: 60, bottom: 130 });
  styles.set('assistantCard:', baseStyle({ backgroundColor: 'rgba(12, 18, 26, 0.62)', borderRadius: '18px' }));

  main.append(settingsHeaderBar, scrollFadeBand, scrollerWrapper, settingsCard, assistantCard);
  document.body.append(main);

  registrations.scanHandlers[0]();
  assert.equal(settingsHeaderBar.getAttribute('data-lws-top-clear'), 'true');
  assert.equal(scrollFadeBand.getAttribute('data-lws-top-clear'), 'true');
  assert.equal(scrollerWrapper.getAttribute('data-lws-pseudo-clear'), 'true');
  assert.equal(settingsCard.hasAttribute('data-lws-top-clear'), false);
  assert.equal(assistantCard.hasAttribute('data-lws-top-clear'), false);

  registrations.navEntries[0].onActivate();
  const drawer = document.querySelector('#lws-drawer');
  drawer.querySelectorAll('button').find(b => b.textContent === '关闭壁纸').onclick();
  assert.equal(settingsHeaderBar.hasAttribute('data-lws-top-clear'), false);
  assert.equal(scrollFadeBand.hasAttribute('data-lws-top-clear'), false);
  assert.equal(scrollerWrapper.hasAttribute('data-lws-pseudo-clear'), false);
});

test('color pickers (default #232323/#232323/#4a4a4a) and splitPanels switch customize 1/2/3 independently', () => {
  const { document, makeNode, registrations } = loadRenderer();
  const sidebar = makeNode('aside');
  sidebar.setAttribute('data-app-shell-left-panel-appearance', 'true');
  const assistantCard = makeNode('div');
  assistantCard.setAttribute('data-local-conversation-final-assistant', 'true');
  const userBubble = makeNode('div');
  userBubble.setAttribute('data-user-message-bubble', 'true');
  const composer = makeNode('div');
  composer.setAttribute('data-composer-surface-variant', 'default');
  document.body.append(sidebar, assistantCard, userBubble, composer);

  registrations.navEntries[0].onActivate();
  const drawer = document.querySelector('#lws-drawer');
  drawer.querySelectorAll('.lws-tab').find(b => b.textContent === '显示设置').onclick();
  const settingsContainer = drawer.children[1].children[0].children.find(n => n.id === 'lws-settings-tab');
  const rangeInputs = settingsContainer.querySelectorAll('input').filter(i => i.type === 'range');
  const colorInputs = settingsContainer.querySelectorAll('input').filter(i => i.type === 'color');
  const splitToggle = settingsContainer.querySelectorAll('button').find(b => b.dataset.setting === 'splitPanels');
  const rowOf = (key) => settingsContainer.querySelectorAll('.lws-settings-row').find(r => r.querySelectorAll('input').some(i => i.dataset.setting === key));

  assert.equal(rowOf('glass').hidden, false);
  assert.equal(rowOf('glass1').hidden, true);
  assert.equal(rowOf('glass2').hidden, true);
  assert.equal(rowOf('glass3').hidden, true);

  // Composer defaults to #4A4A4A at 50% mask and 12px blur before touching controls.
  registrations.scanHandlers[0]();
  assert.equal(composer.style.getPropertyValue('background-color'), 'rgba(74,74,74,0.500)');
  assert.equal(composer.style.getPropertyValue('backdrop-filter'), 'blur(12px)');

  // Adjust unified glass before splitting; toggling splitPanels starts all three zones at that value.
  const unifiedGlass = rangeInputs.find(i => i.dataset.setting === 'glass');
  unifiedGlass.value = '80';
  unifiedGlass.oninput();
  assert.equal(sidebar.style.getPropertyValue('background-color'), 'rgba(35,35,35,0.800)');

  splitToggle.onclick();
  assert.equal(rowOf('glass').hidden, true);
  assert.equal(rowOf('glassBlur').hidden, true);
  assert.equal(rowOf('glass1').hidden, false);
  assert.equal(rowOf('glass2').hidden, false);
  assert.equal(rowOf('glass3').hidden, false);
  assert.equal(rangeInputs.find(i => i.dataset.setting === 'glass1').value, '80');

  // Customize each zone's color picker, opacity, and blur independently.
  const c1 = colorInputs.find(i => i.dataset.setting === 'color1');
  const c2 = colorInputs.find(i => i.dataset.setting === 'color2');
  const c3 = colorInputs.find(i => i.dataset.setting === 'color3');
  c1.value = '#102030'; c1.oninput();
  c2.value = '#201020'; c2.oninput();
  c3.value = '#111111'; c3.oninput();

  const g1 = rangeInputs.find(i => i.dataset.setting === 'glass1');
  const g2 = rangeInputs.find(i => i.dataset.setting === 'glass2');
  const g3 = rangeInputs.find(i => i.dataset.setting === 'glass3');
  const b1 = rangeInputs.find(i => i.dataset.setting === 'glassBlur1');
  const b2 = rangeInputs.find(i => i.dataset.setting === 'glassBlur2');
  const b3 = rangeInputs.find(i => i.dataset.setting === 'glassBlur3');
  g1.value = '30'; g1.oninput(); b1.value = '4'; b1.oninput();
  g2.value = '100'; g2.oninput(); b2.value = '0'; b2.oninput();
  g3.value = '90'; g3.oninput(); b3.value = '16'; b3.oninput();

  assert.equal(sidebar.style.getPropertyValue('background-color'), 'rgba(16,32,48,0.300)');
  assert.equal(sidebar.style.getPropertyValue('backdrop-filter'), 'blur(4px)');
  assert.equal(assistantCard.style.getPropertyValue('background-color'), 'rgba(32,16,32,1.000)');
  assert.equal(assistantCard.style.getPropertyValue('backdrop-filter'), 'none');
  // User bubble contrasts slightly from zone 2's chosen color while matching zone 2's opacity/blur.
  assert.notEqual(userBubble.style.getPropertyValue('background-color'), assistantCard.style.getPropertyValue('background-color'));
  assert(userBubble.style.getPropertyValue('background-color').endsWith(',1.000)'));
  assert.equal(composer.style.getPropertyValue('background-color'), 'rgba(17,17,17,0.900)');
  assert.equal(composer.style.getPropertyValue('backdrop-filter'), 'blur(16px)');

  // Reset restores defaults including #4a4a4a composer, 50% opacity, 12px blur, and unified mode.
  settingsContainer.querySelectorAll('button').find(b => b.textContent === '恢复默认设置').onclick();
  assert.equal(rowOf('glass').hidden, false);
  assert.equal(rowOf('glass1').hidden, true);
  assert.equal(composer.style.getPropertyValue('background-color'), 'rgba(74,74,74,0.500)');
  assert.equal(composer.style.getPropertyValue('backdrop-filter'), 'blur(12px)');
  assert.equal(c1.value, '#232323');
  assert.equal(c2.value, '#232323');
  assert.equal(c3.value, '#4a4a4a');
});

test('pauseOnTask pauses live wallpaper during active turn and resumes after completion or toggle off', () => {
  const { document, makeNode, registrations, storageMap } = loadRenderer();
  const layer = document.querySelector('#lws-background');
  const composer = makeNode('div');
  composer.setAttribute('data-composer-surface-variant', 'default');
  document.body.append(composer);
  registrations.scanHandlers[0]();

  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');
  for (const fn of registrations.eventHandlers.get('codex/turn/started') || []) {
    fn({ threadId: 'thr-1', turn: { id: 'turn-1' } });
  }
  assert.equal(layer.dataset.playback, '任务运行中，已暂停动态壁纸');
  // Glassmorphism remains active even while live playback is paused during a task.
  assert.equal(composer.style.getPropertyValue('backdrop-filter'), 'blur(12px)');

  for (const fn of registrations.eventHandlers.get('codex/turn/completed') || []) {
    fn({ threadId: 'thr-1', turn: { id: 'turn-1' } });
  }
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  // Re-trigger active turn then disable pauseOnTask switch in settings drawer.
  for (const fn of registrations.eventHandlers.get('codex/turn/started') || []) {
    fn({ threadId: 'thr-2', turn: { id: 'turn-2' } });
  }
  assert.equal(layer.dataset.playback, '任务运行中，已暂停动态壁纸');

  registrations.navEntries[0].onActivate();
  const drawer = document.querySelector('#lws-drawer');
  const pauseOnTaskToggle = drawer.querySelectorAll('[data-setting="pauseOnTask"]').find(n => n.getAttribute('role') === 'switch');
  assert(pauseOnTaskToggle);
  assert.equal(pauseOnTaskToggle.getAttribute('aria-checked'), 'true');
  pauseOnTaskToggle.onclick();

  assert.equal(storageMap.get('settings').pauseOnTask, false);
  assert.equal(pauseOnTaskToggle.getAttribute('aria-checked'), 'false');
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');
});

test('scanTopChrome skips deep thread subtrees and respects disabled wallpaper early exit', () => {
  const styles = new Map();
  const baseStyle = (overrides = {}) => ({
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    boxShadow: 'none',
    backdropFilter: 'none',
    webkitBackdropFilter: 'none',
    borderTopWidth: '0px',
    borderTopColor: 'rgba(0, 0, 0, 0)',
    borderBottomWidth: '0px',
    borderBottomColor: 'rgba(0, 0, 0, 0)',
    borderRadius: '0px',
    height: 'auto',
    content: 'none',
    ...overrides,
  });
  const getComputedStyle = (el, pseudo = '') => styles.get((el._key || el.tagName) + ':' + pseudo) || baseStyle();
  const { document, makeNode, registrations } = loadRenderer({ getComputedStyle });

  const main = makeNode('main');
  main.setAttribute('data-app-shell-main-surface', 'true');
  main.getBoundingClientRect = () => ({ top: 32, left: 240, width: 1000, height: 800, bottom: 832 });

  const thread = makeNode('div');
  thread.setAttribute('data-ds-part', 'thread');
  thread.getBoundingClientRect = () => ({ top: 32, left: 240, width: 1000, height: 760, bottom: 792 });

  let threadChildRectCalls = 0;
  const threadBanner = makeNode('div');
  threadBanner._key = 'threadBanner';
  threadBanner.getBoundingClientRect = () => {
    threadChildRectCalls += 1;
    return { top: 36, left: 240, width: 900, height: 40, bottom: 76 };
  };
  styles.set('threadBanner:', baseStyle({ backgroundColor: 'rgb(20, 20, 20)' }));

  thread.append(threadBanner);
  main.append(thread);
  document.body.append(main);

  registrations.scanHandlers[0]();
  assert.equal(threadChildRectCalls, 0);
  assert.equal(threadBanner.hasAttribute('data-lws-top-clear'), false);

  // Disabling wallpaper restores overrides and prevents onScan from re-applying glass.
  const assistant = makeNode('div');
  assistant.setAttribute('data-local-conversation-final-assistant', 'true');
  document.body.append(assistant);
  registrations.navEntries[0].onActivate();
  const drawer = document.querySelector('#lws-drawer');
  drawer.querySelectorAll('button').find(b => b.textContent === '关闭壁纸').onclick();
  assert.equal(assistant.style.getPropertyValue('backdrop-filter'), '');
});

test('pauseOnTask detects running tasks via composer Stop/Queue button, sidebar spinner, agent/status, and mcp-notification', () => {
  const { document, window, makeNode, registrations } = loadRenderer();
  const layer = document.querySelector('#lws-background');

  const composerRoot = makeNode('div');
  composerRoot.setAttribute('data-codex-composer-root', 'true');
  const actionBtn = makeNode('button');
  actionBtn.className = 'bg-composer-primary';
  actionBtn.setAttribute('aria-label', '开启语音聊天');
  composerRoot.append(actionBtn);

  const sidebar = makeNode('aside');
  sidebar.setAttribute('data-app-shell-left-panel-appearance', 'true');
  const threadRow = makeNode('div');
  threadRow.setAttribute('data-app-action-sidebar-thread-id', 'thr-bg');
  sidebar.append(threadRow);
  document.body.append(sidebar, composerRoot);

  registrations.scanHandlers[0]();
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  // 1. Composer button flips to Chinese "停止" -> pauses immediately.
  actionBtn.setAttribute('aria-label', '停止');
  registrations.scanHandlers[0]();
  assert.equal(layer.dataset.playback, '任务运行中，已暂停动态壁纸');

  // 2. Manual "播放" mid-task resumes current turn cleanly, then idle resets override for the next task.
  registrations.navEntries[0].onActivate();
  const drawer = document.querySelector('#lws-drawer');
  const playBtn = drawer.querySelectorAll('button').find(b => b.dataset.action === 'playback');
  assert.equal(playBtn.textContent, '播放');
  playBtn.onclick();
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  actionBtn.setAttribute('aria-label', '开启语音聊天');
  registrations.scanHandlers[0]();
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  // Next task with lone square <rect> icon and no stop aria-label pauses again.
  actionBtn.setAttribute('aria-label', '');
  const svg = makeNode('svg');
  const rect = makeNode('rect');
  svg.append(rect);
  actionBtn.append(svg);
  registrations.scanHandlers[0]();
  assert.equal(layer.dataset.playback, '任务运行中，已暂停动态壁纸');

  // Back to idle via Send button.
  actionBtn.replaceChildren();
  actionBtn.setAttribute('aria-label', '发送');
  registrations.scanHandlers[0]();
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  // 3. Background thread spinner in sidebar pauses even when current composer is idle.
  const spin = makeNode('span');
  spin.className = 'animate-spin';
  threadRow.append(spin);
  registrations.scanHandlers[0]();
  assert.equal(layer.dataset.playback, '任务运行中，已暂停动态壁纸');
  spin.remove();
  registrations.scanHandlers[0]();
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  // 4. Codex++ agent/status (for Codex 26.1111+ where codex/turn/started dispatcher is absent).
  assert.equal(registrations.eventHandlers.get('agent/status')?.length, 1);
  for (const fn of registrations.eventHandlers.get('agent/status')) fn({ sessionId: 'sess-1', status: 'running' });
  assert.equal(layer.dataset.playback, '任务运行中，已暂停动态壁纸');
  for (const fn of registrations.eventHandlers.get('agent/status')) fn({ sessionId: 'sess-1', status: 'idle' });
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  // 5. Electron native window mcp-notification channel.
  window.dispatchEvent({
    type: 'message',
    source: null,
    origin: '',
    data: { type: 'mcp-notification', hostId: 'local', message: { method: 'turn/started', params: { threadId: 'thr-msg' } } },
  });
  assert.equal(layer.dataset.playback, '任务运行中，已暂停动态壁纸');
  window.dispatchEvent({
    type: 'message',
    source: null,
    origin: '',
    data: { type: 'mcp-notification', hostId: 'local', message: { method: 'turn/completed', params: { threadId: 'thr-msg' } } },
  });
  assert.equal(layer.dataset.playback, '内置动态场景 · 低负载');

  // 6. Disabling pauseOnTask switch unsubscribes agent/status watcher cleanly.
  const pauseOnTaskToggle = drawer.querySelectorAll('[data-setting="pauseOnTask"]').find(n => n.getAttribute('role') === 'switch');
  pauseOnTaskToggle.onclick();
  assert.equal(registrations.eventHandlers.get('agent/status')?.length, 0);
});
