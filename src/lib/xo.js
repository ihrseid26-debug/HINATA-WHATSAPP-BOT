import { MessageBuilder } from 'zaileys';

function getConnection(ctx) {
  return {
    chat: ctx.jid || ctx.chat || ctx.from || ctx.message?.key?.remoteJid,
    socket: ctx.sock || ctx.socket || ctx.client || ctx.conn
  };
}

async function startXO(ctx) {
  const { chat, socket } = getConnection(ctx);

  if (!chat || !socket?.sendMessage) {
    throw new Error('تعذر تحديد اتصال واتساب أو المحادثة.');
  }

  const html = `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALVARIA XO</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:18px;background:#10151d;color:#fff;font-family:Arial,sans-serif;text-align:center}
.app{max-width:430px;margin:auto}
h1{color:#f4d6a0;margin:8px 0}
.sub{color:#aeb8c7;font-size:13px;margin-bottom:18px}
.status{background:#202a38;border-radius:13px;padding:14px;margin:12px 0;font-weight:bold}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:18px auto;max-width:350px}
.cell{aspect-ratio:1;border:2px solid #45546a;border-radius:15px;background:#202a38;color:white;font-size:clamp(48px,15vw,75px);font-weight:bold;display:flex;align-items:center;justify-content:center}
.cell:disabled{opacity:1}
.x{color:#f2b36e}
.o{color:#83c8ff}
.controls{display:flex;gap:10px;margin-top:15px}
button.action{flex:1;padding:14px 8px;border:0;border-radius:12px;background:#a66b38;color:white;font-weight:bold;font-size:15px}
button.action.secondary{background:#34445b}
.score{display:flex;justify-content:space-around;background:#202a38;border-radius:12px;padding:13px;margin-top:14px}
.score b{display:block;font-size:22px;margin-top:5px}
.note{color:#aeb8c7;font-size:12px;margin-top:18px}
</style>
</head>
<body>
<div class="app">
<h1>🌸 ALVARIA XO</h1>
<div class="sub">❎ أنت ضد ⭕ ALVARIA</div>
<div class="status" id="status">دورك الآن — اختر مربعًا!</div>
<div class="board" id="board"></div>
<div class="score">
<div>انتصاراتك<b id="wins">0</b></div>
<div>تعادلات<b id="draws">0</b></div>
<div>انتصارات ALVARIA<b id="losses">0</b></div>
</div>
<div class="controls">
<button class="action" id="restart">🔄 جولة جديدة</button>
<button class="action secondary" id="reset">♻️ تصفير النتائج</button>
</div>
<div class="note">🍁 ALVARIA • اختر مربعًا فارغًا لتبدأ اللعب</div>
</div>
<script>
(()=>{
'use strict';

const boardEl=document.getElementById('board');
const statusEl=document.getElementById('status');
const winsEl=document.getElementById('wins');
const drawsEl=document.getElementById('draws');
const lossesEl=document.getElementById('losses');

let board=Array(9).fill('');
let finished=false;
let thinking=false;
let score={wins:0,draws:0,losses:0};

const lines=[
[0,1,2],[3,4,5],[6,7,8],
[0,3,6],[1,4,7],[2,5,8],
[0,4,8],[2,4,6]
];

function winner(b){
 for(const line of lines){
  const [a,c,d]=line;
  if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];
 }
 return b.every(Boolean)?'draw':null;
}

function minimax(b,isBot,depth){
 const result=winner(b);
 if(result==='O')return 10-depth;
 if(result==='X')return depth-10;
 if(result==='draw')return 0;

 let best=isBot?-Infinity:Infinity;

 for(let i=0;i<9;i++){
  if(b[i])continue;
  b[i]=isBot?'O':'X';
  const value=minimax(b,!isBot,depth+1);
  b[i]='';
  best=isBot?Math.max(best,value):Math.min(best,value);
 }
 return best;
}

function bestMove(){
 let best=-Infinity;
 let choices=[];
 for(let i=0;i<9;i++){
  if(board[i])continue;
  board[i]='O';
  const value=minimax(board,false,0);
  board[i]='';
  if(value>best){best=value;choices=[i];}
  else if(value===best)choices.push(i);
 }
 return choices[Math.floor(Math.random()*choices.length)];
}

function render(){
 boardEl.innerHTML='';
 board.forEach((value,i)=>{
  const button=document.createElement('button');
  button.className='cell '+(value==='X'?'x':value==='O'?'o':'');
  button.textContent=value==='X'?'❎':value==='O'?'⭕':'';
  button.disabled=!!value||finished||thinking;
  button.setAttribute('aria-label','المربع '+(i+1));
  button.addEventListener('click',()=>play(i));
  boardEl.appendChild(button);
 });
 winsEl.textContent=score.wins;
 drawsEl.textContent=score.draws;
 lossesEl.textContent=score.losses;
}

function finish(result){
 finished=true;
 if(result==='X'){
  score.wins++;
  statusEl.textContent='🎉 فزت على ALVARIA!';
 }else if(result==='O'){
  score.losses++;
  statusEl.textContent='🌸 فازت ALVARIA هذه المرة!';
 }else{
  score.draws++;
  statusEl.textContent='🤝 تعادل! مباراة جميلة.';
 }
 render();
}

function play(index){
 if(finished||thinking||board[index])return;

 board[index]='X';
 render();

 let result=winner(board);
 if(result){finish(result);return;}

 thinking=true;
 statusEl.textContent='🌸 ALVARIA تفكر...';
 render();

 setTimeout(()=>{
  const move=bestMove();
  if(move!==undefined)board[move]='O';
  thinking=false;

  result=winner(board);
  if(result){finish(result);return;}

  statusEl.textContent='دورك الآن — اختر مربعًا!';
  render();
 },350);
}

function newGame(){
 board=Array(9).fill('');
 finished=false;
 thinking=false;
 statusEl.textContent='دورك الآن — اختر مربعًا!';
 render();
}

document.getElementById('restart').addEventListener('click',newGame);
document.getElementById('reset').addEventListener('click',()=>{
 score={wins:0,draws:0,losses:0};
 newGame();
});

newGame();
})();
</script>
</body>
</html>`;

  const builder = MessageBuilder.create(socket, chat);

  await builder.htmlApp(html, {
    title: 'ALVARIA XO',
    height: 720,
    device: 'android',
    fallback: '🌸 لعبة XO تحتاج واتساب Android يدعم HTML Apps.',
    maxBytes: 262144,
    bypassDownload: false
  });
}

export function registerXOCommands(register) {
  register(
    ['xo', 'اكس_او'],
    'العب XO ضد ALVARIA',
    async ctx => {
      try {
        await startXO(ctx);
      } catch (error) {
        console.error('[ALVARIA XO]', error);
        const message = 'تعذر فتح لعبة XO: ' + error.message;
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
    '❎'
  );
}
