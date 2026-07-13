(() => {
  'use strict';

  /* ============ Storage helpers ============ */
  const STORE = {
    habits: 'enfoque.habits',        // [{id, name}]
    habitLog: 'enfoque.habitLog',    // { "2026-07-12": [habitId, ...] }
    routines: 'enfoque.routines',    // [{id, name, exercises:[{id,name}]}]
    goals: 'enfoque.goals'           // [{id, name, done}]
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

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

  /* ============ State ============ */
  let habits = load(STORE.habits, []);
  let habitLog = load(STORE.habitLog, {});
  let routines = load(STORE.routines, []);
  let goals = load(STORE.goals, []);
  let activeRoutineId = null;
  let currentTab = 'habits';

  /* ============ DOM refs ============ */
  const $ = (id) => document.getElementById(id);

  const pageTitle = $('page-title');
  const todayLabel = $('today-label');
  const progressCount = $('progress-count');
  const progressFill = $('progress-fill');
  const progressTrack = document.querySelector('.progress-track');

  const habitsList = $('habits-list');
  const habitsEmpty = $('habits-empty');
  const habitForm = $('habit-form');
  const habitInput = $('habit-input');

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

  const goalsList = $('goals-list');
  const goalsEmpty = $('goals-empty');
  const goalForm = $('goal-form');
  const goalInput = $('goal-input');

  const tabbar = $('tabbar');

  /* ============ Tab switching ============ */
  const TAB_META = {
    habits: 'Hábitos',
    routines: 'Rutinas',
    goals: 'Metas'
  };

  function showTab(tab) {
    currentTab = tab;

    document.querySelectorAll('[data-view]').forEach(v => v.hidden = true);
    $(`view-${tab === 'habits' ? 'habits' : tab === 'routines' ? 'routines' : 'goals'}`).hidden = false;

    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });

    pageTitle.textContent = TAB_META[tab];

    if (tab === 'habits') {
      todayLabel.textContent = 'Hoy';
      progressTrack.style.visibility = 'visible';
      progressCount.style.visibility = 'visible';
    } else {
      todayLabel.textContent = tab === 'routines' ? 'Entrenamiento' : 'Objetivos';
      progressTrack.style.visibility = 'hidden';
      progressCount.style.visibility = 'hidden';
    }

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
    renderHabits();
  }

  function removeHabit(id) {
    habits = habits.filter(h => h.id !== id);
    save(STORE.habits, habits);
    renderHabits();
  }

  habitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = habitInput.value.trim();
    if (!name) return;
    habits.push({ id: uid(), name });
    save(STORE.habits, habits);
    habitInput.value = '';
    renderHabits();
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

  /* ============ Goals ============ */
  function renderGoals() {
    goalsList.innerHTML = '';
    goalsEmpty.hidden = goals.length > 0;

    goals.forEach(g => {
      const li = document.createElement('li');
      li.className = 'list-item' + (g.done ? ' is-complete' : '');
      li.innerHTML = `
        <span class="item-text"></span>
        <button class="goal-btn"></button>
        <button class="item-remove" aria-label="Eliminar meta">×</button>
      `;
      li.querySelector('.item-text').textContent = g.name;
      li.querySelector('.goal-btn').textContent = g.done ? 'Cumplida' : 'Marcar';
      li.querySelector('.goal-btn').addEventListener('click', () => toggleGoal(g.id));
      li.querySelector('.item-remove').addEventListener('click', () => removeGoal(g.id));
      goalsList.appendChild(li);
    });
  }

  function toggleGoal(id) {
    const g = goals.find(x => x.id === id);
    if (!g) return;
    g.done = !g.done;
    save(STORE.goals, goals);
    renderGoals();
  }

  function removeGoal(id) {
    goals = goals.filter(g => g.id !== id);
    save(STORE.goals, goals);
    renderGoals();
  }

  goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = goalInput.value.trim();
    if (!name) return;
    goals.push({ id: uid(), name, done: false });
    save(STORE.goals, goals);
    goalInput.value = '';
    renderGoals();
  });

  /* ============ Master render ============ */
  function render() {
    if (currentTab === 'habits') renderHabits();
    if (currentTab === 'routines') {
      if (activeRoutineId) renderRoutineDetail(); else renderRoutines();
    }
    if (currentTab === 'goals') renderGoals();
  }

  /* ============ Init ============ */
  showTab('habits');
})();
