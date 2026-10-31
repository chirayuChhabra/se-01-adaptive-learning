import { band, complete, grade, parseNumeric, recommend, stats } from '../../shared/learning/engine.ts';
import type { Attempt, ChapterConfig, LearningState, Response } from '../../shared/learning/types.ts';

/** Stateful engine boundary. The reader owns presentation; this owns saved evidence and results. */
export function createLearningController(config: ChapterConfig, storage: Storage, profile: string) {
  const key = `se01-learning:1:${config.id}:${config.revision}:${profile}`;
  const questions = new Map(config.quizzes.flatMap(q => q.questions).map(q => [q.id, q]));
  let state: LearningState = { schemaVersion: 1, attempts: [] };
  let blocked = false;
  let error = '';
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.schemaVersion !== 1 || !Array.isArray(saved.attempts) || !saved.attempts.every((a: Attempt) =>
        questions.has(a.questionId) && typeof a.hinted === 'boolean' && typeof a.at === 'string' &&
        (typeof a.response === 'string' || typeof a.response === 'number' || Array.isArray(a.response)))) throw new Error('Invalid saved progress');
      state = saved;
    }
  } catch {
    blocked = true;
    error = 'Your saved progress could not be read. Your existing record has been kept, and new answers cannot be saved.';
  }
  return {
    get state() { return state; },
    get error() { return error; },
    restartQuiz(quizId: string) {
      if (blocked) return { saved: false, error };
      const quiz = config.quizzes.find(q => q.id === quizId);
      if (!quiz) return { saved: false, error: 'Quiz not found in this chapter.' };
      const ids = new Set(quiz.questions.map(q => q.id));
      const updated = { ...state, attempts: state.attempts.filter(a => !ids.has(a.questionId)) };
      try {
        storage.setItem(key, JSON.stringify(updated));
        state = updated; error = '';
        return { saved: true, error };
      } catch {
        return { saved: false, error: 'Could not restart the quiz. Please check device storage and try again.' };
      }
    },
    /** Save first: no visible state or recommendation may advance on a failed write. */
    submit(questionId: string, response: Response, hinted: boolean) {
      if (blocked) return { saved: false, error };
      const question = questions.get(questionId);
      if (!question) return { saved: false, error: 'Question not found in this chapter.' };
      const index = (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) < (question.options?.length ?? 0);
      const valid = question.type === 'numeric' ? typeof response === 'string' && parseNumeric(response) !== null
        : question.type === 'single' ? index(response)
        : Array.isArray(response) && response.length > 0 && response.every(index) && new Set(response).size === response.length &&
          (question.type !== 'ordering' || response.length === question.options!.length);
      if (!valid || typeof hinted !== 'boolean') return { saved: false, error: question.type === 'numeric' ? 'Enter a number, or a fraction with a nonzero denominator.' : 'Complete your answer first.' };
      const attempt: Attempt = { questionId: question.id, response, hinted, at: new Date().toISOString() };
      const updated = { ...state, attempts: [...state.attempts, attempt] };
      try {
        storage.setItem(key, JSON.stringify(updated));
        state = updated; error = '';
        return { saved: true, correct: grade(question, response), error };
      } catch {
        error = 'Could not save your answer. Free some device storage and try again.';
        return { saved: false, error };
      }
    },
    isCorrect(questionId: string, response: Response) {
      const question = questions.get(questionId);
      return question ? grade(question, response) : false;
    },
    results() {
      const axes = stats(config, state.attempts);
      return { completed: complete(config, state.attempts), axes: axes.map(axis => ({ ...axis, band: band(config, axis.value) })), next: recommend(config, state.attempts) };
    },
  };
}
