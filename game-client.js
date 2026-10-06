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
const mapToolbar=document.createElement('div');
mapToolbar.className='map-toolbar';
mapToolbar.innerHTML='<div id="mapPlayers" class="map-players"></div><div class="zoom-controls"><span class="pan-hint">按住右键拖动地图（左键/中键同样可拖动）</span><button id="zoomOut" aria-label="缩小地图">−</button><span id="zoomLabel">100%</span><button id="zoomIn" aria-label="放大地图">＋</button><button id="zoomReset">全图</button></div>';
$('board').before(mapToolbar);
const movementPanel=document.createElement('div');
movementPanel.className='movement-panel';
movementPanel.innerHTML='<span id="movementHint">先选择自己的角色</span><button id="confirmMove" disabled>移动到选中格</button>';
$('board').after(movementPanel);
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
  $('zoomLabel').textContent=`${Math.round(mapZoom*100)}%`;
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
// 每名玩家一个固定颜色，地图棋子、占领标记与角色栏共用，方便一眼对应。
const PLAYER_COLORS=["#f0c04a","#63b8d6","#e0806d","#8fd07a","#c69ae0","#e6df7c"];
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
  const tiles=publicState.tiles||[];
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
  $('mapPlayers').innerHTML=publicState.players.map((item,index)=>`<button class="map-player ${item.playerId===selectedPlayerId?'selected':''}" style="border-left:4px solid ${playerColor(publicState,item.playerId)}" data-select-player="${esc(item.playerId)}"><span class="avatar">${roleImage(item.careerId)}</span><span><b>${index+1} · ${esc(item.nickname)}${item.playerId===meId?'（我）':''}</b><small>${item.eliminated?'已淘汰':`坐标 ${esc(item.position||'未出生')}`}${item.playerId===publicState.currentPlayerId?' · 当前回合':''}${item.goldMine?.roundsLeft>0?` · 大金矿剩 ${item.goldMine.roundsLeft} 回合`:''}</small></span></button>`).join('');
  $('mapPlayers').querySelectorAll('[data-select-player]').forEach(button=>button.onclick=()=>selectMapPlayer(button.dataset.selectPlayer));
  const ownSelected=selectedPlayerId===meId;
  const myTurn=publicState.phase==='playing'&&publicState.currentPlayerId===meId&&!player?.eliminated;
  const selected=tiles.find(tile=>tile.id===selectedTileId);
  const terrain=selected&&(TERRAIN[selected.type]||TERRAIN.plain);
  const stepCost=selected?terrainCostFor(player,selected):Infinity;
  const adjacent=hexDistance(player?.position,selectedTileId)===1;
  const canStep=ownSelected&&myTurn&&adjacent&&(player?.movePoints??0)>=stepCost;
  $('confirmMove').disabled=!canStep;
  $('confirmMove').textContent=canStep?`移动到选中格（消耗 ${stepCost} 格）`:'移动到选中格';
  const left=player?.movePoints;
  $('movementHint').textContent=
    !selectedPlayerId?'① 选择自己的角色 → ② 掷移动骰 → ③ 点击相邻格移动（点数＝格数）':
    !ownSelected?'正在查看其他角色；选择自己的角色后才能移动':
    !myTurn?'等待你的回合':
    left==null?'已选择自己的角色，请先掷移动骰':
    adjacent?`移动中 · 还剩 ${left} 格 · 进入 ${selected.id}（${terrain.name}）消耗 ${stepCost} 格`:
    `移动中 · 还剩 ${left} 格 · 点击高亮的相邻格即可移动，或点「结束移动」`;
  updateMapView();
  const claimText=selected?.claim?` · 大金矿已被 ${esc(selected.claim.nickname||"")} 占领（剩余 ${selected.claim.roundsLeft} 回合）`:selected?.type==="goldMine"?" · 大金矿可占领，进入即占领并连续 3 回合每回合结束获得 2 金":"";
  const costText=selected&&myTurn?` · 进入消耗 ${terrainCostFor(player,selected)} 格`:'';
  $('boardHint').textContent=selected?`${terrain.name} · ${selected.id}${costText}${selected.feature==="forge"?" · 铁匠铺":""}${selected.building?` · ${selected.building.name}（产出 ${selected.building.output}）`:''}${selected.resource?' · 有资源':''}${claimText}。`:'点击相邻地块移动，或先掷移动骰；地图格之间已紧密拼接；按住右键可拖动地图。';
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
function actionButton(text, action, extraClass=""){
  return `<button data-action="${action}" class="${extraClass}">${text}</button>`;
}
function renderGame(payload){
  $('auth').classList.add('hidden');$('lobby').classList.add('hidden');$('game').classList.remove('hidden');
  const publicState=payload.public;
  document.querySelector('.board-hint').textContent='移动阶段点击相邻格即可移动：掷出的点数就是可移动格数，困难地形（森林/丘陵/河流）进入时消耗 2 格。点击其他格只选择目标。';
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
  const selected=publicState.tiles.find(tile=>tile.id===selectedTileId);
  const buildingOptions=`<select id="buildingType"><option value="career">专属建筑</option><option value="lumber">伐木场</option><option value="quarry">采石场</option><option value="ranch">牧场</option><option value="mine">金矿场</option></select>`;
  const targetOptions=`<select id="targetPlayer"><option value="">选择目标玩家</option>${publicState.players.filter(player=>!player.eliminated).map(player=>`<option value="${esc(player.playerId)}">${esc(player.nickname)}${player.playerId===meId?"（自己）":""}</option>`).join('')}</select>`;
  const resourceOptions=`<select id="resourceChoice"><option value="wood">木</option><option value="stone">石</option><option value="meat">肉</option><option value="gold">金</option></select><input id="resourceAmount" type="number" min="1" max="10" value="1" title="置换数量" style="width:64px;background:#1b2523;color:#fff4d9;border:1px solid #b19059;border-radius:8px;padding:8px">`;
  // 天赋按钮按角色实际天赋名、费用与实现状态生成；未接入的天赋按钮禁用并给出原因，避免白花资源。
  const talentButtons=()=>{
    if(!me)return '';
    const support=me.talentSupport||{2:{},3:{}};
    return [2,3].flatMap(level=>["a","b"].map(branch=>{
      const name=career?.[`lv${level}${branch}Name`];
      if(!name)return '';
      const cost=(level===2?career[`lv2${branch}Cost`]:career.lv3Cost)||"无";
      const owned=(level===2?me.talent2:me.talent3)===branch;
      const supported=support[level]?.[branch]!==false;
      const locked=owned||!supported;
      const title=owned?"已学习":supported?"":'此天赋效果尚未接入，暂时无法升级';
      return `<button data-action="upgrade${level}${branch}" data-locked="${locked?1:0}" title="${esc(title)}" class="${supported?"":"secondary"}">${level===2?"二级":"三级"} ${esc(name)} · ${esc(cost)}${supported?"":"（待接入）"}</button>`;
    })).join('');
  };
  const rerollButton=me&&me.careerId==="gambler"&&(me.rerollLeft||0)>0&&me.movePoints!=null&&!me.moveSpent
    ?actionButton(`重投移动骰 · 剩 ${me.rerollLeft} 次`,"rerollMove")
    :'';
  const forcedRaid=me?.careerId==="merchant"&&me.talent3==="b";
  $('actionbar').innerHTML=playing?`${actionButton("掷移动骰","rollMove")}${rerollButton}${actionButton("结束移动","stopMove","secondary")}${actionButton("额外移动","extraMove")}${actionButton("抽牌","draw")}${actionButton("抽两张 · 1肉","drawExtra")}${actionButton("铁匠铺抽装备","forge")}${targetOptions}${resourceOptions}${buildingOptions}${actionButton("建造选中格","build")}${actionButton("收获选中格","harvest")}${actionButton(forcedRaid?"强制征税选中格 · 2铜币":"抢夺选中格","raid")}${actionButton("泉水恢复","spring")}${talentButtons()}${actionButton("开始试炼","trial")}${actionButton("结束回合","endTurn","secondary")}${publicState.hostId===meId?actionButton("结束对局","endGame","danger"):''}`:'';
  $('actionbar').querySelectorAll('[data-action]').forEach(button=>{
    button.disabled=button.dataset.locked==="1"||(!myTurn&&button.dataset.action!=="endGame");
    button.onclick=()=>dispatchAction(button.dataset.action);
  });
  if(!playing)notice('gameNotice','本局已结束，地图和记录保留供查看。');
}
function dispatchAction(kind){
  const tileId=selectedTileId;
  if(kind==="drawExtra")return send({type:"draw",extra:true});
  if(kind.startsWith("upgrade"))return send({type:"upgrade",level:Number(kind.slice(-2,-1)),branch:kind.slice(-1)});
  if(kind==="build")return send({type:"build",tileId,buildingType:$('buildingType').value});
  if(["harvest","raid"].includes(kind))return send({type:kind,tileId});
  if(kind==="trial")return trialDialog.showModal();
  if(kind==="endGame"&&!confirm("确定手动结束这场对局吗？"))return;
  send({type:kind});
}
const boardHint=document.createElement("div");boardHint.id="boardHint";boardHint.className="tile-tooltip";
document.querySelector(".board-hint").after(boardHint);
const trialDialog=document.createElement("dialog");
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
