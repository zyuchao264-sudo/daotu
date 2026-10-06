// 顶层初始化一旦抛错，后面的语句会被整段跳过，界面就会“悄悄留白”。
// 这里先把错误暴露到顶栏，避免出现无从判断的空白页面。
window.addEventListener('error',event=>{
  try{ if(typeof setStatus==="function")setStatus('脚本出错：'+(event.message||'未知错误')+'（请按 Ctrl+F5 强制刷新）'); }catch{}
});
const maxPlayersControl=document.getElementById('maxPlayers');
if(maxPlayersControl&&!maxPlayersControl.querySelector('option[value="6"]')){const option=document.createElement('option');option.value='6';option.textContent='6 人';option.selected=true;maxPlayersControl.append(option)}
const ROLE_IMAGES = {
  hunter:"/assets/avatars/hunter.png",
  merchant:"/assets/avatars/merchant.png",
  gambler:"/assets/avatars/gambler.png",
  paladin:"/assets/avatars/paladin.png",
  beggar:"/assets/avatars/beggar.png",
  android:"/assets/avatars/android.png",
  career_1787382232648:"/assets/avatars/trickster.png"
};
const TERRAIN = {
  plain:{name:"平原",icon:"✦",color:"#9ba75c",cost:1},
  forest:{name:"森林",icon:"♠",color:"#456e45",cost:2},
  hill:{name:"丘陵",icon:"▲",color:"#998452",cost:2},
  river:{name:"河流",icon:"≈",color:"#4c88a0",cost:2},
  riverGod:{name:"河神",icon:"♜",color:"#426c91",cost:2},
  desert:{name:"沙漠",icon:"☀",color:"#ba9858",cost:1},
  spring:{name:"泉水",icon:"✧",color:"#5aa8a1",cost:1},
  holySpring:{name:"圣泉",icon:"✴",color:"#91cbc0",cost:1},
  void:{name:"虚空",icon:"◆",color:"#68588b",cost:1},
  fire:{name:"地火",icon:"♨",color:"#a24e35",cost:1},
  goldMine:{name:"金矿",icon:"❖",color:"#ae9042",cost:1},
  trial:{name:"生存试炼",icon:"★",color:"#ae793d",cost:1}
};
// 与 rules-engine.js 的地形消耗保持一致：骰子点数＝可移动格数，进入困难地形要多吃 1 格。
function terrainCostFor(player,tile){
  if(!tile)return Infinity;
  if(player?.ignoreTerrainCost)return 1;
  const base=(TERRAIN[tile.type]||TERRAIN.plain).cost||1;
  const discount=(player?.careerId==="hunter"&&player.talent2==="a"?1:0)+(player?.equipment?.some(card=>card.name==="马车")?1:0);
  return Math.max(1,base-discount);
}
const SUPPORTED_CARDS = new Set(["止血绷带","舔舐伤口","狩猎","整备","前进","召唤猎狗","隐秘行踪","战术瞄准","猎狗进化","金盆洗手","黑金","黑市交易","投资军火","瞄准射击","放暗箭","轻便草鞋","草药","轻皮衣","黑大衣","马车","钱是万能的","换取筹码","哪有赌徒天天输","贷款","好运or厄运","逃跑是门技术","撒钱","止痛药","打吊水","假意示弱","空头支票"]);
// 每名玩家一个固定颜色，地图棋子、占领标记与角色栏共用，方便一眼对应。
// 必须在这里声明：playerColor() 会在 renderMap 里被调用，若声明晚于任何顶层初始化就可能踩到暂时性死区。
const PLAYER_COLORS=["#f0c04a","#63b8d6","#e0806d","#8fd07a","#c69ae0","#e6df7c"];
// 由初始化创建的句柄：先声明为 undefined 而不是 const，初始化若失败也只是留空，不会连累后面调用它们的函数。
let boardHint=null;
let trialDialog=null;
let mapToolbar=null;
// 指令按钮注册表同样提前声明：setCommand 会在渲染过程中访问它，不能等初始化时才建。
const commandButtons={};
let selectedTileId = null;
let selectedPlayerId = null;
const MAP_FIT = 960;          // 100% 缩放时短边的 viewBox 边长，恰好容纳整张地图
const MAP_PADDING = 45;       // 六角格半宽 41 / 半高 35.5 之外再留一点余量
const MAP_MIN_ZOOM = 0.75;
const MAP_MAX_ZOOM = 3;
const MAP_ZOOM_STEP = 0.25;
const MAP_HOME = {x:450,y:450}; // 127 格地图的几何中心
let mapZoom = 1;
let mapCenter = {...MAP_HOME};
let mapBounds = {minX:MAP_HOME.x-410,maxX:MAP_HOME.x+410,minY:MAP_HOME.y-421,maxY:MAP_HOME.y+421};
const layoutStyle=document.createElement('link');
layoutStyle.rel='stylesheet';layoutStyle.href='/game-layout.css';document.head.append(layoutStyle);
const mapToolbarElement=document.createElement('div');
mapToolbarElement.className='map-toolbar';
mapToolbarElement.innerHTML='<div id="mapPlayers" class="map-players"></div><div class="zoom-controls"><span class="pan-hint">按住右键拖动地图（左键/中键同样可拖动）</span><button id="zoomOut" aria-label="缩小地图">−</button><span id="zoomLabel">100%</span><button id="zoomIn" aria-label="放大地图">＋</button><button id="zoomReset">全图</button></div>';
mapToolbar=mapToolbarElement;
$('board').before(mapToolbarElement);
// ===== 指令面板 =====
// 常驻外壳：按钮与下拉只建一次，之后仅切换 hidden/disabled/文案。
// 这样状态刷新不会重置已选的目标/资源/建筑，也不会打断键盘焦点。
buildCommandPanel();
function buildCommandPanel(){
  $('actionbar').innerHTML=`<div class="cmd-groups">
<section class="cmd-group cmd-todo" role="group" data-group="todo" id="groupTodo" aria-label="本回合待办">
  <h4><span class="cmd-step" aria-hidden="true">✓</span>本回合待办<span class="cmd-state" id="todoState"></span></h4>
  <div class="cmd-row" id="todoRow"></div>
</section>
<section class="cmd-group" role="group" data-group="move" id="groupMove" aria-label="移动">
  <h4><span class="cmd-step" aria-hidden="true">1</span>移动<span class="cmd-state" id="movementHint">先选择自己的角色</span></h4>
  <div class="cmd-row">
    <button class="cmd-btn" data-action="rollMove">掷移动骰</button>
    <button class="cmd-btn" data-action="rerollMove" hidden>重投</button>
    <button class="cmd-btn cmd-primary" data-action="confirmMove" disabled>移动到选中格</button>
    <button class="cmd-btn cmd-ghost" data-action="stopMove">结束移动</button>
    <button class="cmd-btn cmd-ghost" data-action="extraMove">额外移动</button>
  </div>
</section>
<section class="cmd-group" role="group" data-group="cards" id="groupCards" aria-label="抽牌与装备">
  <h4><span class="cmd-step">2</span>抽牌与装备<span class="cmd-state" id="cardState"></span></h4>
  <div class="cmd-row">
    <button class="cmd-btn" data-action="draw">抽牌</button>
    <button class="cmd-btn" data-action="drawExtra">抽两张 · 1肉</button>
    <button class="cmd-btn" data-action="forge">铁匠铺抽装备</button>
  </div>
</section>
<section class="cmd-group" role="group" data-group="act" id="groupAct" aria-label="基础行动">
  <h4><span class="cmd-step">3</span>基础行动<span class="cmd-state" id="actionState"></span></h4>
  <div class="cmd-row">
    <button class="cmd-btn" data-action="build">建造选中格</button>
    <button class="cmd-btn" data-action="harvest">收获选中格</button>
    <button class="cmd-btn" data-action="raid">抢夺选中格</button>
    <button class="cmd-btn" data-action="spring">泉水恢复</button>
    <button class="cmd-btn" data-action="attack">攻击选中目标</button>
  </div>
</section>
<section class="cmd-group" role="group" data-group="params" id="groupParams" aria-label="目标与参数">
  <h4><span class="cmd-step">4</span>目标与参数<span class="cmd-state">供建造、收获、抢夺、出牌使用</span></h4>
  <div class="cmd-row cmd-fields">
    <label class="cmd-field"><span>目标玩家</span><select id="targetPlayer"></select></label>
    <label class="cmd-field"><span>资源</span><select id="resourceChoice"><option value="wood">木</option><option value="stone">石</option><option value="meat">肉</option><option value="gold">金</option></select></label>
    <label class="cmd-field cmd-narrow"><span>数量</span><input id="resourceAmount" type="number" min="1" max="10" value="1"></label>
    <label class="cmd-field"><span>建筑</span><select id="buildingType"><option value="career">专属建筑</option><option value="lumber">伐木场</option><option value="quarry">采石场</option><option value="ranch">牧场</option><option value="mine">金矿场</option></select></label>
  </div>
</section>
<section class="cmd-group" role="group" data-group="talents" id="groupTalents" aria-label="天赋升级">
  <h4><span class="cmd-step">5</span>天赋升级<span class="cmd-state" id="talentState"></span></h4>
  <div class="cmd-row">
    <button class="cmd-btn" data-action="upgrade2a" hidden></button>
    <button class="cmd-btn" data-action="upgrade2b" hidden></button>
    <button class="cmd-btn" data-action="upgrade3a" hidden></button>
    <button class="cmd-btn" data-action="upgrade3b" hidden></button>
  </div>
  <details class="cmd-locked" id="lockedTalents" hidden><summary id="lockedTalentsSummary"></summary><div class="cmd-row" id="lockedTalentRow"></div></details>
</section>
</div>
<div class="cmd-footer">
  <span class="cmd-status" id="turnStatus"></span>
  <div class="cmd-footer-actions">
    <button class="cmd-btn" data-action="trial">开始试炼</button>
    <button class="cmd-btn cmd-primary cmd-lg" data-action="endTurn">结束回合</button>
    <span class="cmd-divider" aria-hidden="true"></span>
    <button class="cmd-btn cmd-danger" data-action="endGame" hidden>结束对局</button>
  </div>
</div>
<div class="cmd-notice" id="cmdNoticeHost"></div>`;
  for(const button of $('actionbar').querySelectorAll('[data-action]')){
    commandButtons[button.dataset.action]=button;
    button.onclick=()=>dispatchAction(button.dataset.action);
  }
  const noticeEl=$('gameNotice'),noticeHost=$('cmdNoticeHost');
  if(noticeEl&&noticeHost){
    // 屏幕阅读器需要知道提示区会变化
    noticeEl.setAttribute('role','status');
    noticeEl.setAttribute('aria-live','polite');
    noticeHost.append(noticeEl);
  }
}
function setCommand(action,state={}){
  const button=commandButtons[action];
  if(!button)return;
  if(state.hidden!==undefined)button.hidden=state.hidden;
  if(state.disabled!==undefined)button.disabled=state.disabled;
  if(state.title!==undefined)button.title=state.title;
  if(state.label!==undefined)button.textContent=state.label;
  if(state.primary!==undefined)button.classList.toggle('cmd-primary',state.primary);
}
function setGroupVisible(group,visible){
  const element=$('actionbar').querySelector(`[data-group="${group}"]`);
  if(element)element.hidden=!visible;
}
function setGroupActive(group,active){
  const element=$('actionbar').querySelector(`[data-group="${group}"]`);
  if(element)element.classList.toggle('is-active',!!active);
}
function setText(id,text){const element=$(id);if(element)element.textContent=text||''}
// 本回合待办：把“还能做什么 / 已经做完什么 / 为什么不能做”集中成一行提醒。
// 直接可执行的待办做成按钮（走同一个 dispatchAction），需要选目标或选格的只做提示，
// 避免给出点了会失败的入口。state: todo 可做 / doing 进行中 / done 已完成 / blocked 不可用 / wait 等待。
function renderTurnTodo(items){
  const row=$('todoRow');
  if(!row)return;
  const mark={todo:'○',doing:'◐',done:'✓',blocked:'✕',wait:'…'};
  row.innerHTML=items.map(item=>item.action
    ? `<button class="cmd-chip cmd-todo-${item.state}" data-todo="${esc(item.action)}" title="${esc(item.title||item.text)}">${mark[item.state]} ${esc(item.text)}</button>`
    : `<span class="cmd-chip cmd-todo-${item.state}" title="${esc(item.title||item.text)}">${mark[item.state]} ${esc(item.text)}</span>`
  ).join('');
  row.querySelectorAll('[data-todo]').forEach(button=>button.onclick=()=>dispatchAction(button.dataset.todo));
  const active=items.filter(item=>item.state==="todo"||item.state==="doing").length;
  const waiting=items.some(item=>item.state==="wait");
  // 只有一项时（等待/旁观/已结束）不必再报“还有几项”，避免自相矛盾。
  setText('todoState',waiting||items.length<=1?'':active?`还有 ${active} 项可做`:'本回合已无待办');
}
// 天赋按钮：已学的、选过另一分支的、以及效果未接入的都不占按钮位；
// 未接入的收进可展开的“未接入的天赋”，既不误导也不占地方。
function renderTalentCommands(career,me,canAct){
  if(!career||!me)return 0;
  const support=me.talentSupport||{2:{},3:{}};
  const pending=[];
  let available=0;
  for(const level of [2,3])for(const branch of ["a","b"]){
    const action=`upgrade${level}${branch}`;
    const name=career[`lv${level}${branch}Name`];
    if(!name){setCommand(action,{hidden:true});continue;}
    const cost=(level===2?career[`lv2${branch}Cost`]:career.lv3Cost)||"无";
    const chosen=level===2?me.talent2:me.talent3;
    const owned=chosen===branch;
    const supported=support[level]?.[branch]!==false;
    if(!supported){pending.push({level,name,cost});setCommand(action,{hidden:true});continue;}
    if(owned||chosen){setCommand(action,{hidden:true});continue;}
    const needLevel2=level===3&&!me.talent2;
    const noAction=(me.actionsLeft??0)<1;
    available++;
    setCommand(action,{hidden:false,disabled:!canAct||needLevel2||noAction,
      label:`${level===2?"二级":"三级"} ${name} · ${cost}`,
      title:!canAct?'等待你的回合':needLevel2?'请先学习二级天赋':noAction?'行动次数不足':'消耗 1 次行动升级天赋'});
  }
  const details=$('lockedTalents'),summary=$('lockedTalentsSummary'),row=$('lockedTalentRow');
  if(details&&summary&&row){
    details.hidden=pending.length===0;
    summary.textContent=`未接入的天赋（${pending.length}）`;
    row.innerHTML=pending.map(item=>`<span class="cmd-chip" title="效果尚未接入，暂时无法升级">${item.level===2?"二级":"三级"} ${esc(item.name)} · ${esc(item.cost)}</span>`).join('');
  }
  // 返回可升级项数量，供本回合待办使用
  return canAct?available:0;
}
// 指令面板底部的状态行：一眼看出现在能不能动、该做什么。
function statusHint(publicState,me,playing){
  if(!playing)return publicState.winner?.type==="manual"?"对局已由房主结束"
    :publicState.winner?.nickname?`胜者：${publicState.winner.nickname}`:"对局结束，无胜者";
  if(me?.eliminated)return "你已被淘汰，可以继续旁观";
  if(publicState.currentPlayerId!==meId){
    const current=publicState.players.find(player=>player.playerId===publicState.currentPlayerId);
    return `等待 ${current?.nickname||"对手"} 行动…`;
  }
  const parts=[];
  if(me?.movePoints>0)parts.push(`可移动 ${me.movePoints} 格`);
  else if(!me?.moved)parts.push("可掷移动骰");
  parts.push((me?.actionsLeft??0)>0?`剩余 ${me.actionsLeft} 次行动`:"行动次数已用完，可以结束回合");
  return parts.join(" · ");
}
// 下拉选项会随玩家进出变化，重填时保留玩家已选的值。
function refreshTargetOptions(publicState){
  const select=$('targetPlayer');
  if(!select)return;
  const previous=select.value;
  select.innerHTML=['<option value="">不指定</option>'].concat(
    publicState.players.filter(player=>!player.eliminated)
      .map(player=>`<option value="${esc(player.playerId)}">${esc(player.nickname)}${player.playerId===meId?"（自己）":""}</option>`)
  ).join('');
  select.value=previous;
}
// 让 viewBox 与棋盘实际宽高比一致：既避免留白，也让拖动时横纵换算一致。
function boardAspect(){
  const rect=$('board').getBoundingClientRect();
  const width=rect.width>0?rect.width:900, height=rect.height>0?rect.height:900;
  return Math.min(4,Math.max(.6,width/height));
}
function mapViewSize(){
  const height=MAP_FIT/mapZoom;
  return {width:height*boardAspect(),height};
}
// 地图比视野大时只能在图内平移；比视野小时保持居中，避免把地图拖出屏幕丢失。
function clampMapCenter(view){
  const {minX,maxX,minY,maxY}=mapBounds;
  const centerX=(minX+maxX)/2, centerY=(minY+maxY)/2;
  mapCenter.x=(maxX-minX)<=view.width?centerX:Math.min(Math.max(mapCenter.x,minX+view.width/2),maxX-view.width/2);
  mapCenter.y=(maxY-minY)<=view.height?centerY:Math.min(Math.max(mapCenter.y,minY+view.height/2),maxY-view.height/2);
}
function updateMapView(){
  const svg=$('board').querySelector('svg');
  const view=mapViewSize();
  clampMapCenter(view);
  if(svg)svg.setAttribute('viewBox',`${mapCenter.x-view.width/2} ${mapCenter.y-view.height/2} ${view.width} ${view.height}`);
  setText('zoomLabel',`${Math.round(mapZoom*100)}%`);
}
// 像素位移换算成 viewBox 用户单位：交给浏览器算，preserveAspectRatio 的留白与缩放都自动包含。
function panMapByPixels(deltaX,deltaY){
  const svg=$('board').querySelector('svg');
  if(!svg)return;
  const matrix=svg.getScreenCTM();
  if(!matrix||!matrix.a||!matrix.d)return;
  mapCenter.x-=deltaX/matrix.a;
  mapCenter.y-=deltaY/matrix.d;
  updateMapView();
}
const PAN_DRAG_THRESHOLD=6; // 位移超过该值才算拖动，否则仍然是一次选格点击
const boardElement=$('board');
let mapDrag=null;
let suppressMapClick=false;
function endMapDrag(event){
  if(!mapDrag||(event&&event.pointerId!==mapDrag.pointerId))return;
  const {moved,button}=mapDrag;
  mapDrag=null;
  boardElement.classList.remove('panning');
  if(moved&&button===0)suppressMapClick=true; // 左键拖动后不要顺带选中地块
}
boardElement.addEventListener('contextmenu',event=>event.preventDefault());
// 中键在 Windows 会触发自动滚动，必须显式阻止，否则拖动会失效。
boardElement.addEventListener('mousedown',event=>{if(event.button===1)event.preventDefault()});
boardElement.addEventListener('pointerdown',event=>{
  if(event.pointerType==="mouse"&&event.button!==0&&event.button!==1&&event.button!==2)return;
  if(!boardElement.querySelector('svg'))return;
  if(event.button!==0)event.preventDefault();
  suppressMapClick=false;
  mapDrag={pointerId:event.pointerId,button:event.button,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false};
});
// 用 window 监听而不是 setPointerCapture：指针捕获会把 click 重定向到捕获元素，导致点不到地块。
window.addEventListener('pointermove',event=>{
  if(!mapDrag||event.pointerId!==mapDrag.pointerId)return;
  if(!mapDrag.moved){
    if(Math.abs(event.clientX-mapDrag.startX)<PAN_DRAG_THRESHOLD&&Math.abs(event.clientY-mapDrag.startY)<PAN_DRAG_THRESHOLD)return;
    mapDrag.moved=true;
    boardElement.classList.add('panning');
  }
  const deltaX=event.clientX-mapDrag.lastX, deltaY=event.clientY-mapDrag.lastY;
  mapDrag.lastX=event.clientX;mapDrag.lastY=event.clientY;
  if(!deltaX&&!deltaY)return;
  event.preventDefault();
  panMapByPixels(deltaX,deltaY);
});
window.addEventListener('pointerup',endMapDrag);
window.addEventListener('pointercancel',endMapDrag);
boardElement.addEventListener('click',event=>{
  if(!suppressMapClick)return;
  suppressMapClick=false;
  event.stopPropagation();
  event.preventDefault();
},true);
// 返回大厅：先让服务端释放席位（等待阶段房主顺延），再清理本地凭证。
const leaveButton=$('leave');
if(leaveButton)leaveButton.onclick=()=>{
  let settled=false;
  const finish=()=>{
    if(settled)return;
    settled=true;
    localStorage.removeItem('daotu.playerId');
    localStorage.removeItem('daotu.roomCode');
    localStorage.removeItem('daotu.reconnectToken');
    location.reload();
  };
  if(!socket.connected||!roomCode||!meId)return finish();
  socket.emit("leaveRoom",{roomCode,playerId:meId},finish);
  setTimeout(finish,800);
};
window.addEventListener('resize',()=>updateMapView());
$('zoomIn').onclick=()=>{mapZoom=Math.min(MAP_MAX_ZOOM,mapZoom+MAP_ZOOM_STEP);updateMapView()};
$('zoomOut').onclick=()=>{mapZoom=Math.max(MAP_MIN_ZOOM,mapZoom-MAP_ZOOM_STEP);updateMapView()};
$('zoomReset').onclick=()=>{mapZoom=1;mapCenter={...MAP_HOME};updateMapView()};
function selectMapPlayer(playerId){
  selectedPlayerId=playerId;
  const publicState=state?.public;
  const player=publicState?.players.find(item=>item.playerId===playerId);
  if(!player)return;
  const tile=publicState.tiles.find(item=>item.id===player.position);
  if(tile&&mapZoom>1)mapCenter=hexCenter(tile);
  renderMap(publicState,publicState.players.find(item=>item.playerId===meId));
}
$('confirmMove').onclick=()=>{
  if(selectedPlayerId===meId&&selectedTileId)send({type:'move',tileId:selectedTileId});
};

function roleImage(careerId){
  const image = ROLE_IMAGES[careerId];
  return image ? `<img src="${image}" alt="" loading="lazy">` : "♟";
}
function hexDistance(firstId,secondId){
  if(!firstId||!secondId)return Infinity;
  const [firstQ,firstR]=firstId.split(":").map(Number);
  const [secondQ,secondR]=secondId.split(":").map(Number);
  return Math.max(Math.abs(firstQ-secondQ),Math.abs(firstR-secondR),Math.abs(firstQ+firstR-secondQ-secondR));
}
function renderCareers(){
  $('careers').innerHTML=careers.map(career=>{
    const ready=readyCareerIds.has(career.id);
    return `<button class="career ${selectedCareer===career.id?'selected':''}" data-career="${esc(career.id)}" ${ready?'':'disabled'}>${roleImage(career.id)}${esc(career.name)}<small>${ready?`生命 ${career.hp} · ${esc(career.buildingName||'专属建筑')}`:'卡牌待补充'}</small></button>`;
  }).join('');
  document.querySelectorAll('[data-career]').forEach(button=>button.onclick=()=>{selectedCareer=button.dataset.career;renderCareers()});
}
function renderLobby(publicState){
  const target=publicState.maxPlayers||5;
  $('lobbyCode').textContent=publicState.roomCode;
  $('lobbyTarget').textContent=`${target} 人`;
  $('lobbyPlayers').innerHTML=publicState.players.map(player=>`<div class="player"><div class="avatar">${roleImage(player.careerId)}</div><div class="player-main"><div class="player-name">${esc(player.nickname)} ${player.playerId===publicState.hostId?'· 房主':''}</div><div class="player-meta">${esc(careers.find(career=>career.id===player.careerId)?.name||'未选职业')} · ${player.connected?'在线':'掉线'}</div></div></div>`).join('');
  $('start').classList.toggle('hidden',publicState.hostId!==meId);
  $('start').disabled=publicState.players.length!==target;
  notice('lobbyNotice',publicState.players.length<target?`还需要 ${target-publicState.players.length} 名玩家。`:'人数已到齐，可以开始。');
}
function hexCenter(tile){return {x:MAP_HOME.x+61.5*tile.q,y:MAP_HOME.y+71*tile.r+35.5*tile.q}}
function normalizeTiles(input){
  const source=Array.isArray(input)?input:[];
  const normalized=source.map(tile=>{
    const id=String(tile?.id??'');
    const parts=id.split(':').map(Number);
    const q=Number.isFinite(Number(tile?.q))?Number(tile.q):parts[0];
    const r=Number.isFinite(Number(tile?.r))?Number(tile.r):parts[1];
    return Number.isFinite(q)&&Number.isFinite(r)?{...tile,id:id||`${q}:${r}`,q,r,type:tile.type||'plain'}:null;
  }).filter(Boolean);
  if(normalized.length>=100)return normalized;
  const fallback=[];
  for(let r=-6;r<=6;r++)for(let q=-6;q<=6;q++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=6)fallback.push({id:`${q}:${r}`,q,r,type:q===0&&r===0?'trial':'plain',building:null,resource:null});
  return fallback;
}
function playerColor(publicState,playerId){
  const index=publicState.players.findIndex(player=>player.playerId===playerId);
  return PLAYER_COLORS[(index<0?0:index)%PLAYER_COLORS.length];
}
function roleImageUrl(careerId){return ROLE_IMAGES[careerId]||null}
// 棋子布局：单人居中，2~3 人横向排开，更多人分两行，始终围绕格子中心且不超出六角格。
function pawnLayout(count){
  if(count<=1)return [{x:0,y:0,r:18}];
  if(count<=3){const r=12.5,step=r*2.02;return Array.from({length:count},(_,index)=>({x:(index-(count-1)/2)*step,y:0,r}))}
  const r=10.5,step=r*2.02,perRow=Math.ceil(count/2),positions=[];
  for(let index=0;index<count;index++){
    const row=Math.floor(index/perRow);
    const inRow=Math.min(perRow,count-row*perRow);
    const column=index-row*perRow;
    positions.push({x:(column-(inRow-1)/2)*step,y:(row===0?-1:1)*r*0.95,r});
  }
  return positions;
}
// 地图内容包围盒：用于把平移限制在图内，避免把整张地图拖出视野。
function mapBoundsFor(tiles){
  if(!tiles.length)return {minX:MAP_HOME.x-410,maxX:MAP_HOME.x+410,minY:MAP_HOME.y-421,maxY:MAP_HOME.y+421};
  const points=tiles.map(hexCenter);
  return {
    minX:Math.min(...points.map(point=>point.x))-MAP_PADDING,
    maxX:Math.max(...points.map(point=>point.x))+MAP_PADDING,
    minY:Math.min(...points.map(point=>point.y))-MAP_PADDING,
    maxY:Math.max(...points.map(point=>point.y))+MAP_PADDING
  };
}
function renderMap(publicState, player){
  const tiles=normalizeTiles(publicState.tiles);
  publicState.tiles=tiles;
  mapBounds=mapBoundsFor(tiles);
  const hexPoints="-41,0 -20.5,-35.5 20.5,-35.5 41,0 20.5,35.5 -20.5,35.5";
  const innerPoints="-37,0 -18.5,-32 18.5,-32 37,0 18.5,32 -18.5,32";
  const clipDefs=[];
  // 移动阶段把“用当前格数走得到的相邻格”标出来，让骰子点数与可走格数一目了然。
  const myTurnNow=publicState.phase==='playing'&&publicState.currentPlayerId===meId&&!player?.eliminated;
  const moving=myTurnNow&&selectedPlayerId===meId&&(player?.movePoints??0)>0;
  const reachable=new Set();
  if(moving)for(const tile of tiles){
    if(hexDistance(player.position,tile.id)===1&&terrainCostFor(player,tile)<=player.movePoints)reachable.add(tile.id);
  }
  const cells=tiles.map(tile=>{
    const {x,y}=hexCenter(tile);
    const terrain=TERRAIN[tile.type]||TERRAIN.plain;
    const occupants=publicState.players.filter(item=>item.position===tile.id&&!item.eliminated);
    const building=tile.building;
    const selected=selectedTileId===tile.id?" selected":"";
    const canStep=reachable.has(tile.id);
    const icon=building?"⌂":tile.feature==="forge"?"⚒":terrain.icon;
    // 有人站上去时，地形图标缩小移到左上角，把格子中央让给棋子，同时保留地形辨识。
    const iconMarkup=occupants.length
      ? `<text class="hex-icon hex-icon-corner" x="-30" y="-20">${icon}</text>`
      : `<text class="hex-icon" y="5">${icon}</text>`;
    const positions=pawnLayout(occupants.length);
    const pawns=occupants.map((occupant,index)=>{
      const number=publicState.players.indexOf(occupant)+1;
      const {x:cx,y:cy,r}=positions[index];
      const color=playerColor(publicState,occupant.playerId);
      const isSelected=occupant.playerId===selectedPlayerId;
      const url=roleImageUrl(occupant.careerId);
      let face="";
      if(url){
        const clipId=`pawn-${String(occupant.playerId).replace(/[^a-zA-Z0-9_-]/g,"")}-${index}`;
        clipDefs.push(`<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${Math.max(4,r-1.6)}"/></clipPath>`);
        face=`<image href="${url}" x="${cx-r}" y="${cy-r}" width="${r*2}" height="${r*2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
      }
      const badgeR=Math.max(6,r*0.52),badgeX=cx+r*0.74,badgeY=cy+r*0.74;
      return `<g data-map-player="${esc(occupant.playerId)}" class="map-pawn${isSelected?" selected":""}"><title>${esc(occupant.nickname)} · ${esc(tile.id)}</title><circle cx="${cx}" cy="${cy}" r="${r}" fill="#1d2f2b" stroke="${isSelected?"#ffe29a":color}" stroke-width="${isSelected?3.4:2.6}"/>${face}<circle cx="${badgeX}" cy="${badgeY}" r="${badgeR}" fill="#141a19" stroke="${color}" stroke-width="1.4"/><text class="hex-count pawn-number" x="${badgeX}" y="${badgeY+3.4}">${number}</text></g>`;
    }).join('');
    const claim=tile.claim;
    const claimColor=claim?playerColor(publicState,claim.playerId):"";
    const claimMarkup=claim?`<polygon class="claim-ring" points="${innerPoints}" fill="none" stroke="${claimColor}" stroke-width="3" stroke-opacity=".92"><title>大金矿占领：${esc(claim.nickname||"")}，剩余 ${claim.roundsLeft} 回合</title></polygon><g class="claim-badge"><rect x="-21" y="-35" width="42" height="17" rx="8.5" fill="#141a19" stroke="${claimColor}" stroke-width="1.8"/><circle cx="-11" cy="-26.5" r="5.4" fill="${claimColor}"/><text class="hex-count pawn-number" x="-11" y="-23.9">${publicState.players.findIndex(item=>item.playerId===claim.playerId)+1}</text><text class="hex-count" x="7" y="-22.4">⛏${claim.roundsLeft}</text></g>`:'';
    return `<g class="hex-cell${selected}${canStep?" reachable":""}" data-tile="${esc(tile.id)}" transform="translate(${x} ${y})"><polygon points="${hexPoints}" fill="${terrain.color}" stroke="#3f523d" stroke-width="1.2"/><polygon points="${innerPoints}" fill="none" stroke="#ffeec0" stroke-opacity=".14"/>${canStep?`<polygon points="${innerPoints}" fill="none" stroke="#ffe29a" stroke-width="2.4" stroke-dasharray="6 4" stroke-opacity=".9"/>`:''}${iconMarkup}${claimMarkup}${pawns}${tile.resource?'<circle cx="-24" cy="-20" r="5" fill="#f3d88b"/>':''}</g>`;
  }).join('');
  $('board').innerHTML=`<svg class="hex-map" viewBox="0 0 900 900" role="img" aria-label="127 格六角战棋地图"><defs><filter id="mapNoise"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="6"/><feColorMatrix values="0 0 0 0 0.12 0 0 0 0 0.14 0 0 0 0 0.09 0 0 0 .17 0"/></filter>${clipDefs.join('')}</defs><rect width="900" height="900" fill="#244d48"/>${cells}<rect width="900" height="900" filter="url(#mapNoise)" pointer-events="none" opacity=".16"/></svg>`;
  $('board').querySelectorAll('[data-tile]').forEach(cell=>cell.onclick=()=>onTileClick(cell.dataset.tile));
  $('board').querySelectorAll('[data-map-player]').forEach(marker=>marker.onclick=event=>{event.stopPropagation();selectMapPlayer(marker.dataset.mapPlayer)});
  const mapPlayers=$('mapPlayers');
  if(mapPlayers){
    mapPlayers.innerHTML=publicState.players.map((item,index)=>`<button class="map-player ${item.playerId===selectedPlayerId?'selected':''}" style="border-left:4px solid ${playerColor(publicState,item.playerId)}" data-select-player="${esc(item.playerId)}"><span class="avatar">${roleImage(item.careerId)}</span><span><b>${index+1} · ${esc(item.nickname)}${item.playerId===meId?'（我）':''}</b><small>${item.eliminated?'已淘汰':`坐标 ${esc(item.position||'未出生')}`}${item.playerId===publicState.currentPlayerId?' · 当前回合':''}${item.goldMine?.roundsLeft>0?` · 大金矿剩 ${item.goldMine.roundsLeft} 回合`:''}</small></span></button>`).join('');
    mapPlayers.querySelectorAll('[data-select-player]').forEach(button=>button.onclick=()=>selectMapPlayer(button.dataset.selectPlayer));
  }
  const ownSelected=selectedPlayerId===meId;
  const myTurn=publicState.phase==='playing'&&publicState.currentPlayerId===meId&&!player?.eliminated;
  const selected=tiles.find(tile=>tile.id===selectedTileId);
  const terrain=selected&&(TERRAIN[selected.type]||TERRAIN.plain);
  const stepCost=selected?terrainCostFor(player,selected):Infinity;
  const adjacent=hexDistance(player?.position,selectedTileId)===1;
  const canStep=ownSelected&&myTurn&&adjacent&&(player?.movePoints??0)>=stepCost;
  const left=player?.movePoints;
  setCommand('confirmMove',{disabled:!canStep,label:canStep?`移动到选中格 · ${stepCost} 格`:'移动到选中格',
    title:canStep?`进入 ${selected?.id||''} 消耗 ${stepCost} 格`:'先掷移动骰，再点一个高亮的相邻格'});
  const confirmButton=$('confirmMove');
  if(confirmButton)confirmButton.disabled=!canStep;
  setText('movementHint',
    !selectedPlayerId?'先选择自己的角色':
    !ownSelected?'正在查看其他角色':
    !myTurn?'等待对方行动':
    left==null?'请先掷移动骰':
    adjacent?`还剩 ${left} 格 · 进入消耗 ${stepCost} 格`:
    `还剩 ${left} 格 · 点高亮格移动`);
  updateMapView();
  const claimText=selected?.claim?` · 大金矿已被 ${esc(selected.claim.nickname||"")} 占领（剩余 ${selected.claim.roundsLeft} 回合）`:selected?.type==="goldMine"?" · 大金矿可占领，进入即占领并连续 3 回合每回合结束获得 2 金":"";
  const costText=selected&&myTurn?` · 进入消耗 ${terrainCostFor(player,selected)} 格`:'';
  // 用可空写法：即使初始化失败导致提示元素不存在，也不会中断整张地图的渲染。
  setText('boardHint',selected?`${terrain.name} · ${selected.id}${costText}${selected.feature==="forge"?" · 铁匠铺":""}${selected.building?` · ${selected.building.name}（产出 ${selected.building.output}）`:''}${selected.resource?' · 有资源':''}${claimText}。`:'点击相邻地块移动，或先掷移动骰；地图格之间已紧密拼接；按住右键可拖动地图。');
}
// 点击地块：始终更新选中状态；移动阶段点到走得通的相邻格就直接走，不必每格再点一次确认。
function onTileClick(tileId){
  const publicState=state?.public;
  if(!publicState)return;
  const me=publicState.players.find(player=>player.playerId===meId);
  selectedTileId=tileId;
  renderMap(publicState,me);
  const canWalk=publicState.phase==='playing'&&publicState.currentPlayerId===meId&&!me?.eliminated&&selectedPlayerId===meId&&(me?.movePoints??0)>0;
  const tile=publicState.tiles.find(item=>item.id===tileId);
  if(canWalk&&hexDistance(me.position,tileId)===1&&terrainCostFor(me,tile)<=(me.movePoints??0))send({type:'move',tileId});
}
function renderGame(payload){
  $('auth').classList.add('hidden');$('lobby').classList.add('hidden');$('game').classList.remove('hidden');
  const publicState=payload.public;
  document.querySelector('.board-hint').textContent='点相邻高亮格移动（骰点＝可移动格数，困难地形 2 格）；点其他格只选择目标。';
  const me=publicState.players.find(player=>player.playerId===meId);
  // 默认选中自己的角色，省掉“先点自己再操作”的一步。
  if(!selectedPlayerId&&me)selectedPlayerId=meId;
  const playing=publicState.phase==="playing";
  const myTurn=playing&&publicState.currentPlayerId===meId;
  $('roomBadge').textContent=`房间 ${publicState.roomCode} · ${publicState.maxPlayers||5} 人`;
  $('turn').textContent=playing?`第 ${publicState.round} 轮 · ${publicState.players.find(player=>player.playerId===publicState.currentPlayerId)?.nickname||''} 的回合`:
    `对局已结束 · ${publicState.winner?.type==="manual"?"房主手动结束":publicState.winner?.nickname?"胜者："+publicState.winner.nickname:"无胜者"}`;
  const attackRange=me?.attackRange??0;
  $('players').innerHTML=publicState.players.map(player=>`<div class="player ${player.playerId===publicState.currentPlayerId?'current':''}"><div class="avatar">${roleImage(player.careerId)}</div><div class="player-main"><div class="player-name">${esc(player.nickname)} ${player.eliminated?'· 已淘汰':''}</div><div class="player-meta">${esc(careers.find(career=>career.id===player.careerId)?.name||'')} · ❤ ${player.hp}/${player.maxHp} · ★ ${player.score} · 手牌 ${player.handCount}</div></div>${myTurn&&player.playerId!==meId&&!player.eliminated&&hexDistance(player.position,me?.position)<=attackRange?`<button data-attack="${player.playerId}">攻击</button>`:''}</div>`).join('');
  $('players').querySelectorAll('[data-attack]').forEach(button=>button.onclick=()=>send({type:"attack",targetPlayerId:button.dataset.attack,resourceChoice:$('resourceChoice')?.value}));
  $('log').innerHTML=publicState.log.slice().reverse().map(entry=>`<div>${esc(entry.message)}</div>`).join('');
  renderMap(publicState,me);
  const resourceLabels={wood:"木",stone:"石",meat:"肉",gold:"金",special:"专属"};
  const career=careers.find(item=>item.id===me?.careerId);
  const talentText=level=>{
    const branch=level===2?me?.talent2:me?.talent3;
    if(!branch)return "未学习";
    return `${esc(career?.[`lv${level}${branch}Name`]||branch.toUpperCase())}（${branch.toUpperCase()}）`;
  };
  const talentPlain=level=>{
    const branch=level===2?me?.talent2:me?.talent3;
    if(!branch)return "未学习";
    return `${career?.[`lv${level}${branch}Name`]||branch.toUpperCase()}（${branch.toUpperCase()}）`;
  };
  const goldMineText=me?.goldMine?.roundsLeft>0
    ? `占领中 · 剩余 ${me.goldMine.roundsLeft} 回合 · 已获得 ${me.goldMineCollected||0} 金`
    : `未占领${me?.goldMineCollected?` · 本局累计获得 ${me.goldMineCollected} 金`:''}`;
  $('me').innerHTML=me?`<div class="player"><div class="avatar">${roleImage(me.careerId)}</div><div><b>${esc(me.nickname)}</b><div class="status">${esc(career?.name||'')} · 攻击范围 ${attackRange}</div></div></div><div class="resource-row">${Object.entries(me.resources||{}).map(([key,value])=>`<span class="resource">${resourceLabels[key]||key} <b>${value}</b></span>`).join('')}</div><div class="status">❤ ${me.hp}/${me.maxHp}　★ ${me.score}　行动 ${me.actionsLeft}　${me.movePoints!=null?`可移动 <b>${me.movePoints}</b> 格`:"待掷移动骰"}</div><div class="status">行动牌库 ${payload.private.deckCount} · 装备牌库 ${payload.private.equipmentDeckCount} · 奥秘 ${me.secretCount}</div><div class="status">已装备：${me.equipment?.length?me.equipment.map(card=>esc(card.name)).join('、'):'无'}${me.dog?'、猎狗':''}</div><div class="status">大金矿：${goldMineText}</div><div class="status">天赋：二级 ${talentText(2)}　三级 ${talentText(3)}</div>${career?.passive0?`<div class="status">被动：${esc(career.passive0)}</div>`:''}`:'';
  $('hand').innerHTML=(payload.private.hand||[]).map(card=>{
    const supported=SUPPORTED_CARDS.has(card.name);
    return `<div><button class="card ${supported?'':'unsupported'}" data-card="${esc(card.uid)}" ${supported&&myTurn?'':'disabled'}><strong>${esc(card.name)}</strong><small>${esc(card.type)} · ${esc(card.cost)}</small><p>${esc(card.effect)}</p>${supported?'':'<small>效果待接入</small>'}</button>${myTurn?`<button class="secondary" data-discard="${esc(card.uid)}" style="margin-top:3px;width:100%">弃置</button>`:''}</div>`;
  }).join('')||'<div class="status">暂无手牌</div>';
  $('hand').querySelectorAll('[data-card]').forEach(button=>button.onclick=()=>send({type:"playCard",cardUid:button.dataset.card,targetPlayerId:$('targetPlayer')?.value||null,resourceChoice:$('resourceChoice')?.value,quantity:Number($('resourceAmount')?.value)||1}));
  $('hand').querySelectorAll('[data-discard]').forEach(button=>button.onclick=()=>send({type:"discard",cardUid:button.dataset.discard}));
  // ---- 指令面板：只切换显示与禁用，不重建控件，避免下拉选择被状态刷新重置 ----
  refreshTargetOptions(publicState);
  const canAct=playing&&myTurn&&!me?.eliminated;
  const actions=me?.actionsLeft??0;
  const stunned=!!me&&(me.stunnedUntilRound??0)>=publicState.round;
  for(const group of ["todo","move","cards","act","params","talents"])setGroupVisible(group,playing);
  for(const group of ["move","cards","act","talents"])setGroupActive(group,canAct);
  setText('actionState',`剩余 ${actions} 次`);
  setText('cardState',`牌库 ${payload.private.deckCount} · 装备 ${payload.private.equipmentDeckCount}`);
  setText('talentState',`二级 ${talentPlain(2)} · 三级 ${talentPlain(3)}`);
  // 先把各项的可用性算成具名条件，按钮与本回合待办共用同一份判断，避免两处逻辑走偏。
  const rollBlocked=!canAct||!!me?.moved||me?.movePoints!=null;
  const extraBlocked=!canAct||actions<1||me?.movePoints!=null;
  const drawBlocked=!canAct||actions<1;
  const buildBlocked=!canAct||actions<1||!!me?.buildsThisTurn;
  const raidBlocked=!canAct||actions<1||!!me?.raidsThisTurn;
  const harvestBlocked=!canAct||actions<1;

  setCommand('rollMove',{disabled:rollBlocked,
    title:!canAct?'等待你的回合':me?.moved?'本回合已经掷过移动骰':'掷出 1~3 点，点数就是本回合可移动格数'});
  const gamblerReroll=me?.careerId==="gambler"&&(me?.rerollLeft||0)>0;
  setCommand('rerollMove',{hidden:!gamblerReroll,
    disabled:!canAct||me?.movePoints==null||!!me?.moveSpent,
    label:`重投 · 剩 ${me?.rerollLeft||0} 次`,
    title:me?.movePoints==null?'请先掷移动骰':me?.moveSpent?'已经移动过，不能重投':'好赌之人：重投当前掷出的移动骰'});
  setCommand('stopMove',{disabled:!canAct||me?.movePoints==null,title:'放弃本回合剩余的移动格数'});
  setCommand('extraMove',{disabled:extraBlocked,
    title:actions<1?'行动次数不足':me?.movePoints!=null?'请先用完当前可移动的格数':'消耗 1 次行动，再掷一次移动骰'});

  setCommand('draw',{disabled:drawBlocked,title:actions<1?'行动次数不足':'消耗 1 次行动，抽 1 张职业牌'});
  setCommand('drawExtra',{disabled:drawBlocked||(me?.resources?.meat??0)<1,
    title:(me?.resources?.meat??0)<1?'需要 1 肉':'消耗 1 次行动与 1 肉，抽 2 张职业牌'});
  setCommand('forge',{disabled:drawBlocked,title:'只能在铁匠铺格子上抽取装备牌'});

  const forcedRaid=me?.careerId==="merchant"&&me.talent3==="b";
  setCommand('build',{disabled:buildBlocked,
    title:me?.buildsThisTurn?'每回合只能建造一次':actions<1?'行动次数不足':'在选中的格子上建造（消耗 1 次行动）'});
  setCommand('harvest',{disabled:harvestBlocked,title:'收获两格内自己建筑的产出（消耗 1 次行动）'});
  setCommand('raid',{disabled:raidBlocked,label:forcedRaid?"强制征税选中格":"抢夺选中格",
    title:me?.raidsThisTurn?'每回合只能抢夺一次':forcedRaid?'消耗 1 次行动与 2 铜币，对 3 格内的敌方建筑强制抢夺':'对同格的敌方建筑抢夺（消耗 1 次行动）'});
  setCommand('spring',{disabled:harvestBlocked,title:'只能在泉水格子上回复生命'});
  // 攻击也走同一个“目标玩家”下拉，避免操作入口散落在两处
  const targetPlayer=publicState.players.find(player=>player.playerId===$('targetPlayer')?.value&&!player.eliminated);
  const targetInRange=!!targetPlayer&&hexDistance(targetPlayer.position,me?.position)<=attackRange;
  const payForHit=me?.careerId==="merchant"&&me.talent2==="b";
  const shortCoins=payForHit&&(me?.resources?.special??0)<2;
  const attackBlocked=!canAct||actions<1||!targetInRange||shortCoins;
  setCommand('attack',{disabled:attackBlocked,
    label:payForHit?"拿钱砸人 · 2铜币":"攻击选中目标",
    title:!targetPlayer?'请先在「目标玩家」中选择目标':!targetInRange?`目标不在 ${attackRange} 格攻击范围内`:actions<1?'行动次数不足':shortCoins?'拿钱砸人需要 2 铜币':'对选中目标发动基础攻击（消耗 1 次行动）'});

  const talentOpen=renderTalentCommands(career,me,canAct);

  const trialBlocked=!canAct||actions<1;
  setCommand('trial',{disabled:trialBlocked,title:'需要 30 分并站在地图中心的生存试炼板块'});
  setCommand('endTurn',{disabled:!canAct,title:canAct?'结束本回合，交给下一位玩家':'等待你的回合'});
  setCommand('endGame',{hidden:publicState.hostId!==meId,disabled:!playing,title:'房主手动结束本局（需二次确认）'});
  setText('turnStatus',statusHint(publicState,me,playing));
  renderTurnTodo(turnTodoItems({publicState,me,playing,canAct,actions,stunned,extraBlocked,drawBlocked,
    buildBlocked,raidBlocked,harvestBlocked,attackBlocked,targetPlayer,trialBlocked,talentOpen,attackRange,
    playableCards:(payload.private.hand||[]).filter(card=>SUPPORTED_CARDS.has(card.name)).length,
    totalCards:(payload.private.hand||[]).length}));
  if(!playing)notice('gameNotice','本局已结束，地图与记录保留供查看。');
}
// 组成本回合待办清单：按回合流程排序，只保留“该做/可做/已完成”的核心项。
function turnTodoItems(ctx){
  const {publicState,me,playing,canAct,actions,stunned,extraBlocked,drawBlocked,
    buildBlocked,raidBlocked,harvestBlocked,attackBlocked,targetPlayer,trialBlocked,talentOpen,
    playableCards,totalCards,attackRange}=ctx;
  if(!playing)return [{state:'done',text:publicState.winner?.type==="manual"?"对局已由房主结束":publicState.winner?.nickname?`胜者：${publicState.winner.nickname}`:"对局结束"}];
  if(me?.eliminated)return [{state:'blocked',text:'你已被淘汰，只能旁观',title:'本局已无法操作'}];
  if(!canAct){
    const current=publicState.players.find(player=>player.playerId===publicState.currentPlayerId);
    return [{state:'wait',text:`等待 ${current?.nickname||'对手'} 行动`,title:'轮到你时这里会列出可做的操作'}];
  }
  const tiles=publicState.tiles||[];
  const ownBuildingNearby=tiles.some(tile=>tile.building?.ownerId===me.playerId&&hexDistance(tile.id,me.position)<=2);
  const items=[];
  if(stunned)items.push({state:'blocked',text:'河神停滞中',title:'本回合无法操作，停滞持续到你的下回合结束'});
  // 移动阶段
  if(me?.moved){
    items.push((me?.movePoints??0)>0
      ? {state:'doing',text:`还可移动 ${me.movePoints} 格`,title:'点地图上的高亮格继续移动'}
      : {state:'done',text:'移动已完成'});
  }else{
    items.push({state:'todo',text:'掷移动骰',action:'rollMove',title:'掷出 1~3 点，点数就是本回合可移动格数'});
  }
  if((me?.movePoints??0)>0)items.push({state:'done',text:'结束移动',action:'stopMove',title:'放弃剩余移动格数'});
  // 行动阶段
  items.push(actions>0
    ? {state:'doing',text:`基础行动还剩 ${actions} 次`,title:'建造 / 抽牌 / 收获 / 抢夺 / 攻击 / 出牌 / 额外移动 / 天赋升级'}
    : {state:'done',text:'基础行动已用完'});
  if(!extraBlocked)items.push({state:'todo',text:'额外移动',action:'extraMove',title:'消耗 1 次行动，再掷一次移动骰'});
  if(!drawBlocked)items.push({state:'todo',text:'抽牌',action:'draw',title:'消耗 1 次行动抽 1 张职业牌'});
  // 需要选格或选目标的操作只做提示，不给出点了会失败的入口
  items.push(me?.buildsThisTurn?{state:'done',text:'已建造'}
    :buildBlocked?{state:'blocked',text:'建造不可用',title:'行动次数不足'}
    :{state:'todo',text:'可建造',title:'选中你所在的格子，再点③的「建造选中格」'});
  items.push(me?.raidsThisTurn?{state:'done',text:'已抢夺'}
    :raidBlocked?{state:'blocked',text:'抢夺不可用',title:'行动次数不足'}
    :{state:'todo',text:'可抢夺',title:'需与敌方建筑同格：选中该格后点③的「抢夺选中格」'});
  items.push(!harvestBlocked&&ownBuildingNearby
    ? {state:'todo',text:'可收获',title:'点选两格内自己的建筑，再按③的「收获选中格」'}
    : {state:'blocked',text:'收获不可用',title:'两格内没有自己的建筑，或行动次数不足'});
  items.push(!attackBlocked
    ? {state:'todo',text:`可攻击 ${targetPlayer.nickname}`,title:'点③的「攻击选中目标」'}
    : {state:'blocked',text:'攻击不可用',title:!targetPlayer?'先在④「目标玩家」里选一个目标':`目标不在 ${attackRange} 格攻击范围内`});
  // 出牌
  items.push(totalCards===0?{state:'blocked',text:'无手牌',title:'可以先用抽牌补充'}
    :playableCards>0?{state:'todo',text:`可出牌 ${playableCards} 张`,title:'点右侧手牌即可打出'}
    :{state:'blocked',text:'手牌效果均未接入',title:'这些牌暂时无法打出，可以先用抽牌补充'});
  // 天赋与试炼
  if(talentOpen>0)items.push({state:'todo',text:`可升级天赋 ${talentOpen} 项`,title:'在⑤天赋升级里选择'});
  if(!trialBlocked&&me?.score>=30&&me?.position==="0:0")items.push({state:'todo',text:'可开启生存试炼',action:'trial',title:'通过即可直接获胜'});
  items.push({state:'todo',text:'结束回合',action:'endTurn',title:'交给下一位玩家'});
  return items;
}
function dispatchAction(kind){
  const tileId=selectedTileId;
  if(kind==="drawExtra")return send({type:"draw",extra:true});
  if(kind.startsWith("upgrade"))return send({type:"upgrade",level:Number(kind.slice(-2,-1)),branch:kind.slice(-1)});
  if(kind==="build")return send({type:"build",tileId,buildingType:$('buildingType').value});
  if(["harvest","raid"].includes(kind))return send({type:kind,tileId});
  if(kind==="attack")return send({type:"attack",targetPlayerId:$('targetPlayer')?.value||null,resourceChoice:$('resourceChoice')?.value});
  if(kind==="trial")return trialDialog?trialDialog.showModal():undefined;
  if(kind==="endGame"&&!confirm("确定手动结束这场对局吗？当前对局进度将不再继续。"))return;
  send({type:kind});
}
// 这两个句柄已在文件顶部声明为 let，这里只赋值：即使此处失败，也不会让后面调用它们的函数踩到死区。
boardHint=document.createElement("div");boardHint.id="boardHint";boardHint.className="tile-tooltip";
const boardHintAnchor=document.querySelector(".board-hint");
if(boardHintAnchor)boardHintAnchor.after(boardHint);
trialDialog=document.createElement("dialog");
trialDialog.className="panel";
trialDialog.style.cssText="color:#f8efd9;background:#251b16;border:1px solid #b8935b;border-radius:14px;max-width:440px;width:calc(100% - 32px)";
trialDialog.innerHTML=`<form method="dialog"><h2>生存试炼 · 资源置换</h2><p>木、石、肉及专属资源 1:1 换分；金 2:1 换分。下回合开始结算。</p><div class="resource-row">${[["wood","木"],["stone","石"],["meat","肉"],["gold","金"],["special","专属"]].map(([key,label])=>`<label class="field">${label}<input name="${key}" type="number" min="0" value="0"></label>`).join("")}</div><div class="form-row"><button value="submit">确认开启</button><button value="cancel" class="secondary">取消</button></div></form>`;
document.body.append(trialDialog);
trialDialog.addEventListener("close",()=>{
  if(trialDialog.returnValue!=="submit")return;
  const form=trialDialog.querySelector("form");
  const resources=Object.fromEntries(["wood","stone","meat","gold","special"].map(key=>[key,Number(form.elements[key].value)]));
  send({type:"trial",resources});
});
// 发送行动时给出“处理中”提示，避免网络慢时重复点击；收到回执或超时后更新提示。
let pendingActionTimer=null;
send=action=>{
  notice('gameNotice','处理中…');
  clearTimeout(pendingActionTimer);
  pendingActionTimer=setTimeout(()=>notice('gameNotice','服务器响应较慢，请稍候或检查网络'),8000);
  socket.emit('gameAction',{roomCode,playerId:meId,action},reply=>{
    clearTimeout(pendingActionTimer);
    if(!reply?.ok)notice('gameNotice',reply?.error||'操作失败');
    else notice('gameNotice',reply.roll?`掷出 ${reply.roll} 点，本回合可移动 ${reply.roll} 格`:'');
  });
};
// 断线重连或刷新页面后自动恢复上一局；连接恢复时也重新向服务端登记 socket，否则收不到状态。
socket.on('connect',()=>{
  if(!token||!roomCode)return;
  socket.emit('reconnectRoom',{roomCode,reconnectToken:token},reply=>{
    if(!reply?.ok){
      localStorage.removeItem('daotu.reconnectToken');
      return;
    }
    handleReply(reply);
    $('auth').classList.add('hidden');
    setStatus(state?'连接已恢复':'已自动恢复到上一局');
  });
});
