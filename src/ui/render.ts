import type { AppController } from '../app/controller';
import { formatDuration } from '../domain/statistics';
import { clockwiseRemainingDashOffset } from './ring-progress';

const QUICK_MINUTES = [5, 10, 20];
const RING_CIRCUMFERENCE = 2 * Math.PI * 116;

export const isQuickMinuteSelected = (selectedMinutes: number, quickMinutes: number): boolean => (
  selectedMinutes === quickMinutes
);

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const formatClock = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
};

const sceneTemplate = (): string => `
  <div class="ambient-scene" aria-hidden="true">
    <div class="ambient-sky"></div>
    <div class="ambient-beam beam-one"></div>
    <div class="ambient-beam beam-two"></div>
    <svg class="forest-layer forest-far" viewBox="0 0 1440 900" preserveAspectRatio="none"><path d="M0 450C130 380 215 410 315 330C420 246 510 315 610 250C730 172 810 240 930 185C1085 112 1210 210 1440 102V900H0Z" /></svg>
    <svg class="forest-layer forest-mid" viewBox="0 0 1440 900" preserveAspectRatio="none"><path d="M0 605C118 520 238 590 360 475C475 366 600 470 738 350C865 239 1015 378 1140 270C1260 168 1352 242 1440 208V900H0Z" /></svg>
    <svg class="forest-layer forest-near" viewBox="0 0 1440 900" preserveAspectRatio="none"><path d="M0 740C155 610 286 735 442 575C585 428 735 650 890 480C1050 305 1220 565 1440 380V900H0Z" /></svg>
    <div class="ambient-mist mist-one"></div><div class="ambient-mist mist-two"></div><div class="ambient-grain"></div>
  </div>`;

const settingsIcon = (): string => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-.1-1.2 2-1.6-2-3.4-2.5 1a8 8 0 0 0-2.1-1.2L15 3h-4l-.4 2.6a8 8 0 0 0-2.1 1.2l-2.5-1-2 3.4 2 1.6L6 12l.1 1.2-2 1.6 2 3.4 2.5-1a8 8 0 0 0 2.1 1.2L11 21h4l.4-2.6a8 8 0 0 0 2.1-1.2l2.5 1 2-3.4-2-1.6.1-1.2Z" /></svg>`;

function settingsTemplate(controller: AppController): string {
  const state = controller.snapshot();
  return `<div class="settings-backdrop" data-action="close-settings">
    <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-settings-panel>
      <div class="settings-heading"><div><p class="eyebrow">体验偏好</p><h2 id="settings-title">把这一刻调成适合你的样子</h2></div><button class="icon-button settings-close" data-action="close-settings" aria-label="关闭设置"><span aria-hidden="true">×</span></button></div>
      <div class="setting-group"><div class="setting-label"><label for="duration-range">冥想时长</label><output id="duration-range-value" for="duration-range">${state.selectedMinutes} 分钟</output></div><input id="duration-range" type="range" min="1" max="60" step="1" value="${state.selectedMinutes}" aria-valuetext="${state.selectedMinutes} 分钟" /><div class="range-ends" aria-hidden="true"><span>1 分钟</span><span>60 分钟</span></div></div>
      <div class="setting-switches"><label class="setting-switch"><span><strong>学习背景音</strong><small>柔和低频噪声，平稳陪伴专注</small></span><input type="checkbox" data-action="ambient" ${state.preferences.ambientEnabled ? 'checked' : ''} /></label><label class="setting-switch"><span><strong>结束提示音</strong><small>自然完成时轻声提醒</small></span><input type="checkbox" data-action="sound" ${state.preferences.soundEnabled ? 'checked' : ''} /></label></div>
      <p class="privacy-note">所有偏好和冥想记录只保存在这台设备。</p>
    </section>
  </div>`;
}

function homeTemplate(controller: AppController): string {
  const state = controller.snapshot();
  const stats = controller.statistics();
  return `<main class="page home-page" aria-labelledby="page-title" tabindex="-1">
    ${sceneTemplate()}
    <header class="home-header"><div class="wordmark"><span class="brand-mark" aria-hidden="true">◌</span><span>片刻<small>A MOMENT TO YOURSELF</small></span></div><button class="icon-button" data-action="open-settings" aria-label="打开设置" aria-expanded="${state.settingsOpen}">${settingsIcon()}</button></header>
    <div class="home-layout">
      <section class="home-content"><p class="ambient-label"><span class="period-dot" aria-hidden="true"></span>${escapeHtml(state.ambientProfile.label)}</p><h1 id="page-title" tabindex="-1">把时间，<br>留给自己。</h1><p class="entry-prompt">${escapeHtml(state.ambientProfile.prompt)}</p><p class="entry-note">不必清空思绪。<br>只是坐一会儿，回到当下。</p><div class="quiet-line" aria-hidden="true"><span></span>慢下来，也是一种前行</div></section>
      <section class="entry-controls" aria-labelledby="session-title"><p class="eyebrow">一段属于你的时间</p><h2 id="session-title">准备好，就开始。</h2><p class="duration-caption"><strong data-duration-value>${state.selectedMinutes}</strong><span>分钟 / 此刻</span></p>
        <div class="quick-times" aria-label="快捷时长">${QUICK_MINUTES.map((minutes, index) => `<button class="quick-time${isQuickMinuteSelected(state.selectedMinutes, minutes) ? ' selected' : ''}" data-action="duration" data-minutes="${minutes}" aria-pressed="${isQuickMinuteSelected(state.selectedMinutes, minutes)}"><span>${minutes}<small> 分钟</small></span><small>${['短暂歇息', '回到当下', '深入静心'][index]}</small></button>`).join('')}</div>
        <div class="home-duration-control"><label class="sr-only" for="home-duration-range">冥想时长，一分钟到六十分钟</label><input id="home-duration-range" class="home-duration-range" data-duration-range type="range" min="1" max="60" step="1" value="${state.selectedMinutes}" aria-valuetext="${state.selectedMinutes} 分钟" /><div class="range-ends" aria-hidden="true"><span>1 分钟</span><span>自由调节时长</span><span>60 分钟</span></div></div>
        <label class="home-sound"><span><strong>学习背景音</strong><small>柔和低频噪声，平稳陪伴专注</small></span><input type="checkbox" data-action="ambient" ${state.preferences.ambientEnabled ? 'checked' : ''} /></label>
        <button class="primary-button start-button" data-action="start" ${state.busy ? 'disabled' : ''}><span>${state.busy ? '正在准备…' : '开始冥想'}</span><span aria-hidden="true">↗</span></button><p class="session-footnote">无需准备，保持自然呼吸就好</p>${state.persistent ? '' : '<p class="storage-note" role="status">本次可正常计时；关闭页面后记录可能不会保留。</p>'}
      </section>
    </div>
    <footer class="home-footer"><div><span class="eyebrow">安静的累积</span><p>${stats.todaySeconds > 0 ? `今天已留给自己 <strong>${formatDuration(stats.todaySeconds)}</strong>` : '从这一刻开始，就很好。'}</p></div><button class="records-toggle" data-action="records" aria-expanded="${state.recordsExpanded}" aria-controls="records-panel">${state.recordsExpanded ? '收起最近记录 −' : '最近记录 ↗'}</button></footer>
    ${state.recordsExpanded ? recordsTemplate(controller) : ''}${state.settingsOpen ? settingsTemplate(controller) : ''}
  </main>`;
}

function timerTemplate(controller: AppController): string {
  const state = controller.snapshot();
  const remaining = controller.getRemainingSeconds();
  const paused = state.timer.tag === 'paused';
  const confirming = state.timer.tag === 'confirming';
  const settling = state.timer.tag === 'settling';
  const visible = !confirming && (state.controlsVisible || paused);
  const offset = clockwiseRemainingDashOffset(controller.getProgress(), RING_CIRCUMFERENCE);
  return `<main class="page timer-page" aria-label="冥想计时" data-action="reveal-controls" tabindex="-1">${sceneTemplate()}<p class="sr-only" aria-live="polite">${paused ? '计时已暂停' : confirming ? '正在确认是否提前结束' : settling ? '正在保存本次记录' : '计时进行中'}</p><section class="timer-stage ${paused ? 'is-paused' : ''}"><div class="ring-wrap"><svg class="progress-ring" viewBox="0 0 248 248" aria-hidden="true"><circle class="ring-track" cx="124" cy="124" r="116" /><circle class="ring-value" cx="124" cy="124" r="116" style="stroke-dasharray:${RING_CIRCUMFERENCE};stroke-dashoffset:${offset}" /></svg><div class="timer-readout"><time id="timer-value" class="timer-value" datetime="PT${remaining}S">${formatClock(remaining)}</time>${paused ? '<span class="timer-status">已暂停</span>' : ''}</div></div><div class="timer-controls ${visible ? 'is-visible' : ''}" aria-hidden="${!visible}"><label class="timer-ambient-toggle"><input type="checkbox" data-action="ambient" ${state.preferences.ambientEnabled ? 'checked' : ''} /><span>${state.preferences.ambientEnabled ? '学习背景音' : '环境声已关闭'}</span></label>${paused ? '<button class="primary-button compact" data-action="resume">继续</button>' : `<button class="secondary-button" data-action="pause" ${settling ? 'disabled' : ''}>暂停</button>`}<button class="text-button caution" data-action="open-end" ${settling ? 'disabled' : ''}>提前结束</button></div></section>${confirming ? confirmationTemplate(remaining) : ''}</main>`;
}

function confirmationTemplate(remaining: number): string {
  return `<div class="modal-backdrop" data-action="cancel-end"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="end-title" data-modal><p class="eyebrow">还剩 ${formatClock(remaining)}</p><h2 id="end-title">现在结束吗？</h2><p>已经静心的时间会被如实记录。</p><div class="modal-actions"><button class="secondary-button" data-action="cancel-end" autofocus>继续冥想</button><button class="text-button caution" data-action="confirm-end">结束并记录</button></div></section></div>`;
}

function chartTemplate(controller: AppController): string {
  const stats = controller.statistics();
  return `<div class="chart" role="img" aria-label="最近 15 天冥想时长：${stats.last15.map((day) => `${day.dateKey} ${formatDuration(day.totalSeconds)}`).join('；')}">${stats.last15.map((day) => `<div class="bar-column" title="${escapeHtml(day.dateKey)} · ${formatDuration(day.totalSeconds)}"><span class="bar" style="height:${Math.max(day.ratio * 100, day.totalSeconds ? 5 : 1)}%"></span><small>${day.dateKey.slice(5).replace('-', '/')}</small></div>`).join('')}</div>`;
}

function recordsTemplate(controller: AppController): string {
  const stats = controller.statistics();
  const count = stats.last15.reduce((sum, day) => sum + day.completionCount, 0);
  return `<section class="records-panel" id="records-panel" aria-labelledby="records-title"><div class="records-heading"><div><p class="eyebrow">最近 15 天</p><h2 id="records-title">安静的累积</h2></div><p>7 天共 ${formatDuration(stats.last7Seconds)}<br>${count} 次练习</p></div>${count ? chartTemplate(controller) : '<p class="records-empty">还没有冥想记录。每一段安静的时间，都会在这里留下痕迹。</p>'}<p class="records-privacy">记录只保存在当前设备 · 无需连续打卡</p></section>`;
}

function completionTemplate(controller: AppController): string {
  const state = controller.snapshot();
  if (state.timer.tag !== 'completed') return '';
  const receipt = state.timer.receipt;
  const stats = controller.statistics();
  return `<main class="page completion-page" aria-labelledby="completion-title" tabindex="-1">${sceneTemplate()}<section class="completion-card"><p class="eyebrow">${receipt.reason === 'natural' ? '这一段时间结束了' : '本次已记录'}</p><h1 id="completion-title" tabindex="-1">这一刻，已经足够。</h1><p class="result-duration">本次 ${formatDuration(receipt.actualDurationSeconds)}</p><p class="today-total">今天已留给自己 <strong>${formatDuration(stats.todaySeconds)}</strong></p><div class="completion-actions"><button class="primary-button" data-action="repeat">再次冥想</button><button class="secondary-button" data-action="home">返回首页</button></div><button class="records-toggle" data-action="records" aria-expanded="${state.recordsExpanded}" aria-controls="records-panel">${state.recordsExpanded ? '收起最近记录' : '查看最近记录'}</button></section>${state.recordsExpanded ? recordsTemplate(controller) : ''}</main>`;
}

export function mountApp(root: HTMLElement, controller: AppController): void {
  let lastTag = '';
  let lastRoute = '';
  let lastSettingsOpen = false;
  const routeForTag = (tag: string) => tag === 'idle' ? 'home' : tag === 'completed' ? 'completion' : 'timer';
  const focusCurrentPage = () => window.setTimeout(() => root.querySelector<HTMLElement>('main.page')?.focus({ preventScroll: true }), 0);

  const updateControlsVisibility = () => {
    const controls = root.querySelector<HTMLElement>('.timer-controls');
    if (!controls) return;
    const state = controller.snapshot();
    const visible = state.timer.tag !== 'confirming' && (state.controlsVisible || state.timer.tag === 'paused' || controls.contains(document.activeElement));
    controls.classList.toggle('is-visible', visible);
    controls.setAttribute('aria-hidden', String(!visible));
    controls.inert = !visible;
    const ambient = controls.querySelector<HTMLInputElement>('[data-action="ambient"]');
    if (ambient) ambient.checked = state.preferences.ambientEnabled;
    const label = controls.querySelector('.timer-ambient-toggle span');
    if (label) label.textContent = state.preferences.ambientEnabled ? '学习背景音' : '环境声已关闭';
  };

  const render = () => {
    const snapshot = controller.snapshot();
    const tag = snapshot.timer.tag;
    const previousTag = lastTag;
    const returningFromConfirmation = lastTag === 'confirming' && (tag === 'running' || tag === 'paused');
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeAction = active?.dataset.action;
    const activeMinutes = active?.dataset.minutes;
    const activeId = active?.id;
    const activeWasPage = active?.matches('main.page') ?? false;
    document.documentElement.dataset.period = snapshot.ambientProfile.period;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', snapshot.ambientProfile.themeColor);
    const routeName = routeForTag(tag);
    if (tag === 'running' && lastTag === 'running' && root.querySelector('.timer-page')) { updateTimer(); updateControlsVisibility(); return; }
    root.innerHTML = tag === 'idle' ? homeTemplate(controller) : tag === 'completed' ? completionTemplate(controller) : timerTemplate(controller);
    const notice = document.createElement('p');
    notice.className = 'app-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = snapshot.notice;
    root.append(notice);
    if (tag === 'running') {
      const hint = document.createElement('button');
      hint.className = 'timer-hint';
      hint.dataset.action = 'reveal-controls';
      hint.textContent = '轻触此处显示操作';
      root.querySelector('.timer-page')?.append(hint);
    }
    const dialogBackdrop = root.querySelector('.settings-backdrop, .modal-backdrop');
    if (dialogBackdrop) {
      for (const child of root.querySelector('main.page')?.children ?? []) {
        if (child instanceof HTMLElement && child !== dialogBackdrop) child.inert = true;
      }
    }
    updateControlsVisibility();
    if (lastRoute === routeName) root.querySelector('.page')?.classList.add('no-page-enter');
    document.body.dataset.view = tag;
    const route = tag === 'idle' ? '#/' : tag === 'completed' ? '#/complete' : '#/timer';
    if (location.hash !== route) { if (lastRoute === 'home' && routeName === 'timer') history.pushState({ route }, '', route); else history.replaceState({ route }, '', route); }
    if (snapshot.settingsOpen && !lastSettingsOpen) window.setTimeout(() => root.querySelector<HTMLElement>('.settings-close')?.focus(), 0);
    else if (!snapshot.settingsOpen && lastSettingsOpen) window.setTimeout(() => root.querySelector<HTMLElement>('[data-action="open-settings"]')?.focus(), 0);
    else if (tag === 'confirming' && lastTag !== 'confirming') window.setTimeout(() => root.querySelector<HTMLElement>('.modal [data-action="cancel-end"]')?.focus(), 0);
    else if (returningFromConfirmation) window.setTimeout(() => root.querySelector<HTMLElement>('[data-action="open-end"]')?.focus(), 0);
    else if (lastRoute && lastRoute !== routeName) window.setTimeout(() => root.querySelector<HTMLElement>('main.page')?.focus({ preventScroll: true }), 50);
    else if (activeAction) {
      const nextAction = previousTag === 'running' && tag === 'paused' && activeAction === 'pause' ? 'resume' : previousTag === 'paused' && tag === 'running' && activeAction === 'resume' ? 'pause' : activeAction;
      const selector = activeMinutes ? `[data-action="${nextAction}"][data-minutes="${activeMinutes}"]` : `[data-action="${nextAction}"]`;
      window.setTimeout(() => root.querySelector<HTMLElement>(selector)?.focus(), 0);
    } else if (activeId || activeWasPage) window.setTimeout(() => { const target = activeId ? document.getElementById(activeId) : root.querySelector<HTMLElement>('main.page'); target?.focus({ preventScroll: true }); }, 0);
    lastTag = tag;
    lastRoute = routeName;
    lastSettingsOpen = snapshot.settingsOpen;
  };

  const updateTimer = () => {
    const seconds = controller.getRemainingSeconds();
    const value = root.querySelector<HTMLTimeElement>('#timer-value');
    if (value) { value.textContent = formatClock(seconds); value.dateTime = `PT${seconds}S`; }
    const ring = root.querySelector<SVGCircleElement>('.ring-value');
    if (ring) ring.style.strokeDashoffset = String(clockwiseRemainingDashOffset(controller.getProgress(), RING_CIRCUMFERENCE));
  };

  controller.subscribe(render);
  controller.subscribeTick(updateTimer);
  root.addEventListener('focusin', (event) => {
    if ((event.target as HTMLElement).closest('.timer-controls')) controller.revealControls();
  });
  root.addEventListener('focusout', () => { window.setTimeout(updateControlsVisibility, 0); });
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'reveal-controls') controller.revealControls();
    if (action === 'duration') void controller.setDuration(Number(target.dataset.minutes));
    if (action === 'open-settings') controller.openSettings();
    if (action === 'close-settings') { if (target.classList.contains('settings-backdrop') && event.target !== target) return; controller.closeSettings(); }
    if (action === 'start') void controller.start().then(focusCurrentPage);
    if (action === 'pause') void controller.pause();
    if (action === 'resume') void controller.resume();
    if (action === 'open-end') void controller.openEndConfirmation();
    if (action === 'cancel-end') { if ((event.target as HTMLElement).closest('[data-modal]') && target.classList.contains('modal-backdrop')) return; void controller.cancelEndConfirmation(); }
    if (action === 'confirm-end') void controller.confirmEnd().then(focusCurrentPage);
    if (action === 'repeat') void controller.repeat().then(focusCurrentPage);
    if (action === 'home') void controller.returnHome().then(focusCurrentPage);
    if (action === 'records') controller.toggleRecords();
  });
  root.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action === 'sound') { void controller.setSoundEnabled(input.checked); return; }
    if (input.dataset.action === 'ambient') { void controller.setAmbientEnabled(input.checked); return; }
    if (input.id !== 'duration-range' && !input.matches('[data-duration-range]')) return;
    const minutes = Number(input.value);
    root.querySelectorAll<HTMLInputElement>('#duration-range, [data-duration-range]').forEach((range) => {
      range.value = String(minutes);
      range.setAttribute('aria-valuetext', `${minutes} 分钟`);
    });
    const output = root.querySelector<HTMLOutputElement>('#duration-range-value');
    if (output) output.value = `${minutes} 分钟`;
    root.querySelectorAll<HTMLElement>('[data-duration-value]').forEach((value) => { value.textContent = String(minutes); });
    root.querySelectorAll<HTMLButtonElement>('[data-action="duration"]').forEach((button) => {
      const selected = Number(button.dataset.minutes) === minutes;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    void controller.setDuration(minutes, false);
  });
  document.addEventListener('keydown', (event) => {
    const state = controller.snapshot();
    if (state.settingsOpen) {
      if (event.key === 'Escape') { event.preventDefault(); controller.closeSettings(); return; }
      if (event.key === 'Tab') {
        const panel = root.querySelector<HTMLElement>('[data-settings-panel]');
        const focusable = panel ? [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')] : [];
        const first = focusable[0]; const last = focusable.at(-1);
        if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (first && !panel?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (state.timer.tag === 'confirming') {
      if (event.key === 'Escape') { event.preventDefault(); void controller.cancelEndConfirmation(); return; }
      if (event.key === 'Tab') {
        const modal = root.querySelector<HTMLElement>('[data-modal]');
        const focusable = modal ? [...modal.querySelectorAll<HTMLElement>('button:not(:disabled)')] : [];
        const first = focusable[0]; const last = focusable.at(-1);
        if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (first && !modal?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      }
    }
    const inControls = event.target instanceof HTMLElement && Boolean(event.target.closest('.timer-controls'));
    if ((event.key === 'Enter' || event.key === ' ') && state.timer.tag === 'running' && !state.controlsVisible && !inControls) { event.preventDefault(); controller.revealControls(); }
  });
  document.addEventListener('visibilitychange', () => { void controller.handleVisibilityChange(document.hidden); });
  window.addEventListener('pagehide', () => { void controller.checkpointRunning(); });
  window.addEventListener('popstate', () => {
    const state = controller.snapshot();
    if (state.settingsOpen) controller.closeSettings();
    else if (state.timer.tag === 'completed') void controller.returnHome();
    else if (state.timer.tag === 'running' || state.timer.tag === 'paused') { history.pushState({ route: '#/timer' }, '', '#/timer'); void controller.openEndConfirmation(); }
    else if (state.timer.tag === 'confirming') history.pushState({ route: '#/timer' }, '', '#/timer');
  });
  render();
}
