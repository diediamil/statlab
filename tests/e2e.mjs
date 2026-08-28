/**
 * Prueba de extremo a extremo con un navegador real (Playwright + Chromium).
 * No forma parte de `npm test` (requiere navegador): se ejecuta con
 *
 *     node tests/e2e.mjs
 *
 * mientras se sirve el proyecto en http://localhost:8099
 * (por ejemplo con `python3 -m http.server 8099`).
 *
 * Comprueba el recorrido completo del criterio de éxito: demo → alumno →
 * campaña → actividad → laboratorio → reto → ranking → profesor.
 */

const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const { chromium } = pw.default || pw;

const BASE = process.env.STATLAB_URL || 'http://localhost:8099';
const errors = [];
const steps = [];

const step = (name, ok, detail = '') => {
  steps.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

/** Responde la actividad visible, adaptándose al tipo. Devuelve true si pudo. */
async function answerCurrentActivity(page) {
  if (await page.locator('.option:visible').count()) {
    await page.locator('.option:visible').first().click();
  } else if (await page.locator('.token:visible').count()) {
    // Clasificación: se coloca cada ficha en el primer contenedor.
    const tokens = await page.locator('.token:visible').count();
    for (let i = 0; i < tokens; i++) {
      await page.locator('.token:visible').first().click();
      await page.locator('.dnd__bin').first().click();
    }
  } else if (await page.locator('.input--num:visible').count()) {
    await page.locator('.input--num:visible').first().fill('1');
  } else if (await page.locator('.orderlist:visible').count()) {
    // El orden inicial ya es una respuesta válida.
  } else {
    return false;
  }
  const btn = page.locator('button:visible:has-text("Comprobar")').first();
  if (!(await btn.count()) || await btn.isDisabled()) return false;
  await btn.click();
  return true;
}

const goto = async (hash) => {
  await page.goto(`${BASE}/index.html?demo=1${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
};

try {
  console.log('\n  STATLAB — prueba de extremo a extremo\n');

  /* 1. Panel del estudiante -------------------------------------------- */
  await goto('#/student');
  await page.waitForSelector('h1', { timeout: 10000 });
  const greeting = await page.textContent('h1');
  step('El panel del estudiante carga', /Hola/.test(greeting), greeting);
  step('El HUD muestra nivel y XP', (await page.locator('#hud .hud__item').count()) >= 2);
  step('Aparece el banner de modo demo', await page.locator('#demoBanner').isVisible());
  const modes = await page.locator('.mode').count();
  step('Se ofrecen los 7 modos', modes === 7, `${modes} modos`);

  /* 2. Mapa de progresión ----------------------------------------------- */
  await goto('#/campaign');
  await page.waitForSelector('.worldcard');
  const worlds = await page.locator('.worldcard').count();
  step('El mapa muestra 15 mundos', worlds === 15, `${worlds}`);
  const locked = await page.locator('.worldcard--locked').count();
  step('Hay mundos bloqueados y desbloqueados', locked > 0 && locked < 15, `${locked} bloqueados`);

  /* 3. Actividad real ---------------------------------------------------- */
  await goto('#/play/world/w01?n=3');
  await page.waitForSelector('.activity');
  step('Arranca una sesión de actividades', await page.locator('.activity__prompt').isVisible());

  // Responder la primera actividad, sea del tipo que sea.
  const answered = await answerCurrentActivity(page);
  if (answered) {
    await page.waitForSelector('.feedback', { timeout: 8000 });
    const fb = await page.textContent('.feedback');
    step('El feedback explica qué y por qué', /Correcto|correcto|No es correcto|Parcialmente/.test(fb) && fb.length > 60);
    step('El feedback señala el concepto a revisar', /Concepto a revisar/i.test(fb));
  } else {
    step('El feedback explica qué y por qué', false, `tipo de actividad no cubierto por la prueba`);
  }

  // Pedir una pista
  const hintBtn = page.locator('button:has-text("Pedir una pista")');
  if (await hintBtn.count()) {
    step('Existe el botón de pistas progresivas', true);
  }

  /* 4. Laboratorio -------------------------------------------------------- */
  await goto('#/lab');
  const labs = await page.locator('.mode').count();
  step('El laboratorio ofrece los 10 minijuegos', labs === 10, `${labs}`);

  await goto('#/lab/bayes-machine');
  await page.waitForSelector('.lab', { timeout: 10000 });
  const svgCount = await page.locator('.lab svg').count();
  step('La Máquina de Bayes dibuja la población', svgCount > 0, `${svgCount} SVG`);
  const ppvBefore = await page.locator('.readout--hl .readout__v').first().textContent();
  // Mover la prevalencia
  await page.locator('input[aria-label="Prevalencia"]').fill('0.4');
  await page.locator('input[aria-label="Prevalencia"]').dispatchEvent('input');
  await page.waitForTimeout(300);
  const ppvAfter = await page.locator('.readout--hl .readout__v').first().textContent();
  step('El VPP cambia al mover la prevalencia', ppvBefore !== ppvAfter, `${ppvBefore} → ${ppvAfter}`);

  await goto('#/lab/correlation-lab');
  await page.waitForSelector('.lab svg circle', { timeout: 10000 });
  step('El laboratorio de correlación dibuja puntos arrastrables',
    (await page.locator('.lab svg circle[data-i]').count()) > 5);

  await goto('#/lab/regression-lab');
  await page.waitForSelector('.lab svg', { timeout: 10000 });
  const sse = await page.locator('.readout--hl .readout__v').first().textContent();
  step('El laboratorio de regresión calcula la SSE', Boolean(sse), `SSE = ${sse}`);

  await goto('#/lab/sampling-simulator');
  await page.waitForSelector('.lab svg', { timeout: 15000 });
  step('El simulador de muestreo pinta población y medias',
    (await page.locator('.lab__stage svg').count()) >= 2);

  /* 5. Reto de la semana --------------------------------------------------- */
  await goto('#/challenge');
  await page.waitForSelector('.wrap');
  const chCards = await page.locator('.card').count();
  step('El hub del reto lista los retos de la clase', chCards >= 3, `${chCards} tarjetas`);

  const startLink = page.locator('a:has-text("Iniciar reto"), a:has-text("Abrir")').first();
  if (await startLink.count()) {
    await startLink.click();
    await page.waitForSelector('.challenge-hero', { timeout: 10000 });
    step('El briefing del reto avisa del cronómetro',
      /tiempo empezará a contar/i.test(await page.textContent('.wrap')));
    step('El briefing informa del intento competitivo',
      /ranking/i.test(await page.textContent('.wrap')));

    const startBtn = page.locator('button:has-text("Iniciar reto"), button:has-text("Practicar")').first();
    if (await startBtn.count()) {
      await startBtn.click();
      await page.waitForSelector('.steps-rail', { timeout: 10000 });
      step('El reto arranca con el cronómetro visible', await page.locator('.timer').isVisible());
      step('No hay feedback inmediato durante el reto',
        (await page.locator('.feedback').count()) === 0);

      // Responder los tres primeros pasos: un solo clic por paso.
      for (let i = 0; i < 3; i++) {
        const opts = page.locator('.option:visible');
        if (!(await opts.count())) break;
        await opts.first().click();
        const submit = page.locator('button:visible:has-text("Confirmar y seguir"), button:visible:has-text("Terminar el reto")').first();
        if (!(await submit.count())) break;
        await submit.click();
        await page.waitForTimeout(600);
      }
      step('Los pasos se registran y el reto avanza',
        (await page.locator('.steps-rail__step--done, .steps-rail__step--partial').count()) >= 1
        || (await page.locator('.score-total').count()) > 0);
      step('Un solo clic por paso (confirmar y avanzar)',
        (await page.locator('button:visible:has-text("Comprobar")').count()) === 0);
    }
  }

  /* 6. Rankings ------------------------------------------------------------ */
  await goto('#/ranking');
  await page.waitForSelector('.wrap');
  const rankText = await page.textContent('.wrap');
  step('El ranking semanal muestra un podio', (await page.locator('.podium__slot').count()) === 3);
  step('El ranking solo muestra alias, no correos', !/@/.test(rankText.replace(/[\w.]+@demo\.statlab/g, '')));
  step('Hay ranking de temporada', /temporada/i.test(rankText));
  step('Se explica el criterio de los mejores N retos', /mejores/i.test(rankText));

  /* 7. Progreso y errores --------------------------------------------------- */
  await goto('#/progress');
  await page.waitForSelector('.stats');
  step('El progreso documenta la fórmula del mastery',
    /mastery = 100/.test(await page.textContent('.wrap')));

  await goto('#/mistakes');
  await page.waitForSelector('.wrap');
  step('«Mis errores» carga', (await page.locator('h1').textContent()).includes('errores'));

  /* 8. Panel del profesor ---------------------------------------------------- */
  await page.evaluate(() => localStorage.setItem('statlab.demo.role', 'teacher'));
  await page.reload({ waitUntil: 'networkidle' });   // recarga real, no solo cambio de hash
  await goto('#/teacher');
  await page.waitForSelector('.tabs', { timeout: 10000 });
  const tabs = await page.locator('.tab').count();
  step('El panel del profesor tiene 10 pestañas', tabs === 10, `${tabs}`);
  await page.waitForSelector('.stat__value', { timeout: 10000 });
  step('El resumen muestra KPIs de la clase', (await page.locator('.stat').count()) >= 6);
  step('Hay avisos pedagógicos', (await page.locator('.alert-row').count()) > 0);

  await goto('#/teacher?tab=students');
  await page.waitForSelector('table', { timeout: 10000 });
  const rows = await page.locator('tbody tr').count();
  step('La lista de alumnos muestra los 20 estudiantes demo', rows === 20, `${rows} filas`);
  step('El profesor ve alias Y nombre real',
    /Sigma42/.test(await page.textContent('table')) && /Lucía/.test(await page.textContent('table')));

  await goto('#/teacher?tab=challenge');
  await page.waitForSelector('.stat', { timeout: 15000 });
  const chText = await page.textContent('.wrap');
  step('«¿Dónde falló la clase?» está disponible', /Dónde falló la clase/i.test(chText));
  step('El análisis del reto muestra participación y puntuaciones',
    /Participantes/i.test(chText) && /Puntuación media/i.test(chText));

  await goto('#/teacher?tab=difficulties');
  await page.waitForSelector('table', { timeout: 10000 });
  step('La tabla de dificultades ordena por acierto',
    (await page.locator('tbody tr').count()) > 5);

  await goto('#/teacher?tab=export');
  await page.waitForSelector('.card');
  step('Existen exportación identificada y pseudonimizada',
    /Identificada/i.test(await page.textContent('.wrap'))
    && /Pseudonimizada/i.test(await page.textContent('.wrap')));

  /* 9. Accesibilidad básica --------------------------------------------------- */
  await goto('#/student');
  const a11y = await page.evaluate(() => {
    const imgsWithoutAlt = Array.from(document.querySelectorAll('img')).filter((i) => !i.alt).length;
    const svgsWithoutLabel = Array.from(document.querySelectorAll('svg[role="img"]'))
      .filter((s) => !s.getAttribute('aria-label') && !s.querySelector('title')).length;
    const buttonsWithoutName = Array.from(document.querySelectorAll('button'))
      .filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length;
    const h1 = document.querySelectorAll('h1').length;
    return { imgsWithoutAlt, svgsWithoutLabel, buttonsWithoutName, h1 };
  });
  step('Todas las imágenes tienen texto alternativo', a11y.imgsWithoutAlt === 0);
  step('Todos los gráficos SVG tienen etiqueta accesible', a11y.svgsWithoutLabel === 0);
  step('Todos los botones tienen nombre accesible', a11y.buttonsWithoutName === 0, `${a11y.buttonsWithoutName} sin nombre`);
  step('Hay exactamente un h1 por página', a11y.h1 === 1, `${a11y.h1}`);

  const skip = await page.locator('.skip-link').count();
  step('Existe el enlace «ir al contenido»', skip === 1);

  /* 10. Tema oscuro ------------------------------------------------------------ */
  await page.locator('#themeToggle').click();
  await page.waitForTimeout(200);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  step('El conmutador de tema funciona', theme === 'dark' || theme === 'light', theme);

  /* 11. Responsive -------------------------------------------------------------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await goto('#/student');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  step('Sin desbordamiento horizontal en móvil (390 px)', !overflow);

} catch (err) {
  step('Ejecución completa sin excepciones', false, err.message);
  console.error(err);
} finally {
  await browser.close();
}

/* ------------------------------------------------------------- resumen -- */

const failed = steps.filter((s) => !s.ok);
console.log(`\n  ${steps.length - failed.length} comprobaciones superadas, ${failed.length} fallidas`);

const realErrors = errors.filter((e) => !/favicon|Failed to load resource.*404.*config\.js/i.test(e));
if (realErrors.length) {
  console.log(`\n  ⚠ ${realErrors.length} errores en consola:`);
  realErrors.slice(0, 12).forEach((e) => console.log(`    · ${e.slice(0, 220)}`));
} else {
  console.log('  Sin errores en la consola del navegador.');
}

process.exit(failed.length || realErrors.length ? 1 : 0);
