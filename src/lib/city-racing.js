import { MessageBuilder } from 'zaileys';

const HTML = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALVARIA CITY RACING</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#101522;color:#fff;font-family:Arial,sans-serif}
.app{max-width:560px;margin:auto;padding:12px}
header{text-align:center;padding:8px}
h2{margin:4px;color:#ffca70;letter-spacing:1px}
.sub{color:#aebbd0;font-size:12px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0}
.stat{background:#202b40;border:1px solid #35435e;border-radius:12px;padding:9px;text-align:center;font-size:12px}
.stat b{display:block;color:#ffd27c;font-size:20px;margin-top:4px}
#scene{display:block;width:100%;height:auto;background:#91b9d0;border:2px solid #465674;border-radius:14px;touch-action:none}
.message{text-align:center;min-height:25px;color:#ffd27c;padding:8px;font-size:13px}
.controls{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}
button{border:0;border-radius:12px;padding:12px 8px;background:#293750;color:#fff;font-weight:bold;font-size:14px}
button:active{filter:brightness(1.35);transform:scale(.98)}
button.primary{background:#a85d24}
button.green{background:#23694e}
button:disabled{opacity:.4}
.actions{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
.panel{background:#1b263a;border:1px solid #34445e;border-radius:14px;padding:12px;margin:10px 0}
.panel h3{margin:0 0 10px;color:#ffd27c}
.cars{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.car{background:#26354e;border-radius:12px;padding:10px;text-align:center}
.car .emoji{font-size:35px}
.car b{display:block;margin:5px}
.car small{color:#c0ccdc}
.car button{width:100%;margin-top:8px}
.note{color:#aebbd0;font-size:11px;line-height:1.7;text-align:center}
.hidden{display:none!important}
 
.app{padding-bottom:calc(22px + env(safe-area-inset-bottom))}
.drive-dock{
 position:sticky;
 bottom:0;
 z-index:20;
 padding:8px;
 margin:8px -4px;
 border:1px solid #536783;
 border-radius:16px;
 background:rgba(13,21,36,.96);
 box-shadow:0 -5px 22px rgba(0,0,0,.38);
}
.controls{margin:5px 0;gap:7px}
.controls button{
 min-height:52px;
 touch-action:none;
 user-select:none;
 -webkit-user-select:none;
 -webkit-touch-callout:none;
}
.actions button{min-height:46px}
button{cursor:pointer}
#scene{max-height:62vh;object-fit:fill}
.car{border:1px solid #405574}
.car .emoji{font-size:42px}
.note{padding:3px}
</style>
</head>
<body>
<div class="app">
<header>
<h2>🏎️ ALVARIA CITY RACING</h2>
<div class="sub">مدينة مفتوحة • سباقات • سيارات • مكافآت</div>
</header>

<div class="stats">
<div class="stat">💰 رصيدك<b id="money">250</b></div>
<div class="stat">🏁 المسافة<b id="distance">0</b></div>
<div class="stat">🚘 سيارتك<b id="carName">البداية</b></div>
</div>

<canvas id="scene" width="480" height="640"></canvas>
<div class="message" id="message">اضغط ابدأ وانطلق في المدينة!</div>

<div class="drive-dock">
<div class="controls">
<button id="left">⬅️ يسار</button>
<button id="brake">🛑 فرامل</button>
<button id="right">يمين ➡️</button>
</div>
<div class="controls">
<button class="green" id="gas">🚀 تسارع</button>
<button class="primary" id="boost">⚡ نيترو</button>
<button id="horn">📢 بوق</button>
</div>
</div>

<div class="actions">
<button class="green" id="start">▶️ ابدأ القيادة</button>
<button id="race">🏁 سباق جديد</button>
<button id="pause">Ⅱ إيقاف مؤقت</button>
<button id="shopBtn">🚘 معرض السيارات</button>
</div>

<div class="panel hidden" id="shop">
<h3>🚘 معرض سيارات ALVARIA</h3>
<div class="cars" id="cars"></div>
<button id="closeShop">إغلاق المعرض</button>
</div>

<div class="panel">
<h3>🎯 أهداف القيادة</h3>
<div id="mission">قد لمسافة 500 متر لتحصل على مكافأة.</div>
<p class="note">اجمع العملات الذهبية، تفادَ السيارات، واربح السباقات لشراء سيارات أفضل.</p>
</div>
<p class="note">نسخة تجريبية فردية. التقدم والرصيد في هذه النسخة مؤقتان خلال جلسة اللعبة.</p>
</div>

<script>
(function(){
'use strict';

var canvas=document.getElementById('scene');
var c=canvas.getContext('2d');
var W=480,H=640;
var money=250,distance=0,speed=0,lane=0,playing=false,paused=false;
var raceMode=false,raceLeft=0,earned=0,boost=100;
var objects=[],spawn=0,last=0;
var carIndex=0;
var cars=[
 {name:'البداية',emoji:'🚗',price:0,color:'#e84b4b',power:1},
 {name:'بولت GT',emoji:'🏎️',price:500,color:'#20a9e0',power:1.25},
 {name:'فيرو سبورت',emoji:'🏎️',price:1200,color:'#d83242',power:1.5},
 {name:'توربو RS',emoji:'🚘',price:1900,color:'#e5b83e',power:1.65},
 {name:'ماكلارين X',emoji:'🏎️',price:2500,color:'#ee7b32',power:1.8},
 {name:'هايبر VIP',emoji:'🚀',price:4000,color:'#a56bea',power:2}
];
var owned=[true,false,false,false,false,false];
var carName=document.getElementById('carName');
var moneyEl=document.getElementById('money');
var distanceEl=document.getElementById('distance');
var message=document.getElementById('message');
var mission=document.getElementById('mission');
var gas=false,brake=false,left=false,right=false,usingBoost=false;

function say(t){message.textContent=t}
function stats(){
 moneyEl.textContent=money;
 distanceEl.textContent=Math.floor(distance);
 carName.textContent=cars[carIndex].name;
}
function polygon(points,color){
 c.fillStyle=color;c.beginPath();
 c.moveTo(points[0][0],points[0][1]);
 for(var i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);
 c.closePath();c.fill();
}
function drawBuilding(x,y,w,h,color){
 c.fillStyle=color;c.fillRect(x,y,w,h);
 c.fillStyle='rgba(255,225,130,.7)';
 var cols=Math.max(1,Math.floor(w/15));
 var rows=Math.max(1,Math.floor(h/22));
 for(var a=0;a<cols;a++)for(var b=0;b<rows;b++){
  c.fillRect(x+4+a*15,y+5+b*22,5,8);
 }
}
function road(){
 var horizon=210;
 var shift=lane*35;
 var sky=c.createLinearGradient(0,0,0,horizon);
 sky.addColorStop(0,'#76b2d4');sky.addColorStop(1,'#e7d1a5');
 c.fillStyle=sky;c.fillRect(0,0,W,horizon);
 c.fillStyle='#647b52';c.fillRect(0,horizon,W,H-horizon);

 for(var i=0;i<13;i++){
  var depth=i/13;
  var y=horizon+depth*depth*430;
  var bh=20+depth*100;
  var bw=22+depth*65;
  drawBuilding(4+i*7,y-bh,bw,bh,'#65728b');
  drawBuilding(W-4-bw-i*7,y-bh,bw,bh,'#53647c');
 }
 polygon([[190,horizon],[290,horizon],[W+70,H],[ -70,H]],'#343b48');
 polygon([[190,horizon],[196,horizon],[20,H],[0,H]],'#f0d28a');
 polygon([[284,horizon],[290,horizon],[480,H],[460,H]],'#f0d28a');

 for(var j=0;j<12;j++){
  var z=(j/12+((distance/85)%1))%1;
  var y=horizon+z*z*430;
  var width=2+z*7;
  var x1=240-(50+z*250)/3;
  var x2=240+(50+z*250)/3;
  c.fillStyle='#f4e7c4';
  c.fillRect(x1-width/2,y,width,8+z*35);
  c.fillRect(x2-width/2,y,width,8+z*35);
 }
}
function drawCar(x,y,scale,color,emoji){
 var w=43*scale,h=72*scale;
 c.save();

 // ظل السيارة
 c.fillStyle='rgba(0,0,0,.35)';
 c.beginPath();
 c.ellipse(x,y-2*scale,w*.58,7*scale,0,0,Math.PI*2);
 c.fill();

 // الإطارات
 c.fillStyle='#10131a';
 c.fillRect(x-w*.56,y-h*.55,w*.16,h*.29);
 c.fillRect(x+w*.40,y-h*.55,w*.16,h*.29);
 c.fillRect(x-w*.55,y-h*.19,w*.15,h*.17);
 c.fillRect(x+w*.40,y-h*.19,w*.15,h*.17);

 // جسم السيارة
 var paint=c.createLinearGradient(x-w/2,y-h,x+w/2,y);
 paint.addColorStop(0,'#ffffff');
 paint.addColorStop(.16,color);
 paint.addColorStop(.55,color);
 paint.addColorStop(1,'#252a38');

 polygon([
  [x-w*.42,y-h*.12],
  [x-w*.49,y-h*.34],
  [x-w*.43,y-h*.65],
  [x-w*.29,y-h*.91],
  [x+w*.29,y-h*.91],
  [x+w*.43,y-h*.65],
  [x+w*.49,y-h*.34],
  [x+w*.42,y-h*.12],
  [x+w*.25,y],
  [x-w*.25,y]
 ],paint);

 // الزجاج الأمامي
 polygon([
  [x-w*.31,y-h*.67],
  [x-w*.22,y-h*.86],
  [x+w*.22,y-h*.86],
  [x+w*.31,y-h*.67]
 ],'#8ed8ee');

 // الزجاج الخلفي
 polygon([
  [x-w*.31,y-h*.71],
  [x-w*.23,y-h*.61],
  [x+w*.23,y-h*.61],
  [x+w*.31,y-h*.71]
 ],'#4c7892');

 // السقف والخطوط الجانبية
 c.strokeStyle='rgba(255,255,255,.65)';
 c.lineWidth=Math.max(1,1.5*scale);
 c.beginPath();
 c.moveTo(x-w*.37,y-h*.48);
 c.lineTo(x-w*.23,y-h*.86);
 c.moveTo(x+w*.37,y-h*.48);
 c.lineTo(x+w*.23,y-h*.86);
 c.stroke();

 // مقدمة السيارة والشبك
 c.fillStyle='#151923';
 c.fillRect(x-w*.19,y-h*.16,w*.38,h*.055);
 c.fillStyle='#fff4b7';
 c.fillRect(x-w*.34,y-h*.25,w*.17,h*.055);
 c.fillRect(x+w*.17,y-h*.25,w*.17,h*.055);

 // المصابيح الخلفية
 c.fillStyle='#ff3e48';
 c.fillRect(x-w*.34,y-h*.07,w*.15,h*.045);
 c.fillRect(x+w*.19,y-h*.07,w*.15,h*.045);

 // جناح خلفي رياضي
 c.fillStyle='#171c28';
 c.fillRect(x-w*.43,y-h*.96,w*.86,h*.045);
 c.fillRect(x-w*.31,y-h*.94,w*.07,h*.09);
 c.fillRect(x+w*.24,y-h*.94,w*.07,h*.09);

 c.restore();
}
function drawObjects(){
 objects.forEach(function(o){
  var z=o.z, y=210+z*z*430, x=240+o.x*(45+z*190);
  if(o.type==='coin'){
   c.fillStyle='#ffcf43';c.beginPath();c.arc(x,y,4+z*12,0,Math.PI*2);c.fill();
   c.strokeStyle='#fff1a0';c.lineWidth=2;c.stroke();
  }else{
   drawCar(x,y,0.25+z*.85,o.color||'#d94b4b','');
  }
 });
}
function draw(){
 c.clearRect(0,0,W,H);
 road();
 drawObjects();
 drawCar(240+lane*75,570,1.05,cars[carIndex].color,'');
 c.fillStyle='rgba(0,0,0,.35)';
 c.fillRect(10,10,130,48);
 c.fillStyle='white';c.font='bold 15px Arial';
 c.fillText('SPEED '+Math.floor(speed*100),20,30);
 c.fillText('NITRO '+Math.floor(boost)+'%',20,49);
 if(!playing){
  c.fillStyle='rgba(0,0,0,.4)';c.fillRect(0,0,W,H);
  c.fillStyle='white';c.textAlign='center';c.font='bold 25px Arial';
  c.fillText('ALVARIA CITY',240,290);
  c.font='16px Arial';c.fillText('اضغط ابدأ القيادة',240,325);
  c.textAlign='start';
 }
}
function spawnObject(){
 var x=(Math.random()*1.6)-.8;
 if(Math.random()<.38)objects.push({type:'coin',x:x,z:0});
 else objects.push({type:'car',x:x,z:0,color:['#d74d50','#43a4db','#e6a63c'][Math.floor(Math.random()*3)]});
}
function endRun(){
 playing=false;speed=0;gas=false;usingBoost=false;
 var reward=Math.floor(earned);
 money+=reward;
 say('انتهت الجولة! ربحت '+reward+' قطعة نقدية 💰');
 stats();draw();
}
function update(dt){
 if(!playing||paused)return;
 var power=cars[carIndex].power;
 if(gas)speed=Math.min(1.5*power,speed+dt*.0007*power);
 else speed=Math.max(.35,speed-dt*.00018);
 if(brake)speed=Math.max(0,speed-dt*.001);
 if(usingBoost&&boost>0){speed=Math.min(2.1*power,speed+dt*.0008);boost=Math.max(0,boost-dt*.025);}
 else boost=Math.min(100,boost+dt*.006);
 if(left)lane=Math.max(-1.25,lane-dt*.0025);
 if(right)lane=Math.min(1.25,lane+dt*.0025);

 distance+=speed*dt*.012;
 spawn+=dt;
 if(spawn>750/Math.max(.5,speed)){spawn=0;spawnObject();}
 objects.forEach(function(o){
  o.z+=dt*.00025*speed;
  if(o.z>.82&&o.z<.99&&Math.abs(o.x-lane*.55)<.28){
   if(o.type==='coin'){
    o.z=2;earned+=25;say('جمعت 25 قطعة نقدية! 💰');
   }else{
    o.z=2;speed*=.35;say('اصطدمت بسيارة! انتبه للطريق.');
   }
  }
 });
 objects=objects.filter(function(o){return o.z<1.1});
 if(raceMode){
  raceLeft-=dt;
  if(raceLeft<=0){
   raceMode=false;
   var bonus=Math.max(100,Math.floor(distance/5));
   earned+=bonus;
   say('فزت بالتحدي! مكافأة السباق '+bonus+' 💰');
  }
 }
 if(distance>=500&&mission.dataset.done!=='1'){
  mission.dataset.done='1';earned+=100;
  mission.textContent='أكملت 500 متر! مكافأة 100 قطعة أثناء الجولة.';
 }
 stats();
}
function frame(t){
 var dt=Math.min(40,t-(last||t));last=t;
 update(dt);draw();requestAnimationFrame(frame);
}
function startRun(isRace){
 if(playing){say('أنت تقود بالفعل!');return}
 playing=true;paused=false;raceMode=!!isRace;
 raceLeft=raceMode?45000:0;earned=0;objects=[];spawn=0;
 speed=.45;lane=0;distance=0;mission.dataset.done='';
 mission.textContent=raceMode?'أكمل السباق قبل انتهاء الوقت!':'قد لمسافة 500 متر لتحصل على مكافأة.';
 say(raceMode?'بدأ السباق! اجمع العملات وتجنب السيارات.':'بدأت القيادة الحرة! استمتع بالمدينة.');
}
function togglePause(){
 if(!playing)return;
 paused=!paused;say(paused?'اللعبة متوقفة مؤقتًا.':'عدنا إلى الطريق!');
}
function renderShop(){
 var box=document.getElementById('cars');box.innerHTML='';
 cars.forEach(function(car,i){
  var item=document.createElement('div');item.className='car';
  var status=owned[i]?(carIndex===i?'سيارتك الحالية':'مملوكة'):('السعر: '+car.price+' 💰');
  var btn=document.createElement('button');
  btn.textContent=owned[i]?(carIndex===i?'مستخدمة':'اختر السيارة'):'شراء السيارة';
  btn.disabled=owned[i]&&carIndex===i;
  btn.onclick=function(){
   if(owned[i]){carIndex=i;say('تم اختيار '+car.name);stats();renderShop();return}
   if(money<car.price){say('رصيدك لا يكفي لشراء هذه السيارة.');return}
   money-=car.price;owned[i]=true;carIndex=i;
   say('مبروك! اشتريت '+car.name+' 🚘');stats();renderShop();
  };
  item.innerHTML='<div class="emoji">'+car.emoji+'</div><b>'+car.name+'</b><small>'+status+'</small>';
  item.appendChild(btn);box.appendChild(item);
 });
}
var controlReleases=[];

function hold(id,on,off){
 var el=document.getElementById(id);
 var active=new Set();

 function release(e){
  if(!active.has(e.pointerId))return;
  active.delete(e.pointerId);
  if(active.size===0)off();
 }

 el.addEventListener('pointerdown',function(e){
  e.preventDefault();
  if(active.has(e.pointerId))return;
  active.add(e.pointerId);
  if(active.size===1)on();
  try{el.setPointerCapture(e.pointerId)}catch(_){}
 });

 el.addEventListener('pointerup',release);
 el.addEventListener('pointercancel',release);
 el.addEventListener('lostpointercapture',release);

 controlReleases.push(function(){
  if(active.size){active.clear();off();}
 });
}

function releaseAllControls(){
 controlReleases.forEach(function(fn){fn()});
 left=false;right=false;gas=false;brake=false;usingBoost=false;
}

hold('left',function(){left=true},function(){left=false});
hold('right',function(){right=true},function(){right=false});
hold('gas',function(){gas=true},function(){gas=false});
hold('brake',function(){brake=true},function(){brake=false});
hold('boost',function(){usingBoost=true},function(){usingBoost=false});

window.addEventListener('pointerup',function(e){
 document.dispatchEvent(new Event('hinata-control-release'));
});
window.addEventListener('blur',releaseAllControls);
document.addEventListener('visibilitychange',function(){
 if(document.hidden)releaseAllControls();
});

document.getElementById('start').onclick=function(){startRun(false)};
document.getElementById('race').onclick=function(){startRun(true)};
document.getElementById('pause').onclick=togglePause;
document.getElementById('shopBtn').onclick=function(){renderShop();document.getElementById('shop').classList.remove('hidden')};
document.getElementById('closeShop').onclick=function(){document.getElementById('shop').classList.add('hidden')};
document.getElementById('horn').onclick=function(){say('بيب بيب! 📢')};
document.addEventListener('keydown',function(e){
 if(e.key==='ArrowLeft')left=true;
 if(e.key==='ArrowRight')right=true;
 if(e.key==='ArrowUp')gas=true;
 if(e.key==='ArrowDown')brake=true;
});
document.addEventListener('keyup',function(e){
 if(e.key==='ArrowLeft')left=false;
 if(e.key==='ArrowRight')right=false;
 if(e.key==='ArrowUp')gas=false;
 if(e.key==='ArrowDown')brake=false;
});
document.addEventListener('visibilitychange',function(){
 if(document.hidden)releaseAllControls();
});
stats();draw();requestAnimationFrame(frame);
})();
</script>
</body>
</html>`;

export function registerCityRacingCommands(register) {
  register(
    ['سباق_السيارات', 'سباق', 'cityracing'],
    'لعبة ALVARIA CITY RACING: قيادة وسباقات وجمع المال وشراء السيارات',
    async ctx => {
      const msg = ctx.message || ctx.msg || {};
      const key = msg.key || {};
      const chatValue = ctx.jid || ctx.chatJid || ctx.from || ctx.chat || key.remoteJid;
      const chat = typeof chatValue === 'string' ? chatValue : chatValue?.id;
      const socket = ctx.sock || ctx.socket || ctx.client || ctx.conn;

      if (!socket || !chat) {
        if (ctx.reply) await ctx.reply('تعذر فتح اللعبة: لم أتمكن من تحديد المحادثة.');
        return;
      }

      try {
        const builder = MessageBuilder.create(socket, chat);
        await builder.htmlApp(HTML, {
          title: 'ALVARIA CITY RACING',
          height: 1000,
          device: 'android',
          fallback: 'افتح اللعبة من جهاز يدعم HTML Apps داخل واتساب.',
          maxBytes: 262144,
          bypassDownload: false
        });
      } catch (error) {
        console.error('[ALVARIA CITY RACING]', error);
        if (ctx.reply) await ctx.reply('تعذر فتح لعبة سباق السيارات. تحقق من دعم HTML Apps.');
      }
    }
  );
}
