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
  plain:{name:"平原",icon:"✦",color:"#9ba75c"},
  forest:{name:"森林",icon:"♠",color:"#456e45"},
  hill:{name:"丘陵",icon:"▲",color:"#998452"},
  river:{name:"河流",icon:"≈",color:"#4c88a0"},
  riverGod:{name:"河神",icon:"♜",color:"#426c91"},
  desert:{name:"沙漠",icon:"☀",color:"#ba9858"},
  spring:{name:"泉水",icon:"✧",color:"#5aa8a1"},
  holySpring:{name:"圣泉",icon:"✴",color:"#91cbc0"},
  void:{name:"虚空",icon:"◆",color:"#68588b"},
  fire:{name:"地火",icon:"♨",color:"#a24e35"},
  goldMine:{name:"金矿",icon:"✦",color:"#ae9042"},
  trial:{name:"生存试炼",icon:"★",color:"#ae793d"}
};
const SUPPORTED_CARDS = new Set(["止血绷带","舔舐伤口","狩猎","整备","前进","召唤猎狗","隐秘行踪","战术瞄准","猎狗进化","金盆洗手","黑金","黑市交易","投资军火","瞄准射击","放暗箭","轻便草鞋","草药","轻皮衣","黑大衣","马车","钱是万能的","换取筹码","哪有赌徒天天输","贷款","好运or厄运","逃跑是门技术","撒钱","止痛药","打吊水","假意示弱","空头支票"]);
let selectedTileId = null;
let targetMode = "move";

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
function renderMap(publicState, player){
  const tiles=publicState.tiles||[];
  const hexPoints="-41,0 -20.5,-35.5 20.5,-35.5 41,0 20.5,35.5 -20.5,35.5";
  const cells=tiles.map(tile=>{
    const x=450+61.5*tile.q;
    const y=450+71*tile.r+35.5*tile.q;
    const terrain=TERRAIN[tile.type]||TERRAIN.plain;
    const occupants=publicState.players.filter(item=>item.position===tile.id&&!item.eliminated);
    const building=tile.building;
    const selected=selectedTileId===tile.id?" selected":"";
    const icon=building?"⌂":tile.feature==="forge"?"⚒":terrain.icon;
    const marker=occupants.length?`<circle cx="25" cy="-22" r="11" fill="#efcf89" stroke="#34251a" stroke-width="2"/><text class="hex-count" x="25" y="-18" fill="#33271a" stroke="none">${occupants.length}</text>`:"";
    return `<g class="hex-cell${selected}" data-tile="${esc(tile.id)}" transform="translate(${x} ${y})"><polygon points="${hexPoints}" fill="${terrain.color}" stroke="#3f523d" stroke-width="1.2"/><polygon points="-37,0 -18.5,-32 18.5,-32 37,0 18.5,32 -18.5,32" fill="none" stroke="#ffeec0" stroke-opacity=".14"/><text class="hex-icon" y="5">${icon}</text>${marker}${tile.resource?'<circle cx="-24" cy="-20" r="5" fill="#f3d88b"/>':''}</g>`;
  }).join('');
  $('board').innerHTML=`<svg class="hex-map" viewBox="0 0 900 900" role="img" aria-label="127 格六角战棋地图"><defs><filter id="mapNoise"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="6"/><feColorMatrix values="0 0 0 0 0.12 0 0 0 0 0.14 0 0 0 0 0.09 0 0 0 .17 0"/></filter></defs><rect width="900" height="900" fill="#244d48"/>${cells}<rect width="900" height="900" filter="url(#mapNoise)" pointer-events="none" opacity=".16"/></svg>`;
  $('board').querySelectorAll('[data-tile]').forEach(cell=>cell.onclick=()=>selectTile(cell.dataset.tile));
  const selected=tiles.find(tile=>tile.id===selectedTileId);
  const terrain=selected&&(TERRAIN[selected.type]||TERRAIN.plain);
  $('boardHint').textContent=selected?`${terrain.name} · ${selected.id}${selected.feature==="forge"?" · 铁匠铺":""}${selected.building?` · ${selected.building.name}（产出 ${selected.building.output}）`:''}${selected.resource?' · 有资源':''}。点击地图格可移动或选定目标。`:'点击相邻地块移动，或先掷移动骰；地图格之间已紧密拼接。';
}
function selectTile(tileId){
  selectedTileId=tileId;
  if(targetMode==="move"&&state?.public?.phase==="playing"){
    const me=state.public.players.find(player=>player.playerId===meId);
    if(me?.movePoints!==null&&me?.movePoints!==undefined)send({type:"move",tileId});
  }
  if(state?.public)renderMap(state.public,state.public.players.find(player=>player.playerId===meId));
}
function actionButton(text, action, extraClass=""){
  return `<button data-action="${action}" class="${extraClass}">${text}</button>`;
}
function renderGame(payload){
  $('auth').classList.add('hidden');$('lobby').classList.add('hidden');$('game').classList.remove('hidden');
  const publicState=payload.public;
  const me=publicState.players.find(player=>player.playerId===meId);
  const playing=publicState.phase==="playing";
  const myTurn=playing&&publicState.currentPlayerId===meId;
  $('roomBadge').textContent=`房间 ${publicState.roomCode} · ${publicState.maxPlayers||5} 人`;
  $('turn').textContent=playing?`第 ${publicState.round} 轮 · ${publicState.players.find(player=>player.playerId===publicState.currentPlayerId)?.nickname||''} 的回合`:
    `对局已结束 · ${publicState.winner?.type==="manual"?"房主手动结束":publicState.winner?.nickname?"胜者："+publicState.winner.nickname:"无胜者"}`;
  const attackRange=me?.careerId==="merchant"&&me.talent2==="b"?3:(me?.careerId==="hunter"&&me.talent2==="b"||me?.aimUntilRound>publicState.round?1:0);
  $('players').innerHTML=publicState.players.map(player=>`<div class="player ${player.playerId===publicState.currentPlayerId?'current':''}"><div class="avatar">${roleImage(player.careerId)}</div><div class="player-main"><div class="player-name">${esc(player.nickname)} ${player.eliminated?'· 已淘汰':''}</div><div class="player-meta">${esc(careers.find(career=>career.id===player.careerId)?.name||'')} · ❤ ${player.hp}/${player.maxHp} · ★ ${player.score} · 手牌 ${player.handCount}</div></div>${myTurn&&player.playerId!==meId&&!player.eliminated&&hexDistance(player.position,me?.position)<=attackRange?`<button data-attack="${player.playerId}">攻击</button>`:''}</div>`).join('');
  $('players').querySelectorAll('[data-attack]').forEach(button=>button.onclick=()=>send({type:"attack",targetPlayerId:button.dataset.attack,resourceChoice:$('resourceChoice')?.value}));
  $('log').innerHTML=publicState.log.slice().reverse().map(entry=>`<div>${esc(entry.message)}</div>`).join('');
  renderMap(publicState,me);
  const resourceLabels={wood:"木",stone:"石",meat:"肉",gold:"金",special:"专属"};
  $('me').innerHTML=me?`<div class="player"><div class="avatar">${roleImage(me.careerId)}</div><div><b>${esc(me.nickname)}</b><div class="status">${esc(careers.find(career=>career.id===me.careerId)?.name||'')}</div></div></div><div class="resource-row">${Object.entries(me.resources||{}).map(([key,value])=>`<span class="resource">${resourceLabels[key]||key} <b>${value}</b></span>`).join('')}</div><div class="status">❤ ${me.hp}/${me.maxHp}　★ ${me.score}　行动 ${me.actionsLeft}　移动点 ${me.movePoints??"待掷骰"}</div><div class="status">行动牌库 ${payload.private.deckCount} · 装备牌库 ${payload.private.equipmentDeckCount} · 奥秘 ${me.secretCount}</div><div class="status">已装备：${me.equipment?.length?me.equipment.map(card=>esc(card.name)).join('、'):'无'}${me.dog?'、猎狗':''}</div>`:'';
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
  $('actionbar').innerHTML=playing?`${actionButton("掷移动骰","rollMove")}${actionButton("结束移动","stopMove","secondary")}${actionButton("额外移动","extraMove")}${actionButton("抽牌","draw")}${actionButton("抽两张 · 1肉","drawExtra")}${actionButton("铁匠铺抽装备","forge")}${targetOptions}${resourceOptions}${buildingOptions}${actionButton("建造选中格","build")}${actionButton("收获选中格","harvest")}${actionButton("抢夺选中格","raid")}${actionButton("泉水恢复","spring")}${actionButton("二级天赋 A","upgrade2a")}${actionButton("二级天赋 B","upgrade2b")}${actionButton("三级天赋 A","upgrade3a")}${actionButton("三级天赋 B","upgrade3b")}${actionButton("开始试炼","trial")}${actionButton("结束回合","endTurn","secondary")}${publicState.hostId===meId?actionButton("结束对局","endGame","danger"):''}`:'';
  $('actionbar').querySelectorAll('[data-action]').forEach(button=>{
    button.disabled=!myTurn&&button.dataset.action!=="endGame";
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
