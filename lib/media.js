// Aus Screenshots eines Probelaufs werden ein Schulungsvideo (MP4) und eine Klickanleitung (HTML/PDF).
// Das Video entsteht komplett im Browser: Bilder auf ein Canvas zeichnen, mit WebCodecs kodieren, mit mp4-muxer verpacken.
// Kann der Browser weder H.264 noch VP9 kodieren, wird das Canvas in Echtzeit mit MediaRecorder aufgenommen.
// Optional mit Sprecher: Die Sprechtexte kommen als Audio vom Sprachdienst (api/tts.js) und werden als Tonspur eingemischt.
(function () {
  const W = 1280, H = 720, SHOT_H = 586, CAP_H = H - SHOT_H;
  const FPS = 30;
  const INTRO = 3, STEP = 3.6, OUTRO = 2.6, FADE = 0.45;
  const C = { navy: "#0b1f33", teal: "#2bd4a5", blue: "#0070f2", ring: "#ff5a36", light: "#d7e1ea" };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const loadImage = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });

  function wrap(ctx, text, maxWidth, maxLines) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
        if (lines.length === maxLines) break;
      } else line = test;
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + " …").width > maxWidth && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
      lines[maxLines - 1] = last + " …";
    }
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Ausschnitt des Screenshots, in dem das Ziel-Element liegt.
  function cropFor(item, areaH) {
    const scale = W / item.shot.width;
    const srcH = areaH / scale;
    // Passt das Ziel in den oberen Ausschnitt, bleibt der Seitenkopf sichtbar; sonst wird um das Ziel zentriert.
    const r = item.rect;
    const sy = !r || r.y + r.h + 60 <= srcH ? 0 : clamp(r.y + r.h / 2 - srcH / 2, 0, Math.max(0, item.shot.height - srcH));
    return { scale, sy, srcH };
  }

  function drawShot(ctx, item, areaH, pulse) {
    const { scale, sy, srcH } = cropFor(item, areaH);
    ctx.fillStyle = "#f5f6f7";
    ctx.fillRect(0, 0, W, areaH);
    ctx.drawImage(item.img, 0, sy, item.shot.width, Math.min(srcH, item.shot.height - sy), 0, 0, W, Math.min(srcH, item.shot.height - sy) * scale);
    if (!item.rect) return;
    const x = item.rect.x * scale - 8, y = (item.rect.y - sy) * scale - 8, w = item.rect.w * scale + 16, h = item.rect.h * scale + 16;
    // Umgebung leicht abdunkeln, Ziel hervorheben.
    ctx.save();
    ctx.fillStyle = "rgba(11,31,51,0.28)";
    ctx.beginPath();
    ctx.rect(0, 0, W, areaH);
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill("evenodd");
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.ring;
    ctx.shadowColor = "rgba(255,90,54,0.6)";
    ctx.shadowBlur = 10 + 10 * pulse;
    roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();
    ctx.restore();
    if (pulse > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - pulse);
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.ring;
      roundRect(ctx, x - 10 * pulse, y - 10 * pulse, w + 20 * pulse, h + 20 * pulse, 14);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCaption(ctx, item, i, n, progress) {
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, SHOT_H, W, CAP_H);
    ctx.fillStyle = C.teal;
    ctx.font = "600 17px 'Segoe UI', system-ui, Arial, sans-serif";
    ctx.fillText("SCHRITT " + (i + 1) + " VON " + n, 40, SHOT_H + 32);
    ctx.fillStyle = "#fff";
    ctx.font = "700 27px 'Segoe UI', system-ui, Arial, sans-serif";
    ctx.fillText(wrap(ctx, item.step.title, W - 260, 1)[0] || "", 40, SHOT_H + 66);
    ctx.fillStyle = C.light;
    ctx.font = "19px 'Segoe UI', system-ui, Arial, sans-serif";
    wrap(ctx, item.step.text, W - 80, 2).forEach((l, k) => ctx.fillText(l, 40, SHOT_H + 96 + k * 24));
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "600 15px 'Segoe UI', system-ui, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("✦ Appilot", W - 40, SHOT_H + 32);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(0, H - 5, W, 5);
    ctx.fillStyle = C.teal;
    ctx.fillRect(0, H - 5, W * progress, 5);
  }

  function drawCard(ctx, title, sub, foot, label = "✦ Appilot · Schulungsvideo") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, C.navy);
    g.addColorStop(1, "#123a5e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.teal;
    ctx.font = "600 22px 'Segoe UI', system-ui, Arial, sans-serif";
    ctx.fillText(label, 90, 200);
    ctx.fillStyle = "#fff";
    ctx.font = "700 46px 'Segoe UI', system-ui, Arial, sans-serif";
    const tl = wrap(ctx, title, W - 180, 2);
    tl.forEach((l, k) => ctx.fillText(l, 90, 270 + k * 56));
    ctx.fillStyle = C.light;
    ctx.font = "24px 'Segoe UI', system-ui, Arial, sans-serif";
    wrap(ctx, sub, W - 180, 3).forEach((l, k) => ctx.fillText(l, 90, 290 + tl.length * 56 + 20 + k * 34));
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "18px 'Segoe UI', system-ui, Arial, sans-serif";
    ctx.fillText(foot, 90, H - 70);
  }

  // items: [{ step, shot: { dataUrl, width, height }, rect }]
  async function prepare(items) {
    for (const it of items) it.img = await loadImage(it.shot.dataUrl);
    return items;
  }

  // Standbild je Schritt für die Klickanleitung.
  function still(item) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = SHOT_H;
    drawShot(c.getContext("2d"), item, SHOT_H, 0);
    return c.toDataURL("image/jpeg", 0.85);
  }

  // Ablauf des Videos: Intro, ein Abschnitt je Schritt, Abschluss.
  // Mit Sprecher richtet sich die Dauer jedes Abschnitts nach dem gesprochenen Text.
  const VOICE_DELAY = 0.35;
  function makePlan(n, voice, base = { intro: INTRO, step: STEP, outro: OUTRO }) {
    const segs = [];
    let t = 0;
    const add = (kind, i, base, audio) => {
      const dur = audio ? Math.max(base, audio.duration + VOICE_DELAY + 0.6) : base;
      segs.push({ kind, i, start: t, dur, audio: audio || null });
      t += dur;
    };
    add("intro", -1, base.intro, voice && voice.intro);
    for (let i = 0; i < n; i++) add("step", i, base.step, voice && voice.steps[i]);
    add("outro", -1, base.outro, voice && voice.outro);
    return { segs, total: t, voiced: segs.some(s => s.audio) };
  }

  function timeline(n) {
    return makePlan(n).total;
  }

  const OUTRO_TEXT = n => "Sie haben alle " + n + " Schritte gesehen. Bei Fragen hilft Appilot direkt in der Anwendung, auch zu jedem Feld und jeder Fehlermeldung.";

  // Sprechtexte für die Vertonung, passend zu den Abschnitten des Plans.
  function narration(c, items) {
    return {
      intro: c.title + ". " + (c.description || ""),
      steps: items.map((it, i) => "Schritt " + (i + 1) + ": " + it.step.title + ". " + (it.step.text || "")),
      outro: "Geschafft! " + OUTRO_TEXT(items.length),
    };
  }

  function drawAt(ctx, t, c, items, plan) {
    const n = items.length;
    const dateText = "Stand " + new Date().toLocaleDateString("de-DE") + " · Version " + (c.version || 1);
    const segs = plan.segs;
    const seg = segs.find(s => t < s.start + s.dur) || segs[segs.length - 1];
    const local = t - seg.start;
    if (seg.kind === "intro") {
      drawCard(ctx, c.title, c.description || "", dateText + " · automatisch erzeugt aus dem freigegebenen Case");
      return;
    }
    if (seg.kind === "outro") {
      drawCard(ctx, "Geschafft!", OUTRO_TEXT(n), dateText);
      const k = local / FADE;
      const last = segs[segs.length - 2];
      if (k < 1 && n) { ctx.globalAlpha = 1 - k; frameFor(ctx, items[n - 1], n - 1, n, last.dur, last.dur); ctx.globalAlpha = 1; }
      return;
    }
    const i = seg.i;
    frameFor(ctx, items[i], i, n, local, seg.dur);
    if (local < FADE) {
      ctx.globalAlpha = 1 - local / FADE;
      const prev = segs[segs.indexOf(seg) - 1];
      if (i === 0) drawCard(ctx, c.title, c.description || "", dateText);
      else frameFor(ctx, items[i - 1], i - 1, n, prev.dur, prev.dur);
      ctx.globalAlpha = 1;
    }
  }

  function frameFor(ctx, item, i, n, local, dur) {
    const pulse = (local % 1.2) / 1.2;
    drawShot(ctx, item, SHOT_H, pulse);
    drawCaption(ctx, item, i, n, (i + Math.min(1, local / dur)) / n);
  }

  // Alle Sprechtexte auf eine Tonspur legen, jeweils kurz nach Beginn ihres Abschnitts.
  const RATE = 48000;
  async function mixVoice(plan) {
    const ctx = new OfflineAudioContext(1, Math.ceil(plan.total * RATE), RATE);
    for (const s of plan.segs) {
      if (!s.audio) continue;
      const src = ctx.createBufferSource();
      src.buffer = s.audio;
      src.connect(ctx.destination);
      src.start(s.start + VOICE_DELAY);
    }
    return ctx.startRendering();
  }

  async function audioConfig() {
    if (!("AudioEncoder" in window)) return null;
    for (const cand of [{ codec: "mp4a.40.2", muxer: "aac" }, { codec: "opus", muxer: "opus" }]) {
      const cfg = { codec: cand.codec, sampleRate: RATE, numberOfChannels: 1, bitrate: 128000 };
      try {
        if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, muxer: cand.muxer };
      } catch { /* nächster Codec */ }
    }
    return null;
  }

  // H.264 bevorzugt (spielt überall), sonst VP9 im MP4-Container (Chromium-Builds ohne H.264-Encoder).
  const CODECS = [{ codec: "avc1.42001f", muxer: "avc" }, { codec: "vp09.00.31.08", muxer: "vp9" }];

  // draw(ctx, t) zeichnet das Bild zum Zeitpunkt t; plan liefert Dauer und Tonspur.
  async function encodeMp4(draw, plan, onProgress) {
    if (!("VideoEncoder" in window) || !window.Mp4Muxer) return null;
    let config = null, muxCodec = null;
    for (const cand of CODECS) {
      const cfg = { codec: cand.codec, width: W, height: H, bitrate: 3_000_000, framerate: FPS };
      try {
        if ((await VideoEncoder.isConfigSupported(cfg)).supported) { config = cfg; muxCodec = cand.muxer; break; }
      } catch { /* nächster Codec */ }
    }
    if (!config) return null;
    const audio = plan.voiced ? await audioConfig() : null;
    if (plan.voiced && !audio) return null; // Ton geht dann nur über die Echtzeitaufnahme
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: muxCodec, width: W, height: H },
      audio: audio ? { codec: audio.muxer, sampleRate: RATE, numberOfChannels: 1 } : undefined,
      fastStart: "in-memory",
    });
    let failure = null;
    if (audio) {
      const pcm = (await mixVoice(plan)).getChannelData(0);
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => { failure = e; } });
      aenc.configure(audio.cfg);
      const block = RATE / 10;
      for (let off = 0; off < pcm.length; off += block) {
        const part = pcm.slice(off, off + block);
        const data = new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfChannels: 1, numberOfFrames: part.length, timestamp: Math.round(off / RATE * 1e6), data: part });
        aenc.encode(data);
        data.close();
      }
      await aenc.flush();
      if (failure) throw failure;
    }
    const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
    encoder.configure(config);
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d");
    const total = Math.ceil(plan.total * FPS);
    for (let f = 0; f < total; f++) {
      if (failure) throw failure;
      draw(ctx, f / FPS);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (f % 15 === 0) { onProgress && onProgress(f / total); await new Promise(r => setTimeout(r, 0)); }
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), mime: "video/mp4", ext: "mp4", codec: muxCodec };
  }

  async function recordRealtime(draw, plan, onProgress) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find(m => MediaRecorder.isTypeSupported(m)) || "";
    const stream = canvas.captureStream(FPS);
    let actx = null;
    if (plan.voiced) {
      actx = new AudioContext({ sampleRate: RATE });
      const dest = actx.createMediaStreamDestination();
      const mixed = await mixVoice(plan);
      const src = actx.createBufferSource();
      src.buffer = mixed;
      src.connect(dest);
      stream.addTrack(dest.stream.getAudioTracks()[0]);
      actx._src = src;
    }
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const total = plan.total;
    const done = new Promise(r => { rec.onstop = r; });
    draw(ctx, 0);
    rec.start(500);
    if (actx) actx._src.start();
    const start = performance.now();
    await new Promise(resolve => {
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        if (t >= total) return resolve();
        draw(ctx, t);
        onProgress && onProgress(t / total);
        setTimeout(tick, 1000 / FPS);
      };
      tick();
    });
    rec.stop();
    await done;
    if (actx) actx.close();
    const type = (rec.mimeType || mime || "video/webm").split(";")[0];
    return { blob: new Blob(chunks, { type }), mime: type, ext: type.includes("mp4") ? "mp4" : "webm" };
  }

  // voice: { intro, steps: [], outro } mit AudioBuffern oder null, siehe narration().
  async function renderVideo(c, items, onProgress, voice) {
    await prepare(items);
    const plan = makePlan(items.length, voice);
    return render((ctx, t) => drawAt(ctx, t, c, items, plan), plan, onProgress);
  }

  async function render(draw, plan, onProgress) {
    let out = null;
    try {
      out = await encodeMp4(draw, plan, onProgress);
    } catch (err) {
      console.warn("Appilot: WebCodecs fehlgeschlagen, nehme in Echtzeit auf", err);
    }
    if (!out) out = await recordRealtime(draw, plan, onProgress);
    return { ...out, seconds: Math.round(plan.total), voiced: plan.voiced };
  }

  // ---------------------------------------------------------------------------
  // Erklärvideo für einen Baustein einer Lernstrecke: Titelkarte, eine Folie je Kernpunkt, Merksatz.
  // block: { title, text, points: [{ head, text }], merksatz }
  // ---------------------------------------------------------------------------
  const EXPLAIN = { intro: 4.5, step: 6.5, outro: 4.5 };

  function explainerNarration(block) {
    return {
      intro: block.title + ". " + (block.text || ""),
      steps: (block.points || []).map(p => p.head + ". " + (p.text || "")),
      outro: block.merksatz ? "Merksatz: " + block.merksatz : "Das war das Wichtigste in Kürze.",
    };
  }

  function drawExplainer(ctx, t, block, course, plan) {
    const points = block.points || [];
    const n = points.length;
    const seg = plan.segs.find(s => t < s.start + s.dur) || plan.segs[plan.segs.length - 1];
    const local = t - seg.start;
    const font = (w, px) => w + " " + px + "px 'Segoe UI', system-ui, Arial, sans-serif";
    if (seg.kind === "intro") {
      drawCard(ctx, block.title, block.text || "", course.title, "✦ Appilot · Erklärvideo");
      return;
    }
    if (seg.kind === "outro") {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, C.navy);
      g.addColorStop(1, "#123a5e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.teal;
      ctx.font = font("700", 24);
      ctx.fillText("MERKSATZ", 110, 250);
      ctx.fillStyle = "#fff";
      ctx.font = font("700", 44);
      wrap(ctx, block.merksatz || block.title, W - 220, 4).forEach((l, k) => ctx.fillText(l, 110, 320 + k * 58));
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = font("", 18);
      ctx.fillText(course.title + (block.quelle ? " · Quelle: " + block.quelle : ""), 110, H - 70);
      return;
    }
    const i = seg.i;
    const appear = Math.min(1, local / FADE);
    // Kopf
    ctx.fillStyle = "#f4f6f8";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, 0, W, 92);
    ctx.fillStyle = C.teal;
    ctx.font = font("600", 16);
    ctx.fillText(course.title.toUpperCase(), 60, 36);
    ctx.fillStyle = "#fff";
    ctx.font = font("700", 28);
    ctx.fillText(wrap(ctx, block.title, W - 300, 1)[0] || "", 60, 72);
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = font("600", 16);
    ctx.textAlign = "right";
    ctx.fillText("✦ Appilot", W - 60, 36);
    ctx.textAlign = "left";
    // Liste der Kernpunkte links
    const listX = 60, listW = 360;
    points.forEach((p, k) => {
      const y = 140 + k * 74;
      const on = k === i, done = k < i;
      ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0)";
      if (on) { roundRect(ctx, listX - 14, y - 34, listW + 20, 62, 12); ctx.fill(); }
      ctx.fillStyle = on ? C.blue : done ? C.teal : "#c3ccd5";
      ctx.beginPath();
      ctx.arc(listX + 16, y - 3, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = font("700", 16);
      ctx.textAlign = "center";
      ctx.fillText(done ? "✓" : String(k + 1), listX + 16, y + 3);
      ctx.textAlign = "left";
      ctx.fillStyle = on ? "#13263a" : done ? "#3d5368" : "#8a9aab";
      ctx.font = font(on ? "700" : "600", 19);
      wrap(ctx, p.head, listW - 50, 2).forEach((l, m) => ctx.fillText(l, listX + 46, y + m * 22 - (wrap(ctx, p.head, listW - 50, 2).length > 1 ? 10 : 0) + 4));
    });
    // Aktueller Punkt rechts
    const px = 470, pw = W - px - 60;
    ctx.globalAlpha = appear;
    ctx.fillStyle = "#fff";
    roundRect(ctx, px, 124 + (1 - appear) * 20, pw, H - 200, 18);
    ctx.fill();
    ctx.fillStyle = C.blue;
    ctx.font = font("700", 18);
    ctx.fillText("KERNPUNKT " + (i + 1) + " VON " + n, px + 44, 184 + (1 - appear) * 20);
    ctx.fillStyle = "#13263a";
    ctx.font = font("700", 36);
    const hl = wrap(ctx, points[i].head, pw - 88, 2);
    hl.forEach((l, k) => ctx.fillText(l, px + 44, 238 + k * 44 + (1 - appear) * 20));
    ctx.fillStyle = "#3d5368";
    ctx.font = font("", 24);
    wrap(ctx, points[i].text, pw - 88, 8).forEach((l, k) => ctx.fillText(l, px + 44, 238 + hl.length * 44 + 30 + k * 34 + (1 - appear) * 20));
    ctx.globalAlpha = 1;
    // Fortschritt
    ctx.fillStyle = "#dfe5eb";
    ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = C.teal;
    ctx.fillRect(0, H - 6, W * ((i + Math.min(1, local / seg.dur)) / n), 6);
  }

  async function renderExplainer(block, course, onProgress, voice) {
    const plan = makePlan((block.points || []).length, voice, EXPLAIN);
    return render((ctx, t) => drawExplainer(ctx, t, block, course, plan), plan, onProgress);
  }

  function explainerPoster(block, course) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const plan = makePlan((block.points || []).length, null, EXPLAIN);
    drawExplainer(canvas.getContext("2d"), EXPLAIN.intro + EXPLAIN.step * 0.6, block, course, plan);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  // Sprechtexte über /api/tts vertonen. texts: { intro, steps: [], outro }.
  // Liefert AudioBuffer in derselben Form; wirft, wenn die Sprachausgabe nicht verfügbar ist.
  async function fetchVoice(texts, onProgress) {
    const list = [texts.intro, ...texts.steps, texts.outro];
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const out = new Array(list.length);
    let next = 0, done = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: list[i] }) });
        if (!r.ok) {
          let msg = "Fehler " + r.status;
          try { msg = (await r.json()).error || msg; } catch {}
          throw new Error(msg);
        }
        out[i] = await ctx.decodeAudioData(await r.arrayBuffer());
        onProgress && onProgress(++done / list.length);
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
      return { intro: out[0], steps: out.slice(1, -1), outro: out[out.length - 1] };
    } finally {
      ctx.close();
    }
  }

  function poster(c, items) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    drawAt(canvas.getContext("2d"), INTRO + STEP * 0.6, c, items, makePlan(items.length));
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  const esc = s => String(s || "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  // Klickanleitung als eigenständige HTML-Seite (druckbar als PDF).
  function guideHtml(entry) {
    const steps = entry.steps.map((s, i) => `
<section class="s">
  <h2><span>${i + 1}</span>${esc(s.title)}</h2>
  <p>${esc(s.text)}</p>
  ${s.value ? `<p class="v">${esc(s.value)}</p>` : ""}
  <img src="${s.image}" alt="Bildschirm zu Schritt ${i + 1}">
</section>`).join("");
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(entry.title)} · Klickanleitung</title>
<style>
  body { font: 15px/1.5 "Segoe UI", system-ui, Arial, sans-serif; color: #1d2d3e; max-width: 900px; margin: 0 auto; padding: 32px 24px; background: #fff; }
  header { border-bottom: 3px solid #0b1f33; padding-bottom: 14px; margin-bottom: 24px; }
  header small { color: #0a8f6e; font-weight: 600; letter-spacing: .4px; }
  h1 { margin: 6px 0 8px; font-size: 26px; }
  .meta { color: #556b82; font-size: 13px; }
  .s { break-inside: avoid; margin-bottom: 26px; }
  h2 { font-size: 18px; margin: 0 0 4px; display: flex; gap: 10px; align-items: center; }
  h2 span { background: #0b1f33; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 14px; flex: none; }
  p { margin: 0 0 8px 38px; }
  .v { color: #556b82; font-size: 13px; }
  img { width: calc(100% - 38px); margin-left: 38px; border: 1px solid #d9dee3; border-radius: 8px; }
  @media print { body { padding: 0; } }
</style></head><body>
<header><small>✦ APPILOT · KLICKANLEITUNG</small><h1>${esc(entry.title)}</h1>
<div>${esc(entry.description)}</div>
<div class="meta">Version ${entry.version || 1} · erzeugt am ${new Date(entry.created).toLocaleString("de-DE")} · ${entry.steps.length} Schritte</div></header>
${steps}
</body></html>`;
  }

  window.AppilotMedia = { renderVideo, still, poster, guideHtml, prepare, timeline, narration, fetchVoice, renderExplainer, explainerPoster, explainerNarration };
})();
