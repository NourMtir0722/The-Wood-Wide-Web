/* The Wood Wide Web — game UI
 * Title menu, quest journal, lore meter, codex markers and toasts. The 3D world lives in
 * engine.js; everything here keeps working (minus the 3D) if the engine can't start.
 */
(() => {
  'use strict';

  // ===========================================================================
  // 1. Content & camera choreography
  // ===========================================================================
  const ORGANISM_INFO = {
    fir: {
      title: 'Elder Fir',
      tag: 'Mother hub tree',
      what: 'A towering sunlit evergreen wired into dozens of neighbors through deep roots and fungi.',
      gives: 'Up to 30% of its sunlit carbon sugar into the fungal network',
      gets: 'Deep rock water, phosphorus and nitrogen delivered to its root tips'
    },
    sapling: {
      title: 'Shaded Sapling',
      tag: 'Baby tree',
      what: 'A tiny evergreen growing under thick canopy shade where scarce sunbeams reach.',
      gives: 'A future sunlit partner for the fungal web once it grows tall',
      gets: 'Life-saving sugar and minerals routed through shared fungal bridges'
    },
    birch: {
      title: 'Paper Birch',
      tag: 'Neighbor tree',
      what: 'A completely different species — yet it shares the very same underground web.',
      gives: 'Summer leaf-sugar surpluses into the shared fungal grid',
      gets: 'Early caterpillar-attack warnings and deep rock nutrients'
    },
    mycelium: {
      title: 'Mycelium Web',
      tag: 'The network itself',
      what: 'Miles of living filaments 50× finer than hair. Forest mushrooms are only its seasonal fruit.',
      gives: 'Minerals dissolved out of microscopic rock cracks roots cannot enter',
      gets: 'Sweet tree sugar — fungi have no green leaves to make their own'
    },
    ghost: {
      title: 'Ghost Pipe',
      tag: 'The bandit',
      what: 'An eerie, waxy white forest plant with zero chlorophyll — a clever underground hacker.',
      gives: 'Nothing at all — it never photosynthesizes',
      gets: 'Free tree sugar siphoned straight out of living fungal threads'
    }
  };

  const LORE_NAMES = {
    'step-0': 'Leaves & Rocks',
    'step-1': 'The Underground Pact',
    'step-2': 'Kinship Network',
    'step-3': 'Whispering Wires',
    'step-4': 'The Ghost Bandit',
    'pin-fir': 'Elder Fir',
    'pin-sapling': 'Shaded Sapling',
    'pin-birch': 'Paper Birch',
    'pin-mycelium': 'Mycelium Web',
    'pin-ghost': 'Ghost Pipe'
  };

  const RANKS = [
    [10, 'Forest Whisperer'],
    [7, 'Mycelium Seer'],
    [4, 'Root Ranger'],
    [0, 'Sprout Scout']
  ];

  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

  // yaw, pitch, distance, look-at target, lens FOV
  const STEP_CAMERAS = [
    { yaw: 0.11, pitch: 0.14, dist: 12.0, target: [0.0, -0.22, 0.0], fov: 35 },
    { yaw: -0.3, pitch: -0.05, dist: 6.1, target: [-1.22, -1.52, 0.42], fov: 28 },
    { yaw: 0.15, pitch: 0.1, dist: 7.9, target: [-0.2, -0.38, 0.22], fov: 32 },
    { yaw: -0.15, pitch: 0.17, dist: 11.1, target: [0.05, -0.18, 0.0], fov: 37 },
    { yaw: 0.54, pitch: 0.12, dist: 6.5, target: [2.52, -0.28, 0.7], fov: 29 }
  ];

  const NAMED_CAMERAS = {
    cutaway: STEP_CAMERAS[0],
    underground: { yaw: -0.2, pitch: -0.14, dist: 7.6, target: [0.0, -1.68, 0.0], fov: 33 },
    top: { yaw: 0.24, pitch: 0.76, dist: 12.2, target: [0.0, 0.25, 0.0], fov: 36 },
    ghost: STEP_CAMERAS[4]
  };

  const TITLE_POSE = { yaw: 0.3, pitch: 0.15, dist: 12.4, target: [0.15, -0.15, 0.0], fov: 35 };

  // ===========================================================================
  // 2. DOM
  // ===========================================================================
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = matchMedia('(max-width: 760px)');

  const game = $('#game');
  const canvas = $('#world');
  const titleScreen = $('#title-screen');
  const menuMain = $('#menu-main');
  const menuChapters = $('#menu-chapters');
  const hudTop = $('#hud-top');
  const hudBottom = $('#hud-bottom');
  const journal = $('#journal');
  const journalBody = $('#journal-body');
  const journalToggle = $('#journal-toggle');
  const pinsLayer = $('#pins');
  const pins = $$('.pin');
  const tabs = $$('.chapter-path [role="tab"]');
  const panels = $$('.panels [role="tabpanel"]');
  const chapterPath = $('.chapter-path');
  const stepCounter = $('#step-counter');
  const prevBtn = $('#prev-step-btn');
  const nextBtn = $('#next-step-btn');
  const timeBtn = $('#time-toggle');
  const timeLabel = $('#time-label');
  const sfxBtns = $$('#sfx-toggle, #title-sfx-toggle');
  const motionBtn = $('#motion-toggle');
  const sockets = $$('#rune-sockets li');
  const loreCount = $('#lore-count');
  const loreRank = $('#lore-rank');
  const loreProgress = $('#lore-progress');
  const toasts = $('#toasts');
  const liveStatus = $('#sim-live-status');
  const viewBtns = $$('.view-btn[data-cam]');
  const xrayBtn = $('#soil-xray-btn');
  const codex = $('#codex');
  const closeup = $('#closeup-dialog');
  const lensBtn = $('#dialog-lighting-btn');
  const lensDay = $('#closeup-img-day');
  const lensNight = $('#closeup-img-night');
  const slider = $('#sunlight-slider');
  const sliderOut = $('#sunlight-readout');
  const engineStatus = $('#engine-status');

  const state = {
    screen: 'title',
    step: 0,
    started: false,
    night: true,
    paused: false,
    journalOpen: true,
    discovered: new Set(),
    layout: { W: 0, H: 0, hudH: 0, bottomH: 0, journal: null }
  };

  let engine = null;
  const sfx = typeof window.createForestSfx === 'function' ? window.createForestSfx() : null;

  function syncSfxButtons() {
    const on = !sfx?.isMuted();
    for (const b of sfxBtns) b.setAttribute('aria-pressed', String(on));
  }
  for (const b of sfxBtns) {
    b.addEventListener('click', () => {
      sfx?.toggleMuted();
      syncSfxButtons();
    });
  }

  // ===========================================================================
  // 3. Screens: title ↔ play
  // ===========================================================================
  function setScreen(screen) {
    state.screen = screen;
    game.dataset.screen = screen;
    const playing = screen === 'play';
    titleScreen.inert = playing;
    for (const el of [hudTop, journal, hudBottom, pinsLayer]) el.inert = !playing;
    engine?.setAttract(!playing && !reducedMotionQuery.matches);
    sfx?.updateWorld({ screen });
    if (!playing && codex.matches?.(':popover-open')) codex.hidePopover();
    measureLayout();
    updateInsets();
  }

  function startQuest(chapter = 0) {
    sfx?.questBegin();
    setScreen('play');
    if (!state.started) {
      state.started = true;
      setNight(false, { silent: true }); // dawn breaks as the quest begins
    }
    activateStep(chapter, { duration: 2.9, fromTitle: true });
    journal.focus({ preventScroll: true });
  }

  function showTitle() {
    sfx?.menuBack();
    setScreen('title');
    showMenu('main');
    engine?.flyTo(TITLE_POSE, { duration: 2.2 });
    menuMain.querySelector('.menu-item')?.focus({ preventScroll: true });
  }

  function showMenu(which) {
    menuMain.hidden = which !== 'main';
    menuChapters.hidden = which !== 'chapters';
    const list = which === 'main' ? menuMain : menuChapters;
    list.querySelector('.menu-item')?.focus({ preventScroll: true });
  }

  for (const item of $$('.menu-item', titleScreen)) {
    item.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') sfx?.hover();
    });
  }

  titleScreen.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'begin') startQuest(0);
    else if (action === 'chapters') { sfx?.menuSelect(); showMenu('chapters'); }
    else if (action === 'back') { sfx?.menuBack(); showMenu('main'); }
    else if (action === 'lore') { sfx?.menuSelect(); $('#lore').scrollIntoView({ behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' }); }
    else if (item.dataset.chapter) startQuest(Number(item.dataset.chapter));
  });

  // Arrow keys move through the menu; Enter anywhere starts the quest
  document.addEventListener('keydown', (e) => {
    if (state.screen !== 'title' || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
    const gameRect = game.getBoundingClientRect();
    if (gameRect.bottom < 120) return; // scrolled away to the lore section
    const items = $$('.menu-list:not([hidden]) .menu-item');
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      items[idx < 0 ? 0 : (idx + dir + items.length) % items.length].focus();
      sfx?.hover();
    } else if (e.key === 'Enter' && idx < 0 && (document.activeElement === document.body || !document.activeElement)) {
      e.preventDefault();
      startQuest(0);
    } else if (e.key === 'Escape' && !menuChapters.hidden) {
      sfx?.menuBack();
      showMenu('main');
    }
  });

  $('#menu-btn').addEventListener('click', showTitle);

  // ===========================================================================
  // 4. Lore meter, ranks & toasts
  // ===========================================================================
  const rankFor = (n) => RANKS.find(([min]) => n >= min)[1];

  function toast({ kind = 'lore', kicker, text, duration = 3200 }) {
    while (toasts.children.length > 2) toasts.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.innerHTML = '<span class="toast-gem" aria-hidden="true"></span><span><span class="toast-kicker"></span><span class="toast-text"></span></span>';
    el.querySelector('.toast-kicker').textContent = kicker;
    el.querySelector('.toast-text').textContent = text;
    toasts.append(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reducedMotionQuery.matches ? 0 : 420);
    }, duration);
  }

  function unlockLore(id, { sfxDelay = 0 } = {}) {
    if (state.discovered.has(id)) return;
    const before = rankFor(state.discovered.size);
    state.discovered.add(id);
    const n = state.discovered.size;
    loreCount.textContent = String(n);
    loreProgress.value = n;

    const socket = sockets.find((li) => li.dataset.lore === id);
    if (socket) {
      socket.classList.add('is-lit', 'is-new');
      setTimeout(() => socket.classList.remove('is-new'), 1000);
    }

    const isCodex = id.startsWith('pin-');
    sfx?.loreUnlock(isCodex, { delay: sfxDelay });
    toast({ kind: isCodex ? 'codex' : 'lore', kicker: isCodex ? 'Codex entry found' : 'Lore discovered', text: LORE_NAMES[id] });

    const after = rankFor(n);
    loreRank.textContent = after;
    if (after !== before) {
      setTimeout(() => {
        sfx?.rankUp(n === 10);
        toast({ kind: 'rank', kicker: n === 10 ? 'All ten runes awakened' : 'Rank up', text: after, duration: 4200 });
      }, 650);
      liveStatus.textContent = `New rank: ${after}.`;
    }
  }

  // ===========================================================================
  // 5. Quest journal
  // ===========================================================================
  function activateStep(index, { focusTab = false, duration, fromTitle = false } = {}) {
    const i = Math.max(0, Math.min(tabs.length - 1, index));
    state.step = i;
    if (!fromTitle) sfx?.chapterSelect(i);

    tabs.forEach((tab, k) => {
      const selected = k === i;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) tab.classList.add('is-visited');
    });
    panels.forEach((panel, k) => {
      const active = k === i;
      panel.hidden = !active;
      if (active) {
        panel.tabIndex = 0;
        panel.classList.remove('is-entering');
        void panel.offsetWidth;
        panel.classList.add('is-entering');
      } else {
        panel.removeAttribute('tabindex');
      }
    });
    $('.panels').scrollTop = 0;
    chapterPath.style.setProperty('--path-progress', String(i / (tabs.length - 1)));
    stepCounter.textContent = `Chapter ${ROMAN[i]} of V`;
    prevBtn.disabled = i === 0;
    nextBtn.innerHTML = i === tabs.length - 1 ? 'Lore tablets <span aria-hidden="true">↓</span>' : 'Next <span aria-hidden="true">›</span>';
    if (focusTab) tabs[i].focus();

    engine?.setStep(i);
    setActiveView(null);
    engine?.flyTo(STEP_CAMERAS[i], duration ? { duration } : undefined);
    if (i === 3) launchAttack(false, { sfxDelay: fromTitle ? 620 : 340 });

    unlockLore(`step-${i}`, { sfxDelay: fromTitle ? 0.42 : 0.16 });
    if (mobileQuery.matches) requestAnimationFrame(updateInsets);
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => activateStep(Number(tab.dataset.step))));

  chapterPath.addEventListener('keydown', (e) => {
    const idx = tabs.indexOf(document.activeElement);
    if (idx < 0) return;
    const map = { ArrowRight: idx + 1, ArrowLeft: idx - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    activateStep((map[e.key] + tabs.length) % tabs.length, { focusTab: true });
  });

  prevBtn.addEventListener('click', () => activateStep(state.step - 1));
  nextBtn.addEventListener('click', () => {
    if (state.step === tabs.length - 1) {
      sfx?.stoneClick(1.08);
      $('#lore').scrollIntoView({ behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
    } else {
      activateStep(state.step + 1);
    }
  });

  journalToggle.addEventListener('click', () => {
    state.journalOpen = !state.journalOpen;
    sfx?.journalToggle(state.journalOpen);
    journalToggle.setAttribute('aria-expanded', String(state.journalOpen));
    journalToggle.querySelector('.journal-toggle-text').textContent = state.journalOpen ? 'Hide' : 'Show';
    journalBody.hidden = !state.journalOpen;
    game.classList.toggle('is-journal-collapsed', !state.journalOpen);
    measureLayout();
    updateInsets();
  });

  function completeQuest(btn) {
    if (!btn || btn.classList.contains('is-done')) return;
    btn.classList.add('is-done');
    const note = document.createElement('span');
    note.className = 'visually-hidden';
    note.textContent = ' (completed)';
    btn.append(note);
  }

  // Campfire lines
  for (const btn of $$('[data-copy-pitch]')) {
    btn.addEventListener('click', () => {
      sfx?.copyPitch();
      navigator.clipboard?.writeText(btn.dataset.copyPitch).catch(() => {});
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  }

  // Mission: camera dives
  for (const btn of $$('[data-goto-cam]')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.gotoCam;
      sfx?.cameraFly(key);
      setActiveView(key);
      engine?.flyTo(NAMED_CAMERAS[key]);
      completeQuest(btn);
    });
  }

  // Mission: spirit lens
  for (const btn of $$('[data-open-closeup]')) {
    btn.addEventListener('click', () => {
      sfx?.lensOpen();
      setLensNight(state.night);
      closeup.showModal();
      completeQuest(btn);
    });
  }

  // Mission: sunlight
  function syncSlider() {
    const v = Number(slider.value);
    const pct = ((v - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
    slider.style.setProperty('--p', `${pct}%`);
    slider.setAttribute('aria-valuetext', `${v}% canopy sunlight`);
    sliderOut.textContent = `${v}%`;
    engine?.setSunlight(v / 100);
    sfx?.updateWorld({ sunlight: v / 100 });
    return pct / 100;
  }
  slider.addEventListener('input', () => {
    const pct01 = syncSlider();
    sfx?.sunlightSlide(pct01);
  });
  syncSlider();

  // Mission: caterpillar attack
  let attackSfxTimer = null;
  function launchAttack(fromButton = true, { sfxDelay = 0 } = {}) {
    clearTimeout(attackSfxTimer);
    if (sfxDelay > 0) attackSfxTimer = setTimeout(() => sfx?.caterpillarAttack(), sfxDelay);
    else sfx?.caterpillarAttack();
    engine?.triggerAttack();
    liveStatus.textContent = 'Caterpillars are biting the Elder Fir! An amber distress signal races down its roots and across the fungal web toward the Paper Birch.';
    if (fromButton) toast({ kind: 'alarm', kicker: 'Caterpillar attack', text: 'The alarm races through the fungal web…' });
  }
  $('#trigger-attack-btn').addEventListener('click', (e) => {
    launchAttack(true);
    completeQuest(e.currentTarget);
  });

  function onAttackArrived() {
    sfx?.attackArrived();
    liveStatus.textContent = 'The warning reached the Paper Birch! Its leaves glow emerald as it brews protective tannins.';
    if (state.step === 3) toast({ kind: 'alarm', kicker: 'Warning delivered', text: 'The birch brews bitter bug spray' });
  }

  // ===========================================================================
  // 6. HUD controls
  // ===========================================================================
  function setNight(isNight, { silent = false } = {}) {
    state.night = isNight;
    if (!silent) sfx?.celestialToggle(isNight);
    engine?.setNight(isNight);
    timeLabel.textContent = isNight ? 'Night' : 'Day';
    timeBtn.setAttribute('aria-label', `Time of day: ${isNight ? 'Night' : 'Day'}. Switch to ${isNight ? 'day' : 'night'}`);
    liveStatus.textContent = isNight
      ? 'The sun sets behind the treeline, the moon rises and the forest begins to glow.'
      : 'The moon sinks away and golden morning light returns to the forest.';
  }
  timeBtn.addEventListener('click', () => setNight(!state.night));

  motionBtn.addEventListener('click', () => {
    state.paused = !state.paused;
    sfx?.stoneClick(state.paused ? 0.86 : 1.12);
    sfx?.updateWorld({ paused: state.paused });
    motionBtn.setAttribute('aria-pressed', String(state.paused));
    engine?.setPaused(state.paused);
  });

  function setActiveView(name) {
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.cam === name));
  }
  for (const b of viewBtns) {
    b.addEventListener('click', () => {
      sfx?.cameraFly(b.dataset.cam);
      setActiveView(b.dataset.cam);
      engine?.flyTo(NAMED_CAMERAS[b.dataset.cam]);
    });
  }

  xrayBtn.addEventListener('click', () => {
    const on = xrayBtn.getAttribute('aria-pressed') !== 'true';
    sfx?.xrayToggle(on);
    sfx?.updateWorld({ xray: on });
    xrayBtn.setAttribute('aria-pressed', String(on));
    engine?.setXray(on);
  });

  // Spirit lens dialog
  function setLensNight(isNight) {
    lensDay.hidden = isNight;
    lensNight.hidden = !isNight;
    lensBtn.textContent = isNight ? 'View daylight' : 'View night glow';
  }
  lensBtn.addEventListener('click', () => {
    const nextNight = lensNight.hidden;
    sfx?.lensLightToggle(nextNight);
    setLensNight(nextNight);
  });
  closeup.addEventListener('close', () => sfx?.lensClose());
  closeup.addEventListener('click', (e) => {
    if (e.target === closeup) {
      const r = closeup.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside) closeup.close();
    }
  });

  // ===========================================================================
  // 7. Codex markers
  // ===========================================================================
  let lastPin = null;
  let switchingPin = false;
  const canPopover = typeof HTMLElement.prototype.showPopover === 'function';

  function placeCodex() {
    if (!lastPin) return;
    const r = lastPin.querySelector('.pin-mark').getBoundingClientRect();
    const w = codex.offsetWidth;
    const h = codex.offsetHeight;
    let left = r.right + 14;
    if (left + w > innerWidth - 12) left = r.left - w - 14;
    left = Math.max(12, Math.min(innerWidth - w - 12, left));
    const minTop = Math.max(12, game.getBoundingClientRect().top + state.layout.hudH + 18);
    const top = Math.max(minTop, Math.min(innerHeight - h - 12, r.top + r.height / 2 - h / 2));
    codex.style.left = `${left}px`;
    codex.style.top = `${top}px`;
  }

  codex.addEventListener('toggle', (e) => {
    if (e.newState === 'closed' && !switchingPin && state.screen === 'play') {
      sfx?.codexClose();
    }
  });

  for (const pin of pins) {
    pin.setAttribute('aria-haspopup', 'dialog');
    pin.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') sfx?.hover();
    });
    pin.addEventListener('click', () => {
      const key = pin.dataset.pin;
      const info = ORGANISM_INFO[key];
      lastPin = pin;
      $('#codex-tag').textContent = pin.classList.contains('is-discovered') ? info.tag : `Codex entry unlocked · ${info.tag}`;
      $('#codex-title').textContent = info.title;
      $('#codex-what').textContent = info.what;
      $('#codex-gives').textContent = info.gives;
      $('#codex-gets').textContent = info.gets;
      pin.classList.add('is-discovered');
      sfx?.codexOpen(key);
      unlockLore(`pin-${key}`, { sfxDelay: 0.18 });
      if (canPopover) {
        switchingPin = true;
        if (codex.matches(':popover-open')) codex.hidePopover();
        codex.showPopover();
        switchingPin = false;
      } else {
        codex.classList.add('is-open');
      }
      placeCodex();
    });
  }
  addEventListener('resize', () => codex.matches?.(':popover-open') && placeCodex());

  // ===========================================================================
  // 8. Layout ↔ 3D view insets, marker projection
  // ===========================================================================
  // Offset* values ignore the slide-in transforms, so this is the settled layout.
  function measureLayout() {
    const L = state.layout;
    L.W = game.clientWidth;
    L.H = game.clientHeight;
    L.hudH = hudTop.offsetHeight;
    L.bottomH = mobileQuery.matches ? 0 : L.H - hudBottom.offsetTop;
    L.viewBar = mobileQuery.matches ? hudBottom.offsetTop + hudBottom.offsetHeight : 0;
    L.journal = {
      left: journal.offsetLeft,
      top: journal.offsetTop,
      right: journal.offsetLeft + journal.offsetWidth,
      bottom: journal.offsetTop + journal.offsetHeight
    };
  }

  function updateInsets() {
    if (!engine) return;
    const L = state.layout;
    let ins;
    if (state.screen === 'title') {
      ins = mobileQuery.matches
        ? { left: 0, right: 0, top: L.H * 0.3, bottom: L.H * 0.3 }
        : { left: L.W * 0.4, right: 0, top: 0, bottom: 0 };
    } else if (mobileQuery.matches) {
      const sheetTop = state.journalOpen ? L.journal.top : L.H - 70;
      ins = { left: 0, right: 0, top: L.viewBar + 4, bottom: Math.max(0, L.H - sheetTop) + 6 };
    } else {
      ins = {
        left: state.journalOpen ? L.journal.right + 6 : 0,
        right: 0,
        top: L.hudH * 0.5,
        bottom: L.bottomH + 6
      };
    }
    engine.setViewInset(ins);
  }

  new ResizeObserver(() => {
    measureLayout();
    updateInsets();
  }).observe(game);
  new ResizeObserver(() => {
    measureLayout();
    if (mobileQuery.matches) updateInsets();
  }).observe(journal);

  const dial = timeBtn;
  function onFrame({ anchors, nightMix, camTargetY = -0.22, camPitch = 0.14, attackActive = false, attackProgress = 0 }) {
    dial.style.setProperty('--night', nightMix.toFixed(3));
    const underground = Math.max(0, Math.min(1, (-camTargetY - 0.25) / 1.35 * 0.75 + Math.max(0, -camPitch) * 0.8));
    sfx?.updateWorld({ nightMix, underground, attackActive, attackProgress });
    if (state.screen !== 'play') return;
    const L = state.layout;
    const j = L.journal;
    for (const pin of pins) {
      const a = anchors[pin.dataset.pin];
      const underJournal = j && a && a.x > j.left - 30 && a.x < j.right + 30 && a.y > j.top - 30 && a.y < j.bottom + 30;
      const hidden = !a || !a.visible || a.x < 24 || a.x > L.W - 24 || a.y < L.hudH + 16 || a.y > L.H - L.bottomH - 12 || (mobileQuery.matches && a.y < L.viewBar + 20) || underJournal;
      pin.classList.toggle('is-hidden', hidden);
      if (!hidden) pin.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) translate(-50%, -19px)`;
    }
    if (lastPin && codex.matches?.(':popover-open')) placeCodex();
  }

  // ===========================================================================
  // 9. Foreground foliage (procedural silhouettes)
  // ===========================================================================
  function buildFoliage() {
    const NS = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs, parent) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      parent?.append(el);
      return el;
    };
    const leafPath = (len, w) => `M0 0C${len * 0.28} ${-w} ${len * 0.72} ${-w * 0.85} ${len} 0C${len * 0.72} ${w * 0.85} ${len * 0.28} ${w} 0 0Z`;

    function defs(svg, id) {
      const d = make('defs', {}, svg);
      const g = make('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' }, d);
      make('stop', { offset: '0', 'stop-color': '#0c2418' }, g);
      make('stop', { offset: '1', 'stop-color': '#020806' }, g);
    }

    // Leaflets along a quadratic stem
    function frond(svg, fill, p0, p1, p2, leaf, count, droop = 1) {
      const g = make('g', { fill }, svg);
      make('path', { d: `M${p0}Q${p1} ${p2}`, fill: 'none', stroke: fill, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
        const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
        const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
        const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        const size = leaf * (1 - t * 0.7);
        for (const side of [-1, 1]) {
          make('path', { d: leafPath(size, size * 0.24), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang + side * (52 + 18 * t) * droop).toFixed(1)})` }, g);
        }
      }
    }

    // Broad leaf with a curved midrib and a faint teal rim catching the forest light
    function broadLeaf(svg, fill, x, y, len, w, rot, bend = 0.12) {
      const g = make('g', { transform: `translate(${x} ${y}) rotate(${rot})` }, svg);
      const d = `M0 0C${len * 0.22} ${-w * 1.05} ${len * 0.7} ${-w * (0.95 + bend)} ${len} ${-w * bend * 2}C${len * 0.72} ${w * (0.75 - bend)} ${len * 0.25} ${w * 0.95} 0 0Z`;
      make('path', { d, fill, stroke: 'rgb(110 200 160 / 0.14)', 'stroke-width': 1.6 }, g);
      make('path', { d: `M6 0Q${len * 0.55} ${-w * bend * 1.4} ${len - 8} ${-w * bend * 2}`, fill: 'none', stroke: 'rgb(60 120 90 / 0.35)', 'stroke-width': 1.6 }, g);
    }

    function vine(svg, fill, x, len, sway, leaf) {
      const g = make('g', { fill }, svg);
      make('path', { d: `M${x} -10Q${x + sway} ${len * 0.55} ${x + sway * 0.4} ${len}`, fill: 'none', stroke: fill, 'stroke-width': 2.2 }, g);
      const n = Math.round(len / 28);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 0.5);
        const yy = -10 + (len + 10) * t;
        const xx = x + sway * 2 * t * (1 - t) * 1.1 + sway * 0.4 * t * t;
        const s = leaf * (0.65 + 0.35 * Math.sin(k * 1.7) ** 2);
        make('path', { d: leafPath(s, s * 0.42), transform: `translate(${xx.toFixed(1)} ${yy.toFixed(1)}) rotate(${k % 2 ? 128 : 52})` }, g);
      }
    }

    const left = $('#foliage-left');
    if (left && !left.childElementCount) {
      left.setAttribute('viewBox', '0 0 440 440');
      left.setAttribute('preserveAspectRatio', 'xMinYMax meet');
      defs(left, 'leafL');
      const f = 'url(#leafL)';
      // back layer (slightly lifted tone), then front silhouettes
      frond(left, '#0a2117', [40, 470], [150, 300], [360, 260], 52, 12, 0.9);
      frond(left, '#081b12', [-20, 460], [40, 270], [170, 110], 50, 12, 1);
      broadLeaf(left, '#0b2318', 60, 470, 300, 92, -48, 0.2);
      broadLeaf(left, f, -40, 450, 330, 108, -30, 0.16);
      broadLeaf(left, f, -10, 470, 280, 96, -70, 0.1);
      frond(left, '#030d08', [-30, 450], [10, 330], [40, 190], 40, 10, 1.1);
      broadLeaf(left, '#020806', 110, 480, 220, 72, -16, 0.22);
      for (const [x, h, r] of [[150, 120, -8], [175, 95, 6], [205, 80, 14], [230, 60, 22]]) {
        make('path', { d: `M${x} 450Q${x + r} ${450 - h * 0.6} ${x + r * 2.2} ${450 - h}Q${x + r * 0.8} ${450 - h * 0.5} ${x + 8} 450Z`, fill: '#020806' }, left);
      }
    }

    const right = $('#foliage-right');
    if (right && !right.childElementCount) {
      right.setAttribute('viewBox', '0 0 460 400');
      right.setAttribute('preserveAspectRatio', 'xMaxYMin meet');
      defs(right, 'leafR');
      const f = 'url(#leafR)';
      vine(right, '#06170f', 250, 230, -14, 30);
      vine(right, '#04110b', 318, 330, -22, 34);
      vine(right, '#06170f', 372, 260, -10, 28);
      frond(right, '#0a2117', [480, -20], [350, 30], [200, 190], 50, 12, -1);
      broadLeaf(right, f, 490, -40, 290, 92, 152, 0.18);
      broadLeaf(right, '#0b2318', 470, 30, 250, 80, 176, 0.14);
      frond(right, '#030d08', [490, 50], [400, 170], [340, 360], 40, 11, -1);
      broadLeaf(right, '#020806', 500, -10, 230, 74, 128, 0.2);
      vine(right, '#020806', 428, 380, -16, 30);
    }
  }

  canvas.addEventListener('pointerdown', () => {
    if (state.screen === 'play') sfx?.orbitGrab();
  }, { passive: true });

  for (const details of $$('.riddle')) {
    details.addEventListener('toggle', () => sfx?.riddleToggle(details.open));
  }

  for (const link of $$('.scroll-cue, .back-to-game a')) {
    link.addEventListener('click', () => sfx?.stoneClick(1.05));
  }

  // ===========================================================================
  // 10. Boot
  // ===========================================================================
  function initialUi() {
    syncSfxButtons();
    timeLabel.textContent = 'Night';
    timeBtn.setAttribute('aria-label', 'Time of day: Night. Switch to day');
    timeBtn.style.setProperty('--night', '1');
    setScreen('title');
    showMenuWithoutFocus();
  }

  function showMenuWithoutFocus() {
    menuMain.hidden = false;
    menuChapters.hidden = true;
  }

  async function boot() {
    buildFoliage();
    initialUi();
    measureLayout();
    try {
      if (typeof window.createForestEngine !== 'function') throw new Error('engine.js did not load');
      engine = await window.createForestEngine({
        canvas,
        sceneData: window.WOOD_WIDE_WEB_3D,
        reducedMotion: reducedMotionQuery.matches
      });
      engine.setNight(true, { instant: true });
      engine.setPose(TITLE_POSE);
      engine.setAttract(state.screen === 'title' && !reducedMotionQuery.matches);
      engine.setSunlight(Number(slider.value) / 100);
      engine.on('frame', onFrame);
      engine.on('attackArrived', onAttackArrived);
      measureLayout();
      updateInsets();
      engine.setViewInset({}, { instant: true });
      engineStatus.classList.add('is-done');
      engineStatus.textContent = '';
    } catch (err) {
      console.error('[wood-wide-web] 3D engine failed to start:', err);
      $('#world-fallback').hidden = false;
      canvas.hidden = true;
      engineStatus.classList.add('is-error');
      engineStatus.textContent = 'The live 3D forest couldn’t load (offline, or WebGL is off). Showing the Blender render instead — the quest still works.';
    }

    // Stop rendering while the forest is scrolled out of view
    new IntersectionObserver(([entry]) => {
      engine?.setActive(entry.isIntersecting);
      sfx?.updateWorld({ inView: entry.isIntersecting });
    }, { threshold: 0.02 }).observe(game);
  }

  reducedMotionQuery.addEventListener('change', (e) => {
    engine?.setReducedMotion(e.matches);
    engine?.setAttract(state.screen === 'title' && !e.matches);
  });
  mobileQuery.addEventListener('change', () => {
    measureLayout();
    updateInsets();
  });

  boot();
})();
