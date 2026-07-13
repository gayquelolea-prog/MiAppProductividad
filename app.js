(() => {
  'use strict';

  /* ============ Storage helpers ============ */
  const STORE = {
    habits: 'enfoque.habits',            // [{id, name}]
    habitLog: 'enfoque.habitLog',        // { "2026-07-12": [habitId, ...] }
    habitHistory: 'enfoque.habitHistory',// { "2026-07-12": {completed, total} }
    routines: 'enfoque.routines',        // [{id, name, exercises:[{id,name}]}]
    todos: 'enfoque.todos'               // [{id,title,description,dueDate,done,archived}]
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('No se pudo leer', key, e);
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('No se pudo guardar', key, e);
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function dateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayKey() { return dateKey(new Date()); }

  const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

  /* ============ State ============ */
  let habits = load(STORE.habits, []);
  let habitLog = load(STORE.habitLog, {});
  let habitHistory = load(STORE.habitHistory, {});
  let routines = load(STORE.routines, []);
  let todos = load(STORE.todos, []);

  let activeRoutineId = null;
  let currentTab = 'habits';
  let currentDayKey = todayKey();
  let calDate = new Date();
  calDate.setDate(1);

  /* ============ DOM refs ============ */
  const $ = (id) => document.getElementById(id);

  const pageTitle = $('page-title');
  const todayLabel = $('today-label');
  const progressCount = $('progress-count');
  const progressFill = $('progress-fill');
  const progressTrack = $('progress-track');

  const habitsList = $('habits-list');
  const habitsEmpty = $('habits-empty');
  const habitForm = $('habit-form');
  const habitInput = $('habit-input');

  const todosList = $('todos-list');
  const todosEmpty = $('todos-empty');
  const todoForm = $('todo-form');
  const todoTitle = $('todo-title');
  const todoDesc = $('todo-desc');
  const todoDue = $('todo-due');

  const routinesIndex = $('routines-index');
  const routinesList = $('routines-list');
  const routinesEmpty = $('routines-empty');
  const routineForm = $('routine-form');
  const routineInput = $('routine-input');

  const routineDetail = $('routine-detail');
  const routineDetailTitle = $('routine-detail-title');
  const routineBack = $('routine-back');
  const exercisesList = $('exercises-list');
  const exercisesEmpty = $('exercises-empty');
  const exerciseForm = $('exercise-form');
  const exerciseInput = $('exercise-input');
  const routineDeleteBtn = $('routine-delete');

  const calPrev = $('cal-prev');
  const calNext = $('cal-next');
  const calMonthLabel = $('cal-month-label');
  const calGrid = $('cal-grid');
  const calDetail = $('cal-detail');

  const tabbar = $('tabbar');

  /* ============ Tab switching ============ */
  const TAB_META = {
    habits: { title: 'Hábitos', eyebrow: 'Hoy' },
    todos: { title: 'To-Do', eyebrow: 'Pendientes' },
    routines: { title: 'Rutinas', eyebrow: 'Entrenamiento' },
    calendar: { title: 'Progreso', eyebrow: 'Historial' }
  };

  function showTab(tab) {
    currentTab = tab;

    document.querySelectorAll('[data-view]').forEach(v => v.hidden = true);
    $(`view-${tab}`).hidden = false;

    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });

    const meta = TAB_META[tab];
    pageTitle.textContent = meta.title;
    todayLabel.textContent = meta.eyebrow;

    const showProgress = tab === 'habits';
    progressTrack.style.visibility = showProgress ? 'visible' : 'hidden';
    progressCount.style.visibility = showProgress ? 'visible' : 'hidden';

    if (tab === 'routines') {
      activeRoutineId = null;
      routineDetail.hidden = true;
      routinesIndex.hidden = false;
    }

    render();
  }

  tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    showTab(btn.dataset.tab);
  });

  /* ============ Habits ============ */
  function recordHabitHistory() {
    const log = habitLog[todayKey()] || [];
    habitHistory[todayKey()] = { completed: log.length, total: habits.length };
    save(STORE.habitHistory, habitHistory);
  }

  function renderHabits() {
    const log = habitLog[todayKey()] || [];
    habitsList.innerHTML = '';

    habitsEmpty.hidden = habits.length > 0;

    habits.forEach(h => {
      const done = log.includes(h.id);

      const li = document.createElement('li');
      li.className = 'list-item' + (done ? ' is-done' : '');

      li.innerHTML = `
        <button class="check" aria-label="Marcar hábito">${CHECK_ICON}</button>
        <span class="item-text"></span>
        <button class="item-remove" aria-label="Eliminar hábito">×</button>
      `;
      li.querySelector('.item-text').textContent = h.name;

      li.querySelector('.check').addEventListener('click', () => toggleHabit(h.id));
      li.querySelector('.item-remove').addEventListener('click', () => removeHabit(h.id));

      habitsList.appendChild(li);
    });

    const doneCount = habits.filter(h => log.includes(h.id)).length;
    const total = habits.length;
    progressCount.textContent = `${doneCount}/${total}`;
    progressFill.style.width = total ? `${(doneCount / total) * 100}%` : '0%';
  }

  function toggleHabit(id) {
    const key = todayKey();
    const log = habitLog[key] ? habitLog[key].slice() : [];
    const idx = log.indexOf(id);
    if (idx === -1) log.push(id); else log.splice(idx, 1);
    habitLog[key] = log;
    save(STORE.habitLog, habitLog);
    recordHabitHistory();
    renderHabits();
  }

  function removeHabit(id) {
    habits = habits.filter(h => h.id !== id);
    save(STORE.habits, habits);
    recordHabitHistory();
    renderHabits();
  }

  habitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = habitInput.value.trim();
    if (!name) return;
    habits.push({ id: uid(), name });
    save(STORE.habits, habits);
    habitInput.value = '';
    recordHabitHistory();
    renderHabits();
  });

  /* --- Day rollover watcher: keeps checkboxes fresh across midnight without reload --- */
  setInterval(() => {
    const nowKey = todayKey();
    if (nowKey !== currentDayKey) {
      currentDayKey = nowKey;
      if (currentTab === 'habits') renderHabits();
    }
  }, 30000);

  /* ============ To-Do ============ */
  function formatDue(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  function renderTodos() {
    todosList.innerHTML = '';
    const visible = todos.filter(t => !t.archived);
    todosEmpty.hidden = visible.length > 0;

    const sorted = visible.slice().sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    sorted.forEach(t => {
      const li = document.createElement('li');
      li.className = 'list-item todo-item' + (t.done ? ' is-done' : '');

      const overdue = !t.done && t.dueDate && t.dueDate < todayKey();

      li.innerHTML = `
        <button class="check" aria-label="Marcar tarea">${CHECK_ICON}</button>
        <div class="todo-body">
          <span class="item-text"></span>
          ${t.description ? '<p class="todo-desc"></p>' : ''}
          ${t.dueDate ? `<span class="todo-due${overdue ? ' is-overdue' : ''}"></span>` : ''}
        </div>
        <div class="todo-actions">
          ${t.done ? '<button class="archive-btn">Archivar</button>' : ''}
          <button class="item-remove" aria-label="Eliminar tarea">×</button>
        </div>
      `;

      li.querySelector('.item-text').textContent = t.title;
      if (t.description) li.querySelector('.todo-desc').textContent = t.description;
      if (t.dueDate) {
        li.querySelector('.todo-due').textContent = (overdue ? 'Venció ' : 'Vence ') + formatDue(t.dueDate);
      }

      li.querySelector('.check').addEventListener('click', () => toggleTodo(t.id));
      li.querySelector('.item-remove').addEventListener('click', () => removeTodo(t.id));
      const archiveBtn = li.querySelector('.archive-btn');
      if (archiveBtn) archiveBtn.addEventListener('click', () => archiveTodo(t.id));

      todosList.appendChild(li);
    });
  }

  function toggleTodo(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    save(STORE.todos, todos);
    renderTodos();
  }

  function archiveTodo(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    t.archived = true;
    save(STORE.todos, todos);
    renderTodos();
  }

  function removeTodo(id) {
    todos = todos.filter(t => t.id !== id);
    save(STORE.todos, todos);
    renderTodos();
  }

  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = todoTitle.value.trim();
    if (!title) return;
    todos.push({
      id: uid(),
      title,
      description: todoDesc.value.trim(),
      dueDate: todoDue.value || null,
      done: false,
      archived: false
    });
    save(STORE.todos, todos);
    todoTitle.value = '';
    todoDesc.value = '';
    todoDue.value = '';
    renderTodos();
  });

  /* ============ Routines ============ */
  function renderRoutines() {
    routinesList.innerHTML = '';
    routinesEmpty.hidden = routines.length > 0;

    routines.forEach(r => {
      const li = document.createElement('li');
      li.className = 'list-item routine-row';
      const count = r.exercises.length;
      li.innerHTML = `
        <span class="item-text">
          <div></div>
          <div class="routine-meta">${count} ejercicio${count === 1 ? '' : 's'}</div>
        </span>
        <span class="chevron">›</span>
      `;
      li.querySelector('.item-text > div').textContent = r.name;
      li.addEventListener('click', () => openRoutine(r.id));
      routinesList.appendChild(li);
    });
  }

  function openRoutine(id) {
    activeRoutineId = id;
    routinesIndex.hidden = true;
    routineDetail.hidden = false;
    renderRoutineDetail();
  }

  function renderRoutineDetail() {
    const r = routines.find(x => x.id === activeRoutineId);
    if (!r) { backToRoutines(); return; }

    routineDetailTitle.textContent = r.name;
    exercisesList.innerHTML = '';
    exercisesEmpty.hidden = r.exercises.length > 0;

    r.exercises.forEach(ex => {
      const li = document.createElement('li');
      li.className = 'list-item';
      li.innerHTML = `
        <span class="item-text"></span>
        <button class="item-remove" aria-label="Eliminar ejercicio">×</button>
      `;
      li.querySelector('.item-text').textContent = ex.name;
      li.querySelector('.item-remove').addEventListener('click', () => removeExercise(ex.id));
      exercisesList.appendChild(li);
    });
  }

  function backToRoutines() {
    activeRoutineId = null;
    routineDetail.hidden = true;
    routinesIndex.hidden = false;
    renderRoutines();
  }

  routineBack.addEventListener('click', backToRoutines);

  routineForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = routineInput.value.trim();
    if (!name) return;
    routines.push({ id: uid(), name, exercises: [] });
    save(STORE.routines, routines);
    routineInput.value = '';
    renderRoutines();
  });

  exerciseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = exerciseInput.value.trim();
    if (!name) return;
    const r = routines.find(x => x.id === activeRoutineId);
    if (!r) return;
    r.exercises.push({ id: uid(), name });
    save(STORE.routines, routines);
    exerciseInput.value = '';
    renderRoutineDetail();
  });

  function removeExercise(exId) {
    const r = routines.find(x => x.id === activeRoutineId);
    if (!r) return;
    r.exercises = r.exercises.filter(e => e.id !== exId);
    save(STORE.routines, routines);
    renderRoutineDetail();
  }

  routineDeleteBtn.addEventListener('click', () => {
    routines = routines.filter(r => r.id !== activeRoutineId);
    save(STORE.routines, routines);
    backToRoutines();
  });

  /* ============ Calendar ============ */
  function renderCalendar() {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();

    const label = calDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    calMonthLabel.textContent = label;

    const firstDay = new Date(year, month, 1);
    const leading = (firstDay.getDay() + 6) % 7; // Monday-first offset
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    calGrid.innerHTML = '';
    calDetail.textContent = '';

    for (let i = 0; i < leading; i++) {
      const spacer = document.createElement('div');
      spacer.className = 'cal-cell is-empty';
      calGrid.appendChild(spacer);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${pad(month + 1)}-${pad(day)}`;
      const entry = habitHistory[key];
      const isToday = key === todayKey();

      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (isToday ? ' is-today' : '') + (entry ? ' is-clickable' : '');

      let dotClass = null;
      if (entry && entry.total > 0) {
        dotClass = entry.completed >= entry.total ? 'dot-good' : (entry.completed > 0 ? 'dot-partial' : 'dot-none');
      } else if (entry && entry.total === 0) {
        dotClass = null;
      }

      cell.innerHTML = `
        <span class="cal-day-num"></span>
        <span class="dot${dotClass ? ' ' + dotClass : ''}" style="${dotClass ? '' : 'visibility:hidden'}"></span>
      `;
      cell.querySelector('.cal-day-num').textContent = day;

      cell.addEventListener('click', () => {
        if (entry && entry.total > 0) {
          const pct = Math.round((entry.completed / entry.total) * 100);
          calDetail.textContent = `${day} ${label.split(' ')[0]}: ${entry.completed}/${entry.total} hábitos completados (${pct}%)`;
        } else if (entry) {
          calDetail.textContent = `${day} ${label.split(' ')[0]}: sin hábitos registrados ese día.`;
        } else {
          calDetail.textContent = `${day} ${label.split(' ')[0]}: sin registro.`;
        }
      });

      calGrid.appendChild(cell);
    }
  }

  calPrev.addEventListener('click', () => {
    calDate.setMonth(calDate.getMonth() - 1);
    renderCalendar();
  });

  calNext.addEventListener('click', () => {
    calDate.setMonth(calDate.getMonth() + 1);
    renderCalendar();
  });

  /* ============ Master render ============ */
  function render() {
    if (currentTab === 'habits') renderHabits();
    if (currentTab === 'todos') renderTodos();
    if (currentTab === 'routines') {
      if (activeRoutineId) renderRoutineDetail(); else renderRoutines();
    }
    if (currentTab === 'calendar') renderCalendar();
  }

  /* ============ Init ============ */
  recordHabitHistory();
  showTab('habits');
})();