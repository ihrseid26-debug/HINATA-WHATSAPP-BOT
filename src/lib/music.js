import { MessageBuilder } from 'zaileys';

const HTML = String.raw`<!doctype html>
<html lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALVARIA MUSIC</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0d120e;color:#f4f7f2;font-family:Arial,sans-serif}
.app{max-width:650px;margin:auto;padding:17px 14px 190px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.logo{width:48px;height:48px;border-radius:15px;background:#1ed760;color:#071b0c;display:grid;place-items:center;font-size:27px;font-weight:bold}
.brand h2{margin:0;font-size:20px;letter-spacing:1px}
.brand small{color:#9cab9e}
.search{display:flex;gap:8px;background:#253128;padding:7px;border-radius:14px}
input{min-width:0;flex:1;background:transparent;border:0;outline:0;color:white;padding:10px;font-size:15px}
button{border:0;border-radius:12px;background:#1ed760;color:#09200e;padding:11px 15px;font-weight:bold;cursor:pointer}
button:active{opacity:.75}
h3{font-size:17px;margin:23px 0 12px}
.categories{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}
.categories button{white-space:nowrap;background:#29342c;color:#eaf4eb}
.categories button.active{background:#1ed760;color:#09200e}
.results{display:grid;gap:9px}
.track{display:flex;align-items:center;gap:10px;padding:9px;background:#1b241d;border-radius:13px}
.cover{width:58px;height:58px;border-radius:9px;object-fit:cover;background:#344237;flex-shrink:0}
.info{min-width:0;flex:1;text-align:right}
.info b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.info small{display:block;color:#9eaaa0;margin-top:6px;font-size:11px}
.track button{padding:9px 11px;font-size:13px}
.track .fav{background:#303c32;color:white}
.empty{text-align:center;color:#aab6ac;padding:22px 10px;font-size:14px;line-height:1.8}
#status{font-size:12px;color:#a8b9aa;min-height:22px;margin:10px 0}
.player{position:fixed;z-index:5;bottom:0;left:0;right:0;background:rgba(16,25,18,.97);border-top:1px solid #334638;padding:12px max(14px,env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom));backdrop-filter:blur(15px)}
.player-inner{max-width:620px;margin:auto}
.now{display:flex;align-items:center;gap:12px}
#art{width:58px;height:58px;border-radius:10px;object-fit:cover;background:#27362b}
.now-info{min-width:0;flex:1;text-align:right}
#nowTitle{font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
#nowArtist{color:#a9b5aa;font-size:12px;margin-top:5px}
#likeCurrent{background:#26352a;color:white;padding:9px}
.progress{display:flex;align-items:center;gap:8px;margin-top:12px;color:#b8c3b9;font-size:10px}
input[type=range]{padding:0;accent-color:#1ed760;min-width:0}
#seek{flex:1}
.controls{display:flex;align-items:center;justify-content:center;gap:20px;margin:8px 0}
.controls button{background:transparent;color:white;font-size:21px;padding:5px 10px}
.controls #playPause{background:#1ed760;color:#09200e;width:44px;height:44px;border-radius:50%;font-size:18px}
.volume{display:flex;align-items:center;gap:8px;color:#aab6ac;font-size:12px}
#volume{width:100px}
.license{font-size:10px;color:#819083;margin-top:8px;line-height:1.5}
footer{text-align:center;color:#728276;font-size:11px;margin-top:25px}
</style>
</head>
<body>
<div class="app">
 <div class="brand">
  <div class="logo">♫</div>
  <div><h2>ALVARIA MUSIC</h2><small>Your music space 🍹</small></div>
 </div>

 <div class="search">
  <input id="query" placeholder="ابحث عن أغنية أو فنان..." autocomplete="off">
  <button id="searchBtn">بحث</button>
 </div>

 <h3>اكتشف الموسيقى</h3>
 <div class="categories" id="categories">
  <button class="active" data-q="classical music">🎼 كلاسيكي</button>
  <button data-q="jazz music">🎷 Jazz</button>
  <button data-q="ambient music">🌙 هادئ</button>
  <button data-q="folk music">🪕 Folk</button>
  <button data-q="blues music">🎸 Blues</button>
  <button data-q="world music">🌍 عالمي</button>
 </div>

 <h3 id="resultTitle">🎵 مكتبة الموسيقى المفتوحة</h3>
 <div id="results" class="results">
  <div class="empty">ابحث عن تسجيل أو اختر تصنيفًا للبدء.</div>
 </div>
 <div id="status"></div>

 <h3>❤️ المفضلة</h3>
 <div id="favorites" class="results">
  <div class="empty">لم تضف أغاني إلى المفضلة بعد.</div>
 </div>

 <p class="license">
  يتم تشغيل التسجيلات داخل هذا التطبيق من Internet Archive.
  تظهر التسجيلات التي تحمل تراخيص مفتوحة محددة فقط، مع بيانات النسبة إلى أصحابها.
 </p>
 <footer>ALVARIA MUSIC • Made with 🍹</footer>
</div>

<div class="player">
 <div class="player-inner">
  <div class="now">
   <img id="art" src="https://archive.org/images/notfound.png" alt="Album cover">
   <div class="now-info">
    <div id="nowTitle">اختر أغنية للاستماع</div>
    <div id="nowArtist">ALVARIA MUSIC</div>
   </div>
   <button id="likeCurrent">♡</button>
  </div>

  <audio id="audio" preload="none"></audio>

  <div class="progress">
   <span id="currentTime">0:00</span>
   <input id="seek" type="range" min="0" max="1000" value="0">
   <span id="duration">0:00</span>
  </div>

  <div class="controls">
   <button id="previous" title="Previous">⏮</button>
   <button id="playPause" title="Play">▶</button>
   <button id="next" title="Next">⏭</button>
  </div>

  <div class="volume">
   <span>🔈 الصوت</span>
   <input id="volume" type="range" min="0" max="1" step="0.01" value="0.85">
   <span id="playerStatus">جاهز</span>
  </div>
 </div>
</div>

<script>
(()=>{
const $=id=>document.getElementById(id);
const audio=$('audio');

let tracks=[];
let currentIndex=-1;
let currentTrack=null;
let favorites=[];

try{
 favorites=JSON.parse(localStorage.getItem('hinata_music_favorites')||'[]');
 if(!Array.isArray(favorites))favorites=[];
}catch(e){favorites=[]}

const ALLOWED_LICENSES=[
 'creativecommons.org/publicdomain/zero/1.0',
 'creativecommons.org/publicdomain/mark/1.0',
 'creativecommons.org/licenses/cc0/1.0',
 'creativecommons.org/licenses/by/4.0',
 'creativecommons.org/licenses/by-sa/4.0',
 'creativecommons.org/licenses/by/3.0',
 'creativecommons.org/licenses/by-sa/3.0',
 'creativecommons.org/licenses/by/2.5',
 'creativecommons.org/licenses/by-sa/2.5'
];

function clean(value){
 return String(value||'').replace(/[<>]/g,'').trim().slice(0,180);
}

function firstValue(value){
 if(Array.isArray(value))return value.length?String(value[0]):'';
 return value?String(value):'';
}

function allowedLicense(value){
 const license=String(value||'').toLowerCase();
 return ALLOWED_LICENSES.some(x=>license.includes(x));
}

function licenseName(value){
 const x=String(value||'').toLowerCase();
 if(x.includes('/publicdomain/zero/')||x.includes('/licenses/cc0/'))return 'CC0';
 if(x.includes('/publicdomain/mark/'))return 'Public Domain Mark';
 if(x.includes('/by-sa/'))return 'CC BY-SA';
 if(x.includes('/by/'))return 'CC BY';
 return 'Open license';
}

function formatTime(value){
 if(!Number.isFinite(value)||value<0)return '0:00';
 const m=Math.floor(value/60);
 const s=Math.floor(value%60);
 return m+':'+String(s).padStart(2,'0');
}

function setStatus(text){
 $('status').textContent=text;
 $('playerStatus').textContent=text;
}

function isFavorite(track){
 return favorites.some(x=>x.url===track.url);
}

function saveFavorites(){
 try{
  localStorage.setItem('hinata_music_favorites',JSON.stringify(favorites));
 }catch(e){}
}

function toggleFavorite(track){
 if(!track)return;
 if(isFavorite(track)){
  favorites=favorites.filter(x=>x.url!==track.url);
 }else{
  favorites.unshift(track);
 }
 saveFavorites();
 renderFavorites();
 renderTracks();
 updateCurrentLike();
}

function updateCurrentLike(){
 $('likeCurrent').textContent=currentTrack&&isFavorite(currentTrack)?'♥':'♡';
}

function makeRow(track){
 const row=document.createElement('div');
 row.className='track';

 const img=document.createElement('img');
 img.className='cover';
 img.src=track.cover;
 img.alt='غلاف التسجيل';
 img.loading='lazy';

 const info=document.createElement('div');
 info.className='info';

 const title=document.createElement('b');
 title.textContent=track.title;

 const artist=document.createElement('small');
 artist.textContent=track.artist+' • '+track.license;

 info.append(title,artist);

 const fav=document.createElement('button');
 fav.className='fav';
 fav.textContent=isFavorite(track)?'♥':'♡';
 fav.onclick=()=>toggleFavorite(track);

 const play=document.createElement('button');
 play.textContent='▶';
 play.onclick=()=>playTrack(track);

 row.append(img,info,fav,play);
 return row;
}

function renderTracks(){
 const root=$('results');
 root.innerHTML='';
 if(!tracks.length){
  root.innerHTML='<div class="empty">لم نعثر على تسجيلات متاحة بهذا البحث. جرّب كلمة أخرى.</div>';
  return;
 }
 tracks.forEach(track=>root.append(makeRow(track)));
}

function renderFavorites(){
 const root=$('favorites');
 root.innerHTML='';
 if(!favorites.length){
  root.innerHTML='<div class="empty">لم تضف أي تسجيل إلى المفضلة بعد.</div>';
  return;
 }
 favorites.forEach(track=>root.append(makeRow(track)));
}

function playTrack(track){
 const index=tracks.findIndex(x=>x.url===track.url);
 if(index>=0)currentIndex=index;
 else currentIndex=-1;

 currentTrack=track;
 $('art').src=track.cover;
 $('nowTitle').textContent=track.title;
 $('nowArtist').textContent=track.artist+' • '+track.license;
 updateCurrentLike();

 if(audio.src!==track.url){
  audio.src=track.url;
  audio.load();
 }
 audio.play().then(()=>{
  $('playPause').textContent='Ⅱ';
  setStatus('يتم التشغيل داخل ALVARIA MUSIC');
 }).catch(()=>{
  $('playPause').textContent='▶';
  setStatus('تعذر التشغيل تلقائيًا. اضغط زر التشغيل مرة أخرى.');
 });
}

function playAt(index){
 if(index<0||index>=tracks.length)return;
 playTrack(tracks[index]);
}

function nextTrack(){
 if(!tracks.length)return;
 let next=currentIndex+1;
 if(next>=tracks.length)next=0;
 playAt(next);
}

function previousTrack(){
 if(!tracks.length)return;
 if(audio.currentTime>3){
  audio.currentTime=0;
  return;
 }
 let previous=currentIndex-1;
 if(previous<0)previous=tracks.length-1;
 playAt(previous);
}

function stopPlayback(){
 audio.pause();
 audio.removeAttribute('src');
 audio.load();
 currentTrack=null;
 currentIndex=-1;
 $('art').src='https://archive.org/images/notfound.png';
 $('nowTitle').textContent='اختر أغنية للاستماع';
 $('nowArtist').textContent='ALVARIA MUSIC';
 $('playPause').textContent='▶';
 updateCurrentLike();
 setStatus('تم إيقاف التشغيل');
}

function audioFile(file){
 const name=String(file.name||'');
 const ext=name.split('.').pop().toLowerCase();
 return ['mp3','ogg','oga','opus','flac','wav','m4a'].includes(ext);
}

async function getItemTracks(doc){
 const id=String(doc.identifier||'');
 if(!id)return [];

 const url='https://archive.org/metadata/'+encodeURIComponent(id);
 const response=await fetch(url,{
  method:'GET',
  mode:'cors',
  credentials:'omit',
  cache:'no-store',
  redirect:'follow'
 });

 if(!response.ok)throw Error('Metadata HTTP '+response.status);

 const data=await response.json();
 if(!data||!data.metadata)return [];

 const metadata=data.metadata;
 const license=firstValue(metadata.licenseurl)||firstValue(doc.licenseurl);


 const creator=firstValue(metadata.creator)||firstValue(doc.creator)||'فنان غير محدد';
 const title=firstValue(metadata.title)||firstValue(doc.title)||id;
 const cover='https://archive.org/services/img/'+encodeURIComponent(id);

 const files=(data.files||[])
  .filter(file=>file&&file.name&&audioFile(file))
  .filter(file=>file.source!=='metadata')
  .filter(file=>!String(file.name).toLowerCase().includes('_thumb'))
  .sort((a,b)=>{
   const rank=name=>{
    const n=String(name).toLowerCase();
    if(n.endsWith('.mp3'))return 0;
    if(n.endsWith('.ogg')||n.endsWith('.oga'))return 1;
    if(n.endsWith('.m4a'))return 2;
    if(n.endsWith('.flac'))return 3;
    return 4;
   };
   return rank(a.name)-rank(b.name);
  });

 return files.slice(0,5).map(file=>{
  const fileUrl='https://archive.org/download/'+encodeURIComponent(id)+'/'+encodeURIComponent(file.name);
  return {
   id:id,
   title:clean(files.length>1?String(file.name).replace(/\.[^.]+$/,''):title),
   artist:clean(creator),
   cover:cover,
   url:fileUrl,
   license:licenseName(license),
   licenseUrl:license,
   itemUrl:'https://archive.org/details/'+encodeURIComponent(id)
  };
 });
}

function escapeLucene(value){
 return String(value)
  .replace(/\\/g,' ')
  .replace(/["{}[\]^~*?:!()+-]/g,' ')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,90);
}

async function search(query){
 query=clean(query);
 if(!query)return;

 $('query').value=query;
 $('resultTitle').textContent='نتائج البحث: '+query;
 $('results').innerHTML='<div class="empty">🔎 جاري البحث عن تسجيلات مفتوحة...</div>';
 tracks=[];
 renderTracks();
 setStatus('البحث في مكتبة الصوت المفتوحة...');

 const term=escapeLucene(query);
 if(!term){
  setStatus('اكتب كلمة بحث صحيحة.');
  return;
 }

 const lucene='mediatype:audio AND (title:"'+term+'" OR creator:"'+term+'" OR subject:"'+term+'")';

 const params=new URLSearchParams();
 params.set('q',lucene);
 params.append('fl[]','identifier');
 params.append('fl[]','title');
 params.append('fl[]','creator');
 params.set('rows','12');
 params.set('output','json');
 params.append('sort[]','downloads desc');

 try{
  const url='https://archive.org/advancedsearch.php?'+params.toString();

  const response=await fetch(url,{
   method:'GET',
   mode:'cors',
   credentials:'omit',
   cache:'no-store',
   redirect:'follow'
  });

  if(!response.ok){
   throw Error('Search HTTP '+response.status);
  }

  const data=await response.json();
  const docs=data&&data.response&&Array.isArray(data.response.docs)
   ?data.response.docs:[];

  if(!docs.length){
   $('results').innerHTML='<div class="empty">لا توجد نتائج بهذا الاسم. جرّب تصنيفًا آخر.</div>';
   setStatus('لم يتم العثور على نتائج.');
   return;
  }

  const selected=docs.slice(0,8);
  const batches=await Promise.allSettled(
   selected.map(doc=>getItemTracks(doc))
  );

  const found=[];
  const failures=[];

  batches.forEach((result,index)=>{
   if(result.status==='fulfilled'){
    found.push(...result.value);
   }else{
    failures.push({
     item:selected[index]?.identifier||'unknown',
     error:String(result.reason?.message||result.reason)
    });
    console.error('[ALVARIA MUSIC ITEM]',failures[failures.length-1]);
   }
  });

  tracks=found.slice(0,35);
  renderTracks();

  if(tracks.length){
   setStatus('تم العثور على '+tracks.length+' تسجيل متاح.');
  }else{
   $('results').innerHTML='<div class="empty">وجدنا عناصر، لكن لم نعثر على ملفات صوتية تحمل أحد التراخيص المفتوحة المدعومة.</div>';
   setStatus('لم نعثر على تسجيلات متاحة ضمن التراخيص المدعومة.');
  }

 }catch(error){
  console.error('[ALVARIA MUSIC SEARCH]',error);

  const detail=String(error?.name||'Error')+': '+String(error?.message||error);

  $('results').innerHTML=
   '<div class="empty">تعذر تحميل نتائج البحث. '+clean(detail)+'</div>';

  setStatus('فشل الاتصال بواجهة البحث.');
 }
}

$('searchBtn').onclick=()=>search($('query').value);

$('query').addEventListener('keydown',event=>{
 event.stopPropagation();
 if(event.key==='Enter'){
  event.preventDefault();
  search($('query').value);
 }
});

document.querySelectorAll('[data-q]').forEach(button=>{
 button.onclick=()=>{
  document.querySelectorAll('[data-q]').forEach(x=>x.classList.remove('active'));
  button.classList.add('active');
  search(button.dataset.q);
 };
});

$('playPause').onclick=()=>{
 if(!currentTrack){
  if(tracks.length)playAt(0);
  else setStatus('ابحث عن تسجيل أولًا.');
  return;
 }
 if(audio.paused){
  audio.play().then(()=>{
   $('playPause').textContent='Ⅱ';
  }).catch(()=>setStatus('تعذر تشغيل التسجيل.'));
 }else{
  audio.pause();
  $('playPause').textContent='▶';
 }
};

$('next').onclick=nextTrack;
$('previous').onclick=previousTrack;
$('likeCurrent').onclick=()=>toggleFavorite(currentTrack);

$('volume').oninput=()=>{
 audio.volume=Number($('volume').value);
};
audio.volume=0.85;

audio.addEventListener('play',()=>{
 $('playPause').textContent='Ⅱ';
});
audio.addEventListener('pause',()=>{
 $('playPause').textContent='▶';
});
audio.addEventListener('ended',nextTrack);

audio.addEventListener('timeupdate',()=>{
 if(!Number.isFinite(audio.duration)||audio.duration<=0)return;
 $('seek').value=String(Math.floor(audio.currentTime/audio.duration*1000));
 $('currentTime').textContent=formatTime(audio.currentTime);
 $('duration').textContent=formatTime(audio.duration);
});

audio.addEventListener('loadedmetadata',()=>{
 $('duration').textContent=formatTime(audio.duration);
});

audio.addEventListener('error',()=>{
 if(currentTrack)setStatus('هذا الملف غير متاح للتشغيل. جرّب تسجيلًا آخر.');
});

$('seek').oninput=()=>{
 if(Number.isFinite(audio.duration)&&audio.duration>0){
  audio.currentTime=(Number($('seek').value)/1000)*audio.duration;
 }
};

renderFavorites();
})();
</script>
</body>
</html>`;

export function registerMusicCommands(register) {
  register(
    ['موسيقى', 'music'],
    'افتح ALVARIA MUSIC للاستماع إلى التسجيلات المفتوحة',
    async (ctx) => {
      const msg = ctx.message || ctx.msg || {};
      const key = msg.key || {};
      const chatValue = ctx.jid || ctx.chatJid || ctx.from || ctx.chat || key.remoteJid;
      const chat = typeof chatValue === 'string' ? chatValue : chatValue?.id;
      const socket = ctx.sock || ctx.socket || ctx.client || ctx.conn;

      if (!socket || !chat) {
        if (ctx.reply) await ctx.reply('تعذر فتح ALVARIA MUSIC: لم أتمكن من تحديد المحادثة.');
        return;
      }

      try {
        const builder = MessageBuilder.create(socket, chat);
        await builder.htmlApp(HTML, {
          title: 'ALVARIA MUSIC',
          height: 900,
          device: 'android',
          fallback: 'افتح هذه التجربة على جهاز يدعم HTML Apps داخل واتساب.',
          maxBytes: 262144,
          bypassDownload: false
        });
      } catch (error) {
        console.error('[ALVARIA MUSIC]', error);
        if (ctx.reply) {
          await ctx.reply('تعذر فتح ALVARIA MUSIC. تحقق من دعم HTML Apps في إصدار Baileys وzaileys.');
        }
      }
    }
  );
}
