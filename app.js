(() => {
  'use strict';

  /* ============ Storage helpers ============ */
  const STORE = {
    habits: 'enfoque.habits',             // [{id, name, type:'check'|'counter', target, block:'morning'|'night'}]
    habitLog: 'enfoque.habitLog',         // { "2026-07-12": { habitId: number } }
    habitHistory: 'enfoque.habitHistory', // { "2026-07-12": {completed, total} }
    routines: 'enfoque.routines',         // [{id, name, exercises:[{id,name,pr}]}]
    todos: 'enfoque.todos',               // [{id,title,description,dueDate,done,archived,priority}]
    supplements: 'enfoque.supplements',   // [{id, name}]
    supplementLog: 'enfoque.supplementLog', // { "2026-07-12": { supplementId: number } }
    wellness: 'enfoque.wellness',         // { "2026-07-12": {water, meals, sleep, energy} }
    agenda: 'enfoque.agenda',             // [{id, start, end, label}]
    weight: 'enfoque.weight',             // [{id, date, value}]
    reading: 'enfoque.reading',           // {title, totalPages, currentPage, startDate} | null
    bigGoals: 'enfoque.bigGoals',         // [{id, title, category, steps:[{id,text,done}], expanded}]
    trackerSettings: 'enfoque.trackerSettings' // {waterUnit:'ml'|'oz', waterGoal, mealsGoal}
  };

  const DEFAULT_TRACKER_SETTINGS = { waterUnit: 'ml', waterGoal: 2000, mealsGoal: 4 };

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
        const block = h.block === 'night' ? 'night' : 'morning';
        return { id: h.id, name: h.name, type, target, block };
      });
  }

  function validateDateKeyedNumberMap(parsed, fallback) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const clean = {};
    for (const [date, entry] of Object.entries(parsed)) {
      if (Array.isArray(entry)) {
        // Legacy format from earlier versions: array of completed ids.
        const obj = {};
        entry.forEach(id => { if (typeof id === 'string') obj[id] = 1; });
        clean[date] = obj;
      } else if (entry && typeof entry === 'object') {
        const obj = {};
        for (const [id, val] of Object.entries(entry)) {
          if (typeof val === 'number' && Number.isFinite(val)) obj[id] = val;
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

  function validateSupplements(parsed, fallback) {
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string');
  }

  function validateWellness(parsed, fallback) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const clean = {};
    for (const [date, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue;
      clean[date] = {
        water: Number.isFinite(entry.water) ? Math.max(0, entry.water) : 0,
        meals: Number.isFinite(entry.meals) ? Math.max(0, entry.meals) : 0,
        sleep: Number.isFinite(entry.sleep) && entry.sleep >= 1 && entry.sleep <= 5 ? entry.sleep : null,
        energy: Number.isFinite(entry.energy) && entry.energy >= 1 && entry.energy <= 5 ? entry.energy : null
      };
    }
    return clean;
  }

  function validateTrackerSettings(parsed, fallback) {
    if (!parsed || typeof parsed !== 'object') return fallback;
    const waterUnit = parsed.waterUnit === 'oz' ? 'oz' : 'ml';
    const waterGoal = Number.isFinite(parsed.waterGoal) && parsed.waterGoal > 0 ? parsed.waterGoal : DEFAULT_TRACKER_SETTINGS.waterGoal;
    const mealsGoal = Number.isFinite(parsed.mealsGoal) && parsed.mealsGoal > 0 ? parsed.mealsGoal : DEFAULT_TRACKER_SETTINGS.mealsGoal;
    return { waterUnit, waterGoal, mealsGoal };
  }

  function validateAgenda(parsed, fallback) {
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(a => a && typeof a.id === 'string' && typeof a.start === 'string' && typeof a.end === 'string' && typeof a.label === 'string');
  }

  function validateWeight(parsed, fallback) {
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(w => w && typeof w.id === 'string' && typeof w.date === 'string' && typeof w.value === 'number' && Number.isFinite(w.value));
  }

  function validateReading(parsed, fallback) {
    if (!parsed || typeof parsed !== 'object') return fallback;
    if (typeof parsed.title !== 'string' || !Number.isFinite(parsed.totalPages) || !Number.isFinite(parsed.currentPage)) return fallback;
    return {
      title: parsed.title,
      totalPages: Math.max(1, Math.round(parsed.totalPages)),
      currentPage: Math.max(0, Math.round(parsed.currentPage)),
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : todayKey()
    };
  }

  function validateBigGoals(parsed, fallback) {
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter(g => g && typeof g.id === 'string' && typeof g.title === 'string')
      .map(g => ({
        id: g.id,
        title: g.title,
        category: typeof g.category === 'string' && g.category ? g.category : 'Personal',
        expanded: !!g.expanded,
        steps: Array.isArray(g.steps)
          ? g.steps
              .filter(s => s && typeof s.id === 'string' && typeof s.text === 'string')
              .map(s => ({ id: s.id, text: s.text, done: !!s.done }))
          : []
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
  let habitLog = loadFromLocalStorage(STORE.habitLog, {}, validateDateKeyedNumberMap);
  let habitHistory = loadFromLocalStorage(STORE.habitHistory, {}, validateHabitHistory);
  let routines = loadFromLocalStorage(STORE.routines, [], validateRoutines);
  let todos = loadFromLocalStorage(STORE.todos, [], validateTodos);
  let supplements = loadFromLocalStorage(STORE.supplements, [], validateSupplements);
  let supplementLog = loadFromLocalStorage(STORE.supplementLog, {}, validateDateKeyedNumberMap);
  let wellness = loadFromLocalStorage(STORE.wellness, {}, validateWellness);
  let agenda = loadFromLocalStorage(STORE.agenda, [], validateAgenda);
  let weight = loadFromLocalStorage(STORE.weight, [], validateWeight);
  let reading = loadFromLocalStorage(STORE.reading, null, validateReading);
  let bigGoals = loadFromLocalStorage(STORE.bigGoals, [], validateBigGoals);
  let trackerSettings = loadFromLocalStorage(STORE.trackerSettings, { ...DEFAULT_TRACKER_SETTINGS }, validateTrackerSettings);

  let activeRoutineId = null;
  let currentTab = 'habits';
  let currentDayKey = todayKey();
  let calDate = new Date();
  calDate.setDate(1);
  let selectedHabitType = 'check';
  let selectedHabitBlock = 'morning';
  let selectedTodoPriority = 'normal';
  let selectedGoalCategory = 'Físico';
  let selectedWaterUnit = trackerSettings.waterUnit;

  /* ============ DOM refs ============ */
  const $ = (id) => document.getElementById(id);

  const appShell = $('app-shell');
  const contentEl = $('content');
  const appHeader = $('app-header');
  const pageTitle = $('page-title');
  const todayLabel = $('today-label');
  const progressCount = $('progress-count');
  const progressFill = $('progress-fill');
  const progressTrack = $('progress-track');

  const sleepPicker = $('sleep-picker');
  const energyPicker = $('energy-picker');

  const habitsListMorning = $('habits-list-morning');
  const habitsEmptyMorning = $('habits-empty-morning');
  const habitsListNight = $('habits-list-night');
  const habitsEmptyNight = $('habits-empty-night');
  const habitForm = $('habit-form');
  const habitInput = $('habit-input');
  const habitBlockToggle = $('habit-block-toggle');
  const habitTypeToggle = $('habit-type-toggle');
  const habitTargetInput = $('habit-target');

  const supplementsList = $('supplements-list');
  const supplementsEmpty = $('supplements-empty');
  const supplementForm = $('supplement-form');
  const supplementInput = $('supplement-input');

  const waterMinusBtn = $('water-minus');
  const waterPlusBtn = $('water-plus');
  const waterValueEl = $('water-value');
  const mealsMinusBtn = $('meals-minus');
  const mealsPlusBtn = $('meals-plus');
  const mealsValueEl = $('meals-value');

  const agendaList = $('agenda-list');
  const agendaEmpty = $('agenda-empty');
  const agendaForm = $('agenda-form');
  const agendaStartInput = $('agenda-start');
  const agendaEndInput = $('agenda-end');
  const agendaLabelInput = $('agenda-label');

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

  const weightForm = $('weight-form');
  const weightInput = $('weight-input');
  const weightList = $('weight-list');
  const weightEmpty = $('weight-empty');

  const readingCard = $('reading-card');
  const bigGoalsList = $('big-goals-list');
  const bigGoalsEmpty = $('big-goals-empty');
  const bigGoalForm = $('big-goal-form');
  const bigGoalTitle = $('big-goal-title');
  const bigGoalCategoryToggle = $('big-goal-category-toggle');

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

  const confirmModal = $('confirm-modal');
  const confirmModalMessage = $('confirm-modal-message');
  const confirmModalCancel = $('confirm-modal-cancel');
  const confirmModalConfirm = $('confirm-modal-confirm');

  const trackerSettingsBtn = $('tracker-settings-btn');
  const trackerSettingsModal = $('tracker-settings-modal');
  const trackerSettingsCancel = $('tracker-settings-cancel');
  const trackerSettingsSave = $('tracker-settings-save');
  const waterUnitToggle = $('water-unit-toggle');
  const waterGoalInput = $('water-goal-input');
  const mealsGoalInput = $('meals-goal-input');

  /* ============ Tab switching ============ */
  const TAB_META = {
    habits: { title: 'Hábitos', eyebrow: 'Hoy' },
    todos: { title: 'To-Do', eyebrow: 'Pendientes' },
    routines: { title: 'Rutinas', eyebrow: 'Entrenamiento' },
    calendar: { title: 'Progreso', eyebrow: 'Historial' },
    goals: { title: 'Metas', eyebrow: 'Biblioteca' }
  };

  function showTab(tab) {
    currentTab = tab;

    document.querySelectorAll('[data-view]').forEach(v => { v.hidden = true; v.classList.remove('fade-in'); });
    const activeView = $(`view-${tab}`);
    activeView.hidden = false;
    void activeView.offsetWidth; // restart the fade animation reliably
    activeView.classList.add('fade-in');

    contentEl.scrollTop = 0;
    appHeader.classList.remove('is-scrolled');
    syncHeaderHeight();

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

  /* ============ Confirm-delete modal (generic, reused everywhere) ============ */
  let pendingConfirmAction = null;

  function openConfirmModal(message, onConfirm) {
    confirmModalMessage.textContent = message || '¿Estás seguro de que quieres eliminar esto?';
    pendingConfirmAction = onConfirm;
    confirmModal.hidden = false;
  }

  function closeConfirmModal() {
    confirmModal.hidden = true;
    pendingConfirmAction = null;
  }

  confirmModalCancel.addEventListener('click', closeConfirmModal);

  confirmModalConfirm.addEventListener('click', () => {
    const action = pendingConfirmAction;
    closeConfirmModal();
    if (typeof action === 'function') action();
  });

  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!confirmModal.hidden) closeConfirmModal();
      if (!trackerSettingsModal.hidden) closeTrackerSettingsModal();
    }
  });

  /* ============ Collapsible sections (generic) ============ */
  document.querySelectorAll('.collapsible-header').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.collapsible').classList.toggle('is-collapsed');
    });
  });

  /* ============ Wellness: sleep & energy stars ============ */
  function getTodayWellness() {
    return wellness[todayKey()] || { water: 0, meals: 0, sleep: null, energy: null };
  }

  function updateTodayWellness(patch) {
    const key = todayKey();
    const current = wellness[key] || { water: 0, meals: 0, sleep: null, energy: null };
    wellness[key] = { ...current, ...patch };
    saveToLocalStorage(STORE.wellness, wellness);
  }

  function paintStars(container, value) {
    container.querySelectorAll('.star').forEach(btn => {
      const v = parseInt(btn.dataset.value, 10);
      btn.classList.toggle('is-active', value != null && v <= value);
    });
  }

  function renderWellnessStars() {
    const w = getTodayWellness();
    paintStars(sleepPicker, w.sleep);
    paintStars(energyPicker, w.energy);
  }

  sleepPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.star');
    if (!btn) return;
    const val = parseInt(btn.dataset.value, 10);
    const w = getTodayWellness();
    updateTodayWellness({ sleep: w.sleep === val ? null : val });
    renderWellnessStars();
  });

  energyPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.star');
    if (!btn) return;
    const val = parseInt(btn.dataset.value, 10);
    const w = getTodayWellness();
    updateTodayWellness({ energy: w.energy === val ? null : val });
    renderWellnessStars();
  });

  /* ============ Water & meals trackers ============ */
  function waterStep() {
    return trackerSettings.waterUnit === 'oz' ? 8 : 250;
  }

  function renderTrackers() {
    const w = getTodayWellness();
    const unitLabel = trackerSettings.waterUnit;
    waterValueEl.textContent = `${w.water}/${trackerSettings.waterGoal} ${unitLabel}`;
    mealsValueEl.textContent = `${w.meals}/${trackerSettings.mealsGoal}`;
    waterValueEl.style.color = w.water >= trackerSettings.waterGoal ? 'var(--good)' : '';
    mealsValueEl.style.color = w.meals >= trackerSettings.mealsGoal ? 'var(--good)' : '';
  }

  waterPlusBtn.addEventListener('click', () => {
    const w = getTodayWellness();
    updateTodayWellness({ water: w.water + waterStep() });
    renderTrackers();
  });
  waterMinusBtn.addEventListener('click', () => {
    const w = getTodayWellness();
    updateTodayWellness({ water: Math.max(0, w.water - waterStep()) });
    renderTrackers();
  });
  mealsPlusBtn.addEventListener('click', () => {
    const w = getTodayWellness();
    updateTodayWellness({ meals: w.meals + 1 });
    renderTrackers();
  });
  mealsMinusBtn.addEventListener('click', () => {
    const w = getTodayWellness();
    updateTodayWellness({ meals: Math.max(0, w.meals - 1) });
    renderTrackers();
  });

  /* --- Tracker settings modal (water unit/goal, meals goal) --- */
  function openTrackerSettingsModal() {
    selectedWaterUnit = trackerSettings.waterUnit;
    waterUnitToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b.dataset.unit === selectedWaterUnit));
    waterGoalInput.value = trackerSettings.waterGoal;
    mealsGoalInput.value = trackerSettings.mealsGoal;
    trackerSettingsModal.hidden = false;
  }

  function closeTrackerSettingsModal() {
    trackerSettingsModal.hidden = true;
  }

  trackerSettingsBtn.addEventListener('click', openTrackerSettingsModal);
  trackerSettingsCancel.addEventListener('click', closeTrackerSettingsModal);
  trackerSettingsModal.addEventListener('click', (e) => {
    if (e.target === trackerSettingsModal) closeTrackerSettingsModal();
  });

  waterUnitToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment');
    if (!btn) return;
    selectedWaterUnit = btn.dataset.unit;
    waterUnitToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b === btn));
    // Offer a sensible default goal when switching units, unless the person already typed one.
    const currentVal = parseFloat(waterGoalInput.value);
    const wasDefault = !Number.isFinite(currentVal) || currentVal === trackerSettings.waterGoal;
    if (wasDefault) {
      waterGoalInput.value = selectedWaterUnit === 'oz' ? 70 : 2000;
    }
  });

  trackerSettingsSave.addEventListener('click', () => {
    const waterGoal = parseFloat(waterGoalInput.value);
    const mealsGoal = parseInt(mealsGoalInput.value, 10);

    trackerSettings = {
      waterUnit: selectedWaterUnit,
      waterGoal: Number.isFinite(waterGoal) && waterGoal > 0 ? waterGoal : trackerSettings.waterGoal,
      mealsGoal: Number.isFinite(mealsGoal) && mealsGoal > 0 ? mealsGoal : trackerSettings.mealsGoal
    };
    saveToLocalStorage(STORE.trackerSettings, trackerSettings);
    renderTrackers();
    closeTrackerSettingsModal();
  });

  /* ============ Habits (morning / night blocks, check or counter) ============ */
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

  function buildHabitListItem(h, dayLog) {
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
    return li;
  }

  function renderHabitBlocks() {
    const dayLog = habitLog[todayKey()] || {};

    const morning = habits.filter(h => h.block !== 'night');
    const night = habits.filter(h => h.block === 'night');

    habitsListMorning.innerHTML = '';
    habitsEmptyMorning.hidden = morning.length > 0;
    morning.forEach(h => habitsListMorning.appendChild(buildHabitListItem(h, dayLog)));

    habitsListNight.innerHTML = '';
    habitsEmptyNight.hidden = night.length > 0;
    night.forEach(h => habitsListNight.appendChild(buildHabitListItem(h, dayLog)));

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
    renderHabitBlocks();
  }

  function adjustCounter(id, delta) {
    const key = todayKey();
    const dayLog = { ...(habitLog[key] || {}) };
    dayLog[id] = Math.max(0, (dayLog[id] || 0) + delta);
    habitLog[key] = dayLog;
    saveToLocalStorage(STORE.habitLog, habitLog);
    recordHabitHistory();
    renderHabitBlocks();
  }

  function deleteHabit(id) {
    habits = habits.filter(h => h.id !== id);
    saveToLocalStorage(STORE.habits, habits);
    recordHabitHistory();
    renderHabitBlocks();
  }

  function removeHabit(id) {
    openConfirmModal('¿Estás seguro de que quieres eliminar este hábito?', () => deleteHabit(id));
  }

  habitBlockToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment');
    if (!btn) return;
    selectedHabitBlock = btn.dataset.block;
    habitBlockToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b === btn));
  });

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

    const habit = { id: uid(), name, type: selectedHabitType, target: null, block: selectedHabitBlock };
    if (selectedHabitType === 'counter') {
      const target = parseInt(habitTargetInput.value, 10);
      habit.target = Number.isFinite(target) && target > 0 ? target : 8;
    }

    habits.push(habit);
    saveToLocalStorage(STORE.habits, habits);

    habitInput.value = '';
    habitTargetInput.value = '';
    selectedHabitType = 'check';
    selectedHabitBlock = 'morning';
    habitTargetInput.hidden = true;
    habitTypeToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b.dataset.type === 'check'));
    habitBlockToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b.dataset.block === 'morning'));

    recordHabitHistory();
    renderHabitBlocks();
  });

  /* --- Day rollover watcher: keeps checkboxes fresh across midnight without reload --- */
  setInterval(() => {
    const nowKey = todayKey();
    if (nowKey !== currentDayKey) {
      currentDayKey = nowKey;
      if (currentTab === 'habits') renderHabitsTab();
    }
  }, 30000);

  /* ============ Supplements ============ */
  function renderSupplements() {
    const log = supplementLog[todayKey()] || {};
    supplementsList.innerHTML = '';
    supplementsEmpty.hidden = supplements.length > 0;

    supplements.forEach(s => {
      const done = (log[s.id] || 0) >= 1;
      const li = document.createElement('li');
      li.className = 'list-item' + (done ? ' is-done' : '');
      li.innerHTML = `
        <button class="check" aria-label="Marcar suplemento">${CHECK_ICON}</button>
        <span class="item-text"></span>
        <button class="item-remove" aria-label="Eliminar suplemento">×</button>
      `;
      li.querySelector('.item-text').textContent = s.name;
      li.querySelector('.check').addEventListener('click', () => toggleSupplement(s.id));
      li.querySelector('.item-remove').addEventListener('click', () => removeSupplement(s.id));
      supplementsList.appendChild(li);
    });
  }

  function toggleSupplement(id) {
    const key = todayKey();
    const log = { ...(supplementLog[key] || {}) };
    log[id] = (log[id] || 0) >= 1 ? 0 : 1;
    supplementLog[key] = log;
    saveToLocalStorage(STORE.supplementLog, supplementLog);
    renderSupplements();
  }

  function deleteSupplement(id) {
    supplements = supplements.filter(s => s.id !== id);
    saveToLocalStorage(STORE.supplements, supplements);
    renderSupplements();
  }

  function removeSupplement(id) {
    openConfirmModal('¿Estás seguro de que quieres eliminar este suplemento?', () => deleteSupplement(id));
  }

  supplementForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = supplementInput.value.trim();
    if (!name) return;
    supplements.push({ id: uid(), name });
    saveToLocalStorage(STORE.supplements, supplements);
    supplementInput.value = '';
    renderSupplements();
  });

  /* ============ Agenda (time-boxing) ============ */
  function renderAgenda() {
    const sorted = agenda.slice().sort((a, b) => a.start.localeCompare(b.start));
    agendaList.innerHTML = '';
    agendaEmpty.hidden = agenda.length > 0;

    sorted.forEach(block => {
      const li = document.createElement('li');
      li.className = 'list-item agenda-item';
      li.innerHTML = `
        <span class="agenda-time"></span>
        <span class="item-text"></span>
        <button class="item-remove" aria-label="Eliminar bloque">×</button>
      `;
      li.querySelector('.agenda-time').textContent = `${block.start}–${block.end}`;
      li.querySelector('.item-text').textContent = block.label;
      li.querySelector('.item-remove').addEventListener('click', () => removeAgendaBlock(block.id));
      agendaList.appendChild(li);
    });
  }

  function deleteAgendaBlock(id) {
    agenda = agenda.filter(a => a.id !== id);
    saveToLocalStorage(STORE.agenda, agenda);
    renderAgenda();
  }

  function removeAgendaBlock(id) {
    openConfirmModal('¿Estás seguro de que quieres eliminar este bloque de la agenda?', () => deleteAgendaBlock(id));
  }

  agendaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const start = agendaStartInput.value;
    const end = agendaEndInput.value;
    const label = agendaLabelInput.value.trim();
    if (!start || !end || !label) return;
    agenda.push({ id: uid(), start, end, label });
    saveToLocalStorage(STORE.agenda, agenda);
    agendaStartInput.value = '';
    agendaEndInput.value = '';
    agendaLabelInput.value = '';
    renderAgenda();
  });

  /* ============ Habits tab master renderer ============ */
  function renderHabitsTab() {
    renderWellnessStars();
    renderHabitBlocks();
    renderSupplements();
    renderTrackers();
  }

  /* ============ To-Do ============ */
  function formatShortDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  function renderTodosTab() {
    renderAgenda();
    renderTodos();
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
        li.querySelector('.todo-due').textContent = (overdue ? 'Venció ' : 'Vence ') + formatShortDate(t.dueDate);
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

  function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveToLocalStorage(STORE.todos, todos);
    renderTodos();
  }

  function removeTodo(id) {
    openConfirmModal('¿Estás seguro de que quieres eliminar esta tarea?', () => deleteTodo(id));
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

  function deleteExercise(exId) {
    const r = routines.find(x => x.id === activeRoutineId);
    if (!r) return;
    r.exercises = r.exercises.filter(e => e.id !== exId);
    saveToLocalStorage(STORE.routines, routines);
    renderRoutineDetail();
  }

  function removeExercise(exId) {
    openConfirmModal('¿Estás seguro de que quieres eliminar este ejercicio?', () => deleteExercise(exId));
  }

  routineDeleteBtn.addEventListener('click', () => {
    openConfirmModal('¿Estás seguro de que quieres eliminar esta rutina y todos sus ejercicios?', () => {
      routines = routines.filter(r => r.id !== activeRoutineId);
      saveToLocalStorage(STORE.routines, routines);
      backToRoutines();
    });
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

  /* ============ Weight tracker ============ */
  function renderWeightList() {
    const chronological = weight.slice().sort((a, b) => a.date.localeCompare(b.date));
    const newestFirst = chronological.slice().reverse().slice(0, 15);

    weightList.innerHTML = '';
    weightEmpty.hidden = weight.length > 0;

    newestFirst.forEach(entry => {
      const pos = chronological.findIndex(w => w.id === entry.id);
      const prev = pos > 0 ? chronological[pos - 1] : null;

      let trendClass = 'is-flat', trendSymbol = '→';
      if (prev) {
        if (entry.value > prev.value) { trendClass = 'is-up'; trendSymbol = '↑'; }
        else if (entry.value < prev.value) { trendClass = 'is-down'; trendSymbol = '↓'; }
      }

      const li = document.createElement('li');
      li.className = 'list-item weight-item';
      li.innerHTML = `
        <span class="weight-date"></span>
        <span class="weight-value"></span>
        <span class="weight-trend ${trendClass}">${prev ? trendSymbol : ''}</span>
      `;
      li.querySelector('.weight-date').textContent = formatShortDate(entry.date);
      li.querySelector('.weight-value').textContent = `${entry.value} kg`;
      weightList.appendChild(li);
    });
  }

  weightForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = parseFloat(weightInput.value);
    if (!Number.isFinite(val) || val <= 0) return;

    const key = todayKey();
    const existingIdx = weight.findIndex(w => w.date === key);
    if (existingIdx >= 0) weight[existingIdx].value = val;
    else weight.push({ id: uid(), date: key, value: val });

    saveToLocalStorage(STORE.weight, weight);
    weightInput.value = '';
    renderWeightList();
  });

  /* ============ Reading tracker ============ */
  function renderReadingCard() {
    readingCard.innerHTML = '';

    if (!reading) {
      readingCard.innerHTML = `
        <form class="reading-form" id="reading-form">
          <input type="text" id="reading-title-input" placeholder="Título del libro" maxlength="60">
          <input type="number" id="reading-total-input" placeholder="Total de páginas" min="1" max="5000">
          <button type="submit" class="add-btn-wide">Comenzar a leer</button>
        </form>
      `;
      $('reading-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = $('reading-title-input').value.trim();
        const total = parseInt($('reading-total-input').value, 10);
        if (!title || !Number.isFinite(total) || total <= 0) return;
        reading = { title, totalPages: total, currentPage: 0, startDate: todayKey() };
        saveToLocalStorage(STORE.reading, reading);
        renderReadingCard();
      });
      return;
    }

    const pct = Math.min(100, Math.round((reading.currentPage / reading.totalPages) * 100));
    const [sy, sm, sd] = reading.startDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const daysElapsed = Math.max(1, Math.round((new Date() - start) / 86400000));
    const pace = reading.currentPage / daysElapsed;
    const remainingPages = Math.max(0, reading.totalPages - reading.currentPage);

    let etaText = 'Registra tu avance un par de días más para estimar el ritmo.';
    if (remainingPages === 0) {
      etaText = '¡Libro terminado! 🎉';
    } else if (pace > 0) {
      const daysLeft = Math.ceil(remainingPages / pace);
      etaText = `Unos ${daysLeft} día${daysLeft === 1 ? '' : 's'} más a tu ritmo actual.`;
    }

    readingCard.innerHTML = `
      <div class="reading-active">
        <span class="reading-title"></span>
        <div class="reading-bar-track"><div class="reading-bar-fill" style="width:${pct}%"></div></div>
        <div class="reading-meta">
          <span>${pct}%</span>
          <span>${reading.currentPage}/${reading.totalPages} págs.</span>
        </div>
        <div class="reading-update-row">
          <input type="number" id="reading-current-input" min="0" max="${reading.totalPages}" value="${reading.currentPage}">
          <button type="button" class="add-btn" id="reading-update-btn">✓</button>
        </div>
        <span class="reading-eta"></span>
        <button class="danger-link" id="reading-reset-btn">Terminar / cambiar de libro</button>
      </div>
    `;
    readingCard.querySelector('.reading-title').textContent = reading.title;
    readingCard.querySelector('.reading-eta').textContent = etaText;

    $('reading-update-btn').addEventListener('click', () => {
      const val = parseInt($('reading-current-input').value, 10);
      if (!Number.isFinite(val)) return;
      reading.currentPage = Math.max(0, Math.min(reading.totalPages, val));
      saveToLocalStorage(STORE.reading, reading);
      renderReadingCard();
    });

    $('reading-reset-btn').addEventListener('click', () => {
      openConfirmModal('¿Terminar este libro y comenzar uno nuevo? Se perderá el progreso actual.', () => {
        reading = null;
        saveToLocalStorage(STORE.reading, reading);
        renderReadingCard();
      });
    });
  }

  /* ============ Big goals board ============ */
  function computeGoalPct(goal) {
    if (!goal.steps.length) return 0;
    const done = goal.steps.filter(s => s.done).length;
    return Math.round((done / goal.steps.length) * 100);
  }

  function renderBigGoals() {
    bigGoalsList.innerHTML = '';
    bigGoalsEmpty.hidden = bigGoals.length > 0;

    bigGoals.forEach(goal => {
      const pct = computeGoalPct(goal);
      const li = document.createElement('li');
      li.className = 'goal-card' + (goal.expanded ? '' : ' is-collapsed') + (goal.steps.length && pct >= 100 ? ' is-complete' : '');
      li.innerHTML = `
        <button type="button" class="goal-card-header">
          <div class="goal-card-title-wrap">
            <span class="goal-card-category"></span>
            <span class="goal-card-title"></span>
          </div>
          <span class="goal-card-pct"></span>
          <span class="collapsible-chevron">⌄</span>
        </button>
        <div class="goal-card-body-wrap">
          <div class="goal-card-body">
            <div class="goal-progress-track"><div class="goal-progress-fill" style="width:${pct}%"></div></div>
            <ul class="goal-steps-list"></ul>
            <form class="goal-step-form">
              <input type="text" placeholder="Nuevo paso" maxlength="60">
              <button type="submit" class="add-btn">+</button>
            </form>
            <button type="button" class="danger-link goal-delete-btn">Eliminar meta</button>
          </div>
        </div>
      `;
      li.querySelector('.goal-card-category').textContent = goal.category;
      li.querySelector('.goal-card-title').textContent = goal.title;
      li.querySelector('.goal-card-pct').textContent = goal.steps.length ? `${pct}%` : 'Sin pasos';

      li.querySelector('.goal-card-header').addEventListener('click', () => {
        goal.expanded = !goal.expanded;
        saveToLocalStorage(STORE.bigGoals, bigGoals);
        renderBigGoals();
      });

      const stepsList = li.querySelector('.goal-steps-list');
      goal.steps.forEach(step => {
        const stepLi = document.createElement('li');
        stepLi.className = 'goal-step-item list-item' + (step.done ? ' is-done' : '');
        stepLi.innerHTML = `
          <button class="check" aria-label="Marcar paso">${CHECK_ICON}</button>
          <span class="item-text"></span>
          <button class="item-remove" aria-label="Eliminar paso">×</button>
        `;
        stepLi.querySelector('.item-text').textContent = step.text;
        stepLi.querySelector('.check').addEventListener('click', (e) => {
          e.stopPropagation();
          step.done = !step.done;
          saveToLocalStorage(STORE.bigGoals, bigGoals);
          renderBigGoals();
        });
        stepLi.querySelector('.item-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          openConfirmModal('¿Estás seguro de que quieres eliminar este paso?', () => {
            goal.steps = goal.steps.filter(s => s.id !== step.id);
            saveToLocalStorage(STORE.bigGoals, bigGoals);
            renderBigGoals();
          });
        });
        stepsList.appendChild(stepLi);
      });

      const stepForm = li.querySelector('.goal-step-form');
      stepForm.addEventListener('click', (e) => e.stopPropagation());
      stepForm.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const input = stepForm.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        goal.steps.push({ id: uid(), text, done: false });
        saveToLocalStorage(STORE.bigGoals, bigGoals);
        renderBigGoals();
      });

      li.querySelector('.goal-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openConfirmModal(`¿Eliminar la meta "${goal.title}"? Esta acción no se puede deshacer.`, () => {
          bigGoals = bigGoals.filter(g => g.id !== goal.id);
          saveToLocalStorage(STORE.bigGoals, bigGoals);
          renderBigGoals();
        });
      });

      bigGoalsList.appendChild(li);
    });
  }

  bigGoalCategoryToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment');
    if (!btn) return;
    selectedGoalCategory = btn.dataset.category;
    bigGoalCategoryToggle.querySelectorAll('.segment').forEach(b => b.classList.toggle('is-active', b === btn));
  });

  bigGoalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = bigGoalTitle.value.trim();
    if (!title) return;
    bigGoals.push({ id: uid(), title, category: selectedGoalCategory, steps: [], expanded: true });
    saveToLocalStorage(STORE.bigGoals, bigGoals);
    bigGoalTitle.value = '';
    renderBigGoals();
  });

  /* ============ Calendar / Progreso ============ */
  function computeStreak() {
    let streak = 0;
    const cursor = new Date();

    const isFullDay = (key) => {
      const entry = habitHistory[key];
      return !!(entry && entry.total > 0 && entry.completed >= entry.total);
    };

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
      const dow = (d.getDay() + 6) % 7;

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
    renderWeightList();

    const year = calDate.getFullYear();
    const month = calDate.getMonth();

    const label = calDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    calMonthLabel.textContent = label;

    const firstDay = new Date(year, month, 1);
    const leading = (firstDay.getDay() + 6) % 7;
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
        const wellnessEntry = wellness[key];
        let text;
        if (entry && entry.total > 0) {
          const pct = Math.round((entry.completed / entry.total) * 100);
          text = `${day} ${label.split(' ')[0]}: ${entry.completed}/${entry.total} hábitos (${pct}%)`;
        } else if (entry) {
          text = `${day} ${label.split(' ')[0]}: sin hábitos registrados.`;
        } else {
          text = `${day} ${label.split(' ')[0]}: sin registro.`;
        }
        if (wellnessEntry && (wellnessEntry.sleep || wellnessEntry.energy)) {
          const parts = [];
          if (wellnessEntry.sleep) parts.push(`sueño ${wellnessEntry.sleep}★`);
          if (wellnessEntry.energy) parts.push(`energía ${wellnessEntry.energy}★`);
          text += ` · ${parts.join(', ')}`;
        }
        calDetail.textContent = text;
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
    openConfirmModal(
      'Se borrarán permanentemente todos tus hábitos, suplementos, tareas, rutinas, peso, lectura, metas e historial. Esta acción no se puede deshacer.',
      () => {
        try {
          localStorage.clear();
        } catch (e) {
          console.warn('No se pudo limpiar LocalStorage.', e);
        }
        location.reload();
      }
    );
  });

  /* ============ Cross-tab sync ============ */
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    switch (e.key) {
      case STORE.habits:
        habits = loadFromLocalStorage(STORE.habits, [], validateHabits);
        if (currentTab === 'habits') renderHabitBlocks();
        break;
      case STORE.habitLog:
        habitLog = loadFromLocalStorage(STORE.habitLog, {}, validateDateKeyedNumberMap);
        if (currentTab === 'habits') renderHabitBlocks();
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
      case STORE.supplements:
        supplements = loadFromLocalStorage(STORE.supplements, [], validateSupplements);
        if (currentTab === 'habits') renderSupplements();
        break;
      case STORE.supplementLog:
        supplementLog = loadFromLocalStorage(STORE.supplementLog, {}, validateDateKeyedNumberMap);
        if (currentTab === 'habits') renderSupplements();
        break;
      case STORE.wellness:
        wellness = loadFromLocalStorage(STORE.wellness, {}, validateWellness);
        if (currentTab === 'habits') { renderWellnessStars(); renderTrackers(); }
        break;
      case STORE.agenda:
        agenda = loadFromLocalStorage(STORE.agenda, [], validateAgenda);
        if (currentTab === 'todos') renderAgenda();
        break;
      case STORE.weight:
        weight = loadFromLocalStorage(STORE.weight, [], validateWeight);
        if (currentTab === 'calendar') renderWeightList();
        break;
      case STORE.reading:
        reading = loadFromLocalStorage(STORE.reading, null, validateReading);
        if (currentTab === 'goals') renderReadingCard();
        break;
      case STORE.bigGoals:
        bigGoals = loadFromLocalStorage(STORE.bigGoals, [], validateBigGoals);
        if (currentTab === 'goals') renderBigGoals();
        break;
      case STORE.trackerSettings:
        trackerSettings = loadFromLocalStorage(STORE.trackerSettings, { ...DEFAULT_TRACKER_SETTINGS }, validateTrackerSettings);
        if (currentTab === 'habits') renderTrackers();
        break;
    }
  });

  /* ============ Master render ============ */
  function render() {
    if (currentTab === 'habits') renderHabitsTab();
    if (currentTab === 'todos') renderTodosTab();
    if (currentTab === 'routines') {
      if (activeRoutineId) renderRoutineDetail(); else renderRoutines();
    }
    if (currentTab === 'calendar') renderCalendar();
    if (currentTab === 'goals') { renderReadingCard(); renderBigGoals(); }
  }

  /* ============ Keep header height in sync (fixes Safari dvh/flex quirks) ============ */
  // The header is pinned with position:absolute so it can never scroll away,
  // even in Safari when the dynamic address bar changes the real viewport
  // height. #content is pushed down by --header-h to match; we measure the
  // header's real rendered height (safe-area included) instead of guessing.
  function syncHeaderHeight() {
    const h = appHeader.getBoundingClientRect().height;
    if (h > 0) appShell.style.setProperty('--header-h', `${h}px`);
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncHeaderHeight).observe(appHeader);
  } else {
    window.addEventListener('resize', syncHeaderHeight);
  }
  window.addEventListener('orientationchange', syncHeaderHeight);
  syncHeaderHeight();
  // Re-measure once more after fonts/layout settle on first paint.
  setTimeout(syncHeaderHeight, 150);

  /* ============ Sticky header scroll shadow ============ */
  contentEl.addEventListener('scroll', () => {
    appHeader.classList.toggle('is-scrolled', contentEl.scrollTop > 4);
  }, { passive: true });

  /* ============ Init ============ */
  recordHabitHistory();
  showTab('habits');
})();