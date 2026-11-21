import { MessageBuilder } from 'zaileys';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

function getIds(ctx) {
  const msg = ctx.message || ctx.msg || {};
  const key = msg.key || {};

  const chatValue =
    ctx.jid || ctx.chatJid || ctx.from || ctx.chat || key.remoteJid;

  const senderValue =
    ctx.senderJid || ctx.sender || ctx.participant ||
    key.participant || key.remoteJid;

  return {
    chat: typeof chatValue === 'string' ? chatValue : chatValue?.id,
    sender: typeof senderValue === 'string' ? senderValue : senderValue?.id,
    socket: ctx.sock || ctx.socket || ctx.client || ctx.conn
  };
}

async function say(ctx, text) {
  if (typeof ctx.reply === 'function') return ctx.reply(text);

  const { chat, socket } = getIds(ctx);
  if (socket?.sendMessage && chat) {
    return socket.sendMessage(chat, { text });
  }

  throw new Error('تعذر تحديد محادثة واتساب.');
}

let htmlPromise;

async function getChessHtml() {
  if (!htmlPromise) {
    htmlPromise = (async () => {
      const resolvedPath = fileURLToPath(import.meta.resolve('chess.js'));
const enginePath = resolvedPath.replace(/\/dist\/cjs\/chess\.js$/, '/dist/esm/chess.js');
if (enginePath === resolvedPath) {
  throw new Error('لم يتم العثور على مسار نسخة ESM من chess.js.');
}
      const source = await readFile(enginePath, 'utf8');

      // إزالة تصدير ESM حتى لو تبعه تعليق sourceMappingURL.
      const engine = source
        .replace(/export\s*\{[\s\S]*?\};?/g, '')
        .replace(/^\s*\/\/# sourceMappingURL=.*$/gm, '')
        .trim();

      if (!/\bclass Chess\b/.test(engine)) {
        throw new Error('لم يتم العثور على تعريف Chess داخل نسخة ESM.');
      }

      const html = `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALVARIA CHESS</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:12px;background:#10151d;color:#f5f5f5;font-family:Arial,sans-serif}
.app{max-width:560px;margin:auto}
.header{text-align:center;padding:10px}
h2{margin:4px;color:#f4d6a0}
.sub{color:#aeb8c7;font-size:13px}
.status{background:#202a38;border-radius:12px;padding:12px;text-align:center;margin:10px 0;font-weight:bold}
.board{width:100%;display:grid;grid-template-columns:repeat(8,1fr);border:3px solid #6d5139;border-radius:5px;overflow:hidden;touch-action:manipulation}
.square{border:0;padding:0;margin:0;aspect-ratio:1;position:relative;display:flex;align-items:center;justify-content:center;min-width:0}
.light{background:#f0d9b5}
.dark{background:#b58863}
.square.selected{box-shadow:inset 0 0 0 5px #facc15}
.square.target:after{content:"";position:absolute;width:23%;height:23%;border-radius:50%;background:#166534;opacity:.7}
.square.capture:after{content:"";position:absolute;inset:3px;border:4px solid #166534;border-radius:50%;opacity:.65}
.piece{font-size:clamp(27px,8vw,49px);line-height:1;z-index:1;text-shadow:0 1px 2px #555}
.white-piece{color:#fffdf4;-webkit-text-stroke:1px #282828}
.black-piece{color:#171717}
.coord{position:absolute;font-size:9px;opacity:.7;bottom:2px;right:3px;color:#222}
.controls{display:flex;gap:8px;margin:12px 0}
.controls button,.promo button{flex:1;border:0;border-radius:10px;padding:12px 6px;background:#34445b;color:white;font-weight:bold}
.controls button.primary{background:#a66b38}
.moves{background:#202a38;border-radius:10px;padding:10px;margin-top:10px;color:#d5dce7;font-size:13px;min-height:38px;word-break:break-word}
.promo{display:none;background:#263448;padding:10px;border-radius:10px;margin:10px 0}
.promo.show{display:block}
.promo-title{text-align:center;margin-bottom:8px}
.note{text-align:center;color:#9da9b8;font-size:12px;margin:12px 0}
button:disabled{opacity:.4}
</style>
</head>
<body>
<div class="app">
  <div class="header">
    <h2>🌸 ALVARIA CHESS ♟️</h2>
    <div class="sub">أنت الأبيض • HINATA الأسود</div>
  </div>

  <div id="status" class="status">دورك — اختر قطعة بيضاء</div>
  <div id="board" class="board"></div>

  <div id="promotion" class="promo">
    <div class="promo-title">اختر قطعة الترقية</div>
    <div class="controls">
      <button data-promo="q">♕ وزير</button>
      <button data-promo="r">♖ قلعة</button>
      <button data-promo="b">♗ فيل</button>
      <button data-promo="n">♘ حصان</button>
    </div>
  </div>

  <div class="controls">
    <button id="undo">↩ تراجع</button>
    <button id="restart" class="primary">⟳ مباراة جديدة</button>
  </div>

  <div id="moves" class="moves">سجل الحركات سيظهر هنا.</div>
  <div class="note">اضغط القطعة ثم مربع الوصول المضيء.</div>
</div>

<script>${engine}
window.Chess = Chess;
</script>

<script>
(function(){
  const ChessEngine = window.Chess;
  const game = new ChessEngine();

  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const movesEl = document.getElementById('moves');
  const promoEl = document.getElementById('promotion');

  const glyph = {
    K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',
    k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟︎'
  };

  const values = {p:100,n:320,b:330,r:500,q:900,k:20000};

  let selected = null;
  let pendingPromotion = [];
  let busy = false;

  function isOver(){
    return game.isGameOver();
  }

  function statusText(){
    if(game.isCheckmate()){
      return game.turn()==='w'
        ? 'انتهت المباراة — فاز ALVARIA!'
        : 'انتهت المباراة — فزت على ALVARIA!';
    }

    if(game.isDraw()) return 'انتهت المباراة بالتعادل.';

    if(busy) return 'ALVARIA يفكر في حركته...';

    return (game.turn()==='w' ? 'دورك — الأبيض' : 'دور ALVARIA — الأسود')
      + (game.isCheck() ? ' • كش!' : '');
  }

  function renderMoves(){
    const history = game.history();
    if(!history.length){
      movesEl.textContent = 'لم تبدأ الحركات بعد.';
      return;
    }

    const result = [];
    for(let i=0;i<history.length;i+=2){
      result.push(
        (Math.floor(i/2)+1)+'. '+history[i]+
        (history[i+1] ? ' '+history[i+1] : '')
      );
    }

    movesEl.textContent = result.slice(-8).join('   ');
  }

  function render(){
    const board = game.board();
    const possible = selected
      ? game.moves({square:selected,verbose:true})
      : [];

    boardEl.innerHTML = '';

    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const square = 'abcdefgh'[c] + String(8-r);
        const piece = board[r][c];

        const btn = document.createElement('button');
        btn.className = 'square ' + ((r+c)%2===0?'light':'dark');

        if(selected===square) btn.classList.add('selected');

        const target = possible.find(m=>m.to===square);
        if(target) btn.classList.add(piece?'capture':'target');

        const symbol = piece
          ? glyph[piece.color==='w'
              ? piece.type.toUpperCase()
              : piece.type]
          : '';

        btn.innerHTML =
          '<span class="piece '+(piece?.color==='w'?'white-piece':'black-piece')+'">'+
          symbol+'</span>'+
          ((r===7||c===0)
            ? '<span class="coord">'+(r===7?'abcdefgh'[c]:'')+(c===0?8-r:'')+'</span>'
            : '');

        btn.dataset.square = square;
        btn.addEventListener('click',()=>clickSquare(square));

        boardEl.appendChild(btn);
      }
    }

    statusEl.textContent = statusText();
    renderMoves();
  }

  function evaluate(){
    if(game.isCheckmate()){
      return game.turn()==='w' ? -100000 : 100000;
    }

    if(game.isDraw()) return 0;

    let score = 0;

    for(const row of game.board()){
      for(const piece of row){
        if(!piece) continue;
        const value = values[piece.type] || 0;
        score += piece.color==='w' ? value : -value;
      }
    }

    return score;
  }

  function chooseBotMove(){
    const legalMoves = game.moves({verbose:true});
    if(!legalMoves.length) return null;

    let bestScore = Infinity;
    let choices = [];

    for(const move of legalMoves){
      game.move({
        from:move.from,
        to:move.to,
        promotion:move.promotion || 'q'
      });

      let score = evaluate();

      if(!game.isGameOver()){
        let bestWhiteReply = -Infinity;
        const replies = game.moves({verbose:true});

        for(const reply of replies){
          game.move({
            from:reply.from,
            to:reply.to,
            promotion:reply.promotion || 'q'
          });

          bestWhiteReply = Math.max(bestWhiteReply,evaluate());
          game.undo();
        }

        score = bestWhiteReply;
      }

      game.undo();

      score += Math.random()*2;

      if(score<bestScore){
        bestScore=score;
        choices=[move];
      }else if(score<=bestScore+5){
        choices.push(move);
      }
    }

    return choices[Math.floor(Math.random()*choices.length)] || legalMoves[0];
  }

  function botTurn(){
    if(isOver()){
      busy=false;
      render();
      return;
    }

    const move = chooseBotMove();

    if(move){
      game.move({
        from:move.from,
        to:move.to,
        promotion:move.promotion || 'q'
      });
    }

    busy=false;
    selected=null;
    render();
  }

  function closePromotion(){
    pendingPromotion=[];
    promoEl.classList.remove('show');
  }

  function playHuman(move){
    if(busy || isOver()) return;

    game.move({
      from:move.from,
      to:move.to,
      promotion:move.promotion || 'q'
    });

    selected=null;
    closePromotion();

    if(!isOver()){
      busy=true;
      render();
      setTimeout(botTurn,300);
    }else{
      render();
    }
  }

  function showPromotion(moves){
    pendingPromotion=moves;
    promoEl.classList.add('show');

    promoEl.querySelectorAll('[data-promo]').forEach(button=>{
      button.onclick=()=>{
        const choice=pendingPromotion.find(
          m=>m.promotion===button.dataset.promo
        );
        if(choice) playHuman(choice);
      };
    });
  }

  function clickSquare(square){
    if(busy || isOver() || game.turn()!=='w') return;
    if(pendingPromotion.length) return;

    const piece = game.get(square);

    if(selected){
      const choices = game.moves({
        square:selected,
        verbose:true
      }).filter(m=>m.to===square);

      if(choices.length){
        if(choices.some(m=>m.promotion)){
          showPromotion(choices);
        }else{
          playHuman(choices[0]);
        }
        return;
      }
    }

    if(piece && piece.color==='w'){
      selected=square;
    }else{
      selected=null;
    }

    render();
  }

  document.getElementById('undo').onclick=()=>{
    if(busy) busy=false;

    if(game.history().length){
      game.undo();

      if(game.turn()==='b' && game.history().length){
        game.undo();
      }
    }

    selected=null;
    closePromotion();
    render();
  };

  document.getElementById('restart').onclick=()=>{
    game.reset();
    selected=null;
    busy=false;
    closePromotion();
    render();
  };

  render();
})();
</script>
</body>
</html>`;

      if (new TextEncoder().encode(html).length > 262144) {
        throw new Error('حجم لعبة HTML تجاوز الحد المسموح.');
      }

      return html;
    })();
  }

  return htmlPromise;
}

async function startGame(ctx) {
  const { chat, socket } = getIds(ctx);

  if (!chat || !socket?.sendMessage) {
    throw new Error('لم أجد اتصال واتساب أو المحادثة.');
  }

  const html = await getChessHtml();

  const builder = MessageBuilder.create(socket, chat);

  await builder.htmlApp(html, {
    title: 'ALVARIA CHESS',
    height: 720,
    device: 'android',
    fallback: '♟️ لعبة شطرنج ALVARIA تحتاج واتساب Android يدعم HTML Apps.',
    maxBytes: 262144,
    bypassDownload: false
  }).then(() => undefined);
}

export function registerChessCommands(register) {
  register(
    ['شطرنج'],
    'العب الشطرنج ضد ALVARIA داخل واتساب',
    async ctx => {
      try {
        await startGame(ctx);
      } catch (error) {
        console.error('[ALVARIA CHESS]', error);
        await say(ctx, 'تعذر فتح لعبة الشطرنج: ' + error.message);
      }
    },
    '♟️'
  );

  register(
    ['شطرنج_مربع'],
    'أمر قديم — الشطرنج أصبح داخل الرقعة التفاعلية',
    async ctx => {
      await say(ctx, '♟️ استخدم .شطرنج والعب مباشرة داخل الرقعة.');
    },
    '♟️'
  );
}
