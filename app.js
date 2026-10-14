'use strict';

// ---------- 운동 목록 ----------

const BODY_PARTS = {
  '가슴': ['벤치프레스', '인클라인 벤치프레스', '덤벨 프레스', '인클라인 덤벨 프레스', '체스트 프레스 머신', '펙덱 플라이', '케이블 크로스오버', '딥스', '푸시업'],
  '등': ['데드리프트', '랫풀다운', '풀업', '바벨 로우', '덤벨 로우', '시티드 케이블 로우', '티바 로우', '암 풀다운'],
  '하체': ['스쿼트', '레그 프레스', '핵 스쿼트', '런지', '루마니안 데드리프트', '레그 익스텐션', '레그 컬', '힙 쓰러스트', '카프 레이즈'],
  '어깨': ['오버헤드 프레스', '덤벨 숄더 프레스', '사이드 레터럴 레이즈', '프론트 레이즈', '리어 델트 플라이', '페이스 풀', '업라이트 로우'],
  '팔': ['바벨 컬', '덤벨 컬', '해머 컬', '프리처 컬', '케이블 푸시다운', '오버헤드 트라이셉스 익스텐션', '라잉 트라이셉스 익스텐션'],
  '복근': ['크런치', '레그 레이즈', '행잉 레그 레이즈', '케이블 크런치', '앱 롤아웃', '플랭크'],
  '기타': [],
};
const PART_NAMES = Object.keys(BODY_PARTS);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const STORAGE_KEY = 'gymlog.v1';

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  checkOff: '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  checkOn: '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="12.5" fill="currentColor"/><path d="M8.5 14.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------- 저장 ----------
// 기록 구조: { id, date: 'YYYY-MM-DD', bodyPart, name, createdAt, sets: [{ weight, reps, done }] }

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        records: Array.isArray(data.records) ? data.records : [],
        customExercises: Array.isArray(data.customExercises) ? data.customExercises : [],
      };
    }
  } catch (e) {
    console.error(e);
  }
  return { records: [], customExercises: [] };
}

let db = loadDB();

function saveDB() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
  }
}

// 브라우저가 저장소를 임의로 비우지 않도록 요청
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// ---------- 날짜 ----------

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};
const todayStr = () => fmtDate(new Date());
const shortDate = (s) => {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// ---------- 기록 계산 ----------

const filledSets = (r) => r.sets.filter((s) => s.reps > 0);
const volumeOf = (r) => filledSets(r).reduce((sum, s) => sum + s.weight * s.reps, 0);
const byCreated = (a, b) => a.createdAt - b.createdAt;
const recordsOn = (date) => db.records.filter((r) => r.date === date).sort(byCreated);
const findRecord = (id) => db.records.find((r) => r.id === id);

/** 같은 운동의 가장 최근 기록 (해당 날짜 이전) */
function latestBefore(name, date) {
  let best = null;
  for (const r of db.records) {
    if (r.name !== name || r.date >= date) continue;
    if (!best || r.date > best.date || (r.date === best.date && r.createdAt > best.createdAt)) best = r;
  }
  return best;
}

/** 60 → "60", 62.5 → "62.5" */
const fmtNum = (v) => String(Math.round(v * 100) / 100);
const fmtVolume = (v) => Math.round(v).toLocaleString('ko-KR');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const uid = () =>
  (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

// ---------- 화면 상태 ----------

const state = {
  tab: 'log',
  date: todayStr(),
  month: todayStr().slice(0, 8) + '01',
  exportLimit: false,
  exportStart: addDays(todayStr(), -30),
  exportEnd: todayStr(),
};
let sheet = null; // 운동 추가 시트 상태 { part, q, selected: [{ part, name }] }

const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const titleEl = $('#title');
const subheader = $('#subheader');
const headerAction = $('#header-action');
const fab = $('#fab');

function render() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  fab.hidden = state.tab !== 'log';
  if (state.tab === 'log') renderLog();
  else if (state.tab === 'calendar') renderCalendar();
  else renderExport();
}

// ---------- 기록 탭 ----------

function renderLog() {
  const d = parseDate(state.date);
  titleEl.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  headerAction.hidden = false;
  headerAction.textContent = '오늘';

  const weekStart = addDays(state.date, -d.getDay());
  const workoutDays = new Set(db.records.map((r) => r.date));
  const today = todayStr();

  let week = `<div class="week"><button class="icon-btn" data-act="week" data-n="-7" aria-label="이전 주">${ICON.left}</button>`;
  for (let i = 0; i < 7; i++) {
    const ds = addDays(weekStart, i);
    const cls = ['day', ds === state.date ? 'selected' : '', ds === today ? 'today' : ''].join(' ');
    week += `<button class="${cls}" data-act="pick-date" data-date="${ds}">
      <span class="wd">${WEEKDAYS[i]}</span>
      <span class="dn">${parseDate(ds).getDate()}</span>
      <span class="dot ${workoutDays.has(ds) ? 'on' : ''}"></span>
    </button>`;
  }
  week += `<button class="icon-btn" data-act="week" data-n="7" aria-label="다음 주">${ICON.right}</button></div>`;
  subheader.innerHTML = week;

  const records = recordsOn(state.date);
  if (!records.length) {
    view.innerHTML = `<div class="empty"><b>운동 기록이 없어요</b>아래 '운동 추가' 버튼으로 기록을 시작하세요.</div>`;
    return;
  }
  view.innerHTML = `<div class="stack">${summaryHTML(records)}${records.map(cardHTML).join('')}</div>`;
}

function summaryHTML(records) {
  const parts = [...new Set(records.map((r) => r.bodyPart))].join(' · ');
  return `<div class="card">
    <div class="summary-parts">${esc(parts)}</div>
    <div class="stats">
      <div><span class="label">운동</span><b>${records.length}개</b></div>
      <div><span class="label">세트</span><b id="sum-sets">${records.reduce((n, r) => n + filledSets(r).length, 0)}</b></div>
      <div><span class="label">볼륨</span><b id="sum-volume">${fmtVolume(records.reduce((n, r) => n + volumeOf(r), 0))}kg</b></div>
    </div>
  </div>`;
}

function updateSummary() {
  const records = recordsOn(state.date);
  const sets = $('#sum-sets');
  const volume = $('#sum-volume');
  if (sets) sets.textContent = records.reduce((n, r) => n + filledSets(r).length, 0);
  if (volume) volume.textContent = fmtVolume(records.reduce((n, r) => n + volumeOf(r), 0)) + 'kg';
}

function cardHTML(r) {
  const prev = latestBefore(r.name, r.date);
  const prevSets = prev ? filledSets(prev) : [];
  const prevText = prevSets.length
    ? `<div class="prev">지난 기록 · ${shortDate(prev.date)} ${prevSets.map((s) => `${fmtNum(s.weight)}×${s.reps}`).join(', ')}</div>`
    : '';

  const rows = r.sets.map((s, i) => `
    <div class="set-row ${s.done ? 'done' : ''}" data-i="${i}">
      <span class="set-no">${i + 1}</span>
      <input class="num" type="text" inputmode="decimal" data-field="weight" placeholder="0" value="${s.weight ? fmtNum(s.weight) : ''}" aria-label="${i + 1}세트 무게">
      <input class="num" type="text" inputmode="numeric" pattern="[0-9]*" data-field="reps" placeholder="0" value="${s.reps || ''}" aria-label="${i + 1}세트 횟수">
      <button class="check" data-act="toggle-set" aria-label="${i + 1}세트 완료">${s.done ? ICON.checkOn : ICON.checkOff}</button>
    </div>`).join('');

  return `<section class="card" data-id="${r.id}">
    <div class="ex-head">
      <div><div class="ex-part">${esc(r.bodyPart)}</div><div class="ex-name">${esc(r.name)}</div></div>
      <button class="icon-btn" data-act="delete-ex" aria-label="운동 삭제">${ICON.more}</button>
    </div>
    ${prevText}
    <div class="set-row head"><span>세트</span><span>kg</span><span>회</span><span>완료</span></div>
    ${rows}
    <div class="set-actions">
      <button class="soft-btn" data-act="remove-set" ${r.sets.length ? '' : 'disabled'}>− 세트 삭제</button>
      <button class="soft-btn" data-act="add-set">＋ 세트 추가</button>
    </div>
  </section>`;
}

// 숫자 입력: 입력할 때마다 저장하고 요약만 갱신 (화면을 다시 그리면 키보드가 내려감)
view.addEventListener('input', (e) => {
  const input = e.target.closest('input[data-field]');
  if (!input) return;
  const rec = findRecord(input.closest('[data-id]').dataset.id);
  const set = rec && rec.sets[Number(input.closest('[data-i]').dataset.i)];
  if (!set) return;

  let value = parseFloat(input.value.replace(',', '.'));
  if (!isFinite(value) || value < 0) value = 0;
  if (input.dataset.field === 'reps') value = Math.min(9999, Math.floor(value));
  set[input.dataset.field] = value;
  saveDB();
  updateSummary();
});

// 키보드의 Enter(다음)로 다음 칸으로 이동
view.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('input.num')) return;
  e.preventDefault();
  const inputs = [...view.querySelectorAll('input.num')];
  const next = inputs[inputs.indexOf(e.target) + 1];
  if (next) next.focus();
  else e.target.blur();
});

// ---------- 캘린더 탭 ----------

function renderCalendar() {
  titleEl.textContent = '캘린더';
  headerAction.hidden = true;
  subheader.innerHTML = '';

  const first = parseDate(state.month);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prefix = state.month.slice(0, 8);
  const monthRecords = db.records.filter((r) => r.date.startsWith(prefix)).sort(byCreated);
  const today = todayStr();

  const partsByDay = {};
  for (const r of monthRecords) {
    const parts = (partsByDay[r.date] = partsByDay[r.date] || []);
    if (!parts.includes(r.bodyPart)) parts.push(r.bodyPart);
  }

  let grid = WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join('');
  grid += '<div></div>'.repeat(first.getDay());
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = prefix + pad(day);
    const parts = partsByDay[ds] || [];
    const cls = ['cal-day', parts.length ? 'has' : '', ds === today ? 'today' : ''].join(' ');
    grid += `<button class="${cls}" data-act="cal-day" data-date="${ds}">
      <span class="n">${day}</span>
      <span class="p">${esc(parts.join('·'))}</span>
    </button>`;
  }

  const setsByPart = {};
  for (const r of monthRecords) setsByPart[r.bodyPart] = (setsByPart[r.bodyPart] || 0) + filledSets(r).length;
  const partRows = Object.entries(setsByPart)
    .sort((a, b) => b[1] - a[1])
    .map(([part, n]) => `<div class="list-row"><span>${esc(part)}</span><span class="value">${n}세트</span></div>`)
    .join('');

  view.innerHTML = `<div class="stack">
    <div class="card">
      <div class="month-head">
        <button class="icon-btn" data-act="month" data-n="-1" aria-label="이전 달">${ICON.left}</button>
        <b>${year}년 ${month + 1}월</b>
        <button class="icon-btn" data-act="month" data-n="1" aria-label="다음 달">${ICON.right}</button>
      </div>
      <div class="cal-grid">${grid}</div>
    </div>
    <div class="card">
      <h2 class="section-title">이번 달 요약</h2>
      <div class="stats">
        <div><span class="label">운동한 날</span><b>${new Set(monthRecords.map((r) => r.date)).size}일</b></div>
        <div><span class="label">총 세트</span><b>${monthRecords.reduce((n, r) => n + filledSets(r).length, 0)}</b></div>
        <div><span class="label">총 볼륨</span><b>${fmtVolume(monthRecords.reduce((n, r) => n + volumeOf(r), 0))}kg</b></div>
      </div>
      ${partRows ? `<div class="divider"></div>${partRows}` : ''}
    </div>
  </div>`;
}

// ---------- 내보내기 탭 ----------

function exportRecords() {
  const sorted = [...db.records].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  if (!state.exportLimit) return sorted;
  return sorted.filter((r) => r.date >= state.exportStart && r.date <= state.exportEnd);
}

function makeCSV(records) {
  const csvEsc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['date,body_part,exercise,set,weight_kg,reps,volume_kg,completed'];
  for (const r of records) {
    filledSets(r).forEach((s, i) => {
      lines.push([r.date, r.bodyPart, r.name, i + 1, fmtNum(s.weight), s.reps, fmtNum(s.weight * s.reps), s.done ? 'true' : 'false']
        .map(csvEsc).join(','));
    });
  }
  return lines.join('\n') + '\n';
}

function renderExport() {
  titleEl.textContent = '내보내기';
  headerAction.hidden = true;
  subheader.innerHTML = '';

  const records = exportRecords();
  const csv = makeCSV(records);
  const preview = csv.split('\n').slice(0, 8).join('\n');

  view.innerHTML = `
    <div class="group-label">기간</div>
    <div class="card list">
      <label class="list-row"><span>기간 지정</span><input type="checkbox" class="switch" data-export="limit" ${state.exportLimit ? 'checked' : ''}></label>
      ${state.exportLimit ? `
        <label class="list-row"><span>시작</span><input type="date" data-export="start" value="${state.exportStart}" max="${state.exportEnd}"></label>
        <label class="list-row"><span>종료</span><input type="date" data-export="end" value="${state.exportEnd}" min="${state.exportStart}"></label>` : ''}
    </div>

    <div class="group-label">내보낼 데이터</div>
    <div class="card list">
      <div class="list-row"><span>운동한 날</span><span class="value">${new Set(records.map((r) => r.date)).size}일</span></div>
      <div class="list-row"><span>운동 기록</span><span class="value">${records.length}개</span></div>
      <div class="list-row"><span>세트</span><span class="value">${records.reduce((n, r) => n + filledSets(r).length, 0)}개</span></div>
    </div>

    <div class="card list" style="margin-top:12px">
      <button class="link-btn" data-act="export-csv" ${records.length ? '' : 'disabled'}>CSV로 내보내기</button>
    </div>
    <p class="footnote">횟수를 입력하지 않은 빈 세트는 빠져요. 내보낸 파일을 Claude에게 첨부하면 기록을 분석해 달라고 할 수 있어요.</p>

    <div class="group-label">백업</div>
    <div class="card list">
      <button class="link-btn" data-act="backup" ${db.records.length ? '' : 'disabled'}>백업 파일 저장</button>
      <button class="link-btn" data-act="restore">백업에서 복원</button>
    </div>
    <p class="footnote">기록은 이 기기 안에만 저장돼요. 폰을 바꾸거나 혹시 모를 상황에 대비해 가끔 백업 파일을 저장해 두세요.</p>

    ${records.length ? `
      <div class="group-label">미리보기</div>
      <div class="card list"><pre class="preview">${esc(preview)}</pre></div>` : ''}
  `;
}

view.addEventListener('change', (e) => {
  const el = e.target.closest('[data-export]');
  if (!el) return;
  const key = el.dataset.export;
  if (key === 'limit') state.exportLimit = el.checked;
  else if (el.value && key === 'start') state.exportStart = el.value;
  else if (el.value && key === 'end') state.exportEnd = el.value;
  render();
});

/** iOS에서는 공유 시트(파일 저장, 에어드롭, 카톡 등)로, 그 외에는 다운로드로 */
async function shareFile(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => todayStr().replace(/-/g, '');

function exportCSV() {
  // 엑셀에서 열어도 한글이 깨지지 않도록 UTF-8 BOM 추가
  shareFile(`gym_log_${stamp()}.csv`, '﻿' + makeCSV(exportRecords()), 'text/csv');
}

function backup() {
  const data = { app: 'gymlog', version: 1, exportedAt: new Date().toISOString(), ...db };
  shareFile(`gym_log_backup_${stamp()}.json`, JSON.stringify(data), 'application/json');
}

$('#restore-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.records)) throw new Error('invalid');
    if (!confirm(`백업 파일의 기록 ${data.records.length}개로 지금 기록을 바꿀까요?\n현재 기록은 사라져요.`)) return;
    db = { records: data.records, customExercises: Array.isArray(data.customExercises) ? data.customExercises : [] };
    saveDB();
    render();
    toast('복원했어요');
  } catch (err) {
    toast('백업 파일을 읽지 못했어요');
  }
});

// ---------- 공통 클릭 처리 ----------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const card = btn.closest('[data-id]');
  const rec = card ? findRecord(card.dataset.id) : null;

  switch (btn.dataset.act) {
    case 'week':
      state.date = addDays(state.date, Number(btn.dataset.n));
      render();
      break;
    case 'pick-date':
      state.date = btn.dataset.date;
      render();
      break;
    case 'toggle-set': {
      const row = btn.closest('[data-i]');
      const set = rec.sets[Number(row.dataset.i)];
      set.done = !set.done;
      saveDB();
      row.classList.toggle('done', set.done);
      btn.innerHTML = set.done ? ICON.checkOn : ICON.checkOff;
      break;
    }
    case 'add-set': {
      // 마지막 세트의 무게·횟수를 복사
      const last = rec.sets[rec.sets.length - 1];
      rec.sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false });
      saveDB();
      render();
      break;
    }
    case 'remove-set':
      rec.sets.pop();
      saveDB();
      render();
      break;
    case 'delete-ex':
      if (confirm(`'${rec.name}' 기록을 삭제할까요?`)) {
        db.records = db.records.filter((r) => r !== rec);
        saveDB();
        render();
      }
      break;
    case 'month': {
      const d = parseDate(state.month);
      d.setMonth(d.getMonth() + Number(btn.dataset.n));
      state.month = fmtDate(d);
      render();
      break;
    }
    case 'cal-day':
      state.date = btn.dataset.date;
      state.tab = 'log';
      render();
      window.scrollTo(0, 0);
      break;
    case 'export-csv':
      exportCSV();
      break;
    case 'backup':
      backup();
      break;
    case 'restore':
      $('#restore-input').click();
      break;
  }
});

document.querySelectorAll('.tab').forEach((b) =>
  b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    render();
    window.scrollTo(0, 0);
  })
);

headerAction.addEventListener('click', () => {
  state.date = todayStr();
  render();
});

fab.addEventListener('click', openSheet);

// ---------- 운동 추가 시트 ----------

const exercisesFor = (part) => [
  ...BODY_PARTS[part],
  ...db.customExercises.filter((c) => c.bodyPart === part).map((c) => c.name),
];

function sheetChoices() {
  const q = sheet.q.trim().toLowerCase();
  const parts = q ? PART_NAMES : [sheet.part];
  const out = [];
  for (const part of parts) {
    for (const name of exercisesFor(part)) {
      if (!q || name.toLowerCase().includes(q)) out.push({ part, name });
    }
  }
  return out;
}

function openSheet() {
  sheet = { part: '가슴', q: '', selected: [] };
  const el = $('#sheet');
  el.innerHTML = `
    <div class="sheet-backdrop" data-sheet="close"></div>
    <div class="sheet-panel" role="dialog" aria-label="운동 추가">
      <div class="sheet-head">
        <button class="text-btn" data-sheet="close">취소</button>
        <b>운동 추가</b>
        <button class="text-btn" data-sheet="custom">직접 추가</button>
      </div>
      <div class="search"><input id="sheet-search" type="search" placeholder="운동 검색" autocomplete="off"></div>
      <div id="sheet-chips"></div>
      <div id="sheet-list" class="sheet-list"></div>
      <div class="sheet-foot"><button id="sheet-add" class="primary" data-sheet="add"></button></div>
    </div>`;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  renderSheetBody();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
}

function closeSheet() {
  const el = $('#sheet');
  el.classList.remove('open');
  document.body.style.overflow = '';
  sheet = null;
  setTimeout(() => {
    if (!sheet) {
      el.hidden = true;
      el.innerHTML = '';
    }
  }, 300);
}

function renderSheetBody() {
  const searching = sheet.q.trim() !== '';
  $('#sheet-chips').innerHTML = searching
    ? ''
    : `<div class="chips">${PART_NAMES.map((p) =>
        `<button class="chip ${p === sheet.part ? 'active' : ''}" data-sheet="part" data-part="${esc(p)}">${esc(p)}</button>`).join('')}</div>`;

  const choices = sheetChoices();
  $('#sheet-list').innerHTML = choices.length
    ? choices.map(({ part, name }) => {
        const index = sheet.selected.findIndex((s) => s.part === part && s.name === name);
        return `<button class="choice" data-sheet="pick" data-part="${esc(part)}" data-name="${esc(name)}">
          <span>${esc(name)}${searching ? `<small>${esc(part)}</small>` : ''}</span>
          ${index >= 0 ? `<span class="badge">${index + 1}</span>` : '<span class="ring"></span>'}
        </button>`;
      }).join('')
    : `<div class="sheet-empty">운동이 없어요.<br>오른쪽 위 '직접 추가'로 만들 수 있어요.</div>`;

  const add = $('#sheet-add');
  add.disabled = sheet.selected.length === 0;
  add.textContent = sheet.selected.length ? `${sheet.selected.length}개 운동 추가` : '운동을 선택하세요';
}

$('#sheet').addEventListener('input', (e) => {
  if (e.target.id !== 'sheet-search' || !sheet) return;
  sheet.q = e.target.value;
  renderSheetBody();
});

$('#sheet').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sheet]');
  if (!btn || !sheet || btn.disabled) return;

  switch (btn.dataset.sheet) {
    case 'close':
      closeSheet();
      break;
    case 'part':
      sheet.part = btn.dataset.part;
      $('#sheet-list').scrollTop = 0;
      renderSheetBody();
      break;
    case 'pick': {
      const { part, name } = btn.dataset;
      const index = sheet.selected.findIndex((s) => s.part === part && s.name === name);
      if (index >= 0) sheet.selected.splice(index, 1);
      else sheet.selected.push({ part, name });
      renderSheetBody();
      break;
    }
    case 'custom': {
      const name = (prompt(`'${sheet.part}' 부위에 추가할 운동 이름`) || '').trim();
      if (!name) return;
      if (!exercisesFor(sheet.part).includes(name)) {
        db.customExercises.push({ name, bodyPart: sheet.part });
        saveDB();
      }
      if (!sheet.selected.some((s) => s.part === sheet.part && s.name === name)) {
        sheet.selected.push({ part: sheet.part, name });
      }
      sheet.q = '';
      $('#sheet-search').value = '';
      renderSheetBody();
      break;
    }
    case 'add':
      addSelected();
      break;
  }
});

/** 선택한 운동을 기록에 추가. 지난 기록이 있으면 그 세트 구성(무게·횟수)을 그대로 가져옴 */
function addSelected() {
  const base = Date.now();
  sheet.selected.forEach(({ part, name }, i) => {
    const prev = latestBefore(name, state.date);
    const template = prev ? filledSets(prev) : [];
    const sets = template.length
      ? template.map((s) => ({ weight: s.weight, reps: s.reps, done: false }))
      : [0, 1, 2].map(() => ({ weight: 0, reps: 0, done: false }));
    db.records.push({ id: uid(), date: state.date, bodyPart: part, name, createdAt: base + i, sets });
  });
  saveDB();
  closeSheet();
  render();
}

// ---------- 기타 ----------

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

// 자정을 넘겨 앱을 다시 열었을 때 '오늘'이 어제로 남지 않도록
let lastToday = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayStr();
  if (now !== lastToday) {
    if (state.date === lastToday) state.date = now;
    lastToday = now;
    render();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
