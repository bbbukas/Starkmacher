/** Die Seite, die das Handy sieht. Alles steht in dieser einen Datei: Sie lädt nichts nach und braucht kein Internet. */

const escape = (text: string) => text.replace(/[&<>"]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[z]!);

export function handySeiteHtml(titel: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starkmacher</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; padding: 24px 16px 40px; background: #ffefe6; color: #33203f; font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 440px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 26px; line-height: 1.2; }
  p { margin: 0 0 18px; color: #6a5874; }
  label { display: block; margin: 0 0 12px; padding: 16px; border-radius: 16px; text-align: center; font-weight: 700; cursor: pointer; }
  .haupt { background: #e0525e; color: #fff; }
  .neben { background: #fff; color: #33203f; box-shadow: inset 0 0 0 2px #f3cfc0; }
  input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  ul { list-style: none; margin: 18px 0 0; padding: 0; }
  li { margin: 0 0 8px; padding: 12px 14px; border-radius: 12px; background: #fff; }
  li.gut { background: #e4f7f2; color: #0a6f62; font-weight: 700; }
  li.fehler { background: #fff3da; color: #7a4f0e; }
</style>
</head>
<body>
<main>
  <h1>${escape(titel)}</h1>
  <p>Das Foto geht direkt an deinen Mac, über dein eigenes WLAN.</p>
  <label class="haupt" for="kamera">Foto aufnehmen</label>
  <input id="kamera" type="file" accept="image/*" capture="environment">
  <label class="neben" for="galerie">Aus der Galerie wählen</label>
  <input id="galerie" type="file" accept="image/*" multiple>
  <ul id="liste" aria-live="polite"></ul>
</main>
<script>
  var liste = document.getElementById('liste');
  var warteschlange = [];
  var laeuft = false;
  var nummer = 0;

  function zeile(text) {
    var li = document.createElement('li');
    li.textContent = text;
    liste.insertBefore(li, liste.firstChild);
    return li;
  }

  function weiter() {
    if (laeuft || warteschlange.length === 0) return;
    laeuft = true;
    var auftrag = warteschlange.shift();
    var anfrage = new XMLHttpRequest();
    anfrage.open('POST', 'bild');
    anfrage.upload.onprogress = function (e) {
      if (e.lengthComputable) auftrag.li.textContent = 'Foto ' + auftrag.nummer + ' wird geschickt, ' + Math.round((e.loaded / e.total) * 100) + ' %';
    };
    anfrage.onload = function () {
      if (anfrage.status === 200) {
        auftrag.li.textContent = '✓ Foto ' + auftrag.nummer + ' ist angekommen. Schau auf deinen Mac.';
        auftrag.li.className = 'gut';
      } else {
        auftrag.li.textContent = anfrage.responseText || 'Das hat nicht geklappt.';
        auftrag.li.className = 'fehler';
      }
      laeuft = false;
      weiter();
    };
    anfrage.onerror = function () {
      auftrag.li.textContent = 'Das hat nicht geklappt. Ist das Fenster am Mac noch offen, und ist dein Handy im selben WLAN?';
      auftrag.li.className = 'fehler';
      laeuft = false;
      weiter();
    };
    anfrage.send(auftrag.datei);
  }

  function schicken(e) {
    var dateien = e.target.files;
    for (var i = 0; i < dateien.length; i++) {
      nummer++;
      warteschlange.push({ datei: dateien[i], nummer: nummer, li: zeile('Foto ' + nummer + ' wartet') });
    }
    e.target.value = '';
    weiter();
  }

  document.getElementById('kamera').addEventListener('change', schicken);
  document.getElementById('galerie').addEventListener('change', schicken);
</script>
</body>
</html>
`;
}
