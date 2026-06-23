import { sampleGame } from './shibaiinu/scenario/sampleGame.js';

const scenario = sampleGame;
const eventMap = scenario.eventMap;

function renderStats() {
  const events = Object.entries(eventMap);
  const messageEvents = events.filter(([_, v]) => v.event.constructor.name === 'MessageEvent');
  const selectionEvents = events.filter(([_, v]) => v.event.constructor.name === 'SelectionEvent');
  const endEvents = events.filter(([_, v]) => v.next === null);

  const totalMessages = messageEvents.reduce((sum, [_, v]) => sum + v.event.messages.length, 0);
  const totalChoices = selectionEvents.reduce((sum, [_, v]) => sum + v.event.choices.length, 0);

  document.getElementById('stats').innerHTML = `
    <div class="stat">
      <div class="stat-value">${events.length}</div>
      <div class="stat-label">イベント数</div>
    </div>
    <div class="stat">
      <div class="stat-value">${messageEvents.length}</div>
      <div class="stat-label">メッセージ</div>
    </div>
    <div class="stat">
      <div class="stat-value">${selectionEvents.length}</div>
      <div class="stat-label">選択肢</div>
    </div>
    <div class="stat">
      <div class="stat-value">${totalMessages}</div>
      <div class="stat-label">総テキスト数</div>
    </div>
    <div class="stat">
      <div class="stat-value">${totalChoices}</div>
      <div class="stat-label">総選択肢数</div>
    </div>
    <div class="stat">
      <div class="stat-value">${endEvents.length}</div>
      <div class="stat-label">エンディング</div>
    </div>
  `;
}

function renderEventList() {
  const container = document.getElementById('event-list');

  for (const [id, node] of Object.entries(eventMap)) {
    const event = node.event;
    const isMessage = event.constructor.name === 'MessageEvent';
    const isStart = id === 'start';
    const isEnd = node.next === null;

    let cardClass = 'event-card';
    if (isStart) cardClass += ' start';
    if (isEnd) cardClass += ' end';

    let contentHtml = '';
    if (isMessage) {
      contentHtml = event.messages.map(m => {
        const speaker = m.speaker ? `<span class="message-speaker">${m.speaker}:</span> ` : '';
        const meta = [];
        if (m.image) meta.push(`img:${m.image}`);
        if (m.background) meta.push(`bg:${m.background}`);
        if (m.image === null) meta.push('img:消去');
        if (m.background === null) meta.push('bg:消去');
        const metaHtml = meta.length ? `<span class="message-meta">[${meta.join(', ')}]</span>` : '';
        const textHtml = m.text !== undefined ? `<span class="message-text">${escapeHtml(m.text)}</span> ` : '';
        return `<div class="message-item">${speaker}${textHtml}${metaHtml}</div>`;
      }).join('');
    } else {
      contentHtml = event.choices.map((c, i) =>
        `<div class="choice-item">${i}: ${escapeHtml(c)}</div>`
      ).join('');
    }

    let nextHtml = '';
    if (node.next === null) {
      nextHtml = '<span class="next-label">→ </span><span style="color:#f44336">END</span>';
    } else if (typeof node.next === 'function') {
      nextHtml = '<span class="next-label">→ </span><span class="next-conditional">(条件分岐)</span>';
    } else if (typeof node.next === 'object') {
      const nexts = Object.entries(node.next).map(([k, v]) =>
        `${k}→<span class="next-id" data-id="${v}">${v}</span>`
      ).join(', ');
      nextHtml = `<span class="next-label">→ </span>${nexts}`;
    } else {
      nextHtml = `<span class="next-label">→ </span><span class="next-id" data-id="${node.next}">${node.next}</span>`;
    }

    container.innerHTML += `
      <div class="${cardClass}" id="event-${id}">
        <div class="event-header">
          <span class="event-id">${id}</span>
          <span class="event-type ${isMessage ? 'message' : 'selection'}">
            ${isMessage ? 'MESSAGE' : 'SELECTION'}
          </span>
          ${isStart ? '<span style="color:#4caf50">● START</span>' : ''}
          ${isEnd ? '<span style="color:#f44336">● END</span>' : ''}
        </div>
        <div class="event-content">${contentHtml}</div>
        <div class="event-next">${nextHtml}</div>
      </div>
    `;
  }

  container.querySelectorAll('.next-id').forEach(el => {
    el.addEventListener('click', () => {
      const targetId = el.dataset.id;
      const target = document.getElementById('event-' + targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.borderColor = '#fff';
        setTimeout(() => target.style.borderColor = '', 1000);
      }
    });
  });
}

function renderFlowDiagram() {
  const lines = [];
  const visited = new Set();

  function traverse(id, indent = 0) {
    if (!id || visited.has(id)) return;
    visited.add(id);

    const node = eventMap[id];
    if (!node) return;

    const prefix = '  '.repeat(indent);
    const event = node.event;
    const isMessage = event.constructor.name === 'MessageEvent';

    lines.push(`${prefix}<span class="flow-node">[${id}]</span> ${isMessage ? 'MSG' : 'SEL'}`);

    if (node.next === null) {
      lines.push(`${prefix}  <span class="flow-arrow">└→</span> <span style="color:#f44336">END</span>`);
    } else if (typeof node.next === 'function') {
      lines.push(`${prefix}  <span class="flow-arrow">└→</span> <span class="flow-choice">(条件分岐)</span>`);
    } else if (typeof node.next === 'object') {
      Object.entries(node.next).forEach(([k, v], i, arr) => {
        const isLast = i === arr.length - 1;
        const arrow = isLast ? '└→' : '├→';
        lines.push(`${prefix}  <span class="flow-arrow">${arrow}</span> <span class="flow-choice">[${k}]</span> → <span class="flow-node">${v}</span>`);
      });
    } else {
      lines.push(`${prefix}  <span class="flow-arrow">└→</span> <span class="flow-node">${node.next}</span>`);
      traverse(node.next, indent);
    }
  }

  traverse('start');

  document.getElementById('flow-text').innerHTML = lines.join('\n');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

renderStats();
renderEventList();
renderFlowDiagram();
