const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const rulesEngine = require('./rules-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Supabase配置，从Render环境变量读取
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE_NAME = "daotu";
const GAME_TABLE_NAME = "daotu_games";
const MAX_PLAYERS = 6;
const ROOM_CODE_LENGTH = 6;

// 初始化默认数据（和你原版完全复制，作为兜底）
const defaultData = {
  announcement:"欢迎来到道途协作工作台，公告栏可以在这里发布当日说明。",
  mapNote:"六边形地图示意区：这里先作为地图模块占位，后续可扩展成真正的地块编辑。",
  careers:[
    {
      id:"hunter",name:"猎人",hp:8,equipSlot:"1武器1护具1鞋1道具1宠物",
      buildingName:"猎人公会",buildingDesc:"消耗2肉，默认产出2猎人标记",
      passive0:"忠诚的伙伴：猎人开局自带特殊装备：猎狗（可以在某些卡牌中获取额外收益）",
      lv2aName:"丛林之主",lv2aEffect:"困难地形的移动消耗减1，并且不会受到困难地形造成的伤害",lv2aCost:"2木3肉",
      lv2bName:"鹰眼",lv2bEffect:"攻击距离加1，一回合只能进行一次基础攻击",lv2bCost:"2木3肉",
      lv3Cost:"4金",
      lv3aName:"公会会长",lv3aEffect:"猎人印记无需使用卡牌可以直接放置（消耗行动力，2格范围）并且猎人公会产出加1",
      lv3bName:"锐利鹰眼",lv3bEffect:"攻击距离加1，一回合只能进行一次基础攻击，可以消耗2枚印记额外追加一次基础攻击"
    },
    {
      id:"merchant",name:"商人",hp:8,equipSlot:"1武器1护具1鞋1道具",
      buildingName:"商会",buildingDesc:"消耗2点生命，默认产出2铜币",
      passive0:"重商轻武:商人基础攻击为0，可以在自身所在格子的相邻格子进行建造（建造范围 + 1）",
      lv2aName:"商会大亨",lv2aEffect:"商会的默认产出加1",lv2aCost:"2木3石",
      lv2bName:"拿钱砸人",lv2bEffect:"商人的基础攻击替换为：消耗2铜币对3格范围内的一名玩家造成一点伤害",lv2bCost:"2木3石",
      lv3Cost:"4金",
      lv3aName:"大富大贵",lv3aEffect:"商人从所有非铜币的收入中额外获得1铜币",
      lv3bName:"强制征税",lv3bEffect:"商人可以消耗一次行动和2铜币对3格内的地块强制抢夺（一回合一次）"
    },
    {
      id:"gambler",name:"赌徒",hp:8,equipSlot:"1武器1护具1鞋1道具",
      buildingName:"赌场",buildingDesc:"消耗2石头，默认产出2筹码",
      passive0:"好赌之人:每次投掷骰子时，可以进行一次重投（一回合一次）",
      lv2aName:"赌瘾犯了",lv2aEffect:"天赋好赌之人改为一回合2次",lv2aCost:"2木3石",
      lv2bName:"赌命",lv2bEffect:"指定2格范围内的一名玩家，你投掷1枚1~6的骰子，你和该玩家各自选择一个不同的结果，若你赢，对该玩家造成2点伤害，若你输，则失去1点生命，若平局重新投掷，再平局双方扣1血",lv2bCost:"2筹码3木",
      lv3Cost:"4金",
      lv3aName:"出老千",lv3aEffect:"进行投掷时，你获得额外一个骰子，你可以选择其中一个作为最终结果",
      lv3bName:"赌神",lv3bEffect:"赌场默认产出加1，可在赌场用筹码换取任意基础资源（不消耗行动）"
    },
    {id:"paladin",name:"圣骑士",hp:12,equipSlot:"1武器1护具1鞋1道具",buildingName:"圣殿",buildingDesc:"待填写",passive0:"待填写",lv2aName:"",lv2aEffect:"",lv2aCost:"",lv2bName:"",lv2bEffect:"",lv2bCost:"",lv3Cost:"4金",lv3aName:"",lv3aEffect:"",lv3bName:"",lv3bEffect:""},
    {id:"beggar",name:"乞丐",hp:7,equipSlot:"1武器1护具1鞋1道具",buildingName:"乞讨棚",buildingDesc:"待填写",passive0:"待填写",lv2aName:"",lv2aEffect:"",lv2aCost:"",lv2bName:"",lv2bEffect:"",lv2bCost:"",lv3Cost:"4金",lv3aName:"",lv3aEffect:"",lv3bName:"",lv3bEffect:""},
    {id:"android",name:"人造人",hp:9,equipSlot:"1武器1护具1鞋1道具",buildingName:"维修站",buildingDesc:"待填写",passive0:"待填写",lv2aName:"",lv2aEffect:"",lv2aCost:"",lv2bName:"",lv2bEffect:"",lv2bCost:"",lv3Cost:"4金",lv3aName:"",lv3aEffect:"",lv3bName:"",lv3bEffect:""}
  ],
  cards:[
    {"career":"hunter","type":"行动卡","name":"陷阱投放","count":3,"cost":"1木1石","effect":"在指定地点放置一个陷阱标记（2格范围内）对站到该位置的敌对玩家进行一次1~3的投掷判定，当判定结果为1时，其下轮无法进行基础行动，不为1时，受到1点伤害","note":""},
    {"career":"hunter","type":"行动卡","name":"隐秘行踪","count":3,"cost":"2肉","effect":"在卡面上放置2回合倒计时标记，两回合内自身不可被其他玩家的攻击行动选中。主动做出除了移动以外的行动将提前结束隐秘行踪","note":""},
    {"career":"hunter","type":"行动卡","name":"猎人标记","count":2,"cost":"x猎人标记","effect":"选定一名玩家,将任意枚猎人标记置于其牌面，你对拥有猎人标记的玩家造成的伤害加1。回合结束时移除一枚猎人标记","note":"猎人标记由猎人专属建筑猎人公会产出"},
    {"career":"hunter","type":"行动卡","name":"狩猎","count":3,"cost":"1木","effect":"获取1肉，携带猎狗伙伴时，可以额外获取1肉","note":""},
    {"career":"hunter","type":"行动卡","name":"拾荒","count":3,"cost":"2肉","effect":"派出猎狗收取物资（暂时移除猎狗2回合），2回合结束后重新装备猎狗并且投掷两枚1~3骰子，你可以获取任意基础资源，数量为投掷结果相加","note":""},
    {"career":"hunter","type":"行动卡","name":"前进","count":4,"cost":"1肉","effect":"进行一次移动点数为1的自由移动（丛林之主可额外移动1）","note":""},
    {"career":"hunter","type":"行动卡","name":"整备","count":1,"cost":"1肉","effect":"进行一次装备牌的抽取","note":""},
    {"career":"hunter","type":"行动卡","name":"猎人背包","count":1,"cost":"1木","effect":"货物装备卡“背包”","note":""},
    {"career":"hunter","type":"行动卡","name":"冲吧！猎狗","count":3,"cost":"2肉","effect":"基础攻击后可追加猎狗进行1次数值为0（可受到猎人标记加成）的基础攻击","note":""},
    {"career":"hunter","type":"行动卡","name":"誓死捍卫主人","count":1,"cost":"无","effect":"指定2格范围内一名玩家，猎狗将用生命缠住目标，使目标下1轮次无法进行任何移动，使用后移除宠物猎狗","note":""},
    {"career":"hunter","type":"行动卡","name":"召唤猎狗","count":1,"cost":"1肉","effect":"召唤猎狗到你的宠物装备位","note":""},
    {"career":"hunter","type":"行动卡","name":"瞄准射击","count":3,"cost":"2石","effect":"进行一次攻击距离加1的基础攻击","note":""},
    {"career":"hunter","type":"行动卡","name":"止血绷带","count":3,"cost":"1肉1木","effect":"回复2点生命","note":""},
    {"career":"hunter","type":"行动卡","name":"舔舐伤口","count":2,"cost":"无","effect":"回复1点生命","note":""},
    {"career":"hunter","type":"行动卡","name":"陷阱回收","count":2,"cost":"无","effect":"可以回收已经放置的陷阱标记，并在2格范围内重新放置","note":""},
    {"career":"hunter","type":"行动卡","name":"超级建造","count":1,"cost":"2金","effect":"在指定可建造地块直接建造任意建造（不包含其他角色专属建筑）","note":""},
    {"career":"hunter","type":"行动卡","name":"超级收获","count":1,"cost":"1金","effect":"在指定可收获地块直接进行一次收获","note":""},
    {"career":"hunter","type":"行动卡","name":"战术瞄准","count":1,"cost":"3金","effect":"在卡面上放置2回合倒计时标记，两回合内自身攻击范围增加1","note":""},
    {"career":"hunter","type":"行动卡","name":"猎狗进化","count":1,"cost":"3金","effect":"猎狗造成的基础攻击伤害增加1点","note":""},
    {"career":"hunter","type":"武器","name":"十字弩","count":1,"cost":"无","effect":"装备后，可以在弩上放置1木，使下次基础攻击伤害加1","note":""},
    {"career":"hunter","type":"武器","name":"匕首","count":1,"cost":"无","effect":"装备后，进行攻击距离为1的基础攻击造成的伤害加1","note":""},
    {"career":"hunter","type":"护具","name":"轻布甲","count":1,"cost":"无","effect":"装备后，进行攻击距离为1的基础攻击造成的伤害加1","note":""},
    {"career":"hunter","type":"鞋","name":"轻便草鞋","count":1,"cost":"无","effect":"装备后，进行基础移动后可以追加一次1点的移动","note":""},
    {"career":"hunter","type":"道具","name":"捕兽夹","count":1,"cost":"无","effect":"装备后，提升1点陷阱标记造成的伤害","note":""},
    {"career":"hunter","type":"道具","name":"草药","count":1,"cost":"无","effect":"装备后止血绷带的消耗减少1木","note":""},
    {"career":"hunter","type":"道具","name":"哨子","count":1,"cost":"无","effect":"猎狗存在时，可以消耗一点行动力直接获取舔舐伤口或者召唤猎狗，当猎狗死亡时，此装备直接移除本局游戏","note":""}
  ]
};

// 内存缓存
const backupPath = path.join(__dirname, '道途项目备份.json');
let memoryData = fs.existsSync(backupPath) ? JSON.parse(fs.readFileSync(backupPath, 'utf8')) : {...defaultData};
const rooms = new Map();

function makeRoomCode(){
  let code;
  do code = Math.random().toString(36).slice(2, 2 + ROOM_CODE_LENGTH).toUpperCase(); while(rooms.has(code));
  return code;
}

function makeToken(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`; }

function careerIsReady(careerId){
  return (memoryData.cards || []).some(card=>card.career === careerId && card.name && card.effect);
}

function createGameRoom(roomCode, host, maxPlayers){
  return {roomCode, phase:"lobby", hostId:host.playerId, maxPlayers, createdAt:Date.now(), updatedAt:Date.now(), turnIndex:0, round:1, currentPlayerId:null, winner:null, log:[], tiles:rulesEngine.createTiles(), decks:{}, equipmentDecks:{}, discard:[], holySpringUses:0, players:[host]};
}

function validTiles(tiles){
  return Array.isArray(tiles) && tiles.length >= 100 && tiles.every(tile =>
    tile && typeof tile.id === "string" && Number.isFinite(Number(tile.q)) && Number.isFinite(Number(tile.r)) && typeof tile.type === "string"
  );
}

function publicPlayer(player, round){
  return {playerId:player.playerId, nickname:player.nickname, careerId:player.careerId, connected:!!player.connected, ready:!!player.ready, hp:player.hp, maxHp:player.maxHp, score:player.score, resources:{...player.resources}, position:player.position, eliminated:!!player.eliminated, actionsLeft:player.actionsLeft, moved:!!player.moved, movePoints:player.movePoints, handCount:player.hand?.length||0, secretCount:player.secrets?.length||0, equipment:(player.equipment||[]).map(card=>({name:card.name,type:card.type})), talent2:player.talent2, talent3:player.talent3, aimUntilRound:player.aimUntilRound||0, stealthUntilRound:player.stealthUntilRound||0, dog:!!player.dog, burn:player.burn||0, blessing:!!player.blessing, trial:player.trial||null, attackRange:rulesEngine.attackRange(player, round), goldMine:player.goldMine||null, goldMineCollected:player.goldMineCollected||0, rerollLeft:player.rerollLeft||0, moveSpent:!!player.moveSpent, ignoreTerrainCost:!!player.ignoreTerrainCost, buildsThisTurn:!!player.buildsThisTurn, raidsThisTurn:!!player.raidsThisTurn, playActionOpen:!!player.playActionOpen, stunnedUntilRound:player.stunnedUntilRound||0, talentSupport:rulesEngine.talentSupport(player.careerId)};
}

function publicRoom(room){
  return {roomCode:room.roomCode, phase:room.phase, hostId:room.hostId, maxPlayers:room.maxPlayers || MAX_PLAYERS, round:room.round, currentPlayerId:room.currentPlayerId, winner:room.winner, players:room.players.map(player=>publicPlayer(player, room.round)), tiles:room.tiles, discard:room.discard.slice(-20), log:room.log.slice(-40)};
}

function privateRoom(room, playerId){
  const player = room.players.find(item=>item.playerId === playerId);
  return {hand:player ? player.hand : [], secrets:player ? player.secrets : [], equipment:player ? player.equipment : [], reconnectToken:player ? player.reconnectToken : null, deckCount:room.decks?.[playerId]?.length||0, equipmentDeckCount:room.equipmentDecks?.[playerId]?.length||0};
}

function emitRoom(room){
  for(const player of room.players){
    if(!player.socketId) continue;
    io.to(player.socketId).emit("gameState", {public:publicRoom(room), private:privateRoom(room, player.playerId)});
  }
}

function appendLog(room, message){ room.log.push({at:Date.now(), message}); if(room.log.length > 100) room.log.shift(); }

// 外部请求统一加超时，避免云端无响应时把玩家的操作永久挂起。
const CLOUD_TIMEOUT_MS = 6000;

async function saveGameRoom(room){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try{
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${GAME_TABLE_NAME}`, {method:"POST", headers:{"apikey":SUPABASE_SERVICE_KEY,"Authorization":`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify({room_code:room.roomCode, content:room, updated_at:new Date().toISOString()}), signal:AbortSignal.timeout(CLOUD_TIMEOUT_MS)});
    if(!response.ok) console.error("❌保存对局失败", response.status, await response.text());
  }catch(error){ console.error("❌保存对局失败", error.message); }
}

async function deleteGameRoom(roomCode){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try{
    await fetch(`${SUPABASE_URL}/rest/v1/${GAME_TABLE_NAME}?room_code=eq.${encodeURIComponent(roomCode)}`, {method:"DELETE", headers:{"apikey":SUPABASE_SERVICE_KEY,"Authorization":`Bearer ${SUPABASE_SERVICE_KEY}`}, signal:AbortSignal.timeout(CLOUD_TIMEOUT_MS)});
  }catch(error){ console.error("❌删除对局失败", error.message); }
}

// 每个房间的保存按顺序排队：广播不再等待云端，同时避免并发写入用旧快照覆盖新状态。
const saveQueues = new Map();
function persistRoom(room){
  const previous = saveQueues.get(room.roomCode) || Promise.resolve();
  const next = previous.then(()=>saveGameRoom(room)).catch(()=>{});
  saveQueues.set(room.roomCode, next);
  return next;
}

async function loadGameRoom(roomCode){
  if(rooms.has(roomCode)) return rooms.get(roomCode);
  if(!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try{
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${GAME_TABLE_NAME}?room_code=eq.${encodeURIComponent(roomCode)}&select=content&limit=1`, {headers:{"apikey":SUPABASE_SERVICE_KEY,"Authorization":`Bearer ${SUPABASE_SERVICE_KEY}`}});
    const rows = await response.json();
    const room = rows?.[0]?.content;
    if(room?.roomCode){
      if(!validTiles(room.tiles)) room.tiles = rulesEngine.createTiles();
      room.log = Array.isArray(room.log) ? room.log : [];
      room.discard = Array.isArray(room.discard) ? room.discard : [];
      room.players = Array.isArray(room.players) ? room.players : [];
      room.decks = room.decks && typeof room.decks === "object" ? room.decks : {};
      room.equipmentDecks = room.equipmentDecks && typeof room.equipmentDecks === "object" ? room.equipmentDecks : {};
      room.players.forEach(player=>{player.connected=false;player.socketId=null});
      rooms.set(roomCode, room);
      return room;
    }
  }catch(error){ console.error("❌读取对局失败", error.message); }
  return null;
}

// 出生点：按玩家顺序均匀分布在外圈（距中心 6 格）的板块上，绝不落到中心试炼格。
function spawnTiles(room, count){
  const ring = room.tiles
    .filter(tile=>Math.max(Math.abs(tile.q),Math.abs(tile.r),Math.abs(tile.q+tile.r))===6)
    .sort((first,second)=>Math.atan2(71*first.r+35.5*first.q,61.5*first.q)-Math.atan2(71*second.r+35.5*second.q,61.5*second.q));
  const pool = ring.length ? ring : room.tiles.filter(tile=>tile.type!=="trial");
  if(!pool.length) return [];
  const step = Math.max(1, Math.floor(pool.length/Math.max(1,count)));
  return Array.from({length:count},(_,index)=>pool[(index*step)%pool.length]);
}

function startRoom(room){
  if(room.phase!=="lobby") return {ok:false,error:"对局已经开始或结束"};
  const targetPlayers = room.maxPlayers || MAX_PLAYERS;
  if(room.players.length !== targetPlayers) return {ok:false, error:`需要 ${targetPlayers} 名玩家才能开始`};
  // 允许重复职业；每名玩家仍拥有独立牌库，避免重复职业共享手牌或牌库。
  const decks = rulesEngine.createDecks(memoryData.cards, room.players);
  room.decks = decks.decks; room.equipmentDecks = decks.equipmentDecks;
  const spawnRing = spawnTiles(room, room.players.length);
  room.players.forEach((player, index) => {
    player.hp = player.maxHp; player.score = 0; player.resources = {wood:1, stone:1, meat:1, gold:0, special:0};
    player.position = spawnRing[index].id;
    player.actionsLeft = 2; player.moved = false; player.movePoints=null; player.hand=[]; player.discard=[]; player.equipmentDiscard=[];
    rulesEngine.draw(room,player,3);
    player.secrets = []; player.equipment = []; player.eliminated = false; player.ready = true;
    player.buildsThisTurn=0; player.raidsThisTurn=0; player.attacksThisTurn=0; player.playActionOpen=false;
    player.dog=player.careerId==="hunter"; player.raidMarkers=0; player.raidUses=0;
    player.talent2=null; player.talent3=null; player.burn=0; player.blessing=false;
    player.weakShield=0; player.weakShieldHit=false; player.armorUses=2; player.coatUsed=false;
    player.aimUntilRound=0; player.stealthUntilRound=0; player.stunnedUntilRound=0;
    player.painkillerUntilRound=0; player.dripHealRound=0; player.loanMovePenaltyRound=0;
    player.trial=null; player.debtPending=false; player.fireTiles=[];
    player.goldMine=null; player.goldMineCollected=0;
    player.rerollLeft=player.careerId==="gambler"?1:0; player.moveSpent=false;
  });
  rulesEngine.draw(room,room.players[0]);
  room.phase = "playing"; room.currentPlayerId = room.players[0].playerId; room.round = 1; appendLog(room, "对局开始，首位玩家抽取回合牌"); return {ok:true};
}

// 从supabase读取id=1记录
async function loadSupabase(){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_KEY){
    console.warn("⚠️没有配置Supabase环境变量，使用本地默认数据");
    return;
  }
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.1&select=content`,{
      headers:{
        "apikey":SUPABASE_SERVICE_KEY,
        "Authorization":`Bearer ${SUPABASE_SERVICE_KEY}`
      }
    })
    const arr = await res.json();
    if(Array.isArray(arr) && arr.length>0 && arr[0].content){
      memoryData = arr[0].content;
      console.log("✅成功从Supabase加载数据");
    }else{
      console.log("ℹ️Supabase无id=1记录，使用defaultData");
    }
  }catch(e){
    console.error("❌读取Supabase失败",e);
  }
}

// 更新supabase id=1
async function saveSupabase(payload){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try{
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.1`,{
      method:"PATCH",
      headers:{
        "apikey":SUPABASE_SERVICE_KEY,
        "Authorization":`Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type":"application/json",
        "Prefer":"return=representation"
      },
      body:JSON.stringify({content:payload})
    })
  }catch(err){
    console.error("❌保存Supabase失败",err);
  }
}

// 服务启动拉取云端
loadSupabase();

app.use(express.static(__dirname));

io.on('connection', (socket)=>{
  console.log("客户端已连接",socket.id);
  // 下发当前内存数据，协议不变 fullData
  socket.emit("fullData", memoryData);

  socket.on("createRoom", async ({nickname, careerId, maxPlayers} = {}, callback = ()=>{})=>{
    const cleanName = String(nickname || "").trim().slice(0, 24); const requestedPlayers = Math.max(1, Math.min(MAX_PLAYERS, Number(maxPlayers) || MAX_PLAYERS));
    if(!cleanName) return callback({ok:false, error:"请输入昵称"});
    const player = {playerId:makeToken(), nickname:cleanName, careerId:String(careerId || ""), reconnectToken:makeToken(), socketId:socket.id, connected:true, ready:false, hp:0, maxHp:0, score:0, resources:{}, position:null, actionsLeft:0, moved:false, hand:[], secrets:[], equipment:[], eliminated:false};
    const career = (memoryData.careers || []).find(item=>item.id === player.careerId);
    if(!career || !careerIsReady(player.careerId)) return callback({ok:false, error:"该职业卡牌尚未完成，暂未开放"});
    player.maxHp = Number(career.hp) || 8;
    const room = createGameRoom(makeRoomCode(), player, requestedPlayers); rooms.set(room.roomCode, room); socket.join(room.roomCode);
    callback({ok:true, roomCode:room.roomCode, playerId:player.playerId, reconnectToken:player.reconnectToken, isHost:true}); emitRoom(room); persistRoom(room);
  });

  socket.on("joinRoom", async ({roomCode, nickname, careerId} = {}, callback = ()=>{})=>{
    const code = String(roomCode || "").trim().toUpperCase(); const cleanName = String(nickname || "").trim().slice(0, 24);
    const room = await loadGameRoom(code);
    if(!room) return callback({ok:false, error:"房间不存在"});
    if(room.phase !== "lobby") return callback({ok:false, error:"对局已经开始，不能中途加入"});
    if(room.players.length >= (room.maxPlayers || MAX_PLAYERS)) return callback({ok:false, error:"房间已满"});
    if(room.players.some(item=>item.nickname === cleanName)) return callback({ok:false, error:"昵称已被使用"});
    // 已裁定：允许重复职业，每名玩家仍使用各自的独立牌库。
    const career = (memoryData.careers || []).find(item=>item.id === careerId); if(!career || !careerIsReady(careerId)) return callback({ok:false, error:"该职业卡牌尚未完成，暂未开放"});
    const player = {playerId:makeToken(), nickname:cleanName, careerId:String(careerId), reconnectToken:makeToken(), socketId:socket.id, connected:true, ready:false, hp:0, maxHp:Number(career.hp) || 8, score:0, resources:{}, position:null, actionsLeft:0, moved:false, hand:[], secrets:[], equipment:[], eliminated:false};
    room.players.push(player); room.updatedAt=Date.now(); socket.join(room.roomCode);
    callback({ok:true, roomCode:room.roomCode, playerId:player.playerId, reconnectToken:player.reconnectToken, isHost:false}); emitRoom(room); persistRoom(room);
  });

  socket.on("reconnectRoom", async ({roomCode, reconnectToken} = {}, callback = ()=>{})=>{
    const room = await loadGameRoom(String(roomCode || "").trim().toUpperCase());
    const player = room?.players.find(item=>item.reconnectToken === reconnectToken);
    if(!room || !player) return callback({ok:false, error:"重连凭证无效"});
    player.socketId = socket.id; player.connected = true; socket.join(room.roomCode); callback({ok:true, roomCode:room.roomCode, playerId:player.playerId, reconnectToken:player.reconnectToken}); emitRoom(room);
  });

  // 主动离开：等待阶段释放席位（房主顺延），对局中只标记掉线，避免破坏进行中的对局。
  socket.on("leaveRoom", async ({roomCode, playerId} = {}, callback = ()=>{})=>{
    const room = rooms.get(String(roomCode || "").toUpperCase());
    const player = room?.players.find(item=>item.playerId === playerId);
    if(!room || !player) return callback?.({ok:true});
    player.connected = false; player.socketId = null; socket.leave(room.roomCode);
    if(room.phase === "lobby"){
      room.players = room.players.filter(item=>item.playerId !== playerId);
      if(!room.players.length){ rooms.delete(room.roomCode); await deleteGameRoom(room.roomCode); return callback?.({ok:true}); }
      if(room.hostId === playerId) room.hostId = room.players[0].playerId;
      appendLog(room, `${player.nickname} 离开了房间`);
    }
    room.updatedAt = Date.now();
    callback?.({ok:true});
    emitRoom(room);
    persistRoom(room);
  });

  socket.on("readyRoom", async ({roomCode, playerId} = {}, callback = ()=>{})=>{
    const room = rooms.get(String(roomCode || "").toUpperCase()); const player = room?.players.find(item=>item.playerId === playerId);
    if(!room || !player) return callback({ok:false, error:"房间或玩家不存在"}); player.ready = true; callback({ok:true}); emitRoom(room); persistRoom(room);
  });

  socket.on("startRoom", ({roomCode, playerId} = {}, callback = ()=>{}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase());
    if(!room || room.hostId !== playerId || room.players.find(item=>item.playerId===playerId)?.socketId !== socket.id) return callback({ok:false, error:"只有房主可以开始"});
    const result = startRoom(room);
    if(result.ok){ room.updatedAt=Date.now(); emitRoom(room); persistRoom(room); }
    callback(result);
  });

  socket.on("gameAction", ({roomCode, playerId, action} = {}, callback = ()=>{}) => {
    const room = rooms.get(String(roomCode || "").toUpperCase()); const player = room?.players.find(item=>item.playerId === playerId);
    const result = room && player && player.socketId === socket.id ? rulesEngine.act(room, player, action || {}, memoryData.careers || []) : {ok:false, error:"房间或玩家身份无效"};
    // 先广播再落库：玩家不必等云端写入就能看到结果，写入按房间排队以保证顺序。
    if(result.ok){ room.updatedAt=Date.now(); emitRoom(room); persistRoom(room); }
    callback(result);
  });

  socket.on("updateAll", (newData)=>{
    memoryData = newData;
    io.emit("fullData", memoryData);
    // 写入云端
    saveSupabase(memoryData);
  })

  socket.on("disconnect",()=>{
    console.log("客户端断开",socket.id);
    for(const room of rooms.values()){
      const player = room.players.find(item=>item.socketId === socket.id);
      if(player){ player.connected = false; player.socketId = null; room.updatedAt=Date.now(); saveGameRoom(room); emitRoom(room); }
    }
  })
})

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>{
  console.log(`服务监听端口 ${PORT}`);
});
