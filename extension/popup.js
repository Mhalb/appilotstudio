// Popup: Aufnahme starten (mit Hinweis zu echten Daten) oder laufende Aufnahme beenden.
const $ = id => document.getElementById(id);
const ask = msg => chrome.runtime.sendMessage(msg);
const show = view => ["viewStart", "viewRec", "viewNo"].forEach(v => { $(v).hidden = v !== view; });

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const { state } = await ask({ type: "state" });

if (state && state.recording) {
  show("viewRec");
  $("recText").textContent = state.paused ? "Aufnahme pausiert" : "Aufnahme läuft";
  $("recInfo").textContent = (state.count || 0) + (state.count === 1 ? " Schritt" : " Schritte") + " · " + new URL(state.origin).host;
  if (state.paused) {
    $("recPaused").textContent = "Die Anwendung hat die Adresse gewechselt. Zurück auf " + new URL(state.origin).host + " geht die Aufnahme weiter.";
    $("recPaused").hidden = false;
  }
  if (tab && tab.id !== state.tabId) $("recInfo").textContent += " · läuft in einem anderen Tab";
} else if (!tab || !/^https?:/.test(tab.url || "")) {
  show("viewNo");
} else {
  show("viewStart");
  const { hinweisGesehen } = await chrome.storage.local.get("hinweisGesehen");
  $("hintOk").checked = !!hinweisGesehen;
  $("title").value = "";
  $("title").placeholder = tab.title ? "z. B. " + tab.title.slice(0, 60) : $("title").placeholder;
  $("title").focus();
}

$("btnStart").addEventListener("click", async () => {
  const msg = $("msgStart");
  msg.hidden = true;
  if (!$("hintOk").checked) {
    msg.textContent = "Bitte bestätigen Sie den Hinweis.";
    msg.hidden = false;
    return;
  }
  await chrome.storage.local.set({ hinweisGesehen: true });
  $("btnStart").disabled = true;
  const res = await ask({ type: "start", tabId: tab.id, title: $("title").value, recordValues: $("recordValues").checked });
  if (res && res.state) return window.close();
  $("btnStart").disabled = false;
  msg.textContent = (res && res.error) || "Die Aufnahme ließ sich nicht starten.";
  msg.hidden = false;
});

$("btnStop").addEventListener("click", async () => {
  $("btnStop").disabled = true;
  await ask({ type: "stop" });
  window.close();
});
