import type { AppController } from '../app/controller';
import { formatDuration } from '../domain/statistics';
import { clockwiseRemainingDashOffset } from './ring-progress';

const QUICK_MINUTES = [5, 10, 15, 20, 30];
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

function homeTemplate(controller: AppController): string {
  const state = controller.snapshot();
  const stats = controller.statistics();
  return `
    <main class="page home-page" aria-labelledby="page-title" tabindex="-1">
      <section class="home-card">
        <p class="eyebrow">给自己一段不被打扰的时间</p>
        <h1 id="page-title" tabindex="-1">片刻</h1>
        <p class="duration-value" id="duration-value"><small class="duration-spacer" aria-hidden="true">分钟</small><span>${state.selectedMinutes}</span><small>分钟</small></p>
        <div class="quick-times" aria-label="快捷时长">
          ${QUICK_MINUTES.map((minutes) => `<button class="quick-time${isQuickMinuteSelected(state.selectedMinutes, minutes) ? ' selected' : ''}" data-action="duration" data-minutes="${minutes}" aria-pressed="${isQuickMinuteSelected(state.selectedMinutes, minutes)}">${minutes}</button>`).join('')}
        </div>
        <label class="range-label" for="duration-range">冥想时长，${state.selectedMinutes} 分钟</label>
        <input id="duration-range" type="range" min="1" max="60" step="1" value="${state.selectedMinutes}" />
        <div class="range-ends" aria-hidden="true"><span>1</span><span>60 分钟</span></div>
        <button class="primary-button" data-action="start" ${state.busy ? 'disabled' : ''}>开始冥想</button>
        ${state.persistent ? '' : '<p class="storage-note" role="status">本次可正常计时；关闭页面后记录可能不会保留。</p>'}
        <div class="preferences" aria-label="体验偏好">
          <button class="preference-button" data-action="theme" data-theme="${state.preferences.theme === 'stone' ? 'mist' : 'stone'}" aria-label="${state.preferences.theme === 'stone' ? '切换到柔和晨雾主题' : '切换到自然矿石主题'}">
            <span aria-hidden="true">${state.preferences.theme === 'stone' ? '◐' : '◑'}</span>${state.preferences.theme === 'stone' ? '自然矿石' : '柔和晨雾'}
          </button>
          <label class="sound-toggle"><input type="checkbox" data-action="sound" ${state.preferences.soundEnabled ? 'checked' : ''} /><span>结束提示音</span></label>
        </div>
      </section>
      <footer class="home-summary" aria-label="冥想记录摘要">
        <div><span>今天</span><strong>${formatDuration(stats.todaySeconds)}</strong></div>
        <div><span>最近 7 天</span><strong>${formatDuration(stats.last7Seconds)}</strong></div>
      </footer>
    </main>`;
}

function timerTemplate(controller: AppController): string {
  const state = controller.snapshot();
  const remaining = controller.getRemainingSeconds();
  const paused = state.timer.tag === 'paused';
  const confirming = state.timer.tag === 'confirming';
  const settling = state.timer.tag === 'settling';
  const visible = !confirming && (state.controlsVisible || paused);
  const progress = controller.getProgress();
  const offset = clockwiseRemainingDashOffset(progress, RING_CIRCUMFERENCE);
  return `
    <main class="page timer-page" aria-label="冥想计时" data-action="reveal-controls" tabindex="-1">
      <p class="sr-only" aria-live="polite">${paused ? '计时已暂停' : confirming ? '正在确认是否提前结束' : settling ? '正在保存本次记录' : '计时进行中'}</p>
      <section class="timer-stage ${paused ? 'is-paused' : ''}">
        <div class="ring-wrap">
          <svg class="progress-ring" viewBox="0 0 248 248" aria-hidden="true">
            <circle class="ring-track" cx="124" cy="124" r="116" />
            <circle class="ring-value" cx="124" cy="124" r="116" style="stroke-dasharray:${RING_CIRCUMFERENCE};stroke-dashoffset:${offset}" />
          </svg>
          <time id="timer-value" class="timer-value" datetime="PT${remaining}S">${formatClock(remaining)}</time>
        </div>
        <div class="timer-controls ${visible ? 'is-visible' : ''}" aria-hidden="${!visible}">
          ${paused
            ? '<button class="primary-button compact" data-action="resume">继续</button>'
            : `<button class="secondary-button" data-action="pause" ${settling ? 'disabled' : ''}>暂停</button>`}
          <button class="text-button caution" data-action="open-end" ${settling ? 'disabled' : ''}>提前结束</button>
        </div>
      </section>
      ${confirming ? confirmationTemplate(remaining) : ''}
    </main>`;
}

function confirmationTemplate(remaining: number): string {
  return `<div class="modal-backdrop" data-action="cancel-end">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="end-title" data-modal>
      <p class="eyebrow">还剩 ${formatClock(remaining)}</p>
      <h2 id="end-title">现在结束吗？</h2>
      <p>已经静心的时间会被如实记录。</p>
      <div class="modal-actions">
        <button class="secondary-button" data-action="cancel-end" autofocus>继续冥想</button>
        <button class="text-button caution" data-action="confirm-end">结束并记录</button>
      </div>
    </section>
  </div>`;
}

function chartTemplate(controller: AppController): string {
  const stats = controller.statistics();
  return `<div class="chart" role="img" aria-label="最近 15 天冥想时长：${stats.last15.map((day) => `${day.dateKey} ${formatDuration(day.totalSeconds)}`).join('；')}">
    ${stats.last15.map((day) => `<div class="bar-column" title="${escapeHtml(day.dateKey)} · ${formatDuration(day.totalSeconds)}"><span class="bar" style="height:${Math.max(day.ratio * 100, day.totalSeconds ? 5 : 1)}%"></span><small>${day.dateKey.slice(5).replace('-', '/')}</small></div>`).join('')}
  </div>`;
}

function completionTemplate(controller: AppController): string {
  const state = controller.snapshot();
  if (state.timer.tag !== 'completed') return '';
  const receipt = state.timer.receipt;
  const stats = controller.statistics();
  return `<main class="page completion-page" aria-labelledby="completion-title" tabindex="-1">
    <section class="completion-card">
      <p class="eyebrow">${receipt.reason === 'natural' ? '计时结束' : '本次已记录'}</p>
      <h1 id="completion-title" tabindex="-1">这一刻，已经足够。</h1>
      <p class="result-duration">${formatDuration(receipt.actualDurationSeconds)}</p>
      <p class="today-total">今天共静心 <strong>${formatDuration(stats.todaySeconds)}</strong></p>
      <div class="completion-actions">
        <button class="primary-button" data-action="repeat">再次冥想</button>
        <button class="secondary-button" data-action="home">返回首页</button>
      </div>
      <button class="records-toggle" data-action="records" aria-expanded="${state.recordsExpanded}" aria-controls="records-panel">${state.recordsExpanded ? '收起最近记录' : '查看最近记录'}</button>
    </section>
    ${state.recordsExpanded ? `<section class="records-panel" id="records-panel" aria-labelledby="records-title">
      <div class="records-heading"><div><p class="eyebrow">最近 15 天</p><h2 id="records-title">安静的累积</h2></div><p>7 天共 ${formatDuration(stats.last7Seconds)}<br>${stats.last15.reduce((sum, day) => sum + day.completionCount, 0)} 次完成</p></div>
      ${chartTemplate(controller)}
    </section>` : ''}
  </main>`;
}

export function mountApp(root: HTMLElement, controller: AppController): void {
  let lastTag = '';
  let lastRoute = '';
  const routeForTag = (tag: string) => tag === 'idle' ? 'home' : tag === 'completed' ? 'completion' : 'timer';
  const focusCurrentPage = () => window.setTimeout(
    () => root.querySelector<HTMLElement>('main.page')?.focus({ preventScroll: true }),
    0,
  );

  const updateControlsVisibility = () => {
    const controls = root.querySelector<HTMLElement>('.timer-controls');
    if (!controls) return;
    const state = controller.snapshot();
    const visible = state.timer.tag !== 'confirming'
      && (state.controlsVisible || state.timer.tag === 'paused');
    controls.classList.toggle('is-visible', visible);
    controls.setAttribute('aria-hidden', String(!visible));
  };

  const render = () => {
    const tag = controller.snapshot().timer.tag;
    const previousTag = lastTag;
    const returningFromConfirmation = lastTag === 'confirming' && (tag === 'running' || tag === 'paused');
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeAction = active?.dataset.action;
    const activeMinutes = active?.dataset.minutes;
    const activeId = active?.id;
    const activeWasPage = active?.matches('main.page') ?? false;
    const preferences = controller.snapshot().preferences;
    document.documentElement.dataset.theme = preferences.theme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      'content', preferences.theme === 'stone' ? '#D8D3C8' : '#E4E8E6',
    );
    const routeName = routeForTag(tag);
    if (tag === 'running' && lastTag === 'running' && root.querySelector('.timer-page')) {
      updateTimer();
      updateControlsVisibility();
      return;
    }
    root.innerHTML = tag === 'idle' ? homeTemplate(controller)
      : tag === 'completed' ? completionTemplate(controller)
      : timerTemplate(controller);
    if (lastRoute === routeName) root.querySelector('.page')?.classList.add('no-page-enter');
    document.body.dataset.view = tag;
    const route = tag === 'idle' ? '#/' : tag === 'completed' ? '#/complete' : '#/timer';
    if (location.hash !== route) {
      if (lastRoute === 'home' && routeName === 'timer') history.pushState({ route }, '', route);
      else history.replaceState({ route }, '', route);
    }
    if (tag === 'confirming' && lastTag !== 'confirming') {
      window.setTimeout(() => (root.querySelector('.modal [data-action="cancel-end"]') as HTMLElement | null)?.focus(), 0);
    } else if (returningFromConfirmation) {
      window.setTimeout(() => root.querySelector<HTMLElement>('[data-action="open-end"]')?.focus(), 0);
    } else if (lastRoute && lastRoute !== routeName) {
      window.setTimeout(() => root.querySelector<HTMLElement>('main.page')?.focus({ preventScroll: true }), 50);
    } else if (activeAction) {
      const nextAction = previousTag === 'running' && tag === 'paused' && activeAction === 'pause'
        ? 'resume'
        : previousTag === 'paused' && tag === 'running' && activeAction === 'resume'
          ? 'pause'
          : activeAction;
      const selector = activeMinutes
        ? `[data-action="${nextAction}"][data-minutes="${activeMinutes}"]`
        : `[data-action="${nextAction}"]`;
      window.setTimeout(() => root.querySelector<HTMLElement>(selector)?.focus(), 0);
    } else if (activeId || activeWasPage) {
      window.setTimeout(() => {
        const target = activeId ? document.getElementById(activeId) : root.querySelector<HTMLElement>('main.page');
        target?.focus({ preventScroll: true });
      }, 0);
    }
    lastTag = tag;
    lastRoute = routeName;
  };

  const updateTimer = () => {
    const seconds = controller.getRemainingSeconds();
    const value = root.querySelector<HTMLTimeElement>('#timer-value');
    if (value) { value.textContent = formatClock(seconds); value.dateTime = `PT${seconds}S`; }
    const ring = root.querySelector<SVGCircleElement>('.ring-value');
    if (ring) ring.style.strokeDashoffset = String(
      clockwiseRemainingDashOffset(controller.getProgress(), RING_CIRCUMFERENCE),
    );
  };

  controller.subscribe(render);
  controller.subscribeTick(updateTimer);
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'reveal-controls') controller.revealControls();
    if (action === 'duration') void controller.setDuration(Number(target.dataset.minutes));
    if (action === 'theme') void controller.setTheme(target.dataset.theme === 'mist' ? 'mist' : 'stone');
    if (action === 'start') void controller.start().then(focusCurrentPage);
    if (action === 'pause') void controller.pause();
    if (action === 'resume') void controller.resume();
    if (action === 'open-end') void controller.openEndConfirmation();
    if (action === 'cancel-end') {
      if ((event.target as HTMLElement).closest('[data-modal]') && target.classList.contains('modal-backdrop')) return;
      void controller.cancelEndConfirmation();
    }
    if (action === 'confirm-end') void controller.confirmEnd().then(focusCurrentPage);
    if (action === 'repeat') void controller.repeat().then(focusCurrentPage);
    if (action === 'home') void controller.returnHome().then(focusCurrentPage);
    if (action === 'records') controller.toggleRecords();
  });
  root.addEventListener('input', (event) => {
    const range = event.target as HTMLInputElement;
    if (range.dataset.action === 'sound') {
      void controller.setSoundEnabled(range.checked);
      return;
    }
    if (range.id !== 'duration-range') return;
    const minutes = Number(range.value);
    root.querySelector('#duration-value span')!.textContent = String(minutes);
    const label = root.querySelector<HTMLLabelElement>('.range-label');
    if (label) label.textContent = `冥想时长，${minutes} 分钟`;
    root.querySelectorAll<HTMLButtonElement>('.quick-time').forEach((button) => {
      const selected = isQuickMinuteSelected(minutes, Number(button.dataset.minutes));
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    void controller.setDuration(minutes, false);
  });
  document.addEventListener('keydown', (event) => {
    if (controller.snapshot().timer.tag === 'confirming') {
      if (event.key === 'Escape') {
        event.preventDefault();
        void controller.cancelEndConfirmation();
        return;
      }
      if (event.key === 'Tab') {
        const modal = root.querySelector<HTMLElement>('[data-modal]');
        const focusable = modal ? [...modal.querySelectorAll<HTMLElement>('button:not(:disabled)')] : [];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (first && !modal?.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    if ((event.key === 'Enter' || event.key === ' ') && controller.snapshot().timer.tag === 'running' && !controller.snapshot().controlsVisible) {
      event.preventDefault();
      controller.revealControls();
    }
  });
  document.addEventListener('visibilitychange', () => { void controller.handleVisibilityChange(document.hidden); });
  window.addEventListener('pagehide', () => { void controller.checkpointRunning(); });
  window.addEventListener('popstate', () => {
    const tag = controller.snapshot().timer.tag;
    if (tag === 'completed') void controller.returnHome();
    else if (tag === 'running' || tag === 'paused') {
      history.pushState({ route: '#/timer' }, '', '#/timer');
      void controller.openEndConfirmation();
    } else if (tag === 'confirming') {
      history.pushState({ route: '#/timer' }, '', '#/timer');
    }
  });
  render();
}
