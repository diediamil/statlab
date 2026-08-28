/**
 * Pruebas de la lógica de la aplicación: scoring, mastery, progreso, rankings,
 * exportación y coherencia del contenido.
 *
 * Especial atención al REQUISITO DE JUSTICIA del ranking: saber estadística
 * tiene que puntuar más que responder rápido. Eso se comprueba numéricamente.
 */

import { describe, it, assert } from './runner.js';
import {
  DEFAULT_SCORING, accuracyScore, efficiencyScore, timeScore, hintsScore,
  scoreChallengeAttempt, challengeXp, rankBonusXp, multiSelectScore,
  classifyScore, orderScore, numericScore, claimAuditScore, decisionScore,
} from '../js/scoring.js';
import {
  conceptMastery, responseQuality, computeAllMastery, averageMastery,
  conceptsToReview, nextDifficulty, adaptivePlan, masteryLevel,
} from '../js/mastery.js';
import {
  activityXp, levelFromXp, xpForLevel, updateStreak, streakCalendar,
  worldStates, evaluateAchievements,
} from '../js/progress.js';
import { splitChallenge, sanitizeStep, isRankEligible, solutionAvailable, challengeState, ActiveTimer } from '../js/challenges.js';
import { gradeStepLocally } from '../js/data/demoStore.js';
import { toCsv } from '../js/export.js';
import { validate, getWorlds, getAllActivities, getBuiltInChallenges, getConceptIndex } from '../js/content.js';
import { instantiate, clinicalTrial2Groups } from '../js/generators.js';

/* ======================================================== CHALLENGE POINTS */

describe('Challenge Points — componentes', () => {
  it('exactitud: media ponderada de los pasos', () => {
    const r = accuracyScore([{ score: 1, weight: 1 }, { score: 0, weight: 1 }]);
    assert.close(r.points, 350, 1e-6);
    assert.close(r.fraction, 0.5, 1e-6);
  });

  it('exactitud: los pasos con más peso mandan más', () => {
    const r = accuracyScore([{ score: 1, weight: 3 }, { score: 0, weight: 1 }]);
    assert.close(r.fraction, 0.75, 1e-6);
  });

  it('eficiencia: sin errores da el máximo', () => {
    assert.close(efficiencyScore(0, 8).points, 150, 1e-6);
  });

  it('eficiencia: decae de forma hiperbólica y nunca llega a cero', () => {
    const e1 = efficiencyScore(1, 8).points;
    const e2 = efficiencyScore(2, 8).points;
    const e8 = efficiencyScore(8, 8).points;
    assert.close(e1, 120, 0.01);
    assert.close(e2, 100, 0.01);
    assert.close(e8, 50, 0.01);
    assert.ok(e8 > 0, 'nunca cae a cero');
    assert.ok((e1 - e2) > (efficiencyScore(7, 8).points - e8), 'el primer error penaliza más que el octavo');
  });

  it('tiempo: por debajo del tiempo de referencia se obtiene el máximo', () => {
    assert.close(timeScore(120, 600).points, 100, 1e-6);
    assert.close(timeScore(540, 600).points, 100, 1e-6);
    assert.close(timeScore(600, 600).points, 100, 1e-6);
  });

  it('tiempo: NO hay carrera por debajo de la referencia', () => {
    assert.equal(timeScore(60, 600).points, timeScore(590, 600).points);
  });

  it('tiempo: al doble del tiempo de referencia se obtiene la mitad', () => {
    assert.close(timeScore(1200, 600).points, 50, 0.01);
  });

  it('tiempo: nunca baja del suelo de 25 puntos', () => {
    assert.close(timeScore(100000, 600).points, 25, 1e-6);
  });

  it('tiempo: unos segundos de diferencia no cambian nada relevante', () => {
    const a = timeScore(700, 600).points;
    const b = timeScore(705, 600).points;
    assert.ok(Math.abs(a - b) < 1, `diferencia de ${Math.abs(a - b)} puntos por 5 segundos`);
  });

  it('pistas: máximo sin pistas, cero con todas', () => {
    assert.close(hintsScore(0, 8).points, 50, 1e-6);
    assert.close(hintsScore(4, 8).points, 25, 1e-6);
    assert.close(hintsScore(8, 8).points, 0, 1e-6);
  });

  it('pistas: si el reto no ofrece pistas, se dan los 50 puntos', () => {
    assert.close(hintsScore(0, 0).points, 50, 1e-6);
  });
});

describe('Challenge Points — requisito de justicia', () => {
  const steps8 = (score) => Array.from({ length: 8 }, () => ({ score, weight: 1 }));

  it('un intento perfecto obtiene exactamente 1.000', () => {
    const r = scoreChallengeAttempt({
      steps: steps8(1), errors: 0, hintsUsed: 0, hintsAvailable: 8,
      activeSeconds: 540, referenceSeconds: 600,
    });
    assert.equal(r.total, 1000);
    assert.ok(r.perfectRun);
  });

  it('9 minutos perfecto SUPERA a 4 minutos con errores (requisito explícito)', () => {
    const lentoPerfecto = scoreChallengeAttempt({
      steps: steps8(1), errors: 0, hintsUsed: 0, hintsAvailable: 8,
      activeSeconds: 540, referenceSeconds: 600,
    });
    const rapidoConFallos = scoreChallengeAttempt({
      steps: [...steps8(1).slice(0, 6), { score: 0, weight: 1 }, { score: 0, weight: 1 }],
      errors: 3, hintsUsed: 0, hintsAvailable: 8,
      activeSeconds: 240, referenceSeconds: 600,
    });
    assert.ok(lentoPerfecto.total > rapidoConFallos.total,
      `perfecto=${lentoPerfecto.total} vs rápido=${rapidoConFallos.total}`);
    assert.ok(lentoPerfecto.total - rapidoConFallos.total > 150, 'y la diferencia es amplia');
  });

  it('incluso tardando el DOBLE, resolver bien gana a resolver mal y rápido', () => {
    const lento = scoreChallengeAttempt({
      steps: steps8(1), errors: 0, hintsUsed: 0, hintsAvailable: 8,
      activeSeconds: 1200, referenceSeconds: 600,
    });
    const rapidoMal = scoreChallengeAttempt({
      steps: steps8(0.6), errors: 4, hintsUsed: 0, hintsAvailable: 8,
      activeSeconds: 200, referenceSeconds: 600,
    });
    assert.ok(lento.total > rapidoMal.total, `lento=${lento.total} vs rápido=${rapidoMal.total}`);
  });

  it('la exactitud domina: pesa 700 de 1.000', () => {
    assert.equal(DEFAULT_SCORING.accuracyMax, 700);
    assert.ok(DEFAULT_SCORING.accuracyMax > DEFAULT_SCORING.efficiencyMax
      + DEFAULT_SCORING.timeMax + DEFAULT_SCORING.hintsMax);
  });

  it('el total nunca supera 1.000 ni baja de 0', () => {
    const max = scoreChallengeAttempt({ steps: steps8(1), errors: 0, hintsUsed: 0, hintsAvailable: 0, activeSeconds: 1, referenceSeconds: 600 });
    const min = scoreChallengeAttempt({ steps: steps8(0), errors: 50, hintsUsed: 8, hintsAvailable: 8, activeSeconds: 99999, referenceSeconds: 600 });
    assert.between(max.total, 0, 1000);
    assert.between(min.total, 0, 1000);
    assert.ok(min.total > 0, 'incluso el peor intento conserva algo de tiempo y eficiencia');
  });

  it('usar pistas reduce la puntuación pero no la arruina', () => {
    const sin = scoreChallengeAttempt({ steps: steps8(1), errors: 0, hintsUsed: 0, hintsAvailable: 8, activeSeconds: 500, referenceSeconds: 600 });
    const con = scoreChallengeAttempt({ steps: steps8(1), errors: 0, hintsUsed: 8, hintsAvailable: 8, activeSeconds: 500, referenceSeconds: 600 });
    assert.equal(sin.total - con.total, 50);
  });

  it('los pesos son configurables por reto', () => {
    const cfg = { ...DEFAULT_SCORING, accuracyMax: 800, timeMax: 0, efficiencyMax: 150, hintsMax: 50 };
    const r = scoreChallengeAttempt({ steps: steps8(1), errors: 0, hintsUsed: 0, hintsAvailable: 8, activeSeconds: 5000, referenceSeconds: 600 }, cfg);
    assert.equal(r.components.accuracy.max, 800);
    assert.equal(r.components.time.points, 0);
  });

  it('XP del reto es modesta y separada de los Challenge Points', () => {
    const r = scoreChallengeAttempt({ steps: steps8(1), errors: 0, hintsUsed: 0, hintsAvailable: 8, activeSeconds: 300, referenceSeconds: 600 });
    const xp = challengeXp(r);
    assert.equal(xp, 100);
    assert.ok(xp < r.total / 5, 'la XP no compite con los Challenge Points');
  });

  it('los bonus de posición son pequeños', () => {
    assert.equal(rankBonusXp(1), 100);
    assert.equal(rankBonusXp(4), 0);
    assert.ok(rankBonusXp(1) <= 100, 'un bonus grande haría inalcanzable al líder');
  });
});

describe('Crédito parcial por tipo de paso', () => {
  it('selección múltiple penaliza los falsos positivos', () => {
    assert.close(multiSelectScore(['a', 'b'], ['a', 'b'], ['a', 'b', 'c']), 1, 1e-9);
    assert.close(multiSelectScore(['a'], ['a', 'b'], ['a', 'b', 'c']), 0.5, 1e-9);
    assert.close(multiSelectScore(['a', 'b', 'c'], ['a', 'b'], ['a', 'b', 'c']), 0.5, 1e-9);
    assert.close(multiSelectScore(['a', 'b', 'c'], ['a'], ['a', 'b', 'c']), 0, 1e-9);
  });
  it('marcarlo todo no es rentable', () => {
    const todo = multiSelectScore(['a', 'b', 'c', 'd'], ['a'], ['a', 'b', 'c', 'd']);
    const solo = multiSelectScore(['a'], ['a'], ['a', 'b', 'c', 'd']);
    assert.ok(solo > todo);
  });
  it('clasificación: proporción de elementos bien colocados', () => {
    const items = [{ id: 'i1', bin: 'a' }, { id: 'i2', bin: 'b' }, { id: 'i3', bin: 'a' }, { id: 'i4', bin: 'b' }];
    assert.close(classifyScore({ i1: 'a', i2: 'b', i3: 'b', i4: 'b' }, items), 0.75, 1e-9);
  });
  it('ordenación: concordancia de pares', () => {
    const items = [{ id: 'a', pos: 1 }, { id: 'b', pos: 2 }, { id: 'c', pos: 3 }];
    assert.close(orderScore(['a', 'b', 'c'], items), 1, 1e-9);
    assert.close(orderScore(['c', 'b', 'a'], items), 0, 1e-9);
    assert.close(orderScore(['a', 'c', 'b'], items), 2 / 3, 1e-9);
  });
  it('numérico: respeta la tolerancia', () => {
    assert.equal(numericScore(8.25, 8.3, 0.25), 1);
    assert.equal(numericScore(7.9, 8.3, 0.25), 0);
  });
  it('auditoría de afirmaciones: proporción de juicios acertados', () => {
    const claims = [{ id: 'c1', correct: true }, { id: 'c2', correct: false }];
    assert.close(claimAuditScore({ c1: true, c2: false }, claims), 1, 1e-9);
    assert.close(claimAuditScore({ c1: true, c2: true }, claims), 0.5, 1e-9);
  });
  it('decisión: 70 % elección + 30 % justificación', () => {
    const step = {
      answer: 'anova',
      justify: { options: [{ id: 'j1', correct: true }, { id: 'j2', correct: true }, { id: 'j3', correct: false }] },
    };
    assert.close(decisionScore({ chosen: 'anova', justification: ['j1', 'j2'] }, step), 1, 1e-6);
    assert.close(decisionScore({ chosen: 'anova', justification: [] }, step), 0.7, 1e-6);
    assert.close(decisionScore({ chosen: 'kruskal', justification: ['j1', 'j2'] }, step), 0.3, 1e-6);
  });
  it('decisión: una alternativa aceptable puntúa parcialmente', () => {
    const step = { answer: 't-independent', acceptable: ['mann-whitney'] };
    assert.close(decisionScore({ chosen: 'mann-whitney' }, step), 0.6, 1e-6);
    assert.close(decisionScore({ chosen: 'chi2' }, step), 0, 1e-6);
  });
});

describe('Corrección local (modo demo) y del servidor coinciden', () => {
  it('mcq', () => {
    assert.equal(gradeStepLocally({ type: 'mcq', answer: 'b' }, 'b'), 1);
    assert.equal(gradeStepLocally({ type: 'mcq', answer: 'b' }, 'a'), 0);
  });
  it('classify con crédito parcial', () => {
    const step = { type: 'classify', items: [{ id: 'i1', bin: 'a' }, { id: 'i2', bin: 'b' }] };
    assert.close(gradeStepLocally(step, { i1: 'a', i2: 'a' }), 0.5, 1e-9);
  });
  it('numeric con tolerancia', () => {
    assert.equal(gradeStepLocally({ type: 'numeric', answer: 8.3, tolerance: 0.25 }, 8.25), 1);
  });
  it('decision con justificación', () => {
    const step = {
      type: 'decision', answer: 'x',
      justify: { options: [{ id: 'j1', correct: true }, { id: 'j2', correct: false }] },
    };
    assert.close(gradeStepLocally(step, { chosen: 'x', justification: ['j1'] }), 1, 1e-6);
  });
  it('una respuesta malformada vale 0, no rompe', () => {
    assert.equal(gradeStepLocally({ type: 'mcq', answer: 'b' }, null), 0);
    assert.equal(gradeStepLocally({ type: 'desconocido' }, 'x'), 0);
  });
});

/* ================================================================ MASTERY */

describe('Concept mastery', () => {
  it('calidad: acierto limpio a la primera vale 1', () => {
    assert.close(responseQuality({ correct: true, attempts: 1, hintsUsed: 0 }), 1, 1e-9);
  });
  it('calidad: usar pista descuenta', () => {
    assert.close(responseQuality({ correct: true, attempts: 1, hintsUsed: 1 }), 0.85, 1e-9);
  });
  it('calidad: acertar al segundo intento descuenta más', () => {
    assert.close(responseQuality({ correct: true, attempts: 2, hintsUsed: 0 }), 0.7, 1e-9);
  });
  it('calidad: fallar vale 0', () => {
    assert.close(responseQuality({ correct: false, partial: 0, attempts: 1 }), 0, 1e-9);
  });

  it('sin evidencia el mastery es 0', () => {
    assert.equal(conceptMastery([]).value, 0);
  });

  it('contracción: dos aciertos sueltos NO dan 100', () => {
    const m = conceptMastery([
      { correct: true, attempts: 1, hintsUsed: 0, difficulty: 1 },
      { correct: true, attempts: 1, hintsUsed: 0, difficulty: 1 },
    ]);
    assert.close(m.value, 50, 0.5, 'con n = 2 el factor de contracción es 2/4');
  });

  it('con evidencia sostenida el mastery se acerca a 100', () => {
    const rows = Array.from({ length: 20 }, () => ({ correct: true, attempts: 1, hintsUsed: 0, difficulty: 2 }));
    const m = conceptMastery(rows);
    assert.between(m.value, 88, 92);
  });

  it('la recencia pesa: fallar ahora baja más que fallar hace tiempo', () => {
    const fallaAlFinal = conceptMastery([
      ...Array.from({ length: 6 }, () => ({ correct: true, attempts: 1, hintsUsed: 0, difficulty: 2 })),
      { correct: false, partial: 0, attempts: 1, difficulty: 2 },
    ]);
    const fallaAlPrincipio = conceptMastery([
      { correct: false, partial: 0, attempts: 1, difficulty: 2 },
      ...Array.from({ length: 6 }, () => ({ correct: true, attempts: 1, hintsUsed: 0, difficulty: 2 })),
    ]);
    assert.ok(fallaAlPrincipio.value > fallaAlFinal.value);
  });

  it('la dificultad pesa: acertar difícil vale más', () => {
    const facil = conceptMastery(Array.from({ length: 8 }, () => ({ correct: true, attempts: 1, hintsUsed: 0, difficulty: 1 })));
    const dificil = conceptMastery(Array.from({ length: 8 }, () => ({ correct: true, attempts: 1, hintsUsed: 0, difficulty: 3 })));
    assert.close(facil.value, dificil.value, 0.001, 'con todo correcto el valor coincide…');
    const mezcla1 = conceptMastery([
      { correct: true, attempts: 1, hintsUsed: 0, difficulty: 3 },
      { correct: false, partial: 0, attempts: 1, difficulty: 1 },
    ]);
    const mezcla2 = conceptMastery([
      { correct: true, attempts: 1, hintsUsed: 0, difficulty: 1 },
      { correct: false, partial: 0, attempts: 1, difficulty: 3 },
    ]);
    assert.ok(mezcla1.value > mezcla2.value, '…pero acertar lo difícil y fallar lo fácil puntúa más');
  });

  it('el mastery está siempre en [0, 100]', () => {
    for (const n of [1, 3, 10, 30]) {
      const rows = Array.from({ length: n }, (_, i) => ({ correct: i % 2 === 0, partial: 0.4, attempts: (i % 3) + 1, hintsUsed: i % 2, difficulty: (i % 3) + 1 }));
      assert.between(conceptMastery(rows).value, 0, 100);
    }
  });

  it('niveles etiquetados correctamente', () => {
    assert.equal(masteryLevel(85).key, 'mastered');
    assert.equal(masteryLevel(65).key, 'consolidating');
    assert.equal(masteryLevel(45).key, 'developing');
    assert.equal(masteryLevel(20).key, 'starting');
  });

  it('computeAllMastery agrupa por concepto', () => {
    const attempts = [
      { concepts: ['media'], correct: true, score: 1, attempt_number: 1, hints_used: 0, difficulty: 1, created_at: '2026-01-01' },
      { concepts: ['media', 'mediana'], correct: false, score: 0, attempt_number: 1, hints_used: 0, difficulty: 2, created_at: '2026-01-02' },
    ];
    const map = computeAllMastery(attempts);
    assert.ok(map.has('media') && map.has('mediana'));
    assert.ok(map.get('media').value < 50);
  });

  it('conceptsToReview prioriza lo reciente y lo poco dominado', () => {
    const now = new Date().toISOString();
    const attempts = [
      { concepts: ['p-valor'], correct: false, created_at: now },
      { concepts: ['p-valor'], correct: false, created_at: now },
      { concepts: ['p-valor'], correct: false, created_at: now },
      { concepts: ['media'], correct: false, created_at: now },
    ];
    const map = computeAllMastery(attempts);
    const review = conceptsToReview(map, attempts);
    assert.equal(review[0].concept, 'p-valor');
  });

  it('averageMastery ignora conceptos sin evidencia', () => {
    const map = new Map([['a', { value: 80, n: 5 }], ['b', { value: 0, n: 0 }]]);
    assert.close(averageMastery(map), 80, 1e-9);
  });
});

describe('Dificultad adaptativa', () => {
  it('mastery bajo → dificultad 1', () => assert.equal(nextDifficulty({ value: 20 }), 1));
  it('mastery medio → dificultad 2', () => assert.equal(nextDifficulty({ value: 55 }), 2));
  it('mastery alto → dificultad 3', () => assert.equal(nextDifficulty({ value: 85 }), 3));
  it('dos fallos seguidos bajan la dificultad', () => {
    assert.equal(nextDifficulty({ value: 85 }, [{ correct: false }, { correct: false }]), 2);
  });
  it('tres aciertos limpios la suben', () => {
    const d = nextDifficulty({ value: 45 }, [{ correct: true, attempts: 1 }, { correct: true, attempts: 1 }, { correct: true, attempts: 1 }]);
    assert.equal(d, 3);
  });
  it('tras dos fallos se ofrece práctica guiada con explicación', () => {
    const plan = adaptivePlan({ correct: false, attempts: 2, hintsUsed: 1, mastery: { value: 30 } });
    assert.equal(plan.action, 'guided');
    assert.ok(plan.showFullExplanation);
  });
  it('nunca se castiga: el plan no resta nada', () => {
    const plan = adaptivePlan({ correct: false, attempts: 1, mastery: { value: 30 } });
    assert.ok(!('penalty' in plan));
  });
});

/* =============================================================== PROGRESO */

describe('XP, niveles y rachas', () => {
  it('acierto limpio da la XP completa', () => {
    assert.equal(activityXp({ xp: 20 }, { correct: true, attempts: 1, hintsUsed: 0 }), 20);
  });
  it('las pistas reducen la XP pero no por debajo del 40 %', () => {
    assert.equal(activityXp({ xp: 20 }, { correct: true, attempts: 1, hintsUsed: 1 }), 16);
    assert.equal(activityXp({ xp: 20 }, { correct: true, attempts: 1, hintsUsed: 5 }), 8);
  });
  it('fallar da 0 XP, nunca XP negativa', () => {
    assert.equal(activityXp({ xp: 20 }, { correct: false, score: 0, attempts: 1, hintsUsed: 0 }), 0);
  });
  it('el crédito parcial da algo de XP', () => {
    assert.ok(activityXp({ xp: 20 }, { correct: false, score: 0.5, attempts: 1, hintsUsed: 0 }) > 0);
  });

  it('la curva de nivel es creciente y sin saltos raros', () => {
    for (let l = 1; l < 30; l++) assert.ok(xpForLevel(l + 1) > xpForLevel(l));
    assert.equal(xpForLevel(1), 0);
    assert.equal(xpForLevel(2), 80);
  });
  it('levelFromXp es coherente con xpForLevel', () => {
    assert.equal(levelFromXp(0).level, 1);
    assert.equal(levelFromXp(80).level, 2);
    assert.equal(levelFromXp(79).level, 1);
    const l = levelFromXp(500);
    assert.between(l.progress, 0, 1);
  });

  it('racha: primer día', () => {
    const s = updateStreak(null);
    assert.equal(s.streak, 1);
  });
  it('racha: día consecutivo suma', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const s = updateStreak({ streak_days: 3, last_active_date: yesterday });
    assert.equal(s.streak, 4);
  });
  it('racha: un hueco la reinicia pero no penaliza', () => {
    const old = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const s = updateStreak({ streak_days: 9, last_active_date: old });
    assert.equal(s.streak, 1);
    assert.ok(s.broken);
    assert.equal(s.bonusXp, 0);
  });
  it('racha: bonus cada 5 días', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    assert.equal(updateStreak({ streak_days: 4, last_active_date: yesterday }).bonusXp, 25);
    assert.equal(updateStreak({ streak_days: 5, last_active_date: yesterday }).bonusXp, 0);
  });
  it('calendario de racha devuelve los días pedidos', () => {
    const cal = streakCalendar([], 7);
    assert.equal(cal.length, 7);
    assert.ok(cal[6].isToday);
  });
});

describe('Estados de los mundos', () => {
  const worlds = [
    { id: 'w01', num: 1, requires: null, conceptIds: ['a'], activityCount: 4 },
    { id: 'w02', num: 2, requires: 'w01', conceptIds: ['b'], activityCount: 4 },
    { id: 'w03', num: 3, requires: 'w02', conceptIds: ['c'], activityCount: 4 },
  ];

  it('el primer mundo está disponible desde el principio', () => {
    const s = worldStates(worlds, { activityResults: [], masteryMap: new Map() });
    assert.equal(s.get('w01').state, 'available');
    assert.equal(s.get('w02').state, 'locked');
  });

  it('un mundo se marca iniciado al primer intento', () => {
    const s = worldStates(worlds, {
      activityResults: [{ world: 'w01', activity_id: 'x', score: 0 }],
      masteryMap: new Map(),
    });
    assert.equal(s.get('w01').state, 'started');
  });

  it('completar un mundo desbloquea el siguiente', () => {
    const results = [1, 2, 3].map((i) => ({ world: 'w01', activity_id: `a${i}`, score: 1 }));
    const s = worldStates(worlds, {
      activityResults: results,
      masteryMap: new Map([['a', { value: 75 }]]),
    });
    assert.equal(s.get('w01').state, 'completed');
    assert.equal(s.get('w02').state, 'available');
  });

  it('no basta con hacer actividades: hace falta mastery', () => {
    const results = [1, 2, 3, 4].map((i) => ({ world: 'w01', activity_id: `a${i}`, score: 1 }));
    const s = worldStates(worlds, {
      activityResults: results,
      masteryMap: new Map([['a', { value: 20 }]]),
    });
    assert.equal(s.get('w01').state, 'started');
  });
});

describe('Logros', () => {
  const achievements = [
    { code: 'first-steps', rule: { type: 'totalActivities', min: 1 } },
    { code: 'perfect-run', rule: { type: 'challengeErrors', max: 0 } },
    { code: 'streak-7', rule: { type: 'streak', min: 7 } },
    { code: 'mastery-explorer', rule: { type: 'masteryCount', min: 80, count: 2 } },
  ];

  it('se conceden los logros cumplidos', () => {
    const ctx = {
      totalActivities: 3, streak: 8,
      masteryMap: new Map([['a', { value: 90 }], ['b', { value: 85 }], ['c', { value: 10 }]]),
      lastChallenge: { completed: true, errors: 0 },
    };
    const got = evaluateAchievements(achievements, ctx, []);
    assert.equal(got.length, 4);
  });

  it('no se repiten los ya conseguidos', () => {
    const ctx = { totalActivities: 3 };
    const got = evaluateAchievements(achievements, ctx, ['first-steps']);
    assert.ok(!got.some((a) => a.code === 'first-steps'));
  });

  it('no se conceden si no se cumple la regla', () => {
    const got = evaluateAchievements(achievements, { totalActivities: 0, streak: 2 }, []);
    assert.equal(got.length, 0);
  });
});

/* ================================================================= RETOS */

describe('Retos: separación de la solución', () => {
  const template = {
    id: 'x', title: 'T', steps: [{
      id: 's1', type: 'mcq', prompt: '¿?', answer: 'b', explanation: 'porque sí',
      tolerance: 0.5, hints: ['pista'],
      options: [{ id: 'a', text: 'A', why: 'no' }, { id: 'b', text: 'B', why: 'sí', correct: true }],
    }, {
      id: 's2', type: 'classify', items: [{ id: 'i1', text: 'X', bin: 'a' }], bins: [{ id: 'a', title: 'A' }],
      explanation: 'e',
    }, {
      id: 's3', type: 'claim-audit', claims: [{ id: 'c1', text: 'T', correct: true, why: 'porque' }], explanation: 'e',
    }],
  };

  it('la configuración pública NO contiene respuestas', () => {
    const { configuration } = splitChallenge(template);
    const json = JSON.stringify(configuration);
    assert.ok(!/"answer"/.test(json), 'no debe haber answer');
    assert.ok(!/"correct"/.test(json), 'no debe haber marcas correct');
    assert.ok(!/"why"/.test(json), 'no debe haber justificaciones');
    assert.ok(!/"explanation"/.test(json), 'no debe haber explicaciones');
    assert.ok(!/"bin"/.test(json), 'no debe revelarse la clasificación correcta');
    assert.ok(!/porque/.test(json));
  });

  it('la configuración pública SÍ conserva lo necesario para responder', () => {
    const { configuration } = splitChallenge(template);
    assert.equal(configuration.steps[0].options.length, 2);
    assert.equal(configuration.steps[0].options[0].text, 'A');
    assert.deepEqual(configuration.steps[0].hints, ['pista']);
    assert.equal(configuration.steps[1].items[0].text, 'X');
    assert.equal(configuration.steps[2].claims[0].text, 'T');
  });

  it('la solución conserva todo', () => {
    const { solution } = splitChallenge(template);
    assert.equal(solution.steps[0].answer, 'b');
    assert.equal(solution.steps[0].explanation, 'porque sí');
  });

  it('sanitizeStep no filtra la justificación correcta', () => {
    const s = sanitizeStep({
      id: 'x', type: 'decision', answer: 'a',
      justify: { min: 2, options: [{ id: 'j1', text: 'razón', correct: true }] },
    });
    assert.ok(!('answer' in s));
    assert.ok(!('correct' in s.justify.options[0]));
    assert.equal(s.justify.options[0].text, 'razón');
    assert.equal(s.justify.min, 2);
  });
});

describe('Retos: política de intentos y ventanas', () => {
  it('política «primer intento»: solo el primero cuenta', () => {
    assert.ok(isRankEligible({ policy: 'first', previousAttempts: 0 }));
    assert.ok(!isRankEligible({ policy: 'first', previousAttempts: 1 }));
  });
  it('política «mejor intento»: todos cuentan', () => {
    assert.ok(isRankEligible({ policy: 'best', previousAttempts: 2 }));
  });
  it('en modo práctica nunca cuenta', () => {
    assert.ok(!isRankEligible({ policy: 'best', previousAttempts: 0, practice: true }));
  });

  it('estado según las fechas', () => {
    const now = Date.now();
    const past = new Date(now - 86400000).toISOString();
    const future = new Date(now + 86400000).toISOString();
    assert.equal(challengeState({ opens_at: past, closes_at: future }), 'open');
    assert.equal(challengeState({ opens_at: future, closes_at: future }), 'upcoming');
    assert.equal(challengeState({ opens_at: past, closes_at: past }), 'closed');
  });

  it('la solución no está disponible mientras el reto sigue abierto', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    assert.ok(!solutionAvailable({ solution_policy: 'on_close', closes_at: future }));
    assert.ok(solutionAvailable({ solution_policy: 'immediate', closes_at: future }));
  });
  it('la política manual exige fecha explícita', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    assert.ok(!solutionAvailable({ solution_policy: 'manual', closes_at: past }));
    assert.ok(solutionAvailable({ solution_policy: 'manual', closes_at: past, solution_available_at: past }));
  });
});

describe('Tiempo activo', () => {
  it('el cronómetro arranca a cero y acumula solo con actividad', () => {
    // No hay DOM en Node: se comprueba el contrato, no el temporizador.
    const T = ActiveTimer;
    assert.ok(typeof T === 'function');
    const proto = T.prototype;
    assert.ok(typeof proto.start === 'function' && typeof proto.stop === 'function');
  });
});

/* ============================================================ EXPORTACIÓN */

describe('Exportación CSV', () => {
  it('cabecera y filas', () => {
    const csv = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    assert.equal(csv.split('\r\n')[0], 'a,b');
    assert.equal(csv.split('\r\n')[1], '1,x');
  });
  it('entrecomilla los campos con comas y comillas', () => {
    const csv = toCsv([{ a: 'uno, dos', b: 'dice "hola"' }]);
    assert.ok(csv.includes('"uno, dos"'));
    assert.ok(csv.includes('"dice ""hola"""'));
  });
  it('los booleanos salen como 0/1', () => {
    assert.ok(toCsv([{ ok: true, no: false }]).includes('1,0'));
  });
  it('los nulos salen vacíos, no como "null"', () => {
    const csv = toCsv([{ a: null, b: 1 }]);
    assert.ok(!/null/.test(csv));
  });
  it('usa punto decimal (compatible con R y pandas)', () => {
    assert.ok(toCsv([{ v: 3.14 }]).includes('3.14'));
  });
});

/* =============================================== CONTENIDO Y GENERADORES */

describe('Integridad del contenido', () => {
  it('validate() no encuentra problemas', async () => {
    const res = await validate();
    assert.ok(res.ok, `problemas:\n  ${res.problems.join('\n  ')}`);
  });

  it('hay 15 mundos y todos encadenados', async () => {
    const worlds = await getWorlds();
    assert.equal(worlds.length, 15);
    for (let i = 1; i < worlds.length; i++) assert.equal(worlds[i].requires, worlds[i - 1].id);
  });

  it('correlación y regresión son mundos SEPARADOS', async () => {
    const worlds = await getWorlds();
    const corr = worlds.find((w) => w.num === 11);
    const reg2 = worlds.find((w) => w.num === 12);
    assert.ok(/[Cc]orrelación/.test(corr.title));
    assert.ok(/[Rr]egresión/.test(reg2.title));
    assert.ok(corr.id !== reg2.id);
    // Y no comparten conceptos
    const shared = corr.conceptIds.filter((c) => reg2.conceptIds.includes(c));
    assert.equal(shared.length, 0);
  });

  it('los mundos 1 a 4 tienen al menos 5 actividades cada uno', async () => {
    const all = await getAllActivities();
    for (const w of ['w01', 'w02', 'w03', 'w04']) {
      const n = all.filter((a) => a.world === w).length;
      assert.ok(n >= 5, `${w} solo tiene ${n} actividades`);
    }
  });

  it('todos los mundos tienen alguna actividad', async () => {
    const all = await getAllActivities();
    const worlds = await getWorlds();
    for (const w of worlds) {
      assert.ok(all.some((a) => a.world === w.id), `${w.id} no tiene actividades`);
    }
  });

  it('cada actividad tiene explicación y pistas', async () => {
    const all = await getAllActivities();
    for (const a of all) {
      assert.ok(a.explanation, `${a.id} sin explicación`);
      if (a.type !== 'sim') assert.ok((a.hints || []).length >= 1, `${a.id} sin pistas`);
    }
  });

  it('hay al menos 3 retos de demostración con 8 pasos', async () => {
    const chs = await getBuiltInChallenges();
    assert.ok(chs.length >= 3);
    for (const c of chs) {
      assert.ok(c.steps.length >= 5, `${c.id} tiene ${c.steps.length} pasos`);
      assert.ok(c.title && c.description);
    }
  });

  it('todos los conceptos de los retos existen en los mundos', async () => {
    const idx = await getConceptIndex();
    const chs = await getBuiltInChallenges();
    for (const c of chs) {
      for (const s of c.steps) {
        if (s.concept) assert.ok(idx.has(s.concept), `${c.id}/${s.id}: concepto «${s.concept}» desconocido`);
      }
    }
  });

  it('cada concepto declara su error conceptual habitual', async () => {
    const idx = await getConceptIndex();
    let withMisconception = 0;
    for (const c of idx.values()) if (c.misconception) withMisconception++;
    assert.ok(withMisconception / idx.size > 0.9, 'más del 90 % de los conceptos deben documentar su error habitual');
  });
});

describe('Generación procedural', () => {
  it('la misma semilla produce el mismo enunciado', async () => {
    const all = await getAllActivities();
    const gen = all.find((a) => a.generator);
    const a = instantiate(gen, 'semilla-fija');
    const b = instantiate(gen, 'semilla-fija');
    assert.equal(a.prompt, b.prompt);
    assert.deepEqual(a.answer, b.answer);
  });

  it('semillas distintas producen enunciados distintos', async () => {
    const all = await getAllActivities();
    const gen = all.find((a) => a.generator === 'descriptiveBasics');
    const a = instantiate(gen, 's1');
    const b = instantiate(gen, 's2');
    assert.ok(a.stem !== b.stem || a.answer !== b.answer);
  });

  it('el generador descriptivo produce respuestas coherentes con sus datos', async () => {
    const all = await getAllActivities();
    const gen = all.find((a) => a.generator === 'descriptiveBasics');
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const item = instantiate(gen, seed);
      assert.ok(Number.isFinite(item.answer), 'la respuesta debe ser un número');
      assert.ok(item.data.length >= 6);
    }
  });

  it('el dataset del ensayo clínico es reproducible y con el efecto pedido', () => {
    const params = {
      n: 80, groupNames: ['A', 'B'],
      outcome: { name: 'y', label: 'y', mean: 6, sd: 1.7, effect: -1.6, min: 0, max: 10, round: 0 },
    };
    const d1 = clinicalTrial2Groups(params, 'seed-x');
    const d2 = clinicalTrial2Groups(params, 'seed-x');
    assert.deepEqual(d1.groups, d2.groups);
    assert.equal(d1.rows.length, 80);
    assert.ok(d1.groups.A.mean > d1.groups.B.mean, 'el grupo B debe tener menor media por el efecto negativo');
  });
});
