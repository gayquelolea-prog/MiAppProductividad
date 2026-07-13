(() => {
  'use strict';

  /* ============ Storage helpers ============ */
  const STORE = {
    habits: 'enfoque.habits',             // [{id, name, type:'check'|'counter', target}]
    habitLog: 'enfoque.habitLog',         // { "2026-07-12": { habitId: number } }
    habitHistory: 'enfoque.habitHistory', // { "2026-07-12": {completed, total} }
    routines: 'enfoque.routines',         // [{id, name, exercises:[{id,name,pr}]}]
    todos: 'enfoque.todos'                // [{id,title,description,dueDate,done,archived,priority}]
  };

  function isStorageAvailable() {
    try {
      const testKey = '__enfoque_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  const storageAvailable = isStorageAvailable();
  if (!storageAvailable) {
    console.warn('LocalStorage no está disponible: los datos no se guardarán entre sesiones.');
  }

  function saveToLocalStorage(key, value) {
    if (!storageAvailable) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        console.warn(`No hay espacio suficiente en LocalStorage para guardar "${key}".`, e);
      } else {
        console.warn(`No se pudo guardar "${key}" en LocalStorage.`, e);
      }
      return false;
    }
  }

  function loadFromLocalStorage(key, fallback, validate) {
    if (!storageAvailable) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      if (typeof validate === 'function') return validate(parsed, fallback);
      return parsed;
    } catch (e) {
      console.warn(`No se pudo leer "${key}" de LocalStorage, se usará el valor por defecto.`, e);
      return fallback;
    }
  }

  /* ---- Shape validators: corrupted/hand-edited JSON never breaks the UI ---- */
  function validateHabits(parsed, fallback) {
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter(h => h && typeof h.id === 'string' && typeof h.name === 'string')
      .map(h => {
        const type = h.type === 'counter' ? 'counter' : 'check';
        const target = type === 'counter'
          ? (Number.isFinite(h.target) && h.target > 0 ? h.target : 8)
          : null;
        return { id: h.id, name: h.name, type, target };
      });
  }

  function validateHabitLog(parsed, fallback) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const clean = {};
    for (const [date, entry] of Object.entries(parsed)) {
      if (Array.isArray(entry)) {
        // Legacy format from earlier versions: array of completed habit ids.
        const obj = {};
        entry.forEach(id => { if (typeof id === 'string') obj[id] = 1; });
        clean[date] = obj;
      } else if (entry && typeof entry === 'object') {
        const obj = {};
        for (const [hid, val] of Object.entries(entry)) {
          if (typeof val === 'number' && Number.isFinite(val)) obj[hid] = val;
        }
        clean[date] = obj;
      }
    }
    return clean;
  }

  function validateHabitHistory(parsed, fallback) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const clean = {};
    for (const [date, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.completed === 'number' && typeof entry.total === 'number') {
        clean[date] = { completed: entry.completed, total: entry.total };
      }
    }
    return clean;
  }

  function validateRoutines(parsed, fallback) {
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter(r => r && typeof r.id === 'string' && typeof r.name === 'string')
      .map(r => ({
        id: r.id,
        name: r.name,
        exercises: Array.isArray(r.exercises)
          ? r.exercises
              .filter(ex => ex && typeof ex.id === 'string' && typeof ex.name === 'string')
              .map(ex => ({ id: ex.id, name: ex.name, pr: typeof ex.pr === 'string' ? ex.pr : '' }))
          : []
      }));
  }

  function validateTodos(parsed, fallback) {
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter(t => t && typeof t.id === 'string' && typeof t.title === 'string')
      .map(t => ({
        id: t.id,
        title: t.title,
        description: typeof t.description === 'string' ? t.description : '',
        dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
        done: !!t.done,
        archived: !!t.archived,
        priority: t.priority === 'high' ? 'high' : 'normal'
      }));
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
  let habits = loadFromLocalStorage(STORE.habits, [], validateHabits);
  let habitLog = loadFromLocalStorage(STORE.habitLog, {}, validateHabitLog);
  let habitHistory = loadFromLocalStorage(STORE.habitHistory, {}, validateHabitHistory);
  let routines = loadFromLocalStorage(STORE.routines, [], validateRoutines);
  let todos = loadFromLocalStorage(STORE.todos, [], validateTodos);

  let activeRoutineId = null;
  let currentTab = 'habits';
  let currentDayKey = todayKey();
  let calDate = new Date();
  calDate.setDate(1);
  let selectedHabitType = 'check';
  let selectedTodoPriority = 'normal';

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
  const habitTypeToggle = $('habit-type-toggle');
  const habitTargetInput = $('habit-target');

  const todosList = $('todos-list');
  const todosEmpty = $('todos-empty');
  const todoForm = $('todo-form');
  const todoTitle = $('todo-title');
  const todoDesc = $('todo-desc');
  const todoDue = $('todo-due');
  const todoPriorityToggle = $('todo-priority-toggle');

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
  const streakCount = $('streak-count');
  const weekChartEl = $('week-chart');
  const resetAppBtn = $('reset-app-btn');

  const startWorkoutBtn = $('start-workout-btn');
  const workoutOverlay = $('workout-overlay');
  const workoutTimerEl = $('workout-timer');
  const workoutProgressEl = $('workout-progress');
  const workoutExerciseName = $('workout-exercise-name');
  const workoutPrevBtn = $('workout-prev');
  const workoutNextBtn = $('workout-next');
  const workoutPauseBtn = $('workout-pause');
  const workoutResetBtn = $('workout-reset');
  const workoutFinishBtn = $('workout-finish');

  const restTimerEl = $('rest-timer');
  const restCountEl = $('rest-count');
  const restToggleBtn = $('rest-toggle');
  const restMinusBtn = $('rest-minus');
  const restPlusBtn = $('rest-plus');

  const pomodoroFab = $('pomodoro-fab');
  const pomodoroPanel = $('pomodoro-panel');
  const pomodoroModeEl = $('pomodoro-mode');
  const pomodoroTimeEl = $('pomodoro-time');
  const pomodoroToggleBtn = $('pomodoro-toggle');
  const pomodoroResetBtn = $('pomodoro-reset');

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

    document.querySelectorAll('[data-view]').forEach(v => { v.hidden = true; v.classList.remove('fade-in'); });
    const activeView = $(`view-${tab}`);
    activeView.hidden = false;
    void activeView.offsetWidth; // restart the fade animation reliably
    activeView.classList.add('fade-in');

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
  function isHabitDone(habit, dayLog) {
    const val = (dayLog && dayLog[habit.id]) || 0;
    if (habit.type === 'counter') return val >= (habit.target || 1);
    return val >= 1;
  }

  function recordHabitHistory() {
    const dayLog = habitLog[todayKey()] || {};
    const completed = habits.filter(h => isHabitDone(h, dayLog)).length;
    habitHistory[todayKey()] = { completed, total: habits.length };
    saveToLocalStorage(STORE.habitHistory, habitHistory);
  }

  function renderHabits() {
    const dayLog = habitLog[todayKey()] || {};
    habitsList.innerHTML = '';
    habitsEmpty.hidden = habits.length > 0;

    habits.forEach(h => {
      const done = isHabitDone(h, dayLog);
      const li = document.createElement('li');

      if (h.type === 'counter') {
        const val = dayLog[h.id] || 0;
        li.className = 'list-item habit-counter-item' + (done ? ' is-done' : '');
        li.innerHTML = `
          <div class="counter-body">
            <span class="item-text"></span>
            <span class="counter-progress"></span>
          </div>
          <div class="counter-controls">
            <button class="counter-btn" data-action="minus" aria-label="Restar">−</button>
            <button class="counter-btn is-add" data-action="plus" aria-label="Sumar">+</button>
          </div>
          <button class="item-remove" aria-label="Eliminar hábito">×</button>
        `;
        li.querySelector('.item-text').textContent = h.name;
        li.querySelector('.counter-progress').textContent = `${val}/${h.target}`;
        li.querySelector('[data-action="minus"]').addEventListener('click', () => adjustCounter(h.id, -1));
        li.querySelector('[data-action="plus"]').addEventListener('click', () => adjustCounter(h.id, 1));
        li.querySelector('.item-remove').addEventListener('click', () => removeHabit(h.id));
      } else {
        li.className = 'list-item' + (done ? ' is-done' : '');
        li.innerHTML = `
          <button class="check" aria-label="Marcar hábito">${CHECK_ICON}</button>
          <span class="item-text"></span>
          <button class="item-remove" aria-label="Eliminar hábito">×</button>
        `;
        li.querySelector('.item-text').textContent = h.name;
        li.querySelector('.check').addEventListener('click', () => toggleHabit(h.id));
        li.querySelector('.item-remove').addEventListener('click', () => removeHabit(h.id));
      }

      habitsList.appendChild(li);
    });

    const doneCount = habits.filter(h => isHabitDone(h, dayLog)).length;
    const total = habits.length;
    progressCount.textContent = `${doneCount}/${total}`;
    progressFill.style.width = total ? `${(doneCount / total) * 100}%` : '0%';
    progressCount.classList.toggle('is-full', total > 0 && doneCount === total);
  }

  function toggleHabit(id) {
    const key = todayKey();
    const dayLog = { ...(habitLog[key] || {}) };
    dayLog[id] = (dayLog[id] || 0) >= 1 ? 0 : 1;
    habitLog[key] = dayLog;
    saveToLocalStorage(STORE.habitLog, habitLog);
    recordHabitHistory();
    renderHabits();
  }

  function adjustCounter(id, delta) {
    const key = todayKey();
    const dayLog = { ...(habitLog[key] || {}) };
    dayLog[id] = Math.max(0, (dayLog[id] || 0) + delta);
    habitLog[key] = dayLog;
    saveToLocalStorage(STORE.habitLog, habitLog);
    recordHabitHistory();
    renderHabits();
  }

  function removeHabit(id) {
    habits = habits.filter(h => h.id !== id);
    saveToLocalStorage(STORE.habits, habits);
    recordHabitHistory();
    renderHabits();
  }

  habitTypeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment');
    if (!btn) return;
    selectedHabitType = btn.dataset.type;
    habitTypeToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b === btn));
    habitTargetInput.hidden = selectedHabitType !== 'counter';
  });

  habitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = habitInput.value.trim();
    if (!name) return;

    const habit = { id: uid(), name, type: selectedHabitType, target: null };
    if (selectedHabitType === 'counter') {
      const target = parseInt(habitTargetInput.value, 10);
      habit.target = Number.isFinite(target) && target > 0 ? target : 8;
    }

    habits.push(habit);
    saveToLocalStorage(STORE.habits, habits);

    habitInput.value = '';
    habitTargetInput.value = '';
    selectedHabitType = 'check';
    habitTargetInput.hidden = true;
    habitTypeToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b.dataset.type === 'check'));

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
      const aHigh = a.priority === 'high', bHigh = b.priority === 'high';
      if (aHigh !== bHigh) return aHigh ? -1 : 1;
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
          <div class="todo-title-row">
            ${t.priority === 'high' ? '<span class="priority-dot" aria-hidden="true"></span>' : ''}
            <span class="item-text"></span>
          </div>
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
    saveToLocalStorage(STORE.todos, todos);
    renderTodos();
  }

  function archiveTodo(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    t.archived = true;
    saveToLocalStorage(STORE.todos, todos);
    renderTodos();
  }

  function removeTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveToLocalStorage(STORE.todos, todos);
    renderTodos();
  }

  todoPriorityToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment');
    if (!btn) return;
    selectedTodoPriority = btn.dataset.priority;
    todoPriorityToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b === btn));
  });

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
      archived: false,
      priority: selectedTodoPriority
    });
    saveToLocalStorage(STORE.todos, todos);

    todoTitle.value = '';
    todoDesc.value = '';
    todoDue.value = '';
    selectedTodoPriority = 'normal';
    todoPriorityToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b.dataset.priority === 'normal'));

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
    startWorkoutBtn.hidden = r.exercises.length === 0;
    exercisesList.innerHTML = '';
    exercisesEmpty.hidden = r.exercises.length > 0;

    r.exercises.forEach(ex => {
      const li = document.createElement('li');
      li.className = 'list-item exercise-item';
      li.innerHTML = `
        <div class="exercise-body">
          <span class="item-text"></span>
          <input type="text" class="pr-input" placeholder="PR: peso x reps (ej. 100kg - 8 reps)" maxlength="40">
        </div>
        <button class="item-remove" aria-label="Eliminar ejercicio">×</button>
      `;
      li.querySelector('.item-text').textContent = ex.name;

      const prInput = li.querySelector('.pr-input');
      prInput.value = ex.pr || '';
      const commitPr = () => {
        const val = prInput.value.trim();
        if (ex.pr === val) return;
        ex.pr = val;
        saveToLocalStorage(STORE.routines, routines);
      };
      prInput.addEventListener('blur', commitPr);
      prInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') prInput.blur(); });

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
    saveToLocalStorage(STORE.routines, routines);
    routineInput.value = '';
    renderRoutines();
  });

  exerciseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = exerciseInput.value.trim();
    if (!name) return;
    const r = routines.find(x => x.id === activeRoutineId);
    if (!r) return;
    r.exercises.push({ id: uid(), name, pr: '' });
    saveToLocalStorage(STORE.routines, routines);
    exerciseInput.value = '';
    renderRoutineDetail();
  });

  function removeExercise(exId) {
    const r = routines.find(x => x.id === activeRoutineId);
    if (!r) return;
    r.exercises = r.exercises.filter(e => e.id !== exId);
    saveToLocalStorage(STORE.routines, routines);
    renderRoutineDetail();
  }

  routineDeleteBtn.addEventListener('click', () => {
    routines = routines.filter(r => r.id !== activeRoutineId);
    saveToLocalStorage(STORE.routines, routines);
    backToRoutines();
  });

  /* ============ Workout mode ============ */
  let workoutExercises = [];
  let workoutIndex = 0;
  let workoutSeconds = 0;
  let workoutInterval = null;
  let workoutRunning = false;

  function formatTimer(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${pad(m)}:${pad(s)}`;
  }

  function renderWorkoutExercise() {
    const total = workoutExercises.length;
    workoutProgressEl.textContent = `${workoutIndex + 1}/${total}`;
    workoutExerciseName.textContent = workoutExercises[workoutIndex].name;
    workoutPrevBtn.disabled = workoutIndex === 0;
    workoutNextBtn.disabled = workoutIndex === total - 1;
  }

  function startTimerInterval() {
    clearInterval(workoutInterval);
    workoutInterval = setInterval(() => {
      workoutSeconds++;
      workoutTimerEl.textContent = formatTimer(workoutSeconds);
    }, 1000);
  }

  function openWorkout() {
    const r = routines.find(x => x.id === activeRoutineId);
    if (!r || r.exercises.length === 0) return;

    workoutExercises = r.exercises;
    workoutIndex = 0;
    workoutSeconds = 0;
    workoutRunning = true;

    workoutTimerEl.textContent = formatTimer(0);
    workoutPauseBtn.textContent = '⏸';
    renderWorkoutExercise();
    resetRestTimer();

    workoutOverlay.hidden = false;
    startTimerInterval();
  }

  function closeWorkout() {
    clearInterval(workoutInterval);
    workoutInterval = null;
    stopRest();
    workoutOverlay.hidden = true;
  }

  startWorkoutBtn.addEventListener('click', openWorkout);
  workoutFinishBtn.addEventListener('click', closeWorkout);

  workoutPrevBtn.addEventListener('click', () => {
    if (workoutIndex > 0) { workoutIndex--; renderWorkoutExercise(); }
  });

  workoutNextBtn.addEventListener('click', () => {
    if (workoutIndex < workoutExercises.length - 1) {
      workoutIndex++;
      renderWorkoutExercise();
      autoStartRest(); // finishing a set naturally means "start my rest"
    }
  });

  workoutPauseBtn.addEventListener('click', () => {
    workoutRunning = !workoutRunning;
    workoutPauseBtn.textContent = workoutRunning ? '⏸' : '▶';
    if (workoutRunning) startTimerInterval();
    else { clearInterval(workoutInterval); workoutInterval = null; }
  });

  workoutResetBtn.addEventListener('click', () => {
    workoutSeconds = 0;
    workoutTimerEl.textContent = formatTimer(0);
  });

  /* --- Smart rest timer --- */
  let restDuration = 90;
  let restRemaining = 90;
  let restInterval = null;
  let restRunning = false;

  function updateRestDisplay() {
    restCountEl.textContent = restRemaining;
  }

  function resetRestTimer() {
    stopRest();
    restTimerEl.classList.remove('is-finished');
    restRemaining = restDuration;
    updateRestDisplay();
  }

  function startRest() {
    clearInterval(restInterval);
    restRunning = true;
    restTimerEl.classList.add('is-running');
    restTimerEl.classList.remove('is-finished');
    restInterval = setInterval(() => {
      restRemaining--;
      updateRestDisplay();
      if (restRemaining <= 0) {
        clearInterval(restInterval);
        restInterval = null;
        restRunning = false;
        restTimerEl.classList.remove('is-running');
        restTimerEl.classList.add('is-finished');
        setTimeout(() => {
          restTimerEl.classList.remove('is-finished');
          restRemaining = restDuration;
          updateRestDisplay();
        }, 1500);
      }
    }, 1000);
  }

  function stopRest() {
    clearInterval(restInterval);
    restInterval = null;
    restRunning = false;
    restTimerEl.classList.remove('is-running');
  }

  function autoStartRest() {
    restRemaining = restDuration;
    updateRestDisplay();
    startRest();
  }

  restToggleBtn.addEventListener('click', () => {
    if (restRunning) {
      stopRest();
    } else {
      restRemaining = restDuration;
      updateRestDisplay();
      startRest();
    }
  });

  restMinusBtn.addEventListener('click', () => {
    restDuration = Math.max(15, restDuration - 15);
    if (!restRunning) { restRemaining = restDuration; updateRestDisplay(); }
  });

  restPlusBtn.addEventListener('click', () => {
    restDuration = Math.min(300, restDuration + 15);
    if (!restRunning) { restRemaining = restDuration; updateRestDisplay(); }
  });

  /* ============ Pomodoro (global focus timer) ============ */
  const POMODORO_FOCUS = 25 * 60;
  const POMODORO_BREAK = 5 * 60;
  let pomodoroMode = 'focus';
  let pomodoroRemaining = POMODORO_FOCUS;
  let pomodoroInterval = null;
  let pomodoroRunning = false;

  function updatePomodoroDisplay() {
    pomodoroTimeEl.textContent = formatTimer(pomodoroRemaining);
    pomodoroModeEl.textContent = pomodoroMode === 'focus' ? 'Enfoque' : 'Descanso';
    pomodoroToggleBtn.textContent = pomodoroRunning ? 'Pausar' : 'Iniciar';
    pomodoroFab.classList.toggle('is-running', pomodoroRunning);
  }

  function tickPomodoro() {
    pomodoroRemaining--;
    if (pomodoroRemaining <= 0) {
      pomodoroMode = pomodoroMode === 'focus' ? 'break' : 'focus';
      pomodoroRemaining = pomodoroMode === 'focus' ? POMODORO_FOCUS : POMODORO_BREAK;
    }
    updatePomodoroDisplay();
  }

  function startPomodoro() {
    clearInterval(pomodoroInterval);
    pomodoroRunning = true;
    pomodoroInterval = setInterval(tickPomodoro, 1000);
    updatePomodoroDisplay();
  }

  function pausePomodoro() {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroRunning = false;
    updatePomodoroDisplay();
  }

  pomodoroFab.addEventListener('click', (e) => {
    e.stopPropagation();
    pomodoroPanel.hidden = !pomodoroPanel.hidden;
  });

  pomodoroToggleBtn.addEventListener('click', () => {
    if (pomodoroRunning) pausePomodoro(); else startPomodoro();
  });

  pomodoroResetBtn.addEventListener('click', () => {
    pausePomodoro();
    pomodoroMode = 'focus';
    pomodoroRemaining = POMODORO_FOCUS;
    updatePomodoroDisplay();
  });

  document.addEventListener('click', (e) => {
    if (pomodoroPanel.hidden) return;
    if (!pomodoroPanel.contains(e.target) && e.target !== pomodoroFab) {
      pomodoroPanel.hidden = true;
    }
  });

  updatePomodoroDisplay();

  /* ============ Calendar / Progreso ============ */
  function computeStreak() {
    let streak = 0;
    const cursor = new Date();

    const isFullDay = (key) => {
      const entry = habitHistory[key];
      return !!(entry && entry.total > 0 && entry.completed >= entry.total);
    };

    // If today isn't fully completed yet (day still in progress), start
    // counting from yesterday so an unfinished today doesn't break the streak.
    if (!isFullDay(dateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (isFullDay(dateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  function renderStreak() {
    streakCount.textContent = computeStreak();
  }

  function renderWeekChart() {
    weekChartEl.innerHTML = '';
    const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = dateKey(d);
      const entry = habitHistory[key];
      const pct = entry && entry.total > 0 ? Math.round((entry.completed / entry.total) * 100) : 0;
      const dow = (d.getDay() + 6) % 7; // 0 = Monday

      const fillClass = !entry || entry.total === 0 ? '' : (pct >= 100 ? 'is-good' : (pct > 0 ? 'is-partial' : ''));

      const col = document.createElement('div');
      col.className = 'week-bar-col' + (key === todayKey() ? ' is-today' : '');
      col.innerHTML = `
        <div class="week-bar-track"><div class="week-bar-fill ${fillClass}" style="height:${pct}%"></div></div>
        <span class="week-bar-pct">${entry && entry.total > 0 ? pct + '%' : '–'}</span>
        <span class="week-bar-label">${labels[dow]}</span>
      `;
      weekChartEl.appendChild(col);
    }
  }

  function renderCalendar() {
    renderStreak();
    renderWeekChart();

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

  resetAppBtn.addEventListener('click', () => {
    const confirmed = window.confirm(
      '¿Seguro que quieres restablecer la aplicación?\n\nSe borrarán permanentemente todos tus hábitos, tareas, rutinas e historial. Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;
    try {
      localStorage.clear();
    } catch (e) {
      console.warn('No se pudo limpiar LocalStorage.', e);
    }
    location.reload();
  });

  /* ============ Cross-tab sync ============ */
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    switch (e.key) {
      case STORE.habits:
        habits = loadFromLocalStorage(STORE.habits, [], validateHabits);
        if (currentTab === 'habits') renderHabits();
        break;
      case STORE.habitLog:
        habitLog = loadFromLocalStorage(STORE.habitLog, {}, validateHabitLog);
        if (currentTab === 'habits') renderHabits();
        break;
      case STORE.habitHistory:
        habitHistory = loadFromLocalStorage(STORE.habitHistory, {}, validateHabitHistory);
        if (currentTab === 'calendar') renderCalendar();
        break;
      case STORE.routines:
        routines = loadFromLocalStorage(STORE.routines, [], validateRoutines);
        if (currentTab === 'routines') render();
        break;
      case STORE.todos:
        todos = loadFromLocalStorage(STORE.todos, [], validateTodos);
        if (currentTab === 'todos') renderTodos();
        break;
    }
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