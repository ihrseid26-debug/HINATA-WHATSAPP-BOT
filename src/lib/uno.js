import { MessageBuilder } from 'zaileys';

function getConnection(ctx) {
  return {
    chat: ctx.jid || ctx.chat || ctx.from || ctx.message?.key?.remoteJid,
    socket: ctx.sock || ctx.socket || ctx.client || ctx.conn
  };
}

async function startUno(ctx) {
  const { chat, socket } = getConnection(ctx);

  if (!chat || !socket?.sendMessage) {
    throw new Error('تعذر تحديد اتصال واتساب أو المحادثة.');
  }

  const html = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#10101c">
<title>ALVARIA UNO</title>
<style>
*{box-sizing:border-box}
:root{
 --bg:#10101c;--panel:#1c1d31;--gold:#ffe29a;
 --red:#ed3548;--yellow:#f8d83d;--green:#22b86b;--blue:#3289ed;
}
body{
 margin:0;padding:13px 12px 24px;min-height:100vh;
 background:
 radial-gradient(ellipse at 50% 0%,#38305a 0%,transparent 55%),
 linear-gradient(160deg,#111321,#17152a 55%,#10101c);
 color:#fff;font-family:Arial,sans-serif;text-align:center;
}
.app{max-width:480px;margin:auto}
.top{
 display:flex;align-items:center;justify-content:space-between;
 gap:8px;margin:3px 0 13px
}
.brand{font-weight:1000;font-size:24px;letter-spacing:1px;color:var(--gold)}
.brand small{display:block;font-size:10px;color:#bcb8d2;letter-spacing:3px;margin-top:3px}
.pill{
 border:1px solid #ffffff20;background:#ffffff0d;
 border-radius:30px;padding:8px 11px;font-size:12px;color:#ddd
}
.scorebar{display:flex;gap:8px;margin-bottom:12px}
.score{
 flex:1;background:#ffffff0d;border:1px solid #ffffff16;
 border-radius:13px;padding:9px 5px;font-size:11px;color:#bcb8d2
}
.score b{display:block;color:#fff;font-size:18px;margin-top:4px}
.table{
 position:relative;overflow:hidden;
 background:
 radial-gradient(ellipse at center,#274c48 0%,#153b38 53%,#102c32 100%);
 border:5px solid #d7b56d;border-radius:27px;
 min-height:260px;padding:12px 10px 14px;
 box-shadow:0 12px 35px #0008,inset 0 0 0 2px #ffffff20;
}
.table:before{
 content:"";position:absolute;inset:9px;border:1px dashed #ffffff35;
 border-radius:19px;pointer-events:none
}
.opponents{
 position:relative;display:grid;grid-template-columns:repeat(3,1fr);
 gap:5px;z-index:1
}
.opponent{
 background:#111c29c9;border:1px solid #ffffff20;
 border-radius:13px;padding:8px 3px;min-width:0
}
.opponent.active{border:2px solid var(--gold);box-shadow:0 0 13px #ffe29a55}
.opponent .face{font-size:23px}
.opponent .name{font-size:11px;font-weight:bold;margin:3px 0}
.opponent .count{font-size:10px;color:#c7d6d3}
.mini-cards{display:flex;justify-content:center;gap:2px;margin-top:5px}
.mini{
 width:13px;height:19px;border-radius:3px;background:#e8e8ee;
 border:1px solid #fff;box-shadow:0 1px 2px #0007
}
.center{
 position:relative;z-index:1;display:flex;align-items:center;
 justify-content:center;gap:22px;margin:18px auto 8px;min-height:120px
}
.pile{text-align:center}
.pile label{display:block;font-size:10px;color:#d2e2dc;margin-bottom:6px}
.card{
 position:relative;display:inline-flex;align-items:center;justify-content:center;
 width:67px;height:105px;border:3px solid #fff;border-radius:12px;
 box-shadow:0 5px 12px #0007;overflow:hidden;color:white;
 font-weight:1000;text-shadow:1px 2px 2px #0008;
 transform:rotate(-5deg);user-select:none
}
.card:before{
 content:"";position:absolute;width:48px;height:75px;
 background:#fff;border-radius:50%;transform:rotate(34deg);
 box-shadow:0 0 0 2px #ffffff55
}
.card .value{
 position:relative;z-index:1;font-size:31px;
 transform:rotate(-8deg);line-height:1
}
.card .corner{
 position:absolute;z-index:2;top:3px;left:5px;
 font-size:10px;color:white
}
.red{background:linear-gradient(145deg,#ff5967,#d30e35)}
.yellow{background:linear-gradient(145deg,#ffe75a,#e5a900);color:#292000;text-shadow:none}
.green{background:linear-gradient(145deg,#38df8a,#087e4b)}
.blue{background:linear-gradient(145deg,#5bb4ff,#1553bd)}
.wild{
 background:conic-gradient(#ef344b 0 25%,#f8d83d 25% 50%,#22b86b 50% 75%,#3289ed 75%)
}
.wild:before{background:#fff}
.wild .value{color:#222;text-shadow:none}
.deck{
 width:67px;height:105px;border:3px solid #fff;border-radius:12px;
 background:repeating-linear-gradient(45deg,#26275b 0 5px,#343578 5px 10px);
 box-shadow:0 5px 12px #0007;display:flex;align-items:center;
 justify-content:center;transform:rotate(5deg);font-size:27px
}
.active-color{position:relative;z-index:1;font-size:12px;color:#e9f5ef}
.status{
 margin:11px 0;background:#ffffff10;border:1px solid #ffffff18;
 border-radius:12px;padding:11px;font-size:13px;min-height:39px;
 color:#fff;line-height:1.5
}
.turnline{font-size:12px;color:#ffe5a8;margin:9px 0 2px}
.hand-area{
 margin-top:15px;background:#ffffff09;border:1px solid #ffffff16;
 border-radius:18px;padding:12px 8px 14px
}
.section-title{font-size:13px;color:#e9d59d;font-weight:bold;margin-bottom:10px}
.hand{
 display:flex;justify-content:center;align-items:center;
 flex-wrap:wrap;gap:7px;min-height:100px
}
.hand .card{
 width:57px;height:88px;border-width:2px;border-radius:10px;
 cursor:pointer;transition:transform .12s,filter .12s
}
.hand .card .value{font-size:25px}
.hand .card:hover{filter:brightness(1.12)}
.hand .card:active{transform:translateY(-12px) rotate(0)}
.hand .card.selected{
 transform:translateY(-13px) rotate(0);
 box-shadow:0 0 0 3px var(--gold),0 7px 16px #0008
}
.actions{
 display:grid;grid-template-columns:repeat(3,1fr);
 gap:8px;margin-top:12px
}
button{
 border:0;border-radius:12px;padding:12px 6px;
 font-size:13px;font-weight:bold;color:white;
 background:#34334e;cursor:pointer;touch-action:manipulation
}
button:disabled{opacity:.4;cursor:not-allowed}
.primary{background:linear-gradient(135deg,#ff5967,#ca2444)}
.gold{background:linear-gradient(135deg,#ffdf72,#d69a24);color:#30230a}
.greenbtn{background:linear-gradient(135deg,#32cb80,#08764b)}
.bluebtn{background:linear-gradient(135deg,#4ca6ff,#2355c4)}
.wide{grid-column:span 3}
.color-picker{
 display:none;grid-template-columns:repeat(4,1fr);
 gap:9px;margin-top:12px;padding:12px;
 border-radius:15px;background:#ffffff10
}
.color-picker.show{display:grid}
.color-choice{
 height:52px;border:3px solid #fff;border-radius:13px;
 box-shadow:0 4px 10px #0005
}
.color-choice.red{background:var(--red)}
.color-choice.yellow{background:var(--yellow)}
.color-choice.green{background:var(--green)}
.color-choice.blue{background:var(--blue)}
.log{
 margin-top:12px;background:#ffffff09;border-radius:13px;
 padding:10px;text-align:right;font-size:11px;color:#c8c7d7;
 min-height:40px;line-height:1.7
}
.overlay{
 position:fixed;inset:0;z-index:10;background:#080914eF;
 display:flex;align-items:center;justify-content:center;padding:20px
}
.overlay.hidden{display:none}
.dialog{
 width:100%;max-width:370px;background:linear-gradient(150deg,#292644,#171829);
 border:1px solid #ffffff28;border-radius:22px;padding:22px;
 box-shadow:0 20px 60px #000b
}
.dialog h2{color:var(--gold);margin:5px 0 12px}
.dialog p{font-size:13px;color:#d1cfe0;line-height:1.8}
.dialog button{width:100%;margin-top:9px}
.rules{
 text-align:right;font-size:11px;line-height:1.9;color:#aaa9bd;
 margin-top:12px
}
@media(max-width:360px){
 .card{width:59px;height:94px}
 .hand .card{width:48px;height:76px}
 .hand .card .value{font-size:21px}
 .table{padding:9px 6px}
}
/* HINATA_UNO_PREMIUM_EFFECTS_V1 */
.sound-toggle{
 padding:8px 10px;border:1px solid #ffe29a66;
 border-radius:30px;background:linear-gradient(135deg,#393454,#242239);
 color:#ffe29a;font-size:11px;white-space:nowrap
}
button{
 transition:transform .16s ease,filter .16s ease,box-shadow .16s ease
}
button:active{
 transform:scale(.94);
 filter:brightness(1.2)
}
.table{
 animation:tableGlow 4s ease-in-out infinite;
}
@keyframes tableGlow{
 0%,100%{box-shadow:0 12px 35px #0008,inset 0 0 0 2px #ffffff20}
 50%{box-shadow:0 12px 40px #0009,0 0 22px #31dca855,inset 0 0 0 2px #ffffff35}
}
.opponent.active{
 animation:activePlayer 1.5s ease-in-out infinite;
}
@keyframes activePlayer{
 0%,100%{box-shadow:0 0 8px #ffe29a33}
 50%{box-shadow:0 0 20px #ffe29a99}
}
.hand .card{
 animation:cardEnter .32s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes cardEnter{
 from{opacity:0;transform:translateY(22px) scale(.8) rotate(-10deg)}
 to{opacity:1;transform:translateY(0) scale(1) rotate(0)}
}
#topcard .card{
 animation:cardLand .35s cubic-bezier(.2,.9,.3,1.2);
}
@keyframes cardLand{
 from{opacity:.4;transform:translateY(-24px) scale(1.2) rotate(12deg)}
 to{opacity:1;transform:translateY(0) scale(1) rotate(-5deg)}
}
.deck{
 animation:deckPulse 2.5s ease-in-out infinite;
}
@keyframes deckPulse{
 0%,100%{filter:brightness(1)}
 50%{filter:brightness(1.3)}
}
.hand .card.selected{
 animation:selectedCard .8s ease-in-out infinite alternate;
}
@keyframes selectedCard{
 from{box-shadow:0 0 0 2px #ffe29a,0 5px 12px #0008}
 to{box-shadow:0 0 0 4px #ffe29a,0 0 20px #ffe29a99}
}
#status{
 transition:background .2s ease,transform .2s ease;
}
.sound-toggle:active{transform:scale(.94)}
@keyframes hinataFall{
 0%{transform:translateY(-30px) rotate(0deg);opacity:1}
 100%{transform:translateY(110vh) rotate(540deg);opacity:0}
}
@media(prefers-reduced-motion:reduce){
 *,*::before,*::after{
  animation-duration:.01ms!important;
  animation-iteration-count:1!important;
  transition-duration:.01ms!important
 }
}
</style>
</head>
<body>
<div class="app">
 <div class="top">
  <div class="brand">🌸 ALVARIA UNO<small>COLOR YOUR GAME</small></div>
  <div style="display:flex;gap:6px;align-items:center">
   <button class="sound-toggle" id="soundToggle">🔊 الصوت</button>
   <div class="pill" id="round">الجولة 1</div>
  </div>
 </div>

 <div class="scorebar">
  <div class="score">انتصاراتك<b id="wins">0</b></div>
  <div class="score">أوراقك<b id="mycount">7</b></div>
  <div class="score">المنافسون<b id="botscount">3</b></div>
 </div>

 <div class="table">
  <div class="opponents" id="opponents"></div>
  <div class="center">
   <div class="pile">
    <label>كومة السحب</label>
    <div class="deck" id="drawpile">🎴</div>
   </div>
   <div class="pile">
    <label>الورقة الحالية</label>
    <div id="topcard"></div>
   </div>
  </div>
  <div class="active-color" id="activecolor">اللون النشط: 🔴 أحمر</div>
  <div class="turnline" id="turnline">دورك الآن</div>
 </div>

 <div class="status" id="status">اضغط «ابدأ اللعب» لتبدأ مغامرة UNO!</div>

 <div class="hand-area">
  <div class="section-title">🃏 أوراقك — اضغط على الورقة للعبها</div>
  <div class="hand" id="hand"></div>
 </div>

 <div class="actions">
  <button class="gold" id="draw">🎴 اسحب ورقة</button>
  <button class="primary" id="uno">📣 UNO!</button>
  <button class="greenbtn" id="pass">⏭️ تمرير الدور</button>
  <button class="bluebtn wide" id="start">🚀 ابدأ اللعب</button>
  <button class="wide" id="restart">🔄 جولة جديدة</button>
 </div>

 <div class="color-picker" id="colors">
  <button class="color-choice red" data-color="red" aria-label="أحمر"></button>
  <button class="color-choice yellow" data-color="yellow" aria-label="أصفر"></button>
  <button class="color-choice green" data-color="green" aria-label="أخضر"></button>
  <button class="color-choice blue" data-color="blue" aria-label="أزرق"></button>
 </div>

 <div class="log" id="log">🌸 أهلاً بك في ALVARIA UNO!</div>
 <div class="rules">
  🔴 أحمر • 🟡 أصفر • 🟢 أخضر • 🔵 أزرق<br>
  طابق اللون أو الرقم أو استخدم ورقة خاصة.<br>
  عند بقاء ورقة واحدة اضغط UNO!
 </div>
</div>

<div class="overlay" id="overlay">
 <div class="dialog">
  <h2>🎴 ALVARIA UNO</h2>
  <p>استعد لمباراة مليئة بالألوان! العب أوراقك بذكاء وتغلب على ثلاثة منافسين.</p>
  <p>🎯 هدفك: تخلص من جميع أوراقك قبل المنافسين.</p>
  <button class="primary" id="begin">ابدأ اللعب 🌸</button>
  <button id="how">📖 طريقة اللعب</button>
 </div>
</div>

<script>
(()=>{
'use strict';

const $=id=>document.getElementById(id);
const colors=['red','yellow','green','blue'];
const colorNames={red:'أحمر',yellow:'أصفر',green:'أخضر',blue:'أزرق'};
const colorEmoji={red:'🔴',yellow:'🟡',green:'🟢',blue:'🔵',wild:'⚫'};

// HINATA_UNO_PREMIUM_EFFECTS_V1
let soundEnabled=true;
let audioContext=null;

function getAudio(){
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return null;
  if(!audioContext)audioContext=new Audio();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  return audioContext;
 }catch(error){
  return null;
 }
}

function beep(frequency,duration,volume,type){
 const audio=getAudio();
 if(!audio||!soundEnabled)return;
 try{
  const oscillator=audio.createOscillator();
  const gain=audio.createGain();
  const now=audio.currentTime;
  oscillator.type=type||'sine';
  oscillator.frequency.setValueAtTime(frequency,now);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(volume||.07,now+.015);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now+duration+.03);
 }catch(error){}
}

function playSound(kind){
 if(!soundEnabled)return;
 const patterns={
  play:[[520,.12],[760,.16]],
  draw:[[340,.13],[270,.18]],
  uno:[[660,.12],[880,.14],[1100,.24]],
  special:[[440,.10],[660,.10],[880,.20]],
  turn:[[520,.10]],
  start:[[440,.10],[660,.10],[880,.20]],
  win:[[523,.13],[659,.13],[784,.13],[1047,.38]],
  lose:[[440,.16],[370,.16],[294,.35]]
 };
 const notes=patterns[kind]||patterns.play;
 notes.forEach((note,index)=>{
  setTimeout(()=>beep(note[0],note[1],.065,'sine'),index*125);
 });
}

function celebrate(){
 const symbols=['✨','🌸','🎉','⭐','💖'];
 for(let i=0;i<22;i++){
  const item=document.createElement('span');
  item.textContent=symbols[i%symbols.length];
  item.style.cssText=
   'position:fixed;z-index:30;top:-30px;left:'+
   (Math.random()*96+2)+'%;font-size:'+
   (16+Math.random()*15)+'px;pointer-events:none;animation:hinataFall '+
   (1.5+Math.random()*1.5)+'s linear forwards';
  document.body.appendChild(item);
  setTimeout(()=>item.remove(),3300);
 }
}
const botNames=['Alvaria','Sakura','Naruto'];
const botFaces=['🌸','🌺','🍥'];

let deck=[],discard=[],players=[],turn=0,direction=1;
let activeColor='red',started=false,locked=false,drawn=false;
let wins=0,round=1,selected=-1,unoPending=false,unoTimer=null;
let message='اضغط «ابدأ اللعب» لتبدأ!';
let lastLog='🌸 أهلاً بك في ALVARIA UNO!';

function makeDeck(){
 const d=[];
 for(const color of colors){
  d.push({color,value:'0'});
  for(let n=1;n<=9;n++){
   d.push({color,value:String(n)});
   d.push({color,value:String(n)});
  }
  for(const value of ['skip','reverse','draw2']){
   d.push({color,value});
   d.push({color,value});
  }
 }
 for(let i=0;i<4;i++){
  d.push({color:'wild',value:'wild'});
  d.push({color:'wild',value:'draw4'});
 }
 return d;
}

function shuffle(a){
 for(let i=a.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [a[i],a[j]]=[a[j],a[i]];
 }
 return a;
}

function takeCard(){
 if(deck.length===0){
  if(discard.length<=1)return null;
  const top=discard.pop();
  deck=shuffle(discard);
  discard=[top];
 }
 return deck.pop()||null;
}

function deal(){
 return Array.from({length:7},takeCard).filter(Boolean);
}

function nameValue(v){
 return ({
  skip:'⊘',reverse:'⇄',draw2:'+2',wild:'★',draw4:'+4'
 })[v]||v;
}

function cardHTML(card,extra){
 const cls=card.color==='wild'?'wild':card.color;
 return '<div class="card '+cls+(extra?' '+extra:'')+'">'+
  '<span class="corner">'+nameValue(card.value)+'</span>'+
  '<span class="value">'+nameValue(card.value)+'</span></div>';
}

function playable(card){
 const top=discard[discard.length-1];
 return card.color==='wild'||card.color===activeColor||card.value===top.value;
}

function updateStatus(text){
 message=text;
 $('status').textContent=text;
}

function log(text){
 lastLog=text;
 $('log').textContent=text;
}

function currentName(){
 return turn===0?'أنت':botNames[turn-1];
}

function render(){
 $('wins').textContent=wins;
 $('round').textContent='الجولة '+round;
 $('mycount').textContent=players[0]?.hand.length||0;
 $('botscount').textContent=players.slice(1).filter(p=>p.hand.length>0).length;

 const top=discard[discard.length-1];
 $('topcard').innerHTML=top?cardHTML(top):'';
 $('activecolor').textContent='اللون النشط: '+colorEmoji[activeColor]+' '+(colorNames[activeColor]||'');
 $('turnline').textContent=started?'الدور الآن: '+currentName():'الجولة لم تبدأ';

 $('opponents').innerHTML=players.slice(1).map((p,i)=>{
  const active=started&&turn===i+1;
  return '<div class="opponent '+(active?'active':'')+'">'+
   '<div class="face">'+botFaces[i]+'</div>'+
   '<div class="name">'+botNames[i]+'</div>'+
   '<div class="count">'+p.hand.length+' أوراق</div>'+
   '<div class="mini-cards">'+
   Array.from({length:Math.min(p.hand.length,5)},()=>'<span class="mini"></span>').join('')+
   '</div></div>';
 }).join('');

 const hand=$('hand');
 hand.innerHTML='';
 if(!players[0])return;

 players[0].hand.forEach((card,i)=>{
  const holder=document.createElement('div');
  holder.innerHTML=cardHTML(card,i===selected?'selected':'');
  const element=holder.firstElementChild;
  element.setAttribute('role','button');
  element.setAttribute('aria-label','ورقة '+(i+1));
  element.addEventListener('click',()=>chooseCard(i));
  if(!started||turn!==0||locked||drawn&&i!==selected){
   element.style.opacity='.55';
  }
  hand.appendChild(element);
 });

 $('draw').disabled=!started||turn!==0||locked||drawn;
 $('pass').disabled=!started||turn!==0||locked||!drawn;
 $('uno').disabled=!started||players[0].hand.length!==1||unoPending;
 $('start').disabled=started;
}

function newRound(){
 clearTimeout(unoTimer);
 deck=shuffle(makeDeck());
 discard=[];
 players=[
  {name:'أنت',hand:deal()},
  {name:'Alvaria',hand:deal()},
  {name:'Sakura',hand:deal()},
  {name:'Naruto',hand:deal()}
 ];
 turn=0;
 direction=1;
 activeColor=colors[Math.floor(Math.random()*4)];
 let first=takeCard();
 while(first&&first.color==='wild'){
  deck.unshift(first);
  first=takeCard();
 }
 discard=[first||{color:activeColor,value:'0'}];
 activeColor=discard[0].color;
 started=true;
 locked=false;
 drawn=false;
 selected=-1;
 unoPending=false;
 $('colors').classList.remove('show');
 updateStatus('🎉 بدأت الجولة! اختر ورقة تطابق اللون أو الرقم.');
 log('تم توزيع 7 أوراق على كل لاعب. حظًا موفقًا!');
 render();
}

function finish(winner){
 locked=true;
 started=false;
 clearTimeout(unoTimer);
 if(winner===0){
  playSound('win');
  celebrate();
  wins++;
  updateStatus('🏆 فزت على الجميع! أحسنت يا بطل!');
  log('🌸 فوز رائع! أنت بطل ALVARIA UNO.');
 }else{
  playSound('lose');
  updateStatus('🌸 فاز '+botNames[winner-1]+' هذه الجولة. حاول مجددًا!');
  log('انتهت الجولة. الفائز: '+botNames[winner-1]);
 }
 render();
 $('start').disabled=true;
 $('restart').textContent='🔄 العب مرة أخرى';
}

function scheduleUnoPenalty(playerIndex){
 clearTimeout(unoTimer);
 if(playerIndex!==0)return;
 unoPending=true;
 updateStatus('📣 بقيت ورقة واحدة! اضغط UNO بسرعة.');
 render();
 unoTimer=setTimeout(()=>{
  if(unoPending&&players[0]?.hand.length===1){
   players[0].hand.push(takeCard(),takeCard());
   players[0].hand=players[0].hand.filter(Boolean);
   unoPending=false;
   log('⚠️ نسيت إعلان UNO! سحبت ورقتين كعقوبة.');
   updateStatus('سحبت ورقتين بسبب نسيان UNO.');
   render();
  }
 },4000);
}

function declareUno(){
 if(!started||players[0].hand.length!==1)return;
 playSound('uno');
 unoPending=false;
 clearTimeout(unoTimer);
 updateStatus('📣 UNO! ورقة واحدة متبقية. أكمل اللعب!');
 log('🎉 أعلنت UNO بنجاح!');
 render();
}

function nextTurn(steps){
 turn=(turn+direction*steps+players.length*2)%players.length;
 drawn=false;
 selected=-1;
}

function chooseColor(){
 $('colors').classList.add('show');
 updateStatus('🌈 اختر اللون الذي تريد استكمال اللعب به.');
}

function playCard(playerIndex,cardIndex,chosenColor){
 const player=players[playerIndex];
 const card=player.hand[cardIndex];
 if(!card||!playable(card))return false;

 if(card.color==='wild'&&!chosenColor){
  if(playerIndex===0){
   selected=cardIndex;
   chooseColor();
   render();
   return 'color';
  }
  chosenColor=chooseBotColor(player);
 }

 player.hand.splice(cardIndex,1);
 discard.push(card);
 playSound(card.value==='wild'||card.value==='draw4'||
  card.value==='draw2'||card.value==='skip'||card.value==='reverse'
  ?'special':'play');
 if(card.color==='wild')activeColor=chosenColor;
 else activeColor=card.color;

 if(player.hand.length===0){
  finish(playerIndex);
  return true;
 }

 if(playerIndex===0&&player.hand.length===1){
  unoPending=false;
  scheduleUnoPenalty(0);
 }else if(playerIndex!==0&&player.hand.length===1){
  log(botNames[playerIndex-1]+' أعلن UNO! 📣');
 }

 let steps=1;
 let special='';

 if(card.value==='skip'){
  steps=2;
  special='⏭️ تخطي الدور';
 }else if(card.value==='reverse'){
  direction*=-1;
  special='🔄 عكس الاتجاه';
  if(players.length===2)steps=2;
 }else if(card.value==='draw2'||card.value==='draw4'){
  steps=2;
  const amount=card.value==='draw2'?2:4;
  const target=(turn+direction+players.length)%players.length;
  const penalty=Array.from({length:amount},takeCard).filter(Boolean);
  players[target].hand.push(...penalty);
  special='➕ '+(target===0?'أنت':botNames[target-1])+' سحب '+amount+' أوراق';
 }

 log((playerIndex===0?'أنت':botNames[playerIndex-1])+' لعب '+nameValue(card.value)+' '+special);
 nextTurn(steps);
 render();
 if(started&&turn!==0)botTurn();
 else if(started)updateStatus('دورك الآن! اختر ورقة مناسبة.');
 return true;
}

function chooseCard(index){
 if(!started||turn!==0||locked)return;
 if(drawn&&index!==selected)return;
 const card=players[0].hand[index];
 if(!card)return;

 if(!playable(card)){
  updateStatus('❌ هذه الورقة لا تطابق اللون أو الرقم الحالي.');
  return;
 }

 selected=index;
 if(card.color==='wild'){
  chooseColor();
  render();
  return;
 }
 playCard(0,index);
}

function chooseBotColor(player){
 const counts={red:0,yellow:0,green:0,blue:0};
 player.hand.forEach(c=>{if(counts[c.color]!==undefined)counts[c.color]++;});
 return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
}

function botTurn(){
 if(!started||turn===0||locked)return;
 const index=turn;
 const player=players[index];
 updateStatus('🤖 '+botNames[index-1]+' يفكر...');
 render();

 setTimeout(()=>{
  if(!started||turn!==index)return;

  let candidates=[];
  player.hand.forEach((card,i)=>{
   if(playable(card))candidates.push({card,index:i});
  });

  if(candidates.length===0){
   const card=takeCard();
   if(card){
    player.hand.push(card);
    playSound('draw');
    log(botNames[index-1]+' سحب ورقة.');
    if(playable(card)){
     candidates=[{card,index:player.hand.length-1}];
    }
   }
  }

  if(candidates.length){
   candidates.sort((a,b)=>{
    const score=c=>({draw4:7,wild:6,draw2:5,skip:4,reverse:3}[c.value]||0);
    return score(b.card)-score(a.card);
   });
   const chosen=candidates[0];
   playCard(index,chosen.index,chosen.card.color==='wild'?chooseBotColor(player):null);
  }else{
   log(botNames[index-1]+' مرر الدور بعد السحب.');
   nextTurn(1);
   render();
   if(started&&turn!==0)botTurn();
   else if(started)updateStatus('دورك الآن! اختر ورقة مناسبة.');
  }
 },650);
}

function drawForHuman(){
 if(!started||turn!==0||locked||drawn)return;
 const card=takeCard();
 if(!card){
  updateStatus('لا توجد أوراق متبقية للسحب.');
  return;
 }
 players[0].hand.push(card);
 playSound('draw');
 drawn=true;
 selected=players[0].hand.length-1;
 updateStatus(playable(card)?'🎴 يمكنك لعب الورقة المسحوبة أو تمرير الدور.':'🎴 سحبت ورقة. اضغط تمرير الدور.');
 log('سحبت ورقة جديدة.');
 render();
}

function passTurn(){
 if(!started||turn!==0||!drawn)return;
 nextTurn(1);
 updateStatus('مررت دورك. الآن دور المنافس.');
 render();
 botTurn();
}

function startGame(){
 getAudio();
 playSound('start');
 $('overlay').classList.add('hidden');
 newRound();
}

$('soundToggle').addEventListener('click',()=>{
 soundEnabled=!soundEnabled;
 $('soundToggle').textContent=soundEnabled?'🔊 الصوت':'🔇 مكتوم';
 if(soundEnabled){
  getAudio();
  playSound('turn');
 }
});

$('begin').addEventListener('click',startGame);
$('start').addEventListener('click',startGame);
$('restart').addEventListener('click',()=>{
 round++;
 newRound();
});
$('draw').addEventListener('click',drawForHuman);
$('pass').addEventListener('click',passTurn);
$('uno').addEventListener('click',declareUno);

$('how').addEventListener('click',()=>{
 updateStatus('طابق اللون أو الرقم. استخدم +2 و+4 والتخطي. استخدم +2 و+4 والتخطي والعكس. عند بقاء ورقة اضغط UNO!');
});

$('colors').querySelectorAll('[data-color]').forEach(button=>{
 button.addEventListener('click',()=>{
  if(!started||turn!==0||selected<0)return;
  const color=button.dataset.color;
  $('colors').classList.remove('show');
  playCard(0,selected,color);
 });
});

render();
})();
</script>
</body>
</html>`;

  const builder = MessageBuilder.create(socket, chat);

  await builder.htmlApp(html, {
    title: '🌸 ALVARIA UNO',
    height: 850,
    device: 'android',
    fallback: '🌸 ALVARIA UNO تحتاج واتساب Android يدعم HTML Apps.',
    maxBytes: 262144,
    bypassDownload: false
  });
}

export function registerUnoCommands(register) {
  register(
    ['uno', 'اونو'],
    'لعبة ALVARIA UNO التفاعلية ضد ثلاثة منافسين',
    async ctx => {
      try {
        await startUno(ctx);
      } catch (error) {
        console.error('[ALVARIA UNO]', error);
        if (typeof ctx.reply === 'function') {
          await ctx.reply('تعذر فتح UNO: ' + error.message);
        }
      }
    },
    '🎴'
  );
}
