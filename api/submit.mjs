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
const QUESTIONNAIRE_VERSION = 'fit-choice-sport-v1';
const CONSENT_VERSION = 'einwilligung-v1';
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
    if (!UUID_RE.test(obj.submissionId || '') ||
        obj.questionnaireVersion !== QUESTIONNAIRE_VERSION ||
        obj.consent?.given !== true || obj.consent?.version !== CONSENT_VERSION) {
      return send(res, 400, { error: 'Einwilligung oder Studienversion ungültig.' });
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
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      submissionId: obj.submissionId,
      receivedAt: new Date().toISOString(),
      consent: { given: true, version: CONSENT_VERSION },
      answers: Object.fromEntries(EXPECTED_IDS.map(id => [id, answers[id]]))
    };
    // Dokumentierter Sciebo-FileDrop: Token als WebDAV-Benutzername, Passwort separat.
    const uploadUrl = new URL(`/public.php/webdav/${obj.submissionId}.json`, host.origin);
    const credentials = Buffer.from(`${SCIEBO_TOKEN}:${SCIEBO_PASSWORD}`).toString('base64');
    const upstream = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json; charset=utf-8',
        'If-None-Match': '*'
      },
      body: JSON.stringify(record),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });

    if (upstream.ok) {
      return send(res, 201, { success: true, submissionId: obj.submissionId });
    }
    // Bei Verlust der ersten Antwort darf ein erneuter Klick keine zweite Datei erzeugen.
    // Mit If-None-Match signalisiert 412, dass die Datei bereits vorhanden ist.
    if (upstream.status === 412) {
      return send(res, 200, { success: true, submissionId: obj.submissionId, alreadyExists: true });
    }
    // Technische HTTP-Statuszahl (keine Inhalte oder personenbezogene Daten) für Fehlersuche.
    console.error('Sciebo-Dateiupload fehlgeschlagen, Status:', upstream.status);
    return send(res, 502, { error: 'Sciebo hat die Speicherung nicht bestätigt.' });
  } catch (err) {
    console.error('Fehler beim Datei-Upload:', err?.name || 'unbekannt');
    return send(res, 502, { error: 'Die Übermittlung konnte nicht abgeschlossen werden.' });
  }
}
