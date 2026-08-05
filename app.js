import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore,collection,doc,getDoc,setDoc,onSnapshot,runTransaction,serverTimestamp,deleteDoc,writeBatch } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyBeucnfeFb9awrRv8ziTmQZxBpMWF4OhpY",authDomain:"bokningar-deb17.firebaseapp.com",projectId:"bokningar-deb17",storageBucket:"bokningar-deb17.firebasestorage.app",messagingSenderId:"964863988500",appId:"1:964863988500:web:fe26f729eb390dcf676801",measurementId:"G-BH8Z38DDD9"};
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const ADMIN_EMAILS=["barabajen@gmail.com"];
const DEFAULT_RESOURCES=[
  {id:"bil",name:"Bil",icon:"🚗",color:"#176b57",description:"Familjens bil",order:1,active:true},
  {id:"gotland",name:"Gotland",icon:"🏝️",color:"#2879a9",description:"Boendet på Gotland",order:2,active:true},
  {id:"backora",name:"Bäcköra",icon:"🏡",color:"#9b6a2f",description:"Bäcköra",order:3,active:true}
];
const $=id=>document.getElementById(id);
let user=null,profile=null,allResources=[],resources=[],bookings=[],currentResourceId=null,viewDate=new Date(),unsubs=[];
const isAdmin=()=>ADMIN_EMAILS.includes((user?.email||"").toLowerCase());
const iso=d=>{let x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const dates=(a,b)=>{let r=[],d=new Date(a+"T12:00:00"),e=new Date(b+"T12:00:00");while(d<=e){r.push(iso(d));d.setDate(d.getDate()+1)}return r};
const fmt=s=>new Date(s+"T12:00:00").toLocaleDateString("sv-SE",{day:"numeric",month:"short",year:"numeric"});
const esc=(t="")=>String(t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slug=s=>(s||"resurs").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,35)||"resurs";
function errText(e){const c=e?.code||"";if(c.includes("invalid-credential"))return"Fel e-postadress eller lösenord.";if(c.includes("permission-denied"))return"Du saknar behörighet för detta.";if(c.includes("network"))return"Kontrollera internetanslutningen.";return e?.message||"Något gick fel."}
function resourceById(id){return resources.find(r=>r.id===id)}
function displayNameFor(b){if(b.userId===user?.uid)return profile?.displayName||"Christin";return b.displayName||b.userEmail||"Familjemedlem"}
$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="Loggar in…";try{await signInWithEmailAndPassword(auth,$("emailInput").value.trim(),$("passwordInput").value);$("loginError").textContent=""}catch(x){$("loginError").textContent=errText(x)}};
$("logoutBtn").onclick=()=>signOut(auth);
onAuthStateChanged(auth,async u=>{
  user=u;$("loginView").classList.toggle("hidden",!!u);$("appView").classList.toggle("hidden",!u);unsubs.forEach(f=>f());unsubs=[];
  if(!u)return;
  $("settingsUser").textContent=u.email;
  await loadProfile();
  listenData();
  showTab("home");
});
async function loadProfile(){
  const ref=doc(db,"profiles",user.uid),snap=await getDoc(ref);
  if(snap.exists())profile=snap.data();else{
    profile={displayName:isAdmin()?"Christin":(user.email?.split("@")[0]||"Familjemedlem"),email:user.email,updatedAt:serverTimestamp()};
    try{await setDoc(ref,profile)}catch{}
  }
  $("welcomeName").textContent=profile.displayName||"Christin";$("displayNameInput").value=profile.displayName||"";
}
function listenData(){
  $("syncStatus").textContent="Synkroniserar…";
  unsubs.push(onSnapshot(collection(db,"resources"),async snap=>{
    allResources=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||99)-(b.order||99));
    resources=allResources.filter(r=>r.active!==false);
    if(!allResources.length&&isAdmin()){const batch=writeBatch(db);DEFAULT_RESOURCES.forEach(r=>batch.set(doc(db,"resources",r.id),{...r,createdAt:serverTimestamp(),createdBy:user.uid}));await batch.commit();return}
    if(!currentResourceId&&resources.length)currentResourceId=resources[0].id;
    renderAll();
  },e=>$("syncStatus").textContent="Fel: "+errText(e)));
  unsubs.push(onSnapshot(collection(db,"bookings"),snap=>{
    bookings=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
    $("syncStatus").textContent="Synkroniserad";renderAll();
  },e=>$("syncStatus").textContent="Fel: "+errText(e)));
}
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
function showTab(name){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));
  if(name==="home"){$("homeTab").classList.add("active");$("pageTitle").textContent="Översikt"}
  if(name==="calendar"){$("resourceTab").classList.add("active");$("pageTitle").textContent="Kalender"}
  if(name==="settings"){$("settingsTab").classList.add("active");$("pageTitle").textContent="Inställningar"}
  renderAll();
}
function resourceCard(r){
  const today=iso(new Date()),next=bookings.filter(b=>b.resourceId===r.id&&b.end>=today)[0];
  const line=next?`${fmt(next.start)}–${fmt(next.end)} · ${esc(displayNameFor(next))}`:"Ledig – inga kommande bokningar";
  return `<article class="card resource-card" style="--accent:${esc(r.color||"#155e4b")}"><div><div class="resource-icon">${esc(r.icon||"📅")}</div><h3>${esc(r.name)}</h3><p class="muted">${esc(r.description||"")}</p><p class="status">${line}</p></div><div class="resource-actions"><button class="ghost" data-open-cal="${r.id}">Kalender</button><button class="primary" data-book="${r.id}">Boka</button></div></article>`;
}
function bookingCard(b){
  const r=resourceById(b.resourceId)||{name:b.resource||"Bokning",color:"#155e4b"};
  const mine=b.userId===user?.uid;
  return `<article class="card booking" style="border-left-color:${esc(r.color||"#155e4b")}"><div><h4>${esc(r.icon||"")} ${esc(r.name)}</h4><p>${fmt(b.start)} – ${fmt(b.end)}</p><p>Bokad av ${esc(displayNameFor(b))}${b.comment?" · "+esc(b.comment):""}</p></div>${mine||isAdmin()?`<button class="danger" data-delete="${b.id}">Ta bort</button>`:""}</article>`;
}
function renderAll(){
  if(!user)return;
  document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!isAdmin()));$("adminSection").classList.toggle("hidden",!isAdmin());
  $("resourceGrid").innerHTML=resources.length?resources.map(resourceCard).join(""):'<div class="card" style="padding:18px">Inga bokningsobjekt ännu.</div>';
  const today=iso(new Date()),up=bookings.filter(b=>b.end>=today).slice(0,12);$("upcomingList").innerHTML=up.length?up.map(bookingCard).join(""):'<div class="card muted" style="padding:18px">Inga kommande bokningar.</div>';
  if(currentResourceId&&!resourceById(currentResourceId)&&resources.length)currentResourceId=resources[0].id;
  const r=resourceById(currentResourceId);$("resourceTitle").textContent=r?`${r.icon||"📅"} ${r.name}`:"Kalender";
  $("resourcePills").innerHTML=resources.map(x=>`<button class="pill ${x.id===currentResourceId?"active":""}" data-resource="${x.id}">${esc(x.icon||"📅")} ${esc(x.name)}</button>`).join("");
  const rb=bookings.filter(b=>b.resourceId===currentResourceId);$("resourceBookings").innerHTML=rb.length?rb.map(bookingCard).join(""):'<div class="card muted" style="padding:18px">Inga bokningar för detta objekt.</div>';
  $("resourceAdminList").innerHTML=resources.length?resources.map(x=>`<div class="card admin-row"><div><strong>${esc(x.icon||"📅")} ${esc(x.name)}</strong><div class="muted">${esc(x.description||"")}</div></div><div class="admin-actions"><button class="ghost" data-edit-resource="${x.id}">Ändra</button><button class="ghost" data-archive-resource="${x.id}">Arkivera</button><button class="danger" data-delete-resource="${x.id}">Ta bort</button></div></div>`).join(""):'<div class="card muted" style="padding:16px">Inga aktiva objekt.</div>';
  const archived=allResources.filter(x=>x.active===false);
  $("archivedResourceList").innerHTML=archived.length?archived.map(x=>`<div class="card admin-row"><div><strong>${esc(x.icon||"📅")} ${esc(x.name)}</strong><div class="muted">${esc(x.description||"")}</div></div><div class="admin-actions"><button class="primary" data-restore-resource="${x.id}">Återställ</button><button class="danger" data-delete-resource="${x.id}">Ta bort</button></div></div>`).join(""):'<div class="card muted" style="padding:16px">Inga arkiverade objekt.</div>';
  bindActions();renderCalendar();
}
function bindActions(){
  document.querySelectorAll("[data-open-cal]").forEach(x=>x.onclick=()=>{currentResourceId=x.dataset.openCal;showTab("calendar")});
  document.querySelectorAll("[data-book]").forEach(x=>x.onclick=()=>openBooking(x.dataset.book));
  document.querySelectorAll("[data-resource]").forEach(x=>x.onclick=()=>{currentResourceId=x.dataset.resource;renderAll()});
  document.querySelectorAll("[data-delete]").forEach(x=>x.onclick=()=>removeBooking(x.dataset.delete));
  document.querySelectorAll("[data-edit-resource]").forEach(x=>x.onclick=()=>openResourceDialog(x.dataset.editResource));
  document.querySelectorAll("[data-archive-resource]").forEach(x=>x.onclick=()=>archiveResource(x.dataset.archiveResource));
  document.querySelectorAll("[data-delete-resource]").forEach(x=>x.onclick=()=>deleteResource(x.dataset.deleteResource));
  document.querySelectorAll("[data-restore-resource]").forEach(x=>x.onclick=()=>restoreResource(x.dataset.restoreResource));
}
function renderCalendar(){
  const y=viewDate.getFullYear(),m=viewDate.getMonth(),off=(new Date(y,m,1).getDay()+6)%7,n=new Date(y,m+1,0).getDate(),today=iso(new Date());
  $("monthLabel").textContent=viewDate.toLocaleDateString("sv-SE",{month:"long",year:"numeric"});let h="";
  for(let i=0;i<off;i++)h+='<div class="day empty"></div>';
  for(let d=1;d<=n;d++){const dt=iso(new Date(y,m,d,12)),b=bookings.find(x=>x.resourceId===currentResourceId&&dt>=x.start&&dt<=x.end),mine=b?.userId===user?.uid;
    h+=`<div class="day ${b?"busy":""} ${mine?"mine":""} ${dt===today?"today":""}"><strong>${d}</strong>${b?`<small>${esc(displayNameFor(b))}</small>`:""}<button aria-label="${b?"Bokad "+displayNameFor(b):"Boka "+dt}" data-day="${dt}"></button></div>`;
  }
  $("calendarGrid").innerHTML=h;document.querySelectorAll("[data-day]").forEach(x=>x.onclick=()=>{const dt=x.dataset.day,b=bookings.find(v=>v.resourceId===currentResourceId&&dt>=v.start&&dt<=v.end);if(b)alert(`${displayNameFor(b)} har bokat ${fmt(b.start)}–${fmt(b.end)}${b.comment?`\n${b.comment}`:""}`);else openBooking(currentResourceId,dt)});
}
$("prevMonth").onclick=()=>{viewDate=new Date(viewDate.getFullYear(),viewDate.getMonth()-1,1);renderCalendar()};
$("nextMonth").onclick=()=>{viewDate=new Date(viewDate.getFullYear(),viewDate.getMonth()+1,1);renderCalendar()};
$("newBookingBtn").onclick=()=>openBooking(currentResourceId);$("quickBookBtn").onclick=()=>openBooking(currentResourceId||resources[0]?.id);
function openBooking(resourceId,day=""){currentResourceId=resourceId||currentResourceId;const r=resourceById(currentResourceId);if(!r)return alert("Lägg först till ett bokningsobjekt.");$("bookingForm").reset();$("dialogResource").textContent=`${r.icon||"📅"} ${r.name}`;$("formError").textContent="";const t=iso(new Date()),chosen=day||t;$("startDate").min=t;$("endDate").min=t;$("startDate").value=chosen;$("endDate").value=chosen;$("bookingDialog").showModal()}
$("startDate").onchange=()=>{$("endDate").min=$("startDate").value;if(!$("endDate").value||$("endDate").value<$("startDate").value)$("endDate").value=$("startDate").value};
$("bookingForm").onsubmit=async e=>{
  e.preventDefault();const start=$("startDate").value,end=$("endDate").value,comment=$("comment").value.trim(),r=resourceById(currentResourceId);
  if(!start||!end||end<start){$("formError").textContent="Kontrollera datumen.";return}
  $("formError").textContent="Sparar…";const bookingRef=doc(collection(db,"bookings")),ds=dates(start,end);
  try{await runTransaction(db,async tx=>{
    const refs=ds.map(d=>doc(db,"bookingLocks",`${currentResourceId}__${d}`));const snaps=[];
    for(const ref of refs)snaps.push(await tx.get(ref));if(snaps.some(s=>s.exists()))throw new Error("DUBBEL");
    tx.set(bookingRef,{resourceId:currentResourceId,resource:r.name,start,end,comment,userId:user.uid,userEmail:user.email,displayName:profile?.displayName||"Christin",createdAt:serverTimestamp()});
    refs.forEach((ref,i)=>tx.set(ref,{bookingId:bookingRef.id,resourceId:currentResourceId,date:ds[i],userId:user.uid}));
  });$("bookingDialog").close()}catch(x){$("formError").textContent=x.message==="DUBBEL"?"Något av datumen är redan bokat.":errText(x)}
};
async function removeBooking(id){
  const b=bookings.find(x=>x.id===id);if(!b||(!isAdmin()&&b.userId!==user.uid)||!confirm("Vill du ta bort bokningen?"))return;
  try{await runTransaction(db,async tx=>{
    const lockRefs=dates(b.start,b.end).map(d=>doc(db,"bookingLocks",`${b.resourceId||slug(b.resource)}__${d}`));const snaps=[];
    for(const ref of lockRefs)snaps.push(await tx.get(ref));tx.delete(doc(db,"bookings",id));
    snaps.forEach((s,i)=>{if(s.exists()&&s.data().bookingId===id)tx.delete(lockRefs[i])});
  })}catch(x){alert(errText(x))}
}
$("profileForm").onsubmit=async e=>{e.preventDefault();const name=$("displayNameInput").value.trim();if(!name)return;try{await setDoc(doc(db,"profiles",user.uid),{displayName:name,email:user.email,updatedAt:serverTimestamp()},{merge:true});profile={...profile,displayName:name};$("welcomeName").textContent=name;$("profileMsg").textContent="Sparat.";renderAll()}catch(x){$("profileMsg").textContent=errText(x)}};
$("addResourceBtn").onclick=()=>openResourceDialog();$("addResourceTop").onclick=()=>openResourceDialog();
function openResourceDialog(id=""){
  if(!isAdmin())return;const r=allResources.find(x=>x.id===id);$("resourceForm").reset();$("resourceId").value=id;$("resourceDialogTitle").textContent=r?"Ändra objekt":"Lägg till objekt";$("resourceName").value=r?.name||"";$("resourceIcon").value=r?.icon||"📅";$("resourceColor").value=r?.color||"#155e4b";$("resourceDescription").value=r?.description||"";$("resourceError").textContent="";$("resourceDialog").showModal()
}
$("resourceForm").onsubmit=async e=>{e.preventDefault();if(!isAdmin())return;const existing=$("resourceId").value,name=$("resourceName").value.trim(),id=existing||slug(name);try{await setDoc(doc(db,"resources",id),{name,icon:$("resourceIcon").value.trim()||"📅",color:$("resourceColor").value,description:$("resourceDescription").value.trim(),active:true,order:resourceById(existing)?.order||resources.length+1,updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true});$("resourceDialog").close()}catch(x){$("resourceError").textContent=errText(x)}};

async function archiveResource(id){
  if(!isAdmin()||!confirm("Vill du arkivera detta bokningsobjekt? Det försvinner från översikten men bokningshistoriken sparas."))return;
  try{await setDoc(doc(db,"resources",id),{active:false,updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true})}
  catch(x){alert(errText(x))}
}
async function restoreResource(id){
  if(!isAdmin())return;
  try{await setDoc(doc(db,"resources",id),{active:true,updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true})}
  catch(x){alert(errText(x))}
}
async function deleteResource(id){
    
  if(!isAdmin())return;
  const r=allResources.find(x=>x.id===id);
const linked=bookings.filter(b=>b.resourceId===id);

  if(linked.length){
    alert(`Det går inte att ta bort ${r?.name||"objektet"} eftersom det finns ${linked.length} bokning${linked.length===1?"":"ar"}. Arkivera objektet i stället.`);
    return;
  }
  if(!confirm(`Är du säker på att du vill ta bort ${r?.name||"detta objekt"} permanent? Detta går inte att ångra.`))return;
  try{await deleteDoc(doc(db,"resources",id))}
  catch(x){alert(errText(x))}
}
document.querySelectorAll("[data-close]").forEach(x=>x.onclick=() => $(x.dataset.close).close());
document.querySelectorAll("[data-admin-view]").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll("[data-admin-view]").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll(".admin-panel-section").forEach(x=>x.classList.remove("active"));
  const target={objects:"adminObjects",archived:"adminArchived",info:"adminInfo"}[btn.dataset.adminView];
  if(target)$(target).classList.add("active");
});
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(items => items.forEach(item => item.unregister()))
    .catch(() => {});
}
