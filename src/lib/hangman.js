import { MessageBuilder } from 'zaileys';

function getConnection(ctx) {
  return {
    chat: ctx.jid || ctx.chat || ctx.from || ctx.message?.key?.remoteJid,
    socket: ctx.sock || ctx.socket || ctx.client || ctx.conn
  };
}

async function startHangman(ctx) {
  const { chat, socket } = getConnection(ctx);

  if (!chat || !socket?.sendMessage) {
    throw new Error('تعذر تحديد اتصال واتساب أو المحادثة.');
  }

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALVARIA Hangman</title>
<style>
*{box-sizing:border-box}
html{
 min-height:100%;
 overflow-x:hidden;
 overflow-y:auto;
}
body{
 margin:0;
 padding:10px 12px 30px;
 min-height:100vh;
 background:#10151d;
 color:#fff;
 font-family:Arial,sans-serif;
 text-align:center;
 overflow-x:hidden;
 overflow-y:auto;
 -webkit-overflow-scrolling:touch;
}
.app{
 width:100%;
 max-width:440px;
 margin:0 auto;
 padding-bottom:20px;
}
h1{color:#f4d6a0;margin:8px 0}
.sub{color:#aeb8c7;font-size:13px;margin-bottom:14px}
.panel{background:#202a38;border:1px solid #34445b;border-radius:15px;padding:14px;margin:12px 0}
.status{font-weight:bold;font-size:16px;min-height:24px}
.drawing{width:155px;height:155px;max-width:65%;margin:3px auto;display:block}
.gallows{fill:none;stroke:#d8b58a;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.person{fill:none;stroke:#f2b36e;stroke-width:5;stroke-linecap:round}
.word{direction:rtl;display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin:18px 0}
.letter{width:30px;height:43px;border-bottom:3px solid #f2b36e;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold}
.keyboard{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:12px 0 18px;width:100%}
.key{width:100%;min-width:0;min-height:40px;padding:5px 1px;border:1px solid #45546a;border-radius:9px;background:#29374a;color:#fff;font-size:18px;font-weight:bold;touch-action:manipulation}
.key:disabled{opacity:.35}
.key.good{background:#236b4b;border-color:#368c65}
.key.bad{background:#713b3b;border-color:#a65b5b}
.controls{display:flex;gap:9px;margin-top:14px;margin-bottom:12px;width:100%}
button.action{flex:1;padding:13px 8px;border:0;border-radius:12px;background:#a66b38;color:white;font-weight:bold;font-size:15px}
button.action.secondary{background:#34445b}
.info{display:flex;justify-content:space-around;gap:8px;color:#d8dfea;font-size:13px}
.info b{display:block;font-size:20px;color:#f4d6a0;margin-top:5px}
.note{color:#aeb8c7;font-size:12px;margin-top:16px}
</style>
</head>
<body>
<div class="app">
<h1>🌸 ALVARIA المشنقة</h1>
<div class="sub">🎯 اكتشف الكلمة قبل انتهاء المحاولات</div>

<div class="panel">
<div class="status" id="status">اختر حرفًا لتبدأ!</div>
<svg class="drawing" viewBox="0 0 200 200" aria-label="رسم المشنقة">
<g class="gallows">
<path d="M25 180 H145 M55 180 V20 H135 V40"/>
</g>
<circle id="head" class="person" cx="135" cy="57" r="17" style="display:none"/>
<path id="body" class="person" d="M135 75 V125" style="display:none"/>
<path id="leftArm" class="person" d="M135 88 L110 110" style="display:none"/>
<path id="rightArm" class="person" d="M135 88 L160 110" style="display:none"/>
<path id="leftLeg" class="person" d="M135 125 L112 155" style="display:none"/>
<path id="rightLeg" class="person" d="M135 125 L158 155" style="display:none"/>
</svg>
<div class="info">
<div>الأخطاء<b id="mistakes">0 / 6</b></div>
<div>الحروف المتبقية<b id="remaining">—</b></div>
</div>
</div>

<div class="panel">
<div style="color:#aeb8c7;font-size:13px">الكلمة المخفية</div>
<div class="word" id="word"></div>
</div>

<div class="panel">
<div style="margin-bottom:10px;color:#f4d6a0;font-weight:bold">اختر حرفًا</div>
<div class="keyboard" id="keyboard"></div>
</div>

<div class="controls">
<button class="action" id="restart">🔄 جولة جديدة</button>
<button class="action secondary" id="reveal">💡 كشف الكلمة</button>
</div>

<div class="note">🍁 ALVARIA • كل اختيار صحيح يقرّبك من الفوز</div>
</div>

<script>
(()=>{
'use strict';

const words=[
'مدرسة','حاسوب','هاتف','كتاب','قمر','شمس','نجوم','بحر','جبل','حديقة',
'زهرة','وردة','تفاح','موز','برتقال','سيارة','طائرة','قطار','مدينة','قرية',
'مكتبة','مستشفى','طبيب','معلم','تلميذ','صديق','عائلة','سعادة','مغامرة','رياضة',
'كرة','سباحة','رسم','موسيقى','قصة','سفينة','نافذة','مصباح','مفتاح','ساعة',
'وسادة','طاولة','كرسي','باب','سماء','مطر','ثلج','رياح','غابة','صحراء',
'فراشة','نحلة','حصان','أسد','نمر','فيل','زرافة','أرنب','دجاجة','سلحفاة'
];

const letters=Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي');
const wordEl=document.getElementById('word');
const keyboardEl=document.getElementById('keyboard');
const statusEl=document.getElementById('status');
const mistakesEl=document.getElementById('mistakes');
const remainingEl=document.getElementById('remaining');

const parts=['head','body','leftArm','rightArm','leftLeg','rightLeg'];

let word='';
let guessed=[];
let mistakes=0;
let finished=false;

function normalize(ch){
 return ch
  .replace(/[أإآٱ]/g,'ا')
  .replace(/ة/g,'ه')
  .replace(/ى/g,'ي')
  .replace(/ؤ/g,'و')
  .replace(/ئ/g,'ي');
}

function newGame(){
 word=words[Math.floor(Math.random()*words.length)];
 guessed=[];
 mistakes=0;
 finished=false;
 statusEl.textContent='اختر حرفًا لتبدأ!';
 render();
}

function won(){
 return Array.from(word).every(ch=>
  guessed.includes(normalize(ch))
 );
}

function finish(message){
 finished=true;
 statusEl.textContent=message+' الكلمة: '+word;
 render();
}

function choose(letter){
 if(finished||guessed.includes(letter))return;

 guessed.push(letter);

 const exists=Array.from(word).some(ch=>
  normalize(ch)===letter
 );

 if(!exists){
  mistakes++;
 }

 if(won()){
  finish('🎉 أحسنت! لقد فزت!');
  return;
 }

 if(mistakes>=6){
  finish('😅 انتهت المحاولات!');
  return;
 }

 statusEl.textContent=exists?'✅ حرف صحيح، واصل!':'❌ حرف غير موجود، حاول مجددًا.';
 render();
}

function renderWord(){
 wordEl.innerHTML='';
 Array.from(word).forEach(ch=>{
  const cell=document.createElement('div');
  cell.className='letter';
  cell.textContent=guessed.includes(normalize(ch))||finished?ch:'';
  wordEl.appendChild(cell);
 });
}

function renderKeyboard(){
 keyboardEl.innerHTML='';

 letters.forEach(letter=>{
  const btn=document.createElement('button');
  btn.className='key';
  btn.textContent=letter;
  btn.disabled=finished||guessed.includes(letter);

  if(guessed.includes(letter)){
   const exists=Array.from(word).some(ch=>normalize(ch)===letter);
   btn.classList.add(exists?'good':'bad');
  }

  btn.addEventListener('click',()=>choose(letter));
  keyboardEl.appendChild(btn);
 });
}

function renderDrawing(){
 parts.forEach((id,index)=>{
  document.getElementById(id).style.display=
   mistakes>index?'':'none';
 });
}

function render(){
 renderWord();
 renderKeyboard();
 renderDrawing();
 mistakesEl.textContent=mistakes+' / 6';
 remainingEl.textContent=finished?'0':String(6-mistakes);
}

document.getElementById('restart').addEventListener('click',newGame);

document.getElementById('reveal').addEventListener('click',()=>{
 if(finished)return;
 finish('💡 تم كشف الكلمة!');
});

newGame();
})();
</script>
</body>
</html>`;

  const builder = MessageBuilder.create(socket, chat);

  await builder.htmlApp(html, {
    title: 'ALVARIA المشنقة',
    height: 900,
    device: 'android',
    fallback: '🌸 لعبة المشنقة تحتاج واتساب Android يدعم HTML Apps.',
    maxBytes: 262144,
    bypassDownload: false
  });
}

export function registerHangmanCommands(register) {
  register(
    ['المشنقة', 'شنق', 'hangman'],
    'العب لعبة المشنقة بالحروف العربية',
    async ctx => {
      try {
        await startHangman(ctx);
      } catch (error) {
        console.error('[ALVARIA HANGMAN]', error);
        const message = 'تعذر فتح لعبة المشنقة: ' + error.message;

        if (typeof ctx.reply === 'function') {
          await ctx.reply(message);
        } else {
          const { chat, socket } = getConnection(ctx);
          if (chat && socket?.sendMessage) {
            await socket.sendMessage(chat, { text: message });
          }
        }
      }
    },
    '🎯'
  );
}
