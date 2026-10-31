import { createLearningController } from './controller.ts';
import type { ChapterConfig, Question, Response } from '../../shared/learning/types.ts';

declare global { interface Window { __LEARNING__: { config: ChapterConfig; page: string }; } }
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function mountLearning(doc: Document, config: ChapterConfig, page: string): void {
  const storage = doc.defaultView!.localStorage;
  const activeKey = `se01-learning:active:${config.id}`;
  // Continue an existing local history, while new chapters use the default device history.
  const profile = storage.getItem(activeKey) || 'student';
  const engine = createLearningController(config, storage, profile);
  // The author's color is a default; a reader's saved preference wins.
  if (config.cover?.color) {
    let savedColor: string | null = null;
    try { savedColor = storage.getItem('se01-reader-accent'); } catch { /* keep the chapter default */ }
    if (!savedColor) {
      doc.documentElement.style.setProperty('--accent', config.cover.color);
      const picker = doc.querySelector<HTMLInputElement>('#accent');
      if (picker) picker.value = config.cover.color;
    }
  }

  // Keep the compiler's rendered lesson and interactive descendants, replacing only its chrome.
  const content = doc.createElement('main');
  content.className = 'le-content'; content.id = 'lesson';
  const controls = doc.querySelector<HTMLElement>('.toolbar .controls');
  const rendered = doc.querySelector('.bk-content, #content');
  const source = rendered ? [...rendered.childNodes] : [...doc.body.childNodes].filter(n => n.nodeName !== 'SCRIPT');
  content.append(...source);
  // Give each chapter an opening, while keeping the author's heading and introduction intact.
  const title = content.querySelector<HTMLElement>(':scope > h1');
  if (title) {
    const intro = title.nextElementSibling;
    const hero = doc.createElement('section'); hero.className = 'le-hero';
    const copy = doc.createElement('div'); copy.className = 'le-hero-copy';
    const label = doc.createElement('span'); label.className = 'le-hero-label'; label.textContent = config.cover?.label ?? 'CHAPTER';
    title.before(hero); copy.append(label, title);
    if (intro?.tagName === 'P') copy.append(intro);
    const art = doc.createElement('div'); art.className = 'le-hero-art'; art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<span class="le-orbit le-orbit-one"></span><span class="le-orbit le-orbit-two"></span><span class="le-orbit-dot"></span><span class="le-orbit-cross">✳</span>';
    hero.append(copy);
    if (config.cover?.artwork !== 'none') hero.append(art);
    else hero.classList.add('le-hero-no-art');
    if (controls) { controls.classList.add('le-appearance'); hero.append(controls); }
  }
  content.querySelectorAll('.bk-eyebrow').forEach(n => n.remove());
  doc.querySelector('.bk-shell')?.remove();
  doc.querySelector('.toolbar')?.remove();
  rendered?.remove();
  const app = doc.createElement('div'); app.className = 'le-app';
  if (controls && !title) { controls.classList.add('le-appearance-fallback'); content.prepend(controls); }
  const summary = content.querySelector<HTMLElement>('[data-learning-stats]')!;
  const next = content.querySelector<HTMLElement>('[data-learning-next]')!;
  const dialog = doc.createElement('dialog'); dialog.className = 'le-dialog'; dialog.setAttribute('aria-labelledby', 'le-result-title');
  dialog.innerHTML = '<div class="le-dialog-inner"><div class="le-result-intro"><p class="le-result-eyebrow">Chapter complete</p><h2 id="le-result-title">A look at your learning</h2><p>Here’s what your answers tell us, and a place to go next.</p><button type="button" class="le-close" aria-label="Close results">×</button></div><div class="le-result-body"></div></div>';
  dialog.querySelector('.le-result-body')!.append(summary, next);
  let opener: HTMLElement | null = null;
  const closeResults = () => {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    opener?.focus();
  };
  dialog.querySelector<HTMLButtonElement>('.le-close')!.onclick = closeResults;
  dialog.addEventListener('close', () => opener?.focus());
  function showResults() {
    if (!engine.results().completed) return;
    opener = doc.activeElement as HTMLElement | null;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', ''); // DOM test environments may not implement <dialog>.
    dialog.querySelector<HTMLButtonElement>('.le-close')!.focus();
  }
  const finish = doc.createElement('section'); finish.className = 'le-finish';
  finish.innerHTML = `<span class="le-finish-mark" aria-hidden="true">✳</span><div class="le-finish-copy"><h2>${page === config.entry ? 'End of chapter' : 'Your chapter progress'}</h2><p>Complete the chapter check to see your next step.</p></div>`;
  const finishButton = doc.createElement('button'); finishButton.type = 'button'; finishButton.className = 'le-primary le-finish-button'; finishButton.textContent = page === config.entry ? 'Complete chapter' : 'View my skills'; finishButton.onclick = showResults;
  finish.append(finishButton);
  // The chapter stays a normal reading page; the results live only in the modal.
  content.append(finish);
  const layout = doc.createElement('div'); layout.className = 'le-layout'; layout.append(content);
  app.append(layout, dialog);

  const notice = doc.createElement('p'); notice.className = 'le-notice'; notice.setAttribute('role', 'status');
  app.append(notice); doc.body.append(app);
  doc.documentElement.classList.add('le-document');

  if (engine.error) notice.textContent = engine.error;

  function questionUI(q: Question, onSaved: () => void): HTMLElement {
    const box = doc.createElement('fieldset'); box.className = 'le-question'; box.tabIndex = -1;
    const legend = doc.createElement('legend'); legend.textContent = q.prompt; box.append(legend);
    const instruction = doc.createElement('p'); instruction.className = 'le-instruction';
    instruction.textContent = q.type === 'multiple' ? 'Choose all that apply.' : q.type === 'ordering' ? 'Choose each item once. Selecting an item already used will move it.' : q.type === 'numeric' ? 'Enter a number or fraction.' : 'Choose one answer.';
    if (q.level === 'hots') instruction.textContent = 'Think it through. ' + instruction.textContent;
    box.append(instruction);
    let hinted = false;
    const previous = [...engine.state.attempts].reverse().find(a => a.questionId === q.id);
    const controls = doc.createElement('div'); controls.className = 'le-options'; box.append(controls);
    let read: () => Response;
    if (q.type === 'numeric') {
      const field = doc.createElement('input'); field.type = 'text'; field.setAttribute('aria-label', 'Your number or fraction'); field.placeholder = 'e.g. 3/4';
      if (previous) field.value = String(previous.response); controls.append(field); read = () => field.value;
    } else if (q.type === 'ordering') {
      const selects = q.options!.map((_, i) => {
        const label = doc.createElement('label'); label.className = 'le-order-row';
        const position = doc.createElement('span'); position.textContent = String(i + 1);
        const select = doc.createElement('select'); select.setAttribute('aria-label', `Position ${i + 1}`);
        select.innerHTML = '<option value="">Choose an item</option>' + q.options!.map((s, j) => `<option value="${j}">${escape(s)}</option>`).join('');
        if (Array.isArray(previous?.response)) select.value = String(previous.response[i]);
        label.append(position, select); controls.append(label); return select;
      });
      // Moving an item into another position swaps it with the previous selection.
      // An empty previous selection clears the other position instead.
      selects.forEach(select => { select.dataset.previousValue = select.value; });
      selects.forEach(select => select.addEventListener('change', () => {
        const prior = select.dataset.previousValue ?? '';
        const other = select.value ? selects.find(item => item !== select && item.value === select.value) : undefined;
        if (other) other.value = prior;
        selects.forEach(item => { item.dataset.previousValue = item.value; });
      }));
      read = () => selects.map(s => s.value === '' ? -1 : Number(s.value));
    } else {
      const inputs = q.options!.map((option, i) => {
        const label = doc.createElement('label'); label.className = 'le-choice';
        const field = doc.createElement('input'); field.type = q.type === 'single' ? 'radio' : 'checkbox'; field.name = `${q.id}-${profile}`; field.value = String(i);
        field.checked = q.type === 'single' ? previous?.response === i : Array.isArray(previous?.response) && previous.response.includes(i);
        const text = doc.createElement('span'); text.textContent = option;
        label.append(field, text); controls.append(label); return field;
      });
      read = () => q.type === 'single' ? inputs.findIndex(x => x.checked) : inputs.flatMap((x, i) => x.checked ? [i] : []);
    }
    const feedback = doc.createElement('div'); feedback.className = 'le-feedback'; feedback.setAttribute('role', 'status');
    const actions = doc.createElement('div'); actions.className = 'le-actions';
    const submit = doc.createElement('button'); submit.type = 'button'; submit.className = 'le-primary'; submit.textContent = 'Check answer';
    actions.append(submit);
    if (q.hint) {
      const hint = doc.createElement('button'); hint.type = 'button'; hint.className = 'le-secondary'; hint.textContent = 'Need a hint?';
      hint.onclick = () => { hinted = true; feedback.dataset.tone = 'hint'; feedback.textContent = q.hint!; }; actions.append(hint);
    }
    submit.onclick = () => {
      const response = read();
      if (response === '' || response === -1 || (Array.isArray(response) && (!response.length || response.includes(-1) || new Set(response).size !== response.length))) {
        feedback.dataset.tone = 'hint'; feedback.textContent = q.type === 'ordering' ? 'Choose an item for every position, using each item once, then check your answer.' : 'Choose or enter your answer first, then select Check answer.'; return;
      }
      const result = engine.submit(q.id, response, hinted);
      notice.textContent = result.error;
      if (!result.saved) { feedback.dataset.tone = 'hint'; feedback.textContent = result.error; return; }
      const correct = result.correct; feedback.dataset.tone = correct ? 'correct' : 'practice';
      feedback.innerHTML = `<strong>${correct ? 'You’ve got it.' : 'A little more practice here.'}</strong><p>${escape(q.explanation)}</p>`;
      submit.textContent = 'Check again'; onSaved(); updateSummaries();
    };
    if (previous) {
      feedback.dataset.tone = engine.isCorrect(q.id, previous.response) ? 'correct' : 'practice';
      feedback.innerHTML = `<strong>${engine.isCorrect(q.id, previous.response) ? 'You’ve got it.' : 'A little more practice here.'}</strong><p>${escape(q.explanation)}</p>`;
    }
    box.append(actions, feedback); return box;
  }

  function updateSummaries() {
    const result = engine.results(), values = result.axes, finished = result.completed;
    finishButton.disabled = !finished;
    finish.querySelector('p')!.textContent = finished ? 'See what you have learned and where to go next.' : 'Complete the chapter check to see your next step.';
    const answered = new Set(engine.state.attempts.map(a => a.questionId));
    const required = config.quizzes.filter(q => config.completion.quizzes.includes(q.id)).flatMap(q => q.questions);
    const count = required.filter(q => answered.has(q.id)).length;
    summary.className = 'le-summary';
    const point = (i: number, r: number) => `${240 + Math.cos(-Math.PI / 2 + i * Math.PI / 3) * r},${225 + Math.sin(-Math.PI / 2 + i * Math.PI / 3) * r}`;
    const grids = [38, 76, 114, 152].map(r => `<polygon points="${values.map((_, i) => point(i, r)).join(' ')}" class="le-grid"/>`).join('');
    // A polygon through the center would misrepresent missing evidence as a zero.
    const shape = values.every(s => s.value !== null) ? `<polygon points="${values.map((s, i) => point(i, s.value! * 1.52)).join(' ')}" class="le-shape"/>` : '';
    const points = values.map((s, i) => s.value === null ? '' : `<circle cx="${point(i, s.value * 1.52).split(',')[0]}" cy="${point(i, s.value * 1.52).split(',')[1]}" r="5" class="le-point"/>`).join('');
    const labels = values.map((s, i) => {
      const [x, y] = point(i, 187).split(',');
      const anchor = i === 1 || i === 2 ? 'start' : i === 4 || i === 5 ? 'end' : 'middle';
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle">${escape(s.label)}</text>`;
    }).join('');
    summary.innerHTML = `<div class="le-section-heading"><div><p class="le-summary-kicker">YOUR CHAPTER PROFILE</p><h2>Six skills, one picture</h2></div><span>${count}/${required.length} answered</span></div><svg viewBox="0 0 480 450" role="img" aria-label="Six-sided skill profile. See the list below for each skill's result.">${grids}${values.map((_, i) => { const [x, y] = point(i, 152).split(','); return `<line x1="240" y1="225" x2="${x}" y2="${y}" class="le-spoke"/>`; }).join('')}${shape}${points}${labels}</svg><p class="le-profile-caption">${values.some(s => s.value === null) ? 'Some skills need more evidence. Dots show known results.' : 'Each point reflects your answers in this chapter.'}</p><ul class="le-skill-list" aria-label="Skill results">${values.map(s => `<li><span class="le-skill-dot"></span><span>${escape(s.label)}</span><small>${s.value === null ? 'Not explored' : escape(s.band)}</small></li>`).join('')}</ul>`;
    next.className = 'le-next'; const route = result.next;
    if (!route) {
      const localQuiz = content.querySelector<HTMLElement>('[data-learning-quiz]');
      const checkLink = localQuiz ? '#' + localQuiz.id : relativeLink(page, config.pages.find(p => p.quizzes.includes(config.completion.quizzes[0]))!.file) + '#learning-' + config.completion.quizzes[0];
      next.innerHTML = `<p class="le-next-label">Up next</p><h2>Find your next step</h2><p>Complete the chapter check for a lesson chosen around your skills.</p><a class="le-text-link" href="${escape(checkLink)}">${count ? 'Continue your check' : 'Start the chapter check'} <span aria-hidden="true">→</span></a>`;
      return;
    }
    const target = config.pages.find(p => p.file === route.file)!;
    next.innerHTML = `<p class="le-next-label">YOUR NEXT LESSON</p><h2>${escape(target.title)}</h2><p>${escape(route.reason)}</p>${route.file === page ? '<p class="le-current-lesson">You’re here. Try the check below.</p>' : `<a class="le-primary" href="${escape(relativeLink(page, route.file))}">Continue learning <span aria-hidden="true">→</span></a>`}`;
  }

  function render() {
    if (dialog.open) closeResults();
    doc.querySelectorAll<HTMLElement>('[data-learning-quiz]').forEach(mount => {
      const foundQuiz = config.quizzes.find(q => q.id === mount.dataset.learningQuiz); if (!foundQuiz) return;
      const quiz = foundQuiz;
      mount.className = 'le-quiz'; mount.id = 'learning-' + quiz.id; mount.replaceChildren();
      const answered = new Set(engine.state.attempts.map(a => a.questionId));
      let current = quiz.questions.findIndex(q => !answered.has(q.id)); if (current < 0) current = quiz.questions.length - 1;
      const heading = doc.createElement('h2'); heading.textContent = quiz.title;
      const progress = doc.createElement('div'); progress.className = 'le-quiz-progress';
      const stage = doc.createElement('div'); stage.className = 'le-stage';
      const footer = doc.createElement('div'); footer.className = 'le-quiz-footer';
      const restart = doc.createElement('button'); restart.type = 'button'; restart.className = 'le-secondary'; restart.textContent = 'Restart quiz';
      restart.onclick = () => {
        if (!doc.defaultView!.confirm('Restart this quiz? Its saved answers will be cleared.')) return;
        const result = engine.restartQuiz(quiz.id);
        notice.textContent = result.error;
        if (result.saved) { render(); doc.getElementById('learning-' + quiz.id)?.scrollIntoView?.({ block: 'start' }); }
      };
      mount.append(heading, restart, progress, stage, footer);
      const fields = quiz.questions.map(q => questionUI(q, () => { answered.add(q.id); updateProgress(); }));
      stage.append(...fields);
      function updateProgress() {
        progress.innerHTML = `<span>Question ${current + 1} of ${quiz.questions.length}</span><div class="le-progress-track"><span style="width:${answered.size / quiz.questions.length * 100}%"></span></div>`;
        fields.forEach((field, i) => field.hidden = i !== current);
        footer.replaceChildren();
        const back = doc.createElement('button'); back.type = 'button'; back.className = 'le-secondary'; back.textContent = 'Previous'; back.disabled = current === 0;
        back.onclick = () => { current--; updateProgress(); fields[current].focus({ preventScroll: true }); }; footer.append(back);
        const forward = doc.createElement('button'); forward.type = 'button'; forward.className = 'le-forward';
        forward.textContent = current === quiz.questions.length - 1 ? 'Finish check' : 'Next question';
        forward.disabled = !answered.has(quiz.questions[current].id);
        forward.onclick = () => {
          if (current < quiz.questions.length - 1) { current++; updateProgress(); fields[current].focus({ preventScroll: true }); mount.scrollIntoView?.({ block: 'start' }); }
          else {
            mount.classList.add('le-finished'); stage.hidden = true; progress.hidden = true;
            heading.textContent = 'This check is complete';
            const message = doc.createElement('p'); message.textContent = 'Your answers are saved. Continue reading, then complete the chapter when you are ready.';
            const review = doc.createElement('button'); review.type = 'button'; review.className = 'le-secondary'; review.textContent = 'Review answers';
            review.onclick = () => { mount.classList.remove('le-finished'); stage.hidden = false; progress.hidden = false; heading.textContent = quiz.title; current = 0; updateProgress(); };
            footer.replaceChildren(message, review); finish.scrollIntoView?.({ block: 'nearest' });
          }
        }; footer.append(forward);
      }
      updateProgress();
    });
    updateSummaries();
    // Start in the lesson, even when a saved chapter is complete.
  }
  render();
}
export function relativeLink(from: string, to: string): string {
  const a = from.split('/'); a.pop(); const b = to.split('/');
  while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
  return [...a.map(() => '..'), ...b].join('/').replace(/\.md$/, '.html');
}
if (typeof window !== 'undefined' && window.__LEARNING__) {
  try { mountLearning(document, window.__LEARNING__.config, window.__LEARNING__.page); }
  catch { const p = document.createElement('p'); p.textContent = 'Learning tools could not start. This browser must allow local storage.'; p.setAttribute('role', 'alert'); document.body.prepend(p); }
}
