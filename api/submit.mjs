const GROUP_COUNTS = Object.freeze({
  selbstbild: 3,
  intrinsic: 6,
  fallback: 3,
  personal: 8,
  social: 11,
  sozialisation: 6
});

const EXPECTED_IDS = Object.entries(GROUP_COUNTS).flatMap(([group, count]) =>
  Array.from({ length: count }, (_, index) => `${group}-${index + 1}`)
);
const SECOND_SUBJECTS = Object.freeze(["Biologie", "Chemie", "Deutsch", "Englisch", "Erdkunde/Geographie", "Erziehungswissenschaft/Pädagogik", "Evangelische Religionslehre", "Französisch", "Geschichte", "Informatik", "Italienisch", "Katholische Religionslehre", "Kunst", "Latein", "Mathematik", "Musik", "Philosophie", "Physik", "Politik/Sozialwissenschaften", "Sachunterricht", "Spanisch", "Technik", "Türkisch", "Wirtschaft", "Anderes Unterrichtsfach", "Kein weiteres Fach"]);
// V1 bleibt für im Browser noch geöffnete alte Fragebögen akzeptiert.
// V2 ergänzt Studienmerkmale und einen klar getrennten explorativen Zusatzblock.
const VERSION_1 = 'fit-choice-sport-v1';
const VERSION_2 = 'fit-choice-sport-v2';
const CONSENT_VERSIONS = Object.freeze({
  [VERSION_1]: 'einwilligung-v1',
  [VERSION_2]: 'einwilligung-v2'
});
const ADDITIONAL_IDS = Object.freeze([
  'sport-1', 'sport-2', 'sport-3', 'sport-4', 'sport-5', 'absicht-1'
]);
const BACKGROUND_KEYS = Object.freeze([
  'fachsemester', 'studienphase', 'geschlecht', 'zweitfach',
  'lehramt', 'unterrichtserfahrung', 'trainererfahrung'
]);
const OPTIONS = Object.freeze({
  studienphase: ['bachelor','master','staatsexamen','anderes'],
  geschlecht: ['weiblich','maennlich','divers'],
  lehramt: ['grundschule','hrsge','gymge','berufskolleg','sonderpaedagogik','anderes'],
  unterrichtserfahrung: ['ja','nein'],
  trainererfahrung: ['keine','unter_1_jahr','1_bis_3_jahre','mehr_als_3_jahre'],
  zweitfach: SECOND_SUBJECTS
});
const SUBJECT_GROUPS = Object.freeze({
  A: ['Erziehungswissenschaft/Pädagogik','Evangelische Religionslehre','Geschichte',
      'Katholische Religionslehre','Philosophie','Politik/Sozialwissenschaften','Wirtschaft'],
  B: ['Deutsch','Englisch','Französisch','Italienisch','Latein','Spanisch','Türkisch'],
  C: ['Biologie','Chemie','Erdkunde/Geographie','Informatik','Mathematik','Physik',
      'Sachunterricht','Technik'],
  D: ['Kunst','Musik'],
  E: ['Anderes Unterrichtsfach']
});
function subjectGroup(subject) {
  if (!subject) return null;
  if (subject === 'Kein weiteres Fach') return 'kein_zweitfach';
  return Object.keys(SUBJECT_GROUPS).find(key => SUBJECT_GROUPS[key].includes(subject)) ?? null;
}
function validateAdditional(obj) {
  const extra = obj.additionalAnswers;
  const bg = obj.background;
  if (!extra || typeof extra !== 'object' || Array.isArray(extra) ||
      Object.keys(extra).length !== ADDITIONAL_IDS.length ||
      !ADDITIONAL_IDS.every(id => Number.isInteger(extra[id]) && extra[id] >= 1 && extra[id] <= 7)) return false;
  if (!bg || typeof bg !== 'object' || Array.isArray(bg) ||
      Object.keys(bg).length !== BACKGROUND_KEYS.length ||
      !BACKGROUND_KEYS.every(key => Object.hasOwn(bg, key))) return false;
  if (bg.fachsemester !== null &&
      !(Number.isInteger(bg.fachsemester) && bg.fachsemester >= 1 && bg.fachsemester <= 30)) return false;
  return Object.entries(OPTIONS).every(([key, values]) => bg[key] === null || values.includes(bg[key]));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function send(res, status, content) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(content);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST erlaubt.' });
  // Keine Cross-Origin-Zugriffe erforderlich: HTML und API werden gemeinsam bei Vercel gehostet.
  // Eine Origin-Prüfung ist KEIN ausreichender Schutz gegen Spam oder direkte API-Aufrufe.
  const origin = req.headers.origin;
  const expectedOrigin = `https://${req.headers.host}`;
  if (origin !== expectedOrigin) {
    return send(res, 403, { error: 'Die Übermittlung muss über die Studienseite erfolgen.' });
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    return send(res, 415, { error: 'Ungültiges Datenformat.' });
  }

  // Vor Freigabe der echten Forschungserhebung erst Studieninformationen vervollständigen.
  if (process.env.STUDY_READY !== 'true') {
    return send(res, 503, { error: 'Die Datenerhebung ist noch nicht freigeschaltet.' });
  }

  try {
    const obj = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return send(res, 400, { error: 'Ungültige Anfrage.' });
    }
    // Vercel parsed JSON vorher; erneut als JSON serialisieren, damit Limits auch hier gelten.
    if (Buffer.byteLength(JSON.stringify(obj), 'utf8') > 12000) {
      return send(res, 413, { error: 'Anfrage zu groß.' });
    }
    const version = obj.questionnaireVersion;
    if (!UUID_RE.test(obj.submissionId || '') ||
        !Object.hasOwn(CONSENT_VERSIONS, version) ||
        obj.consent?.given !== true || obj.consent?.version !== CONSENT_VERSIONS[version]) {
      return send(res, 400, { error: 'Einwilligung oder Studienversion ungültig.' });
    }
    if (version === VERSION_2 && !validateAdditional(obj)) {
      return send(res, 400, { error: 'Zusatzantworten oder Studienangaben sind ungültig.' });
    }
    const answers = obj.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) ||
        Object.keys(answers).length !== EXPECTED_IDS.length ||
        !EXPECTED_IDS.every(id => Number.isInteger(answers[id]) && answers[id] >= 1 && answers[id] <= 7)) {
      return send(res, 400, { error: 'Es müssen genau 37 gültige Antworten vorliegen.' });
    }

    const { SCIEBO_HOST, SCIEBO_TOKEN, SCIEBO_PASSWORD } = process.env;
    if (!SCIEBO_HOST || !SCIEBO_TOKEN || !SCIEBO_PASSWORD) {
      return send(res, 503, { error: 'Der Studienserver ist nicht vollständig eingerichtet.' });
    }
    const host = new URL(SCIEBO_HOST);
    if (host.protocol !== 'https:' || !host.hostname.endsWith('.sciebo.de') ||
        host.username || host.password || host.port || host.pathname !== '/' ||
        host.search || host.hash || !/^[A-Za-z0-9_-]{8,128}$/.test(SCIEBO_TOKEN)) {
      return send(res, 503, { error: 'Ungültige Sciebo-Konfiguration.' });
    }

    const record = {
      questionnaireVersion: version,
      submissionId: obj.submissionId,
      receivedAt: new Date().toISOString(),
      consent: { given: true, version: CONSENT_VERSIONS[version] },
      answers: Object.fromEntries(EXPECTED_IDS.map(id => [id, answers[id]]))
    };
    // Die bisherigen 37 Antworten bleiben exakt im ursprünglichen Format.
    // Zusätzliche Daten stehen ausschließlich in neuen Feldern (Version 2).
    if (version === VERSION_2) {
      record.background = Object.fromEntries(BACKGROUND_KEYS.map(key => [key, obj.background[key]]));
      record.background.zweitfachGruppe = subjectGroup(obj.background.zweitfach);
      record.additionalAnswers = Object.fromEntries(ADDITIONAL_IDS.map(id => [id, obj.additionalAnswers[id]]));
    }
    // Nextcloud 29+ unterstützt den neuen öffentlichen WebDAV-Endpunkt.
    // Bei Problemen versuchen wir den von Sciebo dokumentierten älteren Endpunkt.
    // Zugangsdaten bleiben ausschließlich auf dem Vercel-Server.
    const filename = `${obj.submissionId}.json`;
    const payload = JSON.stringify(record);
    async function put(url, username, password) {
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      return fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${credentials}`,
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/octet-stream',
          'If-None-Match': '*'
        },
        body: payload,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000)
      });
    }

    const modernUrl = new URL(
      `/public.php/dav/files/${encodeURIComponent(SCIEBO_TOKEN)}/${filename}`,
      host.origin
    );
    let upstream = await put(modernUrl, 'anonymous', SCIEBO_PASSWORD);
    let endpoint = 'public-dav';
    const modernStatus = upstream.status;

    // 404/405: Endpunkt ist evtl. nicht freigeschaltet.
    // 409: Konflikt beim Zugriff auf den Zielordner - älteren Pfad testen.
    if ([404, 405, 409].includes(upstream.status)) {
      const legacyUrl = new URL(`/public.php/webdav/${filename}`, host.origin);
      upstream = await put(legacyUrl, SCIEBO_TOKEN, SCIEBO_PASSWORD);
      endpoint = 'legacy-webdav';
    }

    if (upstream.ok) {
      return send(res, 201, { success: true, submissionId: obj.submissionId });
    }
    // Erneute Übertragung derselben ID kann bei If-None-Match mit 412 enden.
    if (upstream.status === 412) {
      return send(res, 200, { success: true, submissionId: obj.submissionId, alreadyExists: true });
    }

    // Nur eine technisch relevante DAV-Fehlermeldung loggen; keine Rohantwort,
    // URL, Zugangsdaten oder Fragebogenantworten in die Protokolle schreiben.
    const davBody = (await upstream.text()).slice(0, 4000);
    const messageMatch = davBody.match(/<(?:[A-Za-z0-9_-]+:)?message[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?message>/i);
    const safeMessage = messageMatch?.[1]
      ?.replaceAll(SCIEBO_TOKEN, '[TOKEN]')
      ?.replaceAll(SCIEBO_PASSWORD, '[PASSWORT]')
      ?.replace(/<[^>]*>/g, '')
      ?.slice(0, 180);
    console.error('Sciebo-Dateiupload fehlgeschlagen:', {
      endpoint,
      modernStatus,
      status: upstream.status,
      message: safeMessage || 'keine DAV-Fehlermeldung'
    });
    return send(res, 502, { error: 'Sciebo hat die Speicherung nicht bestätigt.' });
  } catch (err) {
    console.error('Fehler beim Datei-Upload:', err?.name || 'unbekannt');
    return send(res, 502, { error: 'Die Übermittlung konnte nicht abgeschlossen werden.' });
  }
}
