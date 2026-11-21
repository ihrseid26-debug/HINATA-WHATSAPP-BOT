import { MessageBuilder } from 'zaileys';

const HTML = String.raw`<!doctype html>
<html lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALVARIA SNAKE</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#10151d;color:#f4f7fb;font-family:Arial,sans-serif;text-align:center;padding:14px}
.app{max-width:520px;margin:auto}
h2{margin:5px 0 12px;color:#8df0b0;letter-spacing:2px}
.stats{display:flex;justify-content:space-around;gap:8px;margin:12px 0}
.stat{background:#1c2633;border:1px solid #344454;border-radius:12px;padding:10px;flex:1}
.stat b{display:block;color:#8df0b0;font-size:22px;margin-top:4px}
canvas{display:block;width:100%;height:auto;background:#17231e;border:3px solid #4b6858;border-radius:12px;touch-action:none}
.controls{display:grid;grid-template-columns:repeat(3,68px);grid-template-rows:repeat(2,58px);gap:8px;justify-content:center;margin:16px auto}
button{border:0;border-radius:12px;background:#263747;color:white;font-size:21px;font-weight:bold;padding:12px;cursor:pointer}
button:active{background:#39765a}
.up{grid-column:2;grid-row:1}
.left{grid-column:1;grid-row:2}
.down{grid-column:2;grid-row:2}
.right{grid-column:3;grid-row:2}
.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.actions button{font-size:15px;min-width:115px}
#message{min-height:26px;color:#c6d7cb;margin:10px 0}
.note{font-size:12px;color:#9aa9b8;line-height:1.7}
</style>
</head>
<body>
<div class="app">
<h2>🐍 ALVARIA SNAKE</h2>
<div class="stats">
 <div class="stat">النقاط<b id="score">0</b></div>
 <div class="stat">أفضل نتيجة<b id="best">0</b></div>
 <div class="stat">الطول<b id="length">3</b></div>
</div>
<canvas id="game" width="400" height="500"></canvas>
<div id="message">اجمع الفواكه 🍎 وتجنب الحائط وذيلك!</div>
<div class="controls">
 <button class="up" data-dir="up">▲</button>
 <button class="left" data-dir="left">◀</button>
 <button class="down" data-dir="down">▼</button>
 <button class="right" data-dir="right">▶</button>
</div>
<div class="actions">
 <button id="start">▶ ابدأ اللعب</button>
 <button id="pause">Ⅱ إيقاف مؤقت</button>
 <button id="restart">↻ إعادة</button>
</div>
<p class="note">يمكنك اللعب بالأزرار أو السحب على الشاشة أو أسهم لوحة المفاتيح.</p>
</div>
<script>
(()=>{
const canvas=document.getElementById('game');
const c=canvas.getContext('2d');
const scoreEl=document.getElementById('score');
const bestEl=document.getElementById('best');
const lengthEl=document.getElementById('length');
const message=document.getElementById('message');

const COLS=20,ROWS=25,SIZE=20;
let snake,food,dir,nextDir,score,best,timer,running,paused,over;
try{best=Number(localStorage.getItem('hinata_snake_best')||0)}catch(e){best=0}
bestEl.textContent=best;

function randomFood(){
 let p;
 do{
  p={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)};
 }while(snake.some(s=>s.x===p.x&&s.y===p.y));
 return p;
}

function reset(){
 clearInterval(timer);
 snake=[{x:10,y:13},{x:9,y:13},{x:8,y:13}];
 dir={x:1,y:0};
 nextDir={x:1,y:0};
 score=0;
 food=randomFood();
 running=false;
 paused=false;
 over=false;
 updateStats();
 message.textContent='اضغط ابدأ اللعب لتبدأ!';
 draw();
}

function updateStats(){
 scoreEl.textContent=score;
 bestEl.textContent=best;
 lengthEl.textContent=snake.length;
}

function draw(){
 c.fillStyle='#17231e';
 c.fillRect(0,0,canvas.width,canvas.height);

 // خلفية شبكية
 c.strokeStyle='rgba(255,255,255,.045)';
 c.lineWidth=1;
 for(let x=0;x<=COLS;x++){
  c.beginPath();c.moveTo(x*SIZE,0);c.lineTo(x*SIZE,canvas.height);c.stroke();
 }
 for(let y=0;y<=ROWS;y++){
  c.beginPath();c.moveTo(0,y*SIZE);c.lineTo(canvas.width,y*SIZE);c.stroke();
 }

 // الفاكهة
 c.font='17px Arial';
 c.textAlign='center';
 c.textBaseline='middle';
 c.fillText('🍎',food.x*SIZE+SIZE/2,food.y*SIZE+SIZE/2);

 // جسم الثعبان
 snake.forEach((part,i)=>{
  const pad=i===0?2:3;
  c.fillStyle=i===0?'#a5ffbd':'#42bd79';
  c.beginPath();
  c.roundRect(part.x*SIZE+pad,part.y*SIZE+pad,SIZE-pad*2,SIZE-pad*2,5);
  c.fill();

  if(i===0){
   c.fillStyle='#10251a';
   if(dir.x!==0){
    c.beginPath();c.arc(part.x*SIZE+10,part.y*SIZE+6,2,0,Math.PI*2);c.fill();
    c.beginPath();c.arc(part.x*SIZE+10,part.y*SIZE+14,2,0,Math.PI*2);c.fill();
   }else{
    c.beginPath();c.arc(part.x*SIZE+6,part.y*SIZE+10,2,0,Math.PI*2);c.fill();
    c.beginPath();c.arc(part.x*SIZE+14,part.y*SIZE+10,2,0,Math.PI*2);c.fill();
   }
  }
 });

 if(!running&&over){
  c.fillStyle='rgba(0,0,0,.58)';
  c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='white';
  c.font='bold 27px Arial';
  c.fillText('انتهت اللعبة!',200,225);
  c.font='16px Arial';
  c.fillText('نتيجتك: '+score,200,260);
 }
 if(paused){
  c.fillStyle='rgba(0,0,0,.5)';
  c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='white';
  c.font='bold 27px Arial';
  c.fillText('إيقاف مؤقت',200,250);
 }
}

function endGame(reason){
 clearInterval(timer);
 running=false;
 paused=false;
 over=true;
 message.textContent=reason+' نتيجتك: '+score;
 draw();
}

function step(){
 if(!running||paused||over)return;

 dir=nextDir;
 const head={
  x:snake[0].x+dir.x,
  y:snake[0].y+dir.y
 };
 const eating=head.x===food.x&&head.y===food.y;

 // اصطدام الحائط
 if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS){
  endGame('اصطدمت بالحائط!');return;
 }

 // عند عدم أكل الفاكهة يتحرك الذيل ويترك آخر خانة،
 // لذلك لا نعتبر خانة الذيل الحالية اصطداماً في هذه الحالة.
 const bodyToCheck=eating?snake:snake.slice(0,-1);
 if(bodyToCheck.some(part=>part.x===head.x&&part.y===head.y)){
  endGame('اصطدمت بذيلك!');return;
 }

 snake.unshift(head);

 if(eating){
  score+=10;
  food=randomFood();
  if(score>best){
   best=score;
   try{localStorage.setItem('hinata_snake_best',String(best))}catch(e){}
  }
 }else{
  snake.pop();
 }

 updateStats();
 draw();
}

function startGame(){
 if(over)reset();
 if(running&&!paused)return;
 paused=false;
 running=true;
 clearInterval(timer);
 timer=setInterval(step,105);
 message.textContent='اجمع الفواكه 🍎!';
 draw();
}

function pauseGame(){
 if(over||!running)return;
 paused=!paused;
 message.textContent=paused?'اللعبة متوقفة مؤقتاً':'واصل جمع الفواكه!';
 draw();
}

function changeDirection(name){
 const map={
  up:{x:0,y:-1},down:{x:0,y:1},
  left:{x:-1,y:0},right:{x:1,y:0}
 };
 const d=map[name];
 if(!d)return;
 // منع الرجوع مباشرة إلى الخلف
 if(d.x===-dir.x&&d.y===-dir.y)return;
 nextDir=d;
 if(!running&&!over)startGame();
}

document.querySelectorAll('[data-dir]').forEach(btn=>{
 btn.addEventListener('click',()=>changeDirection(btn.dataset.dir));
});

document.getElementById('start').addEventListener('click',startGame);
document.getElementById('pause').addEventListener('click',pauseGame);
document.getElementById('restart').addEventListener('click',()=>{
 reset();startGame();
});

document.addEventListener('keydown',e=>{
 const keys={
  ArrowUp:'up',w:'up',ArrowDown:'down',s:'down',
  ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right'
 };
 if(keys[e.key]){
  e.preventDefault();
  changeDirection(keys[e.key]);
 }
 if(e.key===' '){
  e.preventDefault();
  if(!running)startGame();else pauseGame();
 }
});

let touchStart=null;
canvas.addEventListener('touchstart',e=>{
 const t=e.changedTouches[0];
 touchStart={x:t.clientX,y:t.clientY};
},{passive:true});

canvas.addEventListener('touchend',e=>{
 if(!touchStart)return;
 const t=e.changedTouches[0];
 const dx=t.clientX-touchStart.x;
 const dy=t.clientY-touchStart.y;
 touchStart=null;
 if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;
 if(Math.abs(dx)>Math.abs(dy))changeDirection(dx>0?'right':'left');
 else changeDirection(dy>0?'down':'up');
},{passive:true});

reset();
})();
</script>
</body>
</html>`;

export function registerSnakeCommands(register) {
  register(
    ['ثعبان', 'snake'],
    'لعبة الثعبان الكلاسيكية: اجمع الفواكه وتجنب الحائط وذيلك',
    async (ctx) => {
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
          title: 'ALVARIA SNAKE',
          height: 900,
          device: 'android',
          fallback: 'افتح اللعبة من جهاز يدعم تطبيقات HTML داخل واتساب.',
          maxBytes: 262144,
          bypassDownload: false
        });
      } catch (error) {
        console.error('[ALVARIA SNAKE]', error);
        if (ctx.reply) {
          await ctx.reply('تعذر فتح لعبة الثعبان. تحقق من دعم HTML Apps في إصدار Baileys وzaileys.');
        }
      }
    }
  );
}
