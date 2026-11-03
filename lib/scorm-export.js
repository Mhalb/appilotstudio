// SCORM-1.2-Paket einer freigegebenen Lernstrecke erzeugen, direkt im Browser, ohne Server.
(function () {
  const Store = window.AppilotStore;
  const V = "?v=4";

  // --- ZIP (unkomprimiert reicht, Videos sind ohnehin komprimiert) ----------
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
      head.setUint16(10, time, true); head.setUint16(12, date, true);
      head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true);
      head.setUint16(26, name.length, true);
      parts.push(head, name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(12, time, true); cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(cd, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  // --- Inhalte ---------------------------------------------------------------
  const xml = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const slug = s => (s || "lernstrecke").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  function manifest(course, names) {
    const id = "appilot-" + slug(course.id) + "-v" + (course.version || 1);
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${xml(id)}" version="${course.version || 1}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>${xml(course.title)}</title>
      <item identifier="item" identifierref="sco" isvisible="true">
        <title>${xml(course.title)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="sco" type="webcontent" adlcp:scormtype="sco" href="index.html">
${names.map(n => `      <file href="${xml(n)}"/>`).join("\n")}
    </resource>
  </resources>
</manifest>
`;
  }

  function page(course) {
    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xml(course.title)}</title>
<link rel="stylesheet" href="lernen.css">
</head>
<body>
<header class="top">
  <span class="brand"><span class="dot">✦</span> Appilot <b>Lernstrecke</b></span>
  <span class="grow"></span>
  <button type="button" class="hbtn" id="voice" hidden></button>
</header>
<main id="app"></main>
<button type="button" class="tutor-fab" id="tutorFab" hidden></button>
<section class="tutor" id="tutor" hidden><div class="tutor-log" id="tutorLog"></div><form id="tutorForm"><input id="tutorInput"></form><button type="button" id="tutorClose" hidden></button></section>
<script src="inhalt.js"></script>
<script src="scorm-api.js"></script>
<script src="kurs.js"></script>
<script src="lernen.js"></script>
</body>
</html>
`;
  }

  async function text(path) {
    const res = await fetch(path + V, { cache: "no-store" });
    if (!res.ok) throw new Error(path + " konnte nicht geladen werden (" + res.status + ")");
    return res.text();
  }

  // Baut das Paket. Liefert { blob, name, videos, missing }.
  async function build(course, cases, project) {
    const enc = new TextEncoder();
    const files = [];
    const add = (name, data) => files.push({ name, data: typeof data === "string" ? enc.encode(data) : data });

    const videos = {};
    let missing = 0;
    for (const b of course.blocks.filter(b => b.type === "erklaerung" && b.videoId)) {
      const entry = await Store.kb.get(b.videoId).catch(() => null);
      if (!entry || !entry.video) { missing++; continue; }
      const name = "media/" + slug(b.videoId) + "." + (entry.ext || "mp4");
      add(name, new Uint8Array(await entry.video.arrayBuffer()));
      videos[b.videoId] = { video: name, poster: entry.poster || "" };
    }
    const used = new Set(course.blocks.filter(b => b.type === "praxis").map(b => b.caseId));
    const data = {
      course,
      cases: cases.filter(c => used.has(c.id)).map(c => ({ id: c.id, title: c.title, steps: (c.steps || []).map(() => ({})) })),
      videos,
      // Praxis-Bausteine öffnen die Zielanwendung aus den Projekteinstellungen
      online: project && project.url ? project.url : "",
      appName: project && project.name ? project.name : "",
      exported: new Date().toISOString(),
    };
    add("inhalt.js", "// Lernstrecke „" + course.title + "“, exportiert aus dem Appilot Lern-Editor.\nwindow.APPILOT_PACKAGE = " + JSON.stringify(data, null, 1).replace(/</g, "\\u003c") + ";\n");
    add("index.html", page(course));
    add("lernen.css", await text("/lib/lernen.css"));
    add("scorm-api.js", await text("/lib/scorm-api.js"));
    add("kurs.js", await text("/lib/kurs.js"));
    add("lernen.js", await text("/lib/lernen.js"));
    add("imsmanifest.xml", manifest(course, files.map(f => f.name)));
    return { blob: zip(files), name: slug(course.title) + "-scorm12.zip", videos: Object.keys(videos).length, missing };
  }

  window.AppilotScormExport = { build };
})();
