import { MessageBuilder } from 'zaileys';
import { EXTRA_QUESTIONS } from './million-extra.js';

const QUESTIONS = [
  {q:'ما عاصمة المغرب؟',a:['الرباط','الدار البيضاء','فاس','مراكش'],c:0,e:'الرباط هي عاصمة المملكة المغربية.'},
  {q:'كم عدد أيام الأسبوع؟',a:['5','6','7','8'],c:2,e:'الأسبوع يتكون من سبعة أيام.'},
  {q:'ما الكوكب المعروف بالكوكب الأحمر؟',a:['الزهرة','المريخ','المشتري','عطارد'],c:1,e:'يُعرف المريخ بلونه الأحمر بسبب أكاسيد الحديد على سطحه.'},
  {q:'ما أكبر محيط على الأرض؟',a:['الأطلسي','الهندي','المتجمد الشمالي','الهادئ'],c:3,e:'المحيط الهادئ هو أكبر محيطات العالم.'},
  {q:'كم ضلعًا للمثلث؟',a:['2','3','4','5'],c:1,e:'للمثلث ثلاثة أضلاع وثلاث زوايا.'},
  {q:'ما الغاز الذي تمتصه النباتات من الهواء؟',a:['الأكسجين','النيتروجين','ثاني أكسيد الكربون','الهيدروجين'],c:2,e:'تمتص النباتات ثاني أكسيد الكربون في عملية البناء الضوئي.'},
  {q:'من رسم لوحة الموناليزا؟',a:['فان غوخ','ليوناردو دا فينشي','بيكاسو','مونيه'],c:1,e:'رسمها الفنان الإيطالي ليوناردو دا فينشي.'},
  {q:'ما العملة الرسمية لليابان؟',a:['الوون','اليوان','الين','الدولار'],c:2,e:'الين هو العملة الرسمية لليابان.'},
  {q:'ما العنصر الكيميائي الذي رمزه O؟',a:['الذهب','الأكسجين','الفضة','الحديد'],c:1,e:'الرمز O يشير إلى عنصر الأكسجين.'},
  {q:'كم عدد لاعبي فريق كرة القدم داخل الملعب؟',a:['9','10','11','12'],c:2,e:'يتكون كل فريق من أحد عشر لاعبًا داخل الملعب.'},
  {q:'ما اسم أقرب نجم إلى الأرض؟',a:['الشمس','الشعرى','النسر الواقع','سهيل'],c:0,e:'الشمس هي أقرب نجم إلى الأرض.'},
  {q:'في أي قارة تقع دولة البرازيل؟',a:['آسيا','أفريقيا','أوروبا','أمريكا الجنوبية'],c:3,e:'تقع البرازيل في قارة أمريكا الجنوبية.'},
  {q:'ما اللغة التي كُتب بها كتاب دون كيخوتة الأصلي؟',a:['الفرنسية','الإسبانية','الإيطالية','الألمانية'],c:1,e:'كتب ميغيل دي ثيربانتس روايته باللغة الإسبانية.'},
  {q:'ما العدد الأولي من بين هذه الأعداد؟',a:['21','27','29','33'],c:2,e:'العدد 29 لا يقبل القسمة إلا على 1 وعلى نفسه.'},
  {q:'ما اسم المجرة التي تقع فيها مجموعتنا الشمسية؟',a:['أندروميدا','درب التبانة','المثلث','المرأة المسلسلة'],c:1,e:'تقع مجموعتنا الشمسية في مجرة درب التبانة.'}
];

const PRIZES = [
  '100','200','300','500','1,000',
  '2,000','4,000','8,000','16,000','32,000',
  '64,000','125,000','250,000','500,000','1,000,000'
];

function connection(ctx) {
  return {
    chat: ctx.jid || ctx.chat || ctx.from || ctx.message?.key?.remoteJid,
    socket: ctx.sock || ctx.socket || ctx.client || ctx.conn
  };
}

async function startMillion(ctx) {
  const { chat, socket } = connection(ctx);

  if (!chat || !socket?.sendMessage) {
    throw new Error('تعذر تحديد اتصال واتساب أو المحادثة.');
  }

  const pool = [...QUESTIONS, ...EXTRA_QUESTIONS];

  // خلط الأسئلة ثم اختيار 15 سؤالًا مختلفًا لكل جولة.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const roundQuestions = pool.slice(0, 15);
  const questions = JSON.stringify(roundQuestions).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALVARIA MILLION</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:14px;background:#10151d;color:#fff;font-family:Arial,sans-serif}
.app{max-width:520px;margin:auto}
header{text-align:center;padding:12px}
h1{color:#f5d28c;margin:5px;font-size:25px}
.sub{color:#aeb8c7;font-size:13px}
.money{background:linear-gradient(120deg,#61401e,#a66b38);padding:15px;border-radius:14px;text-align:center;margin:10px 0}
.money small{display:block;color:#f7dfba;margin-bottom:5px}
.money strong{font-size:27px}
.progress{display:flex;gap:5px;margin:12px 0}
.dot{height:5px;flex:1;border-radius:8px;background:#34445b}
.dot.done{background:#d6a65c}
.dot.current{background:#fff0b2}
.panel{background:#202a38;border:1px solid #35445a;border-radius:15px;padding:15px;margin:12px 0}
.level{color:#e9c27d;font-size:13px;margin-bottom:10px}
.question{font-size:19px;font-weight:bold;line-height:1.7;min-height:65px}
.answers{display:grid;grid-template-columns:1fr;gap:9px;margin-top:14px}
.answer{border:1px solid #53647b;background:#29374a;color:white;border-radius:12px;padding:13px;text-align:right;font-size:15px;line-height:1.5}
.answer:disabled{opacity:.65}
.answer.correct{background:#17633d;border-color:#39b879}
.answer.wrong{background:#782e36;border-color:#e36b75}
.answer.hidden{visibility:hidden}
.lifelines{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.life{border:1px solid #a66b38;border-radius:12px;background:#342b25;color:#f5d28c;padding:12px;font-weight:bold}
.life:disabled{opacity:.35}
.feedback{display:none;padding:12px;border-radius:12px;background:#172d28;color:#a9f0c7;line-height:1.7;margin-top:12px}
.feedback.show{display:block}
.controls{display:flex;gap:9px;margin-top:12px}
.action{flex:1;border:0;border-radius:11px;padding:13px;background:#a66b38;color:white;font-weight:bold}
.action.alt{background:#34445b}
.ladder{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:12px}
.step{background:#202a38;border-radius:7px;padding:8px 2px;text-align:center;color:#aeb8c7;font-size:11px}
.step.active{background:#8d5c2d;color:#fff}
.step.safe{border:1px solid #e7bf79;color:#f5d28c}
.result{text-align:center;padding:22px;line-height:2}
.result h2{color:#f5d28c}
.audience{display:none;background:#172333;border-radius:12px;padding:12px;margin-top:10px}
.bar{display:flex;align-items:center;gap:7px;margin:8px 0;font-size:12px}
.bar span:first-child{width:25px}
.track{height:10px;background:#34445b;flex:1;border-radius:8px;overflow:hidden}
.fill{height:100%;background:#d6a65c}
.note{text-align:center;color:#98a6b8;font-size:11px;margin:15px 0}
</style>
</head>
<body>
<div class="app">
<header>
<h1>💰 من سيربح المليون؟</h1>
<div class="sub">🍁 تحدي المعلومات مع HINATA 🍁</div>
</header>
<div class="money">
<small>الجائزة الحالية</small>
<strong id="prize">0</strong>
</div>
<div class="progress" id="progress"></div>
<section class="panel" id="game">
<div class="level" id="level">السؤال 1 من 15</div>
<div class="question" id="question"></div>
<div class="answers" id="answers"></div>
<div class="feedback" id="feedback"></div>
<div class="audience" id="audience"></div>
</section>
<div class="lifelines">
<button class="life" id="half">✂️ حذف إجابتين</button>
<button class="life" id="audienceBtn">📊 رأي الجمهور</button>
</div>
<div class="controls">
<button class="action" id="next" disabled>السؤال التالي</button>
<button class="action alt" id="quit">🚪 انسحاب</button>
</div>
<div class="ladder" id="ladder"></div>
<div class="note">❄️ ALVARIA • أجب عن 15 سؤالًا للوصول إلى المليون</div>
</div>
<script>
(()=>{
'use strict';
const Q=${questions};
const prizes=${JSON.stringify(PRIZES)};
let index=0,done=false,locked=false;
let used={half:false,audience:false};
let secured=0,selected=-1,answered=false;

const $=id=>document.getElementById(id);
const letters=['أ','ب','ج','د'];

function renderProgress(){
 $('progress').innerHTML='';
 for(let i=0;i<15;i++){
  const d=document.createElement('div');
  d.className='dot'+(i<index?' done':i===index?' current':'');
  $('progress').appendChild(d);
 }
 $('ladder').innerHTML='';
 for(let i=14;i>=0;i--){
  const d=document.createElement('div');
  d.className='step'+(i===index?' active':'')+([4,9,14].includes(i)?' safe':'');
  d.textContent=prizes[i];
  $('ladder').appendChild(d);
 }
}

function render(){
 const q=Q[index];
 $('level').textContent='السؤال '+(index+1)+' من 15';
 $('question').textContent=q.q;
 $('prize').textContent=prizes[Math.max(0,index-1)]+' نقطة';
 if(index===0)$('prize').textContent='0';
 $('answers').innerHTML='';
 q.a.forEach((answer,i)=>{
  const b=document.createElement('button');
  b.className='answer';
  b.textContent=letters[i]+' — '+answer;
  b.disabled=locked||answered;
  if(selected===i)b.classList.add(i===q.c?'correct':'wrong');
  b.addEventListener('click',()=>choose(i));
  $('answers').appendChild(b);
 });
 $('feedback').className='feedback';
 $('feedback').textContent='';
 $('audience').style.display='none';
 $('next').disabled=true;
 $('next').textContent='السؤال التالي';
 $('half').disabled=used.half;
 $('audienceBtn').disabled=used.audience;
 renderProgress();
}

function finish(message,amount){
 done=true;locked=true;
 $('game').innerHTML='<div class="result"><h2>🌸 '+message+'</h2><p>رصيدك النهائي</p><h1>'+amount+' نقطة</h1><p>شكرًا لمشاركتك في تحدي ALVARIA!</p><button class="action" id="again">🔄 العب من جديد</button></div>';
 $('again').addEventListener('click',restart);
 $('next').disabled=true;
 $('quit').disabled=true;
}

function choose(i){
 if(done||locked||answered)return;
 selected=i;
 answered=true;
 const q=Q[index];
 const buttons=[...$('answers').children];
 buttons.forEach((b,n)=>{
  b.disabled=true;
  if(n===q.c)b.classList.add('correct');
  else if(n===i)b.classList.add('wrong');
 });
 if(i===q.c){
  secured=index+1;
  $('feedback').textContent='✅ إجابة صحيحة! '+q.e;
  $('feedback').className='feedback show';
  if(index===14){
   $('next').textContent='عرض النتيجة';
  }else{
   $('next').textContent='التالي';
  }
  $('next').disabled=false;
 }else{
  $('feedback').textContent='❌ إجابة غير صحيحة. '+q.e;
  $('feedback').className='feedback show';
  const amount=secured>=10?prizes[9]:secured>=5?prizes[4]:'0';
  setTimeout(()=>finish('انتهت اللعبة!',amount),1500);
 }
}

function next(){
 if(!answered||done)return;
 if(index===14){finish('🏆 مبروك! وصلت إلى المليون!',prizes[14]);return;}
 index++;
 selected=-1;
 answered=false;
 render();
}

function useHalf(){
 if(used.half||answered||done)return;
 used.half=true;
 const q=Q[index];
 const wrong=[0,1,2,3].filter(i=>i!==q.c);
 wrong.sort(()=>Math.random()-.5);
 const remove=wrong.slice(0,2);
 [...$('answers').children].forEach((b,i)=>{
  if(remove.includes(i)){b.classList.add('hidden');b.disabled=true;}
 });
 $('half').disabled=true;
}

function useAudience(){
 if(used.audience||answered||done)return;
 used.audience=true;
 const q=Q[index];
 const correct=55+Math.floor(Math.random()*36);
 let remaining=100-correct;
 const wrong=[0,1,2,3].filter(i=>i!==q.c);
 const values=[0,0,0,0];
 values[q.c]=correct;
 wrong.forEach((n,i)=>{
  values[n]=i===2?remaining:Math.floor(Math.random()*(remaining+1));
  remaining-=values[n];
 });
 $('audience').style.display='block';
 $('audience').innerHTML='<b>📊 تصويت الجمهور (تجريبي)</b>';
 values.forEach((n,i)=>{
  const row=document.createElement('div');
  row.className='bar';
  const label=document.createElement('span');
  label.textContent=letters[i];
  const track=document.createElement('div');
  track.className='track';
  const fill=document.createElement('div');
  fill.className='fill';
  fill.style.width=n+'%';
  track.appendChild(fill);
  const value=document.createElement('b');
  value.textContent=n+'%';
  row.append(label,track,value);
  $('audience').appendChild(row);
 });
 $('audienceBtn').disabled=true;
}

function quit(){
 if(done)return;
 const amount=secured>=10?prizes[9]:secured>=5?prizes[4]:'0';
 finish('اخترت الانسحاب 👏',amount);
}

function restart(){
 index=0;done=false;locked=false;used={half:false,audience:false};
 secured=0;selected=-1;answered=false;
 $('quit').disabled=false;
 render();
}

$('next').addEventListener('click',next);
$('half').addEventListener('click',useHalf);
$('audienceBtn').addEventListener('click',useAudience);
$('quit').addEventListener('click',quit);
restart();
})();
</script>
</body>
</html>`;

  const builder = MessageBuilder.create(socket, chat);
  await builder.htmlApp(html, {
    title: 'ALVARIA MILLION',
    height: 760,
    device: 'android',
    fallback: '💰 لعبة من سيربح المليون تحتاج واتساب Android يدعم HTML Apps.',
    maxBytes: 262144,
    bypassDownload: false
  });
}

export function registerMillionCommands(register) {
  register(
    ['المليون', 'من_سيربح_المليون'],
    'العب من سيربح المليون ضد ALVARIA',
    async ctx => {
      try {
        await startMillion(ctx);
      } catch (error) {
        console.error('[ALVARIA MILLION]', error);
        const { chat, socket } = connection(ctx);
        const message = 'تعذر فتح لعبة المليون: ' + error.message;
        if (typeof ctx.reply === 'function') {
          await ctx.reply(message);
        } else if (chat && socket?.sendMessage) {
          await socket.sendMessage(chat, { text: message });
        }
      }
    },
    '💰'
  );
}
