# FIT-Choice-Sport: Fragebogen + Vercel + Sciebo

Dieses Projekt verwendet die **unveränderten 37 Itemtexte** aus der vom Nutzer bereitgestellten HTML-Datei und behält die sechs bisherigen **vereinfachten Ergebniskategorien** bei. Neu sind ein Einwilligungsfeld, ein Absende-Button und ein geschützter Vercel-API-Endpunkt. Es wird jede **Einzelantwort** (Schlüssel `selbstbild-1` usw.) in einer separaten JSON-Datei gespeichert, damit die späteren FIT-Choice-Skalen unabhängig vom Web-Frontend gebildet werden können.

## Vor dem Start: Datenschutz

Die beigefügte `studieninformation.html` ist **nur eine Vorlage**. Ersetze alle Angaben in `[ECKIGEN KLAMMERN]` durch die mit der Hochschule abgestimmten echten Angaben. Kläre die datenschutzrechtliche Zulässigkeit von Vercel und Sciebo sowie eventuelle Ethikfreigaben. Die Vorlage für das Häkchen allein reicht nicht. Aktiviere die Datenerhebung erst danach über `STUDY_READY=true`.

## Neues GitHub-Repository und Vercel

1. Lege ein **neues** GitHub-Repository an und lade die Dateien dieses Projekts in dessen **Hauptverzeichnis**. Der Ordner `api` muss als Ordner erhalten bleiben.
2. Verbinde das neue Repository auf https://vercel.com/new mit einem **neuen Vercel-Projekt**. Wähle Framework **Other**, Root Directory `./`, keine Build-Befehle nötig.
3. Öffne bei Vercel **Project → Settings → Environment Variables** und hinterlege:
   - `SCIEBO_HOST`: z. B. `https://uni-koeln.sciebo.de` (die tatsächliche Host-Adresse deines Sciebo, ohne `/s/...`)
   - `SCIEBO_TOKEN`: der Token hinter `/s/` des FileDrop-Freigabelinks
   - `SCIEBO_PASSWORD`: das Passwort der FileDrop-Freigabe
   - `STUDY_READY`: zunächst `false`; nach Datenschutzprüfung für die eigentliche Erhebung `true`
4. Nach Änderungen der Umgebungsvariablen **erneut deployen** (Redeploy).
5. **NUR** die Vercel-Domain des neuen Projekts an die Studierenden geben. GitHub Pages allein kann die Serverfunktion nicht bereitstellen. Da die Webseite und `/api/submit` auf derselben Vercel-Domain liegen, ist keine Cross-Origin-Konfiguration erforderlich.

## Sciebo vorbereiten

In Sciebo einen Ordner `FIT-Choice-Sport` anlegen → öffentlich freigeben → Option **Dateianfrage/Nur hochladen (FileDrop)** auswählen → Passwort setzen. Sciebo erläutert die FileDrop-Konfiguration und den skriptgesteuerten WebDAV-Upload:
- https://docs.sciebo.de/docs/getting-started/webinterface/dateien-teilen/
- https://docs.sciebo.de/docs/apps/filedrop-curl/

Token/Passwort **niemals** in `index.html`, GitHub oder Vercel-Logs schreiben. In Vercel gehören sie ausschließlich in geheime Umgebungsvariablen.

## Funktionstest

1. Erst echte Studieninformation vervollständigen und `STUDY_READY=true` setzen. Für einen **reinen technischen Test** darf der Studienordner zunächst Testdaten enthalten; anschließend Testdaten löschen und `STUDY_READY` wieder auf `false` setzen, solange die Prüfung aussteht.
2. Unter deiner neuen Vercel-URL alle 37 Items anklicken; ohne Häkchen bleibt der Absende-Button deaktiviert.
3. Checkbox aktivieren, absenden. Erst wenn Sciebo den Upload erfolgreich bestätigt, erscheint die Auswertung.
4. Im Sciebo-FileDrop-Ordner kontrollieren, ob eine Datei `<uuid>.json` mit `answers` und den 37 Itemkennungen angekommen ist.
5. Upload-Fehler: Antworten bleiben im Browser erhalten, und du kannst erneut absenden. Der Browser wiederverwendet dafür die Abgabe-ID, damit ein Retry nicht gewöhnlich eine zweite Datei erzeugt. Bei wiederholten Uploadfehlern Sciebo-Freigabe und Vercel Function Logs prüfen.

## Einschränkungen vor einer echten Erhebung

- GitHub und Vercel sind verschiedene Dienste; für dieses Projekt wird **Vercel auch als Hosting** genutzt. Keine zusätzliche Supabase- oder Cloudflare-Komponente nötig.
- Die API ist öffentlich erreichbar. Der Origin-Check ist **kein wirksamer Botschutz**; ergänze in einer Produktivstudie einen geeigneten Missbrauchsschutz (z. B. Turnstile oder Vercel WAF/Ratelimit). Erwarte nicht, dass Herkunftsprüfung allein gefälschte Antworten verhindert.
- Speicherung in Sciebo beruht auf WebDAV-FileDrop. Ob es auf deiner Sciebo-Instanz genauso funktioniert, muss real getestet werden.
- Die 37 Antworten bilden den **Motivationsbereich** deiner Fragebogenversion ab. Die sechs bisher angezeigten Kategorien sind eine vereinfachte eigene Auswertung, **keine** automatisch vergleichbaren standardisierten FIT-Choice-Skalen. Wissenschaftliche Skalenbildung erfolgt später extern.
- Weil ein individueller Abgabecode angezeigt wird, können Studierende bei der Studienleitung unter Verweis darauf um Löschung bitten, soweit die Datei noch vorhanden ist.
- Nach dem erfolgreichen Absenden können die Antworten auf derselben Seite nicht mehr bearbeitet werden. Bei einem Übertragungsfehler werden sie nicht gelöscht.

## JSON-Format pro Abgabe

```json
{
  "questionnaireVersion": "fit-choice-sport-v1",
  "submissionId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "receivedAt": "2026-10-23T10:00:00.000Z",
  "consent": {"given": true, "version": "einwilligung-v1"},
  "answers": {"selbstbild-1": 6, "selbstbild-2": 5, "...": "..."}
}
```

`item_zuordnung.csv` enthält die 37 Item-IDs mit ihren Formulierungen, zur späteren Rekonstruktion in SPSS/R/Excel. 
