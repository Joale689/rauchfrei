(function () {
'use strict';
const KEY='rauchfrei_v2_state', OLD='rauchfrei_v1_events', VERSION='1.0.0';
const types=['cigarette','first-cigarette','vape','day-start'];
const isCig=e=>e.type==='cigarette'||e.type==='first-cigarette';
const fail=m=>{throw new Error(m);};
const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
function dayNumber(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('Ungueltiges Datum.');
  const t=Date.parse(s+'T12:00:00Z');
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==s) fail('Ungueltiges Datum.');
  return Math.floor(t/86400000);
}
const dateString=n=>new Date(n*86400000).toISOString().slice(0,10);
function dayKey(now=new Date()){
  const d=new Date(now); if(d.getHours()<5)d.setDate(d.getDate()-1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function planCheck(p){
  if(!p||!Number.isInteger(p.baseline)||p.baseline<1||p.baseline>100||![1,2,3,7].includes(p.step))fail('Planwerte ungueltig.');
  const span=dayNumber(p.quit)-dayNumber(p.start);
  if(span<1||span>366)fail('Zieldatum muss 1 bis 366 Tage nach dem Start liegen.');
  return p;
}
function limit(p,date){
  planCheck(p);const elapsed=dayNumber(date)-dayNumber(p.start),span=dayNumber(p.quit)-dayNumber(p.start);
  if(elapsed<0)return null;if(elapsed>=span)return 0;
  const stages=Math.ceil(span/p.step),index=Math.floor(elapsed/p.step);
  return Math.ceil(p.baseline*(stages-index)/stages);
}
function fresh(events=[]){return {schema:2,revision:0,timezone:zone(),events,confirmed:[],plan:{start:'2026-10-07',quit:'2026-11-12',baseline:18,step:2},phase:1,nicotine:10,phaseLog:[]};}
function validate(s,now=new Date()){
  if(!s||s.schema!==2||!Number.isSafeInteger(s.revision)||s.revision<0)fail('Unbekannter oder defekter Datenstand.');
  if(s.timezone!==zone())fail('Diese Daten gehoeren zu einer anderen Zeitzone. Es wird nichts ersetzt.');
  planCheck(s.plan);
  if(![1,2,3].includes(s.phase)||!Number.isFinite(s.nicotine)||s.nicotine<0||s.nicotine>100||(s.phase===3&&s.nicotine!==0))fail('Phase oder Nikotinstaerke ungueltig.');
  if(!Array.isArray(s.events)||s.events.length>50000)fail('Ereignisliste ungueltig oder zu gross.');
  const ids=new Set();
  for(const e of s.events){
    if(!e||typeof e.id!=='string'||!e.id||e.id.length>150||ids.has(e.id)||!types.includes(e.type))fail('Ungueltiger oder doppelter Eintrag.');
    const t=Date.parse(e.timestamp);
    if(typeof e.timestamp!=='string'||!Number.isFinite(t)||new Date(t).toISOString()!==e.timestamp||t>now.getTime())fail('Eintrag hat ungueltige Zeit oder liegt in der Zukunft.');
    ids.add(e.id);
  }
  if(!Array.isArray(s.confirmed)||s.confirmed.length>10000||new Set(s.confirmed).size!==s.confirmed.length)fail('Tagesbestaetigungen ungueltig.');
  for(const d of s.confirmed)if(dayNumber(d)>=dayNumber(dayKey(now)))fail('Laufende oder zukuenftige Tage duerfen nicht bestaetigt sein.');
  if(!Array.isArray(s.phaseLog)||s.phaseLog.length>10000)fail('Phasenverlauf ungueltig.');
  for(const p of s.phaseLog)if(!p||![1,2,3].includes(p.phase)||!Number.isFinite(p.nicotine)||p.nicotine<0||p.nicotine>100||typeof p.timestamp!=='string'||!Number.isFinite(Date.parse(p.timestamp))||Date.parse(p.timestamp)>now.getTime())fail('Phasenverlauf ungueltig.');
  return s;
}
function read(storage,now=new Date()){
  const raw=storage.getItem(KEY);
  if(raw!==null)return {raw,state:validate(JSON.parse(raw),now)};
  const old=storage.getItem(OLD),state=fresh(old===null?[]:JSON.parse(old));
  return {raw:null,state:validate(state,now)};
}
function write(storage,expected,state,now=new Date()){
  validate(state,now);
  if(storage.getItem(KEY)!==expected)fail('Daten wurden in einem anderen Fenster geaendert. Bitte erneut versuchen.');
  storage.setItem(KEY,JSON.stringify(state));
}
function imported(data,now=new Date()){
  if(!data||data.app!=='Rauchfrei')fail('Kein Rauchfrei-Backup.');
  if(data.version===VERSION)return validate(data.state,now);
  if(!Array.isArray(data.events))fail('Backup enthaelt keine Ereignisliste.');
  if(!['0.8','0.8.1'].includes(data.version))fail('Unbekannte Backup-Version.');
  return validate(fresh(data.events),now);
}
function editEvent(s,id,value,now=new Date()){
  const e=s.events.find(x=>x.id===id);if(!e)fail('Eintrag nicht mehr vorhanden.');
  const d=new Date(value);
  const pad=n=>String(n).padStart(2,'0');
  const local=t=>`${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
  if(local(new Date(e.timestamp))===value)return;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!Number.isFinite(+d)||local(d)!==value||d>now)fail('Ungueltige Uhrzeit, Zeitumstellung oder Zukunft.');
  if([-3600000,3600000].some(delta=>local(new Date(+d+delta))===value))fail('Diese Uhrzeit kommt zweimal vor. Bitte eine eindeutige Minute waehlen.');
  const a=dayKey(new Date(e.timestamp)),b=dayKey(d);
  e.timestamp=d.toISOString();s.confirmed=s.confirmed.filter(k=>k!==a&&k!==b);
}
const api={KEY,OLD,fresh,read,write,validate,imported,dayKey,dayNumber,limit,editEvent};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
const $=id=>document.getElementById(id),txt=(id,value)=>{$(id).textContent=value;};
const dateDE=k=>k.split('-').reverse().join('.');
const timeDE=t=>new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const duration=ms=>{const n=Math.max(0,Math.floor(ms/60000));return `${Math.floor(n/60)}h ${n%60}m`;};
let current=null,busy=false;
document.querySelector('main').innerHTML=`
<h1>Rauchfrei <small>1.0.0</small></h1><p class="subtitle">Erst zigarettenfrei. Dann nikotinfrei. Dann dampferfrei.</p>
<p id="notice" role="status" aria-live="polite"></p>
<section class="card"><div id="today" class="date"></div><h2 id="planTitle"></h2>
<div class="counter"><span id="cigCount">–</span> / <span id="target">–</span></div>
<p id="remaining"></p><p id="nextStep" class="muted"></p><p class="muted">Ein Limit ist eine Obergrenze, kein Verbrauchsziel. Weniger ist jederzeit moeglich.</p>
<p class="muted">Dein Tag laeuft von 05:00 bis 05:00 Uhr. Aufstehen oder eine Zigarette setzen das Limit nicht zurueck.</p></section>
<section class="card buttons"><button id="cigBtn" class="cigarette">+ Zigarette</button><button id="vapeBtn" class="vape">+ Dampfer-Sitzung</button>
<p class="muted">Eine Sitzung = eine zusammenhaengende Dampfpause. Daraus wird keine Nikotindosis berechnet.</p>
<button id="wakeBtn" class="undo">Aufgestanden / Tagesbeginn markieren</button><button id="undoBtn" class="undo">Letzten Eintrag rueckgaengig</button></section>
<section class="card stats"><div class="stat">Dampfer-Sitzungen<strong id="vapeCount"></strong></div><div class="stat">Seit letztem erfassten Zigaretten-Eintrag<strong id="sinceLast"></strong></div></section>
<section class="card"><strong>Heutiger Verlauf</strong><ul id="events" class="events"></ul></section>
<section class="card"><h2>Letzte 7 Tage</h2><p class="muted">Fehlende Eintraege sind keine bestaetigten Nulltage. Bestaetige nur vollstaendig erfasste Tage.</p><div id="history"></div></section>
<details class="card"><summary>Plan und Phasen einstellen</summary><form id="settings">
<label>Startdatum<input id="start" type="date" required></label><label>Zigarettenfrei ab<input id="quit" type="date" required></label>
<label>Ausgangswert pro Tag<input id="baseline" type="number" min="1" max="100" required></label>
<label>Stufenrhythmus<select id="step"><option value="1">Taeglich</option><option value="2">Alle 2 Tage</option><option value="3">Alle 3 Tage</option><option value="7">Woechentlich</option></select></label>
<p class="muted">Die App verteilt ganze Zigaretten auf die verfuegbare Zeit. Je nach Zeitraum koennen Stufen gleich bleiben oder groesser ausfallen. Eine Planaenderung berechnet die Zielanzeige neu; erfasste Eintraege bleiben erhalten.</p>
<label>Aktuelle Phase<select id="phase"><option value="1">1 – Zigaretten reduzieren</option><option value="2">2 – Nikotin reduzieren</option><option value="3">3 – Dampfen ausschleichen</option></select></label>
<label>Aktuelles Liquid: Nikotin in mg/ml<input id="nicotine" type="number" min="0" max="100" step="0.1" required></label>
<p class="muted">Spaeter gewuenscht: 10 → 5 → 0 mg/ml. Erst wechseln, wenn du ohne Zigaretten stabil bist. Kleinere Schritte sind moeglich. Keine automatische Umstellung. Phase 3: dampferfreie Zeiten ausbauen; kein Pflichtkonsum.</p>
<button class="undo" type="submit">Einstellungen speichern</button></form><p id="phaseStatus"></p><div id="schedule"></div></details>
<details class="card"><summary>Sicherung und Daten</summary><p>Regelmaessig exportieren: Deine Daten liegen nur in diesem Browser auf diesem Geraet.</p>
<div class="buttons"><button id="exportBtn" class="undo">Daten-Backup exportieren</button><button id="importBtn" class="undo">Backup importieren</button><button id="recoveryBtn" class="undo">Sicherung vor letztem Import herunterladen</button></div>
<input id="importFile" type="file" accept=".json,application/json" hidden></details>
<dialog id="editDialog"><form id="editForm"><h2>Uhrzeit aendern</h2><input id="editTime" type="datetime-local" required><div class="buttons"><button type="submit">Speichern</button><button id="editCancel" type="button">Abbrechen</button></div></form></dialog>`;
const style=document.createElement('style');style.textContent='h2{font-size:20px}small{font-size:14px;color:#94a3b8}label{display:block;margin:14px 0}input,select{display:block;width:100%;padding:12px;margin-top:5px;font:inherit;box-sizing:border-box}summary{cursor:pointer;font-weight:bold;padding:8px 0}p{line-height:1.5}#notice:not(:empty){padding:14px;border:1px solid #f59e0b;border-radius:10px;white-space:pre-wrap}.row{padding:12px 0;border-bottom:1px solid #334155}.mini{width:auto;min-height:44px;font-size:14px;padding:8px;margin:4px}dialog{max-width:95vw;border-radius:14px}dialog input{margin-bottom:12px}.events li{flex-wrap:wrap}';document.head.append(style);
function notice(m){txt('notice',m);}
function btn(label,fn){const b=document.createElement('button');b.className='mini undo';b.textContent=label;b.type='button';b.onclick=fn;return b;}
function settings(s){for(const k of ['start','quit','baseline','step'])$(k).value=s.plan[k];$('phase').value=s.phase;$('nicotine').value=s.nicotine;}
function render(fill=false){
  try{
    current=read(localStorage);const s=current.state,now=new Date(),day=dayKey(now),n=dayNumber(day),today=s.events.filter(e=>dayKey(new Date(e.timestamp))===day).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const count=today.filter(isCig).length,l=s.phase===1?limit(s.plan,day):0;
    txt('today',`Tag ${dateDE(day)} · 05:00 bis 05:00 Uhr`);
    txt('planTitle',n<dayNumber(s.plan.start)?'Plan startet am '+dateDE(s.plan.start):`Phase ${s.phase} · Plantag ${n-dayNumber(s.plan.start)+1}`);
    txt('cigCount',count);txt('target',l===null?'–':l);
    txt('remaining',l===null?'Vor dem Planstart.':count>l?`${count-l} ueber dem Limit. Weiter erfassen – dein Plan bleibt bestehen.`:`Heute noch ${l-count} innerhalb deines Limits.`);
    let next='Ziel: dauerhaft ohne Zigaretten.';
    if(s.phase===1&&l!==0){for(let i=n+1;i<=dayNumber(s.plan.quit);i++){const v=limit(s.plan,dateString(i));if(v!==null&&v!==l){next=`Naechste Stufe: ${v} ab ${dateDE(dateString(i))}.`;break;}}}
    txt('nextStep',next);txt('vapeCount',today.filter(e=>e.type==='vape').length);
    const cigs=s.events.filter(isCig).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    txt('sinceLast',cigs.length?duration(+now-Date.parse(cigs.at(-1).timestamp)):'–');
    $('events').replaceChildren();
    for(const e of [...today].reverse()){
      const li=document.createElement('li'),label=document.createElement('span');label.textContent=`${timeDE(e.timestamp)} · ${isCig(e)?'Zigarette':e.type==='vape'?'Dampfer-Sitzung':'Aufgestanden'}`;
      li.append(label,btn('Uhrzeit',()=>openEdit(e)),btn('Entfernen',()=>{if(confirm('Diesen Eintrag entfernen?'))mutate(x=>{x.events=x.events.filter(v=>v.id!==e.id);x.confirmed=x.confirmed.filter(k=>k!==dayKey(new Date(e.timestamp)));},'Eintrag entfernt.');}));$('events').append(li);
    }
    if(!today.length){const li=document.createElement('li');li.textContent='Noch keine Eintraege.';$('events').append(li);}
    $('history').replaceChildren();
    for(let i=n-1;i>=n-7;i--){const k=dateString(i),events=s.events.filter(e=>dayKey(new Date(e.timestamp))===k),c=events.filter(isCig).length,ok=s.confirmed.includes(k),row=document.createElement('div');row.className='row';
      const label=document.createElement('div');label.textContent=`${dateDE(k)}: ${c} Zigaretten · ${events.filter(e=>e.type==='vape').length} Dampfer · ${ok?'vollstaendig bestaetigt':events.length?'Vollstaendigkeit offen':'keine Daten / unbekannt'}`;row.append(label);
      row.append(btn(ok?'Bestaetigung aufheben':'Tag vollstaendig bestaetigen',()=>{if(!ok&&!confirm(`${dateDE(k)}: ${c} Zigaretten. Ist der ganze Tag vollstaendig erfasst?`))return;mutate(x=>{x.confirmed=x.confirmed.filter(d=>d!==k);if(!ok)x.confirmed.push(k);},'Tagesstatus gespeichert.');}));$('history').append(row);
    }
    txt('phaseStatus',`Aktuell: Phase ${s.phase}, ${s.nicotine} mg/ml. Phasenwechsel erfolgen ausschliesslich durch dich.`);
    $('schedule').replaceChildren();let previous=null;
    for(let i=dayNumber(s.plan.start);i<=dayNumber(s.plan.quit);i++){const k=dateString(i),v=limit(s.plan,k);if(v!==previous){const p=document.createElement('div');p.textContent=`Ab ${dateDE(k)}: maximal ${v} Zigaretten`; $('schedule').append(p);previous=v;}}
    $('recoveryBtn').hidden=localStorage.getItem(KEY+':before-import')===null;
    if(fill)settings(s);
  }catch(e){current=null;notice('Daten konnten nicht sicher gelesen werden. Nichts geloescht. '+e.message);}
}
async function mutate(fn,message){
  if(busy)return;busy=true;
  try{
    if(!current)fail('Daten zuerst pruefen. Es wird nichts ueberschrieben.');
    if(!navigator.locks)fail('Dieser Browser unterstuetzt die sichere Speicherung nicht. Bitte aktuelles Chrome nutzen.');
    const expected=current.raw;
    await navigator.locks.request(KEY,()=>{
      const latest=read(localStorage);if(latest.raw!==expected)fail('Daten haben sich geaendert. Bitte erneut versuchen.');
      const s=structuredClone(latest.state);fn(s);s.revision++;write(localStorage,expected,s);
    });
    notice(message);render();
  }catch(e){notice('Nicht gespeichert: '+e.message);render();}finally{busy=false;}
}
function add(type){mutate(s=>{const now=new Date(),k=dayKey(now);
  if(type==='day-start'&&s.events.some(e=>e.type===type&&dayKey(new Date(e.timestamp))===k))fail('Aufstehen ist fuer diesen Tag schon markiert.');
  s.events.push({id:crypto.randomUUID(),type,timestamp:now.toISOString()});s.confirmed=s.confirmed.filter(d=>d!==k);
},type==='day-start'?'Tagesbeginn markiert, keine Zigarette hinzugefuegt.':'Eintrag gespeichert.');}
let editing=null;
function openEdit(e){editing={...e};const d=new Date(e.timestamp),pad=n=>String(n).padStart(2,'0');$('editTime').value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;$('editDialog').showModal();}
$('editCancel').onclick=()=>$('editDialog').close();
$('editForm').onsubmit=e=>{e.preventDefault();const value=$('editTime').value,target=editing;$('editDialog').close();mutate(s=>{if(s.events.find(x=>x.id===target.id)?.timestamp!==target.timestamp)fail('Eintrag wurde zwischenzeitlich geaendert.');editEvent(s,target.id,value);},'Uhrzeit gespeichert.');};
$('cigBtn').onclick=()=>add('cigarette');$('vapeBtn').onclick=()=>add('vape');$('wakeBtn').onclick=()=>add('day-start');
$('undoBtn').onclick=()=>{if(confirm('Den zuletzt hinzugefuegten Eintrag entfernen?'))mutate(s=>{const e=s.events.pop();if(e)s.confirmed=s.confirmed.filter(k=>k!==dayKey(new Date(e.timestamp)));},'Letzter Eintrag entfernt.');};
$('settings').onsubmit=async e=>{e.preventDefault();const p={start:$('start').value,quit:$('quit').value,baseline:Number($('baseline').value),step:Number($('step').value)},phase=Number($('phase').value),nicotine=Number($('nicotine').value);
  if(!confirm('Diese Einstellungen speichern? Bei Phase 2/3: Fuehlst du dich ohne Zigaretten stabil? Die bisherigen Eintraege bleiben erhalten.'))return;
  await mutate(s=>{planCheck(p);if(phase===3&&nicotine!==0)fail('Phase 3 ist fuer nikotinfreies Dampfen vorgesehen.');if(phase!==s.phase||nicotine!==s.nicotine)s.phaseLog.push({phase,nicotine,timestamp:new Date().toISOString()});s.plan=p;s.phase=phase;s.nicotine=nicotine;},'Plan gespeichert.');render(true);
};
function download(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
const payload=s=>({app:'Rauchfrei',version:VERSION,exportedAt:new Date().toISOString(),state:s});
$('exportBtn').onclick=()=>{try{download(payload(read(localStorage).state),'rauchfrei-backup-'+new Date().toISOString().slice(0,10)+'.json');notice('Export angefordert. Bitte die Datei im Download-Ordner pruefen.');}catch(e){notice('Export nicht moeglich: '+e.message);}};
$('recoveryBtn').onclick=()=>{try{const raw=localStorage.getItem(KEY+':before-import');if(raw===null)fail('Keine Importsicherung vorhanden.');download(JSON.parse(raw),'rauchfrei-vor-import.json');}catch(e){notice(e.message);}};
$('importBtn').onclick=()=>{$('importFile').value='';$('importFile').click();};
$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>10000000)fail('Datei ist zu gross.');const incoming=imported(JSON.parse(await f.text()));
  if(!confirm(`${incoming.events.length} Eintraege importieren und aktuellen Stand ersetzen? Vorher wird eine lokale Sicherung gespeichert. Alte Backups enthalten keinen Plan; dabei wird der Startplan 18 → 0 wiederhergestellt.`))return;
  await mutate(s=>{localStorage.setItem(KEY+':before-import',JSON.stringify(payload(s)));const revision=s.revision;Object.assign(s,structuredClone(incoming));s.revision=revision;},'Backup importiert.');render(true);
}catch(error){notice('Import abgebrochen: '+error.message);}};
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===OLD){notice('Daten in einem anderen Fenster geaendert. Anzeige aktualisiert.');render(true);}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});setInterval(()=>render(),30000);render(true);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>notice('Offline-Modus konnte nicht aktualisiert werden. Die App bleibt online nutzbar.'));
})();