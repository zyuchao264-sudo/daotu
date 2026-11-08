const TERRAIN_COST = {plain:1, forest:2, hill:2, river:2, riverGod:2, desert:1, spring:1, holySpring:1, void:1, fire:1, goldMine:1, trial:1};
const RESOURCE_NAMES = {wood:"木", stone:"石", meat:"肉", gold:"金", special:"专属资源"};
const cardEffects = require('./card-effects');
const BASE_BUILDINGS = {
  lumber:{name:"伐木场", terrain:"forest", cost:{wood:2}, resource:"wood"},
  quarry:{name:"采石场", terrain:"hill", cost:{stone:2}, resource:"stone"},
  ranch:{name:"牧场", terrain:"plain", cost:{meat:2}, resource:"meat"},
  mine:{name:"金矿场", terrain:"goldMine", cost:{stone:2}, resource:"gold"}
};
const CAREER_BUILDINGS = {
  hunter:{name:"猎人公会", terrain:"forest", cost:{meat:2}},
  merchant:{name:"商会", terrain:"plain", cost:{hp:2}},
  gambler:{name:"赌场", terrain:"plain", cost:{stone:2}},
  android:{name:"山地营帐", terrain:"hill", cost:{wood:1,stone:1}},
  career_1787382232648:{name:"骗术工坊", terrain:"plain", cost:{wood:1,stone:1}}
};
const TERRAIN_LAYOUT = [
  ["forest",5,-2,-1],["hill",5,2,-2],["river",5,0,3],["riverGod",1,1,2],
  ["desert",5,-3,2],["spring",1,0,-2],["holySpring",1,2,0],
  ["void",6,-1,3],["fire",3,3,1],["goldMine",1,-2,2]
];

function distance(first, second){
  return Math.max(Math.abs(first.q-second.q), Math.abs(first.r-second.r), Math.abs(first.q+first.r-second.q-second.r));
}

function createTiles(){
  const tiles=[];
  for(let row=-6;row<=6;row++) for(let col=-6;col<=6;col++){
    const tile={id:`${col}:${row}`,q:col,r:row,type:"plain",building:null,resource:null};
    if(distance(tile,{q:0,r:0})<=6) tiles.push(tile);
  }
  const center=tiles.find(tile=>tile.id==="0:0");center.type="trial";
  const main=tiles.filter(tile=>tile!==center&&distance(tile,center)<=4);
  const assign=(candidates,type,count,focus)=>candidates.filter(tile=>tile.type==="plain").sort((first,second)=>distance(first,focus)-distance(second,focus)||first.q-second.q||first.r-second.r).slice(0,count).forEach(tile=>{tile.type=type});
  for(const [type,count,q,r] of TERRAIN_LAYOUT) assign(main,type,count,{q,r});
  const outer=tiles.filter(tile=>distance(tile,center)>4);
  for(const [type,count,q,r] of [["forest",9,-5,-1],["hill",9,5,-3],["desert",4,-4,5],["void",2,4,2],["spring",1,0,-6]]) assign(outer,type,count,{q,r});
  const resourceTiles=tiles.filter(tile=>!['void','fire','riverGod','goldMine','trial'].includes(tile.type));
  let spawned=0;
  for(const tile of resourceTiles){
    if(Math.random()<0.35){
      tile.resource={type:["wood","stone","meat"][Math.floor(Math.random()*3)],amount:1};
      spawned++;
    }
  }
  if(!spawned&&resourceTiles.length){
    const tile=resourceTiles[Math.floor(Math.random()*resourceTiles.length)];
    tile.resource={type:["wood","stone","meat"][Math.floor(Math.random()*3)],amount:1};
  }
  for(const anchor of tiles.filter(tile=>distance(tile,center)===6)){
    const nearby=resourceTiles.filter(tile=>distance(tile,anchor)===1);
    if(nearby.length&&!nearby.some(tile=>tile.resource))nearby[0].resource={type:anchor.type==='forest'?'wood':anchor.type==='hill'?'stone':'meat',amount:1};
  }
  for(const focus of [{q:-1,r:-2},{q:2,r:-1}]){
    const tile=main.filter(item=>item.type==="plain"&&!item.feature).sort((first,second)=>distance(first,focus)-distance(second,focus))[0];
    if(tile)tile.feature="forge";
  }
  return tiles;
}

function shuffle(cards){
  for(let index=cards.length-1;index>0;index--){const swap=Math.floor(Math.random()*(index+1));[cards[index],cards[swap]]=[cards[swap],cards[index]]}
  return cards;
}

function createDecks(cards,players){
  const decks={};const equipmentDecks={};
  for(const player of players){
    const owned=(cards||[]).filter(card=>card.career===player.careerId&&card.name&&card.effect);
    const copies=owned.flatMap(card=>Array.from({length:Math.max(0,Math.min(8,Number(card.count)||0))},(_,index)=>({uid:`${card.uid||card.name}-${index}`,name:card.name,type:card.type,cost:card.cost||"无",effect:card.effect,trigger:card.trigger||"",career:card.career})));
    decks[player.playerId]=shuffle(copies.filter(card=>["行动卡","奥秘卡"].includes(card.type)));
    equipmentDecks[player.playerId]=shuffle(copies.filter(card=>!["行动卡","奥秘卡"].includes(card.type)));
  }
  return {decks,equipmentDecks};
}

function discardPile(player,equipment){return equipment?(player.equipmentDiscard||=[]):(player.discard||=[])}
function recycleDiscard(room,player,deck,discard,label){
  if(deck.length||!discard.length)return false;
  while(discard.length)deck.push(discard.pop());
  shuffle(deck);
  log(room,`${player.nickname} 的${label}弃牌堆已洗回牌库`);
  return true;
}
function draw(room,player,amount=1,equipment=false){
  const decks=equipment?room.equipmentDecks:room.decks;
  const deck=decks?.[player.playerId]||[];
  const discard=discardPile(player,equipment);
  const label=equipment?"装备牌":"职业牌";
  recycleDiscard(room,player,deck,discard,label);
  let drawn=0;
  while(drawn<amount){
    recycleDiscard(room,player,deck,discard,label);
    if(!deck.length)break;
    player.hand.push(deck.pop());drawn++;
  }
  return drawn;
}

function findTile(room,id){return room.tiles.find(tile=>tile.id===id)}
function log(room,message){room.log.push({at:Date.now(),message});if(room.log.length>100)room.log.shift()}
function fail(error){return {ok:false,error}}
function canPay(player,cost){return Object.entries(cost).every(([key,value])=>key==="hp"?player.hp>value:(player.resources[key]||0)>=value)}
function pay(player,cost){for(const [key,value] of Object.entries(cost)){if(key==="hp")player.hp-=value;else player.resources[key]-=value}}
function alivePlayers(room){return room.players.filter(player=>!player.eliminated)}
function eliminate(room,player){
  if(player.hp>0||player.eliminated)return;
  player.hp=0;player.eliminated=true;log(room,`${player.nickname} 被淘汰`);
  if(player.goldMine)releaseGoldMine(room,player,`${player.nickname} 被淘汰，大金矿占领标记被移除`);
  const alive=alivePlayers(room);
  if(alive.length===1&&room.players.length>1){room.phase="finished";room.winner={type:"war",playerId:alive[0].playerId,nickname:alive[0].nickname}}
  else if(!alive.length){room.phase="finished";room.winner={type:"draw"};log(room,"场上已无玩家存活，本局无胜者")}
}
function gain(player,resource,amount){
  player.resources[resource]=(player.resources[resource]||0)+amount;
  if(resource==='special'&&amount>0&&hasEquipment(player,'钱包')){player.walletIncome=(player.walletIncome||0)+amount;const bonus=Math.floor(player.walletIncome/5);player.walletIncome%=5;player.resources.special+=bonus}
  // 商人「大富大贵」：所有非铜币的收入额外获得 1 铜币。
  if(amount>0&&resource!=="special"&&player.careerId==="merchant"&&player.talent3==="a"){
    player.resources.special=(player.resources.special||0)+1;
  }
}
function hasEquipment(player,name){return (player.equipment||[]).some(card=>card.name===name)}

const GOLD_MINE_ROUNDS=3;
const GOLD_MINE_INCOME=2;
// 大金矿：进入即占领，之后 3 个「自己的回合」结束时各产出 2 金。
// 同一格同时只有一个占领者：被其他玩家进入会顶掉原占领标记；占领生效期间反复进入不会刷新时长。
function claimGoldMine(room,player,tile){
  const active=player.goldMine;
  if(active&&active.tileId===tile.id&&active.roundsLeft>0)return;
  const previous=tile.claim;
  if(previous&&previous.playerId!==player.playerId){
    const holder=room.players.find(item=>item.playerId===previous.playerId);
    if(holder?.goldMine?.tileId===tile.id)holder.goldMine=null;
    log(room,`${player.nickname} 夺走了 ${previous.nickname||"其他玩家"} 的大金矿占领标记`);
  }
  player.goldMine={tileId:tile.id,roundsLeft:GOLD_MINE_ROUNDS};
  player.goldMineCollected=player.goldMineCollected||0;
  tile.claim={playerId:player.playerId,nickname:player.nickname,roundsLeft:GOLD_MINE_ROUNDS};
  log(room,`${player.nickname} 占领大金矿，${GOLD_MINE_ROUNDS} 个回合内每回合结束获得 ${GOLD_MINE_INCOME} 金`);
}
function releaseGoldMine(room,player,reason){
  const claim=player.goldMine;
  player.goldMine=null;
  const tile=claim&&findTile(room,claim.tileId);
  if(tile?.claim?.playerId===player.playerId)tile.claim=null;
  if(reason)log(room,reason);
}
function collectGoldMine(room,player){
  const claim=player.goldMine;
  if(!claim||claim.roundsLeft<=0)return;
  const tile=findTile(room,claim.tileId);
  claim.roundsLeft--;
  gain(player,"gold",GOLD_MINE_INCOME);
  player.goldMineCollected=(player.goldMineCollected||0)+GOLD_MINE_INCOME;
  if(tile?.claim?.playerId===player.playerId)tile.claim.roundsLeft=claim.roundsLeft;
  log(room,`大金矿产出：${player.nickname} 获得 ${GOLD_MINE_INCOME} 金（剩余 ${claim.roundsLeft} 回合）`);
  if(claim.roundsLeft<=0)releaseGoldMine(room,player,`${player.nickname} 的大金矿占领结束`);
}
// 专属建筑产出 +1 的天赋按建筑拥有者结算，收获与抢夺使用同一产出值。
function effectiveOutput(room,building){
  const output=Number(building.output)||2;
  if(building.type!=="career")return output;
  const owner=room.players.find(item=>item.playerId===building.ownerId);
  if(!owner)return output;
  if(owner.careerId==="merchant"&&owner.talent2==="a")return output+1;
  if(owner.careerId==="hunter"&&owner.talent3==="a")return output+1;
  if(owner.careerId==="gambler"&&owner.talent3==="b")return output+1;
  return output;
}
// 逐职业天赋实现状态：只有完整实现的效果才允许消耗资源升级，避免付了资源却没有任何效果。
const TALENT_SUPPORT={
  hunter:{2:{a:true,b:true},3:{a:false,b:false}},
  merchant:{2:{a:true,b:true},3:{a:true,b:true}},
  gambler:{2:{a:true,b:false},3:{a:false,b:false}},
  android:{2:{a:false,b:true},3:{a:false,b:false}},
  career_1787382232648:{2:{a:false,b:false},3:{a:false,b:false}}
};
function talentSupport(careerId){
  const support=TALENT_SUPPORT[careerId];
  return support?{2:{...support[2]},3:{...support[3]}}:{2:{a:false,b:false},3:{a:false,b:false}};
}
function reduceDamage(target,amount,round){
  if(target.weakShield>0){amount=Math.max(0,amount-target.weakShield);target.weakShield=0;target.weakShieldHit=true}
  if(target.painkillerUntilRound>=round)amount=Math.max(0,amount-1);
  if(hasEquipment(target,"黑大衣")&&!target.coatUsed){target.coatUsed=true;amount=Math.max(0,amount-1)}
  if(hasEquipment(target,"轻皮衣")&&amount>0){
    target.armorUses=target.armorUses??2;
    if(target.armorUses>0){const blocked=Math.min(2,amount);amount-=blocked;target.armorUses--}
  }
  return amount;
}
// 移动到下一个未淘汰的玩家；跨过顺位末端时轮次 +1。
function advanceTurn(room,fromPlayer){
  if(!alivePlayers(room).length)return null;
  if(fromPlayer.extraTurn&&!fromPlayer.eliminated){fromPlayer.extraTurn=false;return fromPlayer}
  const index=room.players.indexOf(fromPlayer);
  let nextIndex=index;
  for(let step=0;step<room.players.length;step++){
    nextIndex=(nextIndex+1)%room.players.length;
    if(!room.players[nextIndex].eliminated)break;
  }
  if(nextIndex<=index)room.round++;
  const next=room.players[nextIndex];
  room.currentPlayerId=next.playerId;
  return next;
}
// 回合开始结算：重置行动资源、偿还空头支票负债、结算生存试炼、抽牌。
// 返回 false 表示该玩家无法开始回合（被淘汰或对局已结束），调用方继续寻找下一位。
function beginTurn(room,player){
  player.turnsStarted=(player.turnsStarted||0)+1;
  player.playedThisTurn=[];player.comboActive=false;player.softBootsUsed=false;player.watchUsed=false;
  player.liningUsed=false;player.dieUsed=false;
  player.keptDie=null;
  player.dogFollowupAvailable=false;
  if(player.chargedAttack&&player.chargedAttack.untilTurn<=player.turnsStarted){const charge=player.chargedAttack;player.chargedAttack=null;const target=room.players.find(item=>item.playerId===charge.targetId&&!item.eliminated);if(target&&distance(findTile(room,player.position),findTile(room,target.position))<=charge.range)dealDamage(room,target,charge.amount,player,'拉弓蓄力')}
  for(const tile of room.tiles)if(tile.coinRain?.pendingIds.includes(player.playerId)){tile.coinRain.pendingIds=tile.coinRain.pendingIds.filter(id=>id!==player.playerId);if(tile.id===player.position)dealDamage(room,player,2,room.players.find(item=>item.playerId===tile.coinRain.ownerId),'金币雨')}
  for(const payment of (player.contractPayments||[]).filter(item=>item.untilTurn>player.turnsStarted)){const partner=room.players.find(item=>item.playerId===payment.targetId&&!item.eliminated);if(partner)requestChoice(room,player,'tribute',{sourceId:partner.playerId,count:1})}
  player.actionsLeft=2;player.moved=false;player.movePoints=null;
  player.buildsThisTurn=0;player.raidsThisTurn=0;player.raidUses=0;player.attacksThisTurn=0;player.playActionOpen=false;player.coatUsed=false;
  player.moveSpent=false;
  if(player.dogReturnRound&&room.round>=player.dogReturnRound){player.dog=true;player.dogReturnRound=0;const amount=2+Math.floor(Math.random()*3)+Math.floor(Math.random()*3);gain(player,player.scavengeResource||'wood',amount);log(room,`${player.nickname} 的猎狗返回身边，拾荒获得 ${amount} ${RESOURCE_NAMES[player.scavengeResource||'wood']}`)}
  player.rerollLeft=player.careerId==="gambler"?(player.talent2==="a"?2:1):0;
  if(player.debtPending){
    if(player.resources.gold>=2)player.resources.gold-=2;
    else{dealDamage(room,player,3,null,'空头支票');log(room,`${player.nickname} 无力偿还空头支票，受到 3 点伤害`)}
    player.debtPending=false;
  }
  if(room.phase!=="playing")return false;
  if(player.trial?.pending){
    player.score+=player.trial.pending;player.trial.pending=0;
    if(player.score>=30&&player.position==="0:0"){
      room.phase="finished";room.winner={type:"score",playerId:player.playerId,nickname:player.nickname};
      log(room,`${player.nickname} 通过生存试炼，达成分数胜利`);return false;
    }
    player.trial=null;log(room,`${player.nickname} 生存试炼失败`);
  }
  if(player.eliminated)return false;
  draw(room,player);
  log(room,`${player.nickname} 的回合开始，抽取 1 张牌`);
  return true;
}
function endTurn(room,player){
  if(!player.eliminated){
    if(player.hand.length>5)return fail("回合结束前请弃牌至 5 张");
    if(player.trial?.active){player.trial.active=false}
    if(player.weakShield&&!player.weakShieldHit)draw(room,player);
    player.weakShield=0;player.weakShieldHit=false;
    if(player.dripHealRound===room.round)player.hp=Math.min(player.maxHp,player.hp+3);
    if(player.blessing&&findTile(room,player.position)?.type==="river")player.score+=3;
    collectGoldMine(room,player);
    for(const owner of room.players)if(owner.hunterMarks?.[player.playerId]>0)owner.hunterMarks[player.playerId]--;
    for(const debt of (player.borrowed||[]).filter(item=>item.untilTurn<=(player.turnsStarted||0))){
      const lender=room.players.find(item=>item.playerId===debt.targetId&&!item.eliminated);
      if(lender)requestChoice(room,player,'tribute',{sourceId:lender.playerId,count:2});
    }
    player.borrowed=(player.borrowed||[]).filter(item=>item.untilTurn>(player.turnsStarted||0));
    if(hasEquipment(player,'破鞋')&&player.brokenShoesTurns>0&&!room.resumeEndTurn){player.brokenShoesTurns--;requestChoice(room,player,'controlledMove',{targetId:player.playerId,points:1});if(!player.brokenShoesTurns)player.equipment=player.equipment.filter(item=>item.name!=='破鞋')}
    if(room.choices?.length){room.resumeEndTurn=player.playerId;return {ok:true}}
  }
  let next=advanceTurn(room,player);
  while(next){
    if(beginTurn(room,next))return {ok:true};
    if(room.phase!=="playing")return {ok:true};
    next=advanceTurn(room,next);
  }
  room.phase="finished";
  room.winner=room.winner||{type:"draw"};
  return {ok:true};
}

function collectTileResource(room,player){
  const tile=findTile(room,player.position);
  if(!tile?.resource)return false;
  const resource=tile.resource;
  gain(player,resource.type,resource.amount);
  tile.resource=null;
  log(room,`${player.nickname} 经过地块拾取了 ${resource.amount} ${RESOURCE_NAMES[resource.type]}（一次性）`);
  return true;
}

function resolveTerrain(room,player,tile){
  collectTileResource(room,player);
  if(tile.type==="goldMine")claimGoldMine(room,player,tile);
  if(tile.type==="holySpring"&&room.holySpringUses<2){room.holySpringUses++;player.hp=player.maxHp;log(room,`${player.nickname} 在圣泉恢复了生命`);if(room.holySpringUses===2)tile.type="spring"}
  if(tile.type==="void"){
    const roll=1+Math.floor(Math.random()*6);
    if(roll%2)dealDamage(room,player,2,null,'虚空');else player.score++;
    log(room,`${player.nickname} 在虚空掷出 ${roll}：${roll%2?"失去 2 生命":"获得 1 分"}`);eliminate(room,player)
  }
  if(tile.type==="fire"){
    player.resources.wood=0;player.resources.meat=0;dealDamage(room,player,4,null,'地火');
    player.fireTiles=player.fireTiles||[];
    if(!player.fireTiles.includes(tile.id)){player.fireTiles.push(tile.id);player.burn=(player.burn||0)+1}
    log(room,`${player.nickname} 穿过地火，失去 4 生命并获得燃烧`);eliminate(room,player)
  }
  if(tile.type==="riverGod"){
    if(canPay(player,{gold:5,meat:4})){pay(player,{gold:5,meat:4});player.blessing=true;log(room,`${player.nickname} 获得河神庇护`)}
    else{player.score=Math.max(0,player.score-3);player.stunnedUntilRound=room.round+1;log(room,`${player.nickname} 无法上供河神，失去 3 分并停滞`)}
  }
  if(tile.trap&&tile.trap.ownerId!==player.playerId&&!player.eliminated){
    const trap=tile.trap;tile.trap=null;
    const roll=1+Math.floor(Math.random()*3);
    if(roll===1){player.stunnedUntilRound=Math.max(player.stunnedUntilRound||0,room.round+1);log(room,`${player.nickname} 触发陷阱，掷出 ${roll}：下回合无法进行基础行动`) }
    else{const dealt=dealDamage(room,player,1+(trap.damageBonus||0),room.players.find(item=>item.playerId===trap.ownerId),'陷阱');log(room,`${player.nickname} 触发陷阱，掷出 ${roll}：受到 ${dealt} 点伤害`);eliminate(room,player)}
  }
}

function parseCost(text){
  const cost={};for(const match of String(text||"").matchAll(/(\d+)\s*(木|石|肉|金|生命|血|铜币|筹码|猎人标记|欺诈币)/g)){
    const key={木:"wood",石:"stone",肉:"meat",金:"gold",生命:"hp",血:"hp",铜币:"special",筹码:"special",猎人标记:"special",欺诈币:"special"}[match[2]];
    cost[key]=(cost[key]||0)+Number(match[1]);
  }return cost;
}
function rollDie(room,player,sides,action={}){
  if(hasEquipment(player,'千变骰子')&&!player.dieUsed&&action.useKeptDie&&player.keptDie>0&&player.keptDie<=sides){player.dieUsed=true;log(room,`${player.nickname} 使用保留骰点 ${player.keptDie}`);return player.keptDie}
  let result=1+Math.floor(Math.random()*sides);
  for(const observer of room.players.filter(item=>item!==player&&!item.eliminated))if(triggerSecret(room,observer,'暗箱操作')){result=1+Math.floor(Math.random()*sides);log(room,`${observer.nickname} 代掷 ${sides} 面骰：${result}`);break}
  if(hasEquipment(player,'千变骰子')&&!player.dieUsed)player.keptDie=result;
  return result;
}

// 基础攻击范围：默认 1（相邻格）。多个「攻击距离 +1」来源按加法叠加。
function attackRange(player,round){
  let range=player.careerId==="merchant"&&player.talent2==="b"?3:1;
  if(player.aimUntilRound>round)range++;
  if(player.careerId==="hunter"&&player.talent2==="b")range++;
  return range;
}

const MOVE_ACTIONS=new Set(["rollMove","rerollMove","extraMove","move","stopMove"]);
const STEALTH_SAFE_ACTIONS=new Set(["discard","closePlayAction","openPlayAction","endTurn","playCard"]);
// 隐秘行踪：主动做出除移动以外的行动会提前结束该状态（打出行踪卡本身除外）。
function endStealth(room,player){
  if(!(player.stealthUntilRound>room.round))return false;
  player.stealthUntilRound=0;
  log(room,`${player.nickname} 采取其他行动，隐秘行踪提前结束`);
  return true;
}

function playCard(room,player,action){
  const index=player.hand.findIndex(card=>card.uid===action.cardUid);if(index<0)return fail("手牌中没有这张牌");
  const card=player.hand[index];
  if(!player.playActionOpen&&!(card.name==='冲吧！猎狗'&&player.dogFollowupAvailable))return fail("请先使用一次基础行动进入出牌阶段");
  if(card.lock&&activeUntil(room,card.lock))return fail("交换的牌在施法者下回合开始前被锁定");
  if(cardEffects.REACTIONS.has(card.name)){
    const cost=parseCost(card.cost);
    if(!canPay(player,cost))return fail("预备响应牌的资源不足");
    player.hand.splice(index,1);(player.secrets||=[]).push({...card,quantity:Math.max(1,Math.min(10,Number(action.quantity)||1))});
    log(room,`${player.nickname} 预备了一张响应牌，满足条件时自动触发并支付费用`);return {ok:true};
  }
  if(card.type==="奥秘卡")return fail("未知响应牌");
  const slot={武器:"weapon",护具:"armor",防具:"armor",鞋:"shoes",道具:"item",宠物:"pet"}[card.type];
  const supportedEquipment=cardEffects.EQUIPMENT;
  if(slot){
    if(!supportedEquipment.has(card.name))return fail("这件装备的效果尚未接入，暂不能装备");
    const cost=parseCost(card.cost);
    if(card.name==='破鞋')cost[['wood','stone','meat','gold'].includes(action.resourceChoice)?action.resourceChoice:'wood']=1;
    const cement=card.name==='水泥';
    const tile=findTile(room,action.tileId),spec=buildingSpec(action.buildingType,player);
    if(cement&&(!tile||distance(findTile(room,player.position),tile)>2||tile.building||!spec||spec.terrain!==tile.type))return fail("水泥：请选择两格内空置的对应地形与建筑");
    if(!canPay(player,cost))return fail("装备资源不足");
    pay(player,cost);
    endStealth(room,player);
    if(cement){placeBuilding(room,player,tile,action.buildingType,spec);player.hand.splice(index,1);(player.removed||=[]).push(card);return {ok:true}}
    const old=player.equipment.find(item=>item.slot===slot);
    // 被替换的装备进入装备弃牌堆，不能混进职业行动牌库。
    if(old)discardPile(player,true).push(old);
    player.equipment=player.equipment.filter(item=>item.slot!==slot);
    player.equipment.push({...card,slot});player.hand.splice(index,1);
    if(card.name==='轻皮衣')player.armorUses=2;
    if(card.name==='破鞋')player.brokenShoesTurns=3;
    log(room,`${player.nickname} 装备了 ${card.name}`);return {ok:true};
  }
  if(card.type!=="行动卡")return fail("未知卡牌类型");
  if(player.markedCards?.uids.includes(card.uid)){const hunter=room.players.find(item=>item.playerId===player.markedCards.ownerId&&!item.eliminated);player.markedCards.uids=player.markedCards.uids.filter(uid=>uid!==card.uid);if(hunter)dealDamage(room,player,1+(hunter.burn||0),hunter,'猎杀标记',{attack:true});if(player.eliminated)return {ok:true}}
  const cost=parseCost(card.cost);
  if(hasEquipment(player,'谎言怀表')&&!player.watchUsed&&action.useWatch&&player.resources.special>0){const key=Object.keys(cost).find(key=>cost[key]>0);if(key)cost[key]--;cost.special=(cost.special||0)+1}
  if(card.name==="止血绷带"&&hasEquipment(player,"草药"))cost.wood=0;
  if(!canPay(player,cost))return fail("支付卡牌费用的资源不足");
  const extended=cardEffects.prepare(room,player,card,action,effectApi(room,player,action));
  if(extended){
    if(extended.error)return fail(extended.error);
    if(action.copy)for(const key of Object.keys(cost))cost[key]=0;
    pay(player,cost);if(action.useWatch)player.watchUsed=true;
    player.hand.splice(index,1);if(!action.copy)discardPile(player,false).push(card);
    endStealth(room,player);extended.execute();
    (player.playedThisTurn||=[]).push({...card});
    log(room,`${player.nickname} 打出了 ${card.name}`);return {ok:true};
  }
  const healing=card.name==="止血绷带"?2:card.name==="舔舐伤口"?1:0;
  const trapDeploy=card.name==="陷阱投放";
  const trapRecycle=card.name==="陷阱回收";
  const hunting=card.name==="狩猎";
  const scavenging=card.name==="拾荒";
  const drawing=card.name==="整备";
  const advancing=card.name==="前进";
  const summonDog=card.name==="召唤猎狗";
  const dogRush=card.name==="冲吧！猎狗";
  const dogGuard=card.name==="誓死捍卫主人";
  const stealth=card.name==="隐秘行踪";
  const aiming=card.name==="战术瞄准";
  const dogEvolution=card.name==="猎狗进化";
  const healingMerchant=card.name==="金盆洗手";
  const blackGold=card.name==="黑金";
  const blackMarket=card.name==="黑市交易";
  const equipDraw=card.name==="投资军火";
  const wealthSwap=card.name==="钱是万能的";
  const chipSwap=card.name==="换取筹码";
  const gamblerGain=card.name==="哪有赌徒天天输";
  const loan=card.name==="贷款";
  const lucky=card.name==="好运or厄运";
  const escape=card.name==="逃跑是门技术";
  const paymentRain=card.name==="撒钱";
  const painkiller=card.name==="止痛药";
  const drip=card.name==="打吊水";
  const weak=card.name==="假意示弱";
  const blankCheque=card.name==="空头支票";
  if(blankCheque&&action.resources&&!validAllocation(action.resources,3))return fail('空头支票需要分配恰好 3 点基础资源');
  const resourceChoice=action.resourceChoice;
  const quantity=Number(action.quantity)||1;
  const target=room.players.find(item=>item.playerId===action.targetPlayerId&&!item.eliminated);
  const playerTile=findTile(room,player.position);
  const targetedAttack=card.name==="瞄准射击"||card.name==="放暗箭";
  const targetTile=findTile(room,action.tileId||action.targetTileId);
  const recycleSource=findTile(room,action.sourceTileId||action.tileId);
  if(dogRush&&!player.dogFollowupAvailable)return fail('请先进行一次基础攻击，再追加猎狗攻击');
  if((card.name==='瞄准射击'||dogRush)&&activeUntil(room,room.peace))return fail('平等条约生效期间无法基础攻击');
  if(targetedAttack&&(!target||target===player||distance(playerTile,findTile(room,target.position))>(card.name==='瞄准射击'?attackRange(player,room.round)+1:2)||target.stealthUntilRound>room.round))return fail("请选择攻击范围内且未潜行的目标玩家");
  if(lucky&&(!target||distance(playerTile,findTile(room,target.position))>3))return fail("请选择三格内玩家");
  if((trapDeploy||trapRecycle)&&(!targetTile||distance(playerTile,targetTile)>2))return fail("请选择两格内的目标地块");
  if(trapDeploy&&targetTile.trap)return fail("该地块已有陷阱");
  if(trapRecycle&&(!recycleSource?.trap||recycleSource.trap.ownerId!==player.playerId||targetTile.trap&&targetTile!==recycleSource))return fail("请选择自己的陷阱来源，以及两格内没有陷阱的目标地块");
  if((scavenging||dogRush||dogGuard||dogEvolution)&&!player.dog)return fail("需要装备猎狗才能使用这张牌");
  if((dogRush||dogGuard)&&(!target||target===player||distance(playerTile,findTile(room,target.position))>2||target.stealthUntilRound>room.round))return fail("请选择两格内且未潜行的目标玩家");
  if((wealthSwap||chipSwap||gamblerGain||loan||(blankCheque&&!action.resources))&&!["wood","stone","meat","gold"].includes(resourceChoice))return fail("请选择资源种类");
  if((wealthSwap||chipSwap)&&(!Number.isInteger(quantity)||quantity<1||quantity>10))return fail("置换数量需为 1～10");
  if(wealthSwap&&player.resources.special<quantity)return fail("铜币不足");
  if(chipSwap&&player.resources[resourceChoice]<quantity)return fail("基础资源不足");
  if(gamblerGain&&player.resources[resourceChoice]<1)return fail("需要支付 1 份基础资源");
  if(blackGold&&player.resources.special<4)return fail("黑金需要 4 枚欺诈币");
  if(!healing&&!trapDeploy&&!trapRecycle&&!hunting&&!scavenging&&!drawing&&!advancing&&!summonDog&&!dogRush&&!dogGuard&&!stealth&&!aiming&&!dogEvolution&&!healingMerchant&&!blackGold&&!blackMarket&&!equipDraw&&!targetedAttack&&!wealthSwap&&!chipSwap&&!gamblerGain&&!loan&&!lucky&&!escape&&!paymentRain&&!painkiller&&!drip&&!weak&&!blankCheque&&card.name!=="猎人背包")return fail("此卡效果尚未接入，暂不能打出，手牌与资源不会扣除");
  if(card.name!=="隐秘行踪")endStealth(room,player);
  pay(player,cost);player.hand.splice(index,1);if(!action.copy)discardPile(player,false).push(card);
  if(healing)player.hp=Math.min(player.maxHp,player.hp+healing);
  if(trapDeploy)targetTile.trap={ownerId:player.playerId,ownerName:player.nickname,damageBonus:hasEquipment(player,"捕兽夹")?1:0};
  if(trapRecycle){const trap=recycleSource.trap;recycleSource.trap=null;targetTile.trap=trap;log(room,`${player.nickname} 回收并重新放置了陷阱`)}
  if(hunting)gain(player,"meat",player.dog?2:1);
  if(scavenging){
    player.dog=false;player.dogReturnRound=room.round+2;
    player.scavengeResource=["wood","stone","meat","gold"].includes(action.resourceChoice)?action.resourceChoice:"wood";
    log(room,`${player.nickname} 派猎狗拾荒，2 回合后返回并结算资源`);
  }
  if(drawing)draw(room,player,1,true);
  if(advancing)player.movePoints=(player.movePoints||0)+2+(player.talent2==="a"?1:0);
  if(summonDog)player.dog=true;
  if(dogRush){player.dogFollowupAvailable=false;dealDamage(room,target,Number(player.dogDamage||0),player,card.name,{attack:true,followup:true})}
  if(dogGuard){target.moveBlockedUntilRound=Math.max(target.moveBlockedUntilRound||0,room.round+1);player.dog=false;const whistle=player.equipment.find(item=>item.name==='哨子');if(whistle){player.equipment=player.equipment.filter(item=>item!==whistle);(player.removed||=[]).push(whistle)}log(room,`${player.nickname} 让猎狗缠住 ${target.nickname}，其下回合无法移动`)}
  if(stealth)player.stealthUntilRound=room.round+2;
  if(aiming)player.aimUntilRound=room.round+2;
  if(dogEvolution)player.dogDamage=(player.dogDamage||0)+1;
  if(healingMerchant){player.resources.special=0;player.hp=Math.min(player.maxHp,player.hp+3)}
  if(blackGold){player.resources.special-=4;gain(player,"gold",2);draw(room,player,2)}
  if(blackMarket){dealDamage(room,player,1,player,'黑市交易');gain(player,"special",2);gain(player,"gold",1);eliminate(room,player)}
  if(equipDraw)draw(room,player,1,true);
  if(targetedAttack)dealDamage(room,target,card.name==="放暗箭"?1:1+(player.burn||0),player,card.name,{attack:card.name==='瞄准射击',range:attackRange(player,room.round)+1});
  if(wealthSwap){player.resources.special-=quantity;gain(player,resourceChoice,quantity)}
  if(chipSwap){player.resources[resourceChoice]-=quantity;gain(player,"special",quantity)}
  if(gamblerGain){player.resources[resourceChoice]--;gain(player,"special",rollDie(room,player,3,action))}
  if(loan){draw(room,player);gain(player,resourceChoice,1);player.loanMovePenaltyRound=room.round+1}
  if(lucky){const roll=rollDie(room,player,6,action);if(roll>3)target.hp=Math.min(target.maxHp,target.hp+roll-3);else if(roll<3)dealDamage(room,target,3-roll,player,card.name,{dice:true});log(room,`${target.nickname} 掷出 ${roll}`)}
  if(escape){const roll=rollDie(room,player,6,action);player.movePoints=(player.movePoints||0)+Math.min(3,roll)+(roll===4||roll===6?1:0);player.ignoreTerrainCost=roll===5||roll===6;log(room,`${player.nickname} 逃跑掷出 ${roll}`)}
  if(paymentRain)for(const victim of room.players.filter(item=>item!==player&&!item.eliminated))dealDamage(room,victim,2,player,card.name);
  if(painkiller)player.painkillerUntilRound=room.round+2;
  if(drip)player.dripHealRound=room.round+1;
  if(weak){player.weakShield=2;player.weakShieldHit=false}
  if(blankCheque){for(const [key,amount] of Object.entries(action.resources||{[resourceChoice]:3}))gain(player,key,amount);player.debtPending=true}
  if(card.name==="猎人背包"){player.equipment=player.equipment.filter(item=>item.slot!=="item");player.equipment.push({...card,name:"猎人背包",slot:"item"})}
  (player.playedThisTurn||=[]).push({...card});
  log(room,`${player.nickname} 打出了 ${card.name}`);return {ok:true};
}

function buildingSpec(type,player){return type==='career'?CAREER_BUILDINGS[player.careerId]:BASE_BUILDINGS[type]}
function placeBuilding(room,player,tile,type,spec){
  tile.building={ownerId:player.playerId,name:spec.name,type,resource:spec.resource||'special',output:2,level:1,robbedRound:null};
  player.score++;log(room,`${player.nickname} 建造了 ${spec.name}，获得 1 分`);
}
function buildOptions(room,player){
  const here=findTile(room,player.position);
  if(!here)return [];
  return room.tiles.filter(tile=>distance(here,tile)<=(player.careerId==='merchant'?1:0)).flatMap(tile=>Object.keys({...BASE_BUILDINGS,career:null}).map(type=>{
    const spec=buildingSpec(type,player);if(!spec||tile.type!==spec.terrain)return null;
    const reason=tile.building?'地块已有建筑':player.buildsThisTurn?'本回合已建造':player.actionsLeft<1?'行动不足':!canPay(player,spec.cost)?'资源不足':'';
    return {tileId:tile.id,buildingType:type,name:spec.name,cost:spec.cost,reason,enabled:!reason};
  }).filter(Boolean));
}
function activeUntil(room,status){
  const owner=room.players.find(item=>item.playerId===status?.ownerId);
  return !!owner&&!owner.eliminated&&(owner.turnsStarted||0)<status.untilTurn;
}
function requestChoice(room,player,kind,data){
  (room.choices||=[]).push({id:++room.choiceSequence||(room.choiceSequence=1),playerId:player.playerId,kind,...data});
}
function triggerSecret(room,player,name){
  const index=(player.secrets||[]).findIndex(item=>item.name===name);
  if(index<0)return null;
  const card=player.secrets[index],cost=parseCost(card.cost);
  if(!canPay(player,cost))return null;
  pay(player,cost);player.secrets.splice(index,1);discardPile(player,false).push(card);
  log(room,`${player.nickname} 触发 ${name}`);return card;
}
function dealDamage(room,target,amount,source,label,options={}){
  if(target.eliminated)return 0;
  if(source&&source!==target&&activeUntil(room,target.contract)&&target.contract.sourceId===source.playerId)amount=0;
  if(source&&target.hunterMarks?.[source.playerId]>0)amount++;
  if(options.attack&&source){
    const gap=distance(findTile(room,source.position),findTile(room,target.position));
    if(gap===1){if(hasEquipment(source,'匕首'))amount++;if(hasEquipment(source,'轻布甲'))amount++}
    if(source.crossbowLoaded){amount++;source.crossbowLoaded=false}
    if(!options.followup)source.dogFollowupAvailable=true;
    if(triggerSecret(room,source,'拉弓蓄力')){
      source.chargedAttack={targetId:target.playerId,amount:Math.max(0,amount)*2,untilTurn:(source.turnsStarted||0)+1,range:options.range||attackRange(source,room.round)};
      source.attacksThisTurn=(source.attacksThisTurn||0)+1;
      (room.events||=[]).push({id:room.eventSequence=(room.eventSequence||0)+1,type:'block',targetId:source.playerId,tileId:source.position,amount:0,label:'拉弓蓄力'});
      log(room,`${source.nickname} 蓄力，本次攻击延后到下回合`);return 0;
    }
  }
  if(amount>0&&hasEquipment(target,'千层内衬')&&!target.liningUsed){target.liningUsed=true;if(target.resources.special>0){target.resources.special--;amount=0}else amount=Math.max(0,amount-1)}
  if(amount>0){const secret=triggerSecret(room,target,'拿钱消灾');if(secret){const blocked=Math.min(amount,secret.quantity,target.resources.special||0);target.resources.special-=blocked;amount-=blocked}}
  if(amount>0&&triggerSecret(room,target,'骰子也能防御'))amount=Math.max(0,amount-Math.max(0,1+Math.floor(Math.random()*6)-3));
  amount=reduceDamage(target,amount,room.round);
  if(amount>=target.hp&&amount>0){
    if(triggerSecret(room,target,'假死脱身')){
      for(const card of target.hand)discardPile(target,card.type!=='行动卡'&&card.type!=='奥秘卡').push(card);
      target.hand=[];draw(room,target,2);target.stealthUntilRound=room.round+1;amount=0;
    }else if(hasEquipment(target,'防弹背心')){const index=target.equipment.findIndex(item=>item.name==='防弹背心');(target.removed||=[]).push(target.equipment.splice(index,1)[0]);amount=0}
    else if(triggerSecret(room,target,'我和你赌命')){const roll=rollDie(room,target,6);log(room,`我和你赌命掷出 ${roll}`);if(roll>4){target.hp=Math.max(2,target.hp);amount=0}}
  }
  const dealt=Math.min(target.hp,Math.max(0,amount));target.hp-=dealt;
  (room.events||=[]).push({id:room.eventSequence=(room.eventSequence||0)+1,type:dealt?'damage':'block',targetId:target.playerId,sourceId:source?.playerId||null,tileId:target.position,amount:dealt,label});
  log(room,`${source?.nickname||label} 对 ${target.nickname} 造成 ${dealt} 伤害（${label}）`);
  if(options.attack&&source){
    source.attacksThisTurn=(source.attacksThisTurn||0)+1;
    if(triggerSecret(room,source,'箭矢回收'))draw(room,source,2);
    if(source.careerId==='android'&&source.resources.special>0&&(source.raidUses||0)<3){
      const key=['wood','stone','meat'].find(key=>target.resources[key]>0);
      if(key){const stolen=Math.min(3,target.resources[key]);target.resources[key]-=stolen;gain(source,key,stolen);source.resources.special--;source.raidUses=(source.raidUses||0)+1;if(source.raidBoost>0){source.raidBoost--;requestChoice(room,target,'tribute',{sourceId:source.playerId,count:1,resources:['wood','stone','meat']})}}
    }
  }
  if(dealt>0&&source&&hasEquipment(source,'护卫')&&source.resources.special>=2&&options.guard){source.resources.special-=2;dealDamage(room,target,1,source,'护卫')}
  if(dealt>0&&source&&hasEquipment(source,'老虎机')&&options.dice&&!options.slot){const roll=1+Math.floor(Math.random()*3);log(room,`老虎机掷出 ${roll}`);dealDamage(room,target,1,source,'老虎机',{slot:true})}
  if(dealt>0&&!options.retaliation)for(const observer of room.players.filter(item=>!item.eliminated&&distance(findTile(room,item.position),findTile(room,target.position))<=3))if(triggerSecret(room,observer,'仗势欺人'))dealDamage(room,target,1,observer,'仗势欺人',{retaliation:true});
  eliminate(room,target);return dealt;
}
function validAllocation(resources,total){return !!resources&&Object.keys(resources).every(key=>['wood','stone','meat','gold'].includes(key))&&Object.values(resources).every(value=>Number.isInteger(value)&&value>=0)&&Object.values(resources).reduce((sum,value)=>sum+value,0)===total}
function deceptionSuccess(room,player){
  player.deceptions=(player.deceptions||0)+1;
  if(player.comboActive)requestChoice(room,player,'comboHit',{});
  if(hasEquipment(player,'无声软靴')&&!player.softBootsUsed){player.softBootsUsed=true;requestChoice(room,player,'softBoots',{})}
}
function effectApi(room,player,action={}){
  return {tileAt:id=>findTile(room,id),distance,canPay,buildSpec:buildingSpec,
    validAllocation,deceive:()=>deceptionSuccess(room,player),
    roll:sides=>rollDie(room,player,sides,action),
    draw:(owner,amount=1)=>draw(room,owner,amount),gain,
    damage:(target,amount,source,label,options)=>dealDamage(room,target,amount,source,label,{dice:['押注','杀猪盘','死亡轮盘'].includes(label),...options}),
    log:message=>log(room,message),locked:card=>activeUntil(room,card.lock),output:building=>building.robbedRound===room.round&&!hasEquipment(player,'地契')?0:effectiveOutput(room,building),
    discard:(owner,card)=>discardPile(owner,!['行动卡','奥秘卡'].includes(card.type)).push(card),
    request:(owner,kind,data)=>requestChoice(room,owner,kind,data),
    build:(tile,type,spec)=>placeBuilding(room,player,tile,type,spec),
    exchange:other=>{if(triggerSecret(room,player,'骗术陷阱')){const removed=other.hand.splice(Math.floor(Math.random()*other.hand.length),1)[0];if(removed)discardPile(other,false).push(removed);draw(room,player)}if(triggerSecret(room,other,'骗术陷阱')){const removed=player.hand.splice(Math.floor(Math.random()*player.hand.length),1)[0];if(removed)discardPile(player,false).push(removed);draw(room,other)}}};
}
function resolveChoice(room,player,action){
  const choice=room.choices?.[0];
  if(!choice||choice.playerId!==player.playerId||choice.id!==action.choiceId)return fail('当前没有属于你的待处理选择');
  const source=room.players.find(item=>item.playerId===choice.sourceId);
  const target=room.players.find(item=>item.playerId===choice.targetId);
  const handCard=player.hand.find(item=>item.uid===action.handCardUid&&!activeUntil(room,item.lock));
  const remove=(owner,card)=>owner.hand.splice(owner.hand.indexOf(card),1);
  const resources=action.resources||{};
  const transfer=count=>{
    const allowed=choice.resources||['wood','stone','meat','gold'];
    const available=allowed.reduce((sum,key)=>sum+(player.resources[key]||0),0);
    const required=Math.min(count,available);
    if(Object.keys(resources).some(key=>!allowed.includes(key))||Object.values(resources).some(value=>!Number.isInteger(value)||value<0)||Object.values(resources).reduce((sum,value)=>sum+value,0)!==required||!canPay(player,resources))return false;
    pay(player,resources);for(const [key,value] of Object.entries(resources))gain(source,key,value);return true;
  };
  switch(choice.kind){
    case 'comboHit': {
      const victim=room.players.find(item=>item.playerId===action.targetPlayerId&&!item.eliminated&&item!==player&&!(item.stealthUntilRound>room.round));
      if(!victim)return fail('请选择未潜行的其他玩家');dealDamage(room,victim,1,player,'连环骗局');break;
    }
    case 'softBoots':
      if(action.decision==='coin')gain(player,'special',1);
      else if(action.decision==='move'){const tile=findTile(room,action.tileId);if(!tile||distance(findTile(room,player.position),tile)!==1||player.moveBlockedUntilRound>room.round||player.dripHealRound===room.round)return fail('请选择可移动到的相邻格，或改选欺诈币');if(room.players.some(item=>item!==player&&activeUntil(room,{ownerId:item.playerId,untilTurn:item.blockadeUntilTurn})&&distance(findTile(room,item.position),tile)<=2))return fail('开道生效，无法进入该格');player.position=tile.id;resolveTerrain(room,player,tile)}else return fail('请选择移动或获得欺诈币');break;
    case 'comeback': {
      if(Object.keys(resources).some(key=>!['wood','stone','meat','gold'].includes(key))||Object.values(resources).some(value=>!Number.isInteger(value)||value<0)||Object.values(resources).reduce((sum,value)=>sum+value,0)!==3)return fail('请分配恰好 3 点基础资源');
      for(const [key,value] of Object.entries(resources))gain(player,key,value);break;
    }
    case 'confirmAttack': {
      if(action.decision==='cancel')break;
      if(action.decision!=='attack')return fail('请选择继续攻击或取消');
      if(player.actionsLeft<1)return fail('行动次数不足');
      player.actionsLeft--;player.playActionOpen=false;
      const bonus=Object.values(parseCost(choice.shownCard.cost)).reduce((sum,value)=>sum+value,0)>2?1:0;
      dealDamage(room,target,choice.damage+bonus,player,'假面短刃',{attack:true});break;
    }
    case 'evade': {
      if(action.decision!=='stop'){
        const tile=findTile(room,action.tileId),here=findTile(room,player.position),cost=TERRAIN_COST[tile?.type]||1;
        if(!tile||distance(here,tile)!==1||cost>choice.points)return fail('请选择可到达的相邻地块，或停止移动');
        player.position=tile.id;resolveTerrain(room,player,tile);choice.points-=cost;
        if(choice.points>0&&!player.eliminated){requestChoice(room,player,'evade',{sourceId:choice.sourceId,points:choice.points,damage:choice.damage,range:choice.range});break}
      }
      if(!player.eliminated&&distance(findTile(room,source.position),findTile(room,player.position))<=choice.range)dealDamage(room,player,choice.damage,source,'基础攻击',{attack:true,guard:choice.guard});
      else log(room,`${player.nickname} 灵活步伐避开了攻击`);break;
    }
    case 'tribute': if(!transfer(choice.count))return fail('请选择足额的基础资源（不足时交出剩余资源）');break;
    case 'extort': if(action.decision==='pay'){if((choice.resources||['wood','stone','meat','gold']).reduce((sum,key)=>sum+(player.resources[key]||0),0)<choice.count||!transfer(choice.count))return fail('交付资源不足')}else if(action.decision==='damage')dealDamage(room,player,choice.damage,source,'索取资源');else return fail('请选择支付或受伤');break;
    case 'contract':
      if(action.decision==='accept'){player.contract={ownerId:source.playerId,sourceId:source.playerId,untilTurn:choice.untilTurn};(source.contractPayments||=[]).push({targetId:player.playerId,untilTurn:choice.untilTurn})}
      else if(action.decision!=='decline')return fail('请选择接受或拒绝合约');break;
    case 'identity': {
      if(!['believe','doubt'].includes(action.decision))return fail('请选择相信或不信');
      const correct=(choice.card.type===choice.declaredType)===(action.decision==='believe');
      log(room,`伪造身份翻开 ${choice.card.name}（${choice.card.type}），判断${correct?'正确':'错误'}`);
      discardPile(source,false).push(choice.card);
      if(correct)draw(room,player);else{gain(source,'special',2);deceptionSuccess(room,source)}break;
    }
    case 'scry': {
      const top=action.topCardUids||[],bottom=action.bottomCardUids||[],all=[...top,...bottom];
      if(all.length!==choice.cardUids.length||new Set(all).size!==all.length||all.some(uid=>!choice.cardUids.includes(uid)))return fail('必须为每张预览牌选择顺序与牌库顶或底');
      const deck=room.decks[player.playerId],cards=deck.splice(-choice.cardUids.length);
      deck.unshift(...bottom.map(uid=>cards.find(card=>card.uid===uid)));deck.push(...top.slice().reverse().map(uid=>cards.find(card=>card.uid===uid)));draw(room,player);break;
    }
    case 'returnCard': if(action.decision!=='skip'){if(!handCard)return fail('请选择一张手牌或跳过');remove(player,handCard);room.decks[player.playerId].push(handCard)}break;
    case 'exchangeDraw':
      if(action.decision!=='skip'){if(!handCard||player.resources.special<1)return fail('需要一张手牌和 1 筹码');remove(player,handCard);room.decks[player.playerId].unshift(handCard);player.resources.special--;draw(room,player)}break;
    case 'discardEnemy': case 'master': {
      if(choice.step==='exchange'){
        if(player.hand.length&&target.hand.length&&!handCard)return fail('请选择要交换的手牌');
        if(handCard&&target.hand.length){const other=target.hand.splice(Math.floor(Math.random()*target.hand.length),1)[0];remove(player,handCard);target.hand.push(handCard);player.hand.push(other);effectApi(room,player).exchange(target)}break;
      }
      const candidates=choice.kind==='discardEnemy'?[...target.hand,...target.equipment]:target.hand;
      const selected=candidates.find(card=>card.uid===action.targetCardUid);
      if(!selected&&candidates.length)return fail('请选择目标的牌');
      if(selected){const list=target.hand.includes(selected)?target.hand:target.equipment;list.splice(list.indexOf(selected),1);discardPile(target,!['行动卡','奥秘卡'].includes(selected.type)).push(selected)}
      if(choice.kind==='master'){gain(player,'special',2+(selected?.type==='行动卡'?1:0));requestChoice(room,player,'master',{targetId:target.playerId,step:'exchange'})}break;
    }
    case 'borrow': {
      const selected=target.hand.find(card=>card.uid===action.targetCardUid);
      if(!selected&&target.hand.length)return fail('请选择目标手牌');
      if(!selected)break;
      requestChoice(room,player,'borrowGive',{targetId:target.playerId,targetCardUid:selected.uid});break;
    }
    case 'borrowGive':
      if(!handCard)return fail('请选择要交还的手牌');
      requestChoice(room,target,'borrowRefuse',{sourceId:player.playerId,takeUid:choice.targetCardUid,giveUid:handCard.uid});break;
    case 'borrowRefuse': {
      if(action.decision==='refuse'){if(player.resources.gold<1)return fail('拒绝需要 1 金');player.resources.gold--;draw(room,source)}
      else if(action.decision==='accept'){
        const take=player.hand.find(card=>card.uid===choice.takeUid),give=source.hand.find(card=>card.uid===choice.giveUid);
        if(take&&give){remove(player,take);remove(source,give);player.hand.push(give);source.hand.push(take);effectApi(room,source).exchange(player)}
      }else return fail('请选择接受或支付 1 金拒绝');break;
    }
    case 'bait': {
      if(action.decision==='give'){if(!handCard||handCard.career!=='career_1787382232648')return fail('请选择欺诈师牌');remove(player,handCard);source.hand.push(handCard)}
      else if(action.decision==='discard'){if(player.hand.length){const removed=player.hand.splice(Math.floor(Math.random()*player.hand.length),1)[0];discardPile(player,false).push(removed)}}else return fail('请选择交牌或随机弃牌');break;
    }
    case 'copy': {
      const selected=choice.cards.find(card=>card.uid===action.copyCardUid);if(!selected)return fail('请选择本回合使用过的牌');
      const uid=`copy-${room.choiceSequence}`;
      player.hand.push({...selected,uid,cost:'无'});player.playActionOpen=true;
      const result=playCard(room,player,{...action,type:'playCard',cardUid:uid,copy:true});if(!result.ok){player.hand=player.hand.filter(item=>item.uid!==uid);return result}break;
    }
    case 'controlledMove': {
      if(action.decision==='stop')break;
      const tile=findTile(room,action.tileId),from=findTile(room,target.position);
      if(!tile||distance(from,tile)!==1)return fail('只能选择目标相邻地块');
      const cost=TERRAIN_COST[tile.type]||1;if(choice.points<cost)return fail('移动点数不足');
      target.position=tile.id;resolveTerrain(room,target,tile);if(choice.points>cost&&!target.eliminated)requestChoice(room,player,'controlledMove',{targetId:target.playerId,points:choice.points-cost});break;
    }
    default:return fail('未知选择类型');
  }
  room.choices.shift();
  if(!room.choices.length&&room.resumeEndTurn){const owner=room.players.find(item=>item.playerId===room.resumeEndTurn);room.resumeEndTurn=null;const next=advanceTurn(room,owner);if(next)beginTurn(room,next)}
  return {ok:true};
}
function act(room,player,action,careers=[]){
  const snapshot=structuredClone(room);
  const actionLabel=player.hand?.find(card=>card.uid===action.cardUid)?.name||({spring:'泉水恢复',build:'建造消耗生命',endTurn:'回合结算',resolveChoice:'卡牌响应'}[action.type])||action.type;
  const before=room.players.map(item=>({id:item.playerId,hp:item.hp}));
  const eventStart=room.eventSequence||0;
  let result;
  try{result=actInternal(room,player,action,careers)}catch(error){restoreState(room,snapshot);throw error}
  if(!result.ok){restoreState(room,snapshot);return result}
  if(result.ok){
    for(const owner of room.players)if(!owner.eliminated&&['wood','stone','meat','gold'].every(key=>!(owner.resources[key]>0))&&triggerSecret(room,owner,'东山再起'))requestChoice(room,owner,'comeback',{count:3});
    room.choices=(room.choices||[]).filter(choice=>room.players.some(item=>item.playerId===choice.playerId&&!item.eliminated));
    const currentPlayer=room.players.find(item=>item.playerId===room.currentPlayerId);
    if(room.phase==='playing'&&currentPlayer?.eliminated&&!room.choices.length)endTurn(room,currentPlayer);
    for(const previous of before){const current=room.players.find(item=>item.playerId===previous.id),delta=current.hp-previous.hp;
      const recorded=(room.events||[]).filter(event=>event.id>eventStart&&event.targetId===current.playerId).reduce((sum,event)=>sum+(event.type==='damage'?-event.amount:event.type==='heal'?event.amount:0),0);
      const residual=delta-recorded;
      if(residual)(room.events||=[]).push({id:room.eventSequence=(room.eventSequence||0)+1,type:residual<0?'damage':'heal',targetId:current.playerId,tileId:current.position,amount:Math.abs(residual),label:actionLabel});
    }
    room.events=(room.events||[]).slice(-80);
    room.choices=(room.choices||[]).filter(choice=>room.players.some(item=>item.playerId===choice.playerId&&!item.eliminated));
    if(room.phase==='finished')room.choices=[];
  }
  return result;
}
function restoreState(target,snapshot){
  for(const key of Object.keys(target))if(!(key in snapshot))delete target[key];
  for(const [key,value] of Object.entries(snapshot)){
    if(value&&typeof value==='object'&&target[key]&&typeof target[key]==='object'&&Array.isArray(value)===Array.isArray(target[key]))restoreState(target[key],value);
    else target[key]=value;
  }
  if(Array.isArray(target))target.length=snapshot.length;
}
function actInternal(room,player,action,careers){
  if(room.phase==='playing'&&room.choices?.length){
    if(action.type==='resolveChoice'&&!player.eliminated)return resolveChoice(room,player,action);
    if(action.type!=='endGame')return fail('请先处理待响应的卡牌选择');
  }
  if(action.type==="endGame"){
    if(room.hostId!==player.playerId)return fail("只有房主可以结束游戏");
    room.phase="finished";room.winner={type:"manual",playerId:player.playerId,nickname:player.nickname};log(room,`${player.nickname} 手动结束了游戏`);return {ok:true};
  }
  if(room.phase==="setup"){
    if(action.type!=="setupReady")return fail("请先完成开局布置");
    if(player.setupReady)return fail("已确认开局布置，无法再次修改");
    const tileId=String(action.spawnTileId||"");
    const candidateIds=room.setup?.spawnOptions?.[player.playerId]||room.setup?.spawnTiles||[];
    if(!candidateIds.includes(tileId))return fail("请选择外圈高亮出生格");
    const occupied=room.players.find(item=>item.playerId!==player.playerId&&!item.eliminated&&item.position===tileId);
    if(occupied)return fail("这个出生格已被其他玩家选择");
    const presets=room.setup?.resourcePresets||{};
    const presetId=presets[action.resourcePreset]?action.resourcePreset:"balanced";
    const presetResources={balanced:{wood:1,stone:1,meat:2,gold:0,special:0},woodland:{wood:2,stone:1,meat:1,gold:0,special:0},warband:{wood:1,stone:2,meat:1,gold:0,special:0},merchant:{wood:1,stone:1,meat:2,gold:0,special:0}}[presetId];
    if(action.resources!==undefined&&!validAllocation(action.resources,4))return fail("开局资源须为非负整数，木、石、肉、金合计恰好 4");
    player.position=tileId;player.resources=action.resources!==undefined?{wood:0,stone:0,meat:0,gold:0,...action.resources,special:0}:{...presetResources};player.setupPreset=action.resources!==undefined?'custom':presetId;player.setupReady=true;
    log(room,`${player.nickname} 完成开局布置`);
    if(room.players.every(item=>item.setupReady)){
      room.phase="playing";room.currentPlayerId=room.players[0].playerId;room.round=1;draw(room,room.players[0]);log(room,"所有玩家完成布置，首位玩家开始第一回合");
    }
    return {ok:true};
  }
  if(room.phase!=="playing")return fail("对局尚未开始或已经结束");
  if(player.eliminated&&room.currentPlayerId!==player.playerId)return fail("你已被淘汰");
  if(room.currentPlayerId!==player.playerId)return fail("还没轮到你");
  // 当前玩家在自己的回合内被淘汰（虚空、地火、自伤等）：立即把回合交给下一位，避免对局卡死。
  if(player.eliminated)return endTurn(room,player);
  if(player.stunnedUntilRound>=room.round&&action.type!=="endTurn")return fail("河神停滞：本回合无法操作");
  if(player.dripHealRound===room.round&&["rollMove","extraMove","move"].includes(action.type))return fail("打吊水期间不能移动");
  const breaksStealth=!(MOVE_ACTIONS.has(action.type)||STEALTH_SAFE_ACTIONS.has(action.type));
  const result=runAction(room,player,action,careers);
  // 只有行动真的结算成功才结束隐秘行踪，失败的尝试不应消耗状态。
  if(result.ok&&breaksStealth)endStealth(room,player);
  return result;
}

function runAction(room,player,action,careers){
  if(action.type==="endTurn")return endTurn(room,player);
  if(action.type==="discard"){
    const index=player.hand.findIndex(card=>card.uid===action.cardUid);if(index<0)return fail("找不到这张牌");
    if(activeUntil(room,player.hand[index].lock))return fail('交换的手牌尚未解锁');
    const removed=player.hand.splice(index,1)[0];
    discardPile(player,removed.type!=="行动卡"&&removed.type!=="奥秘卡").push(removed);
    log(room,`${player.nickname} 弃置 1 张牌`);return {ok:true};
  }
  if(action.type==="rollMove"||action.type==="extraMove"){
    if(player.moveBlockedUntilRound>room.round)return fail("猎狗缠住了你，本回合无法移动");
    if(player.movePoints!==null&&player.movePoints!==undefined)return fail("请先用完当前可移动的格数");
    if(action.type==="rollMove"){if(player.moved)return fail("本回合已进行基础移动");if(player.dripHealRound===room.round||player.loanMovePenaltyRound===room.round)return fail("本回合无法进行基础移动");player.moved=true}
    else{if(player.actionsLeft<1)return fail("行动次数不足");player.actionsLeft--;player.playActionOpen=false}
    const roll=rollDie(room,player,3,action);
    player.movePoints=roll;
    // 每次重新掷骰都重新获得重投机会（重投次数本身由 rerollLeft 限制）。
    player.moveSpent=false;
    if(hasEquipment(player,'小皮鞋')&&action.type==='extraMove')player.movePoints+=1+Math.floor(Math.random()*3);
    if(action.type==="rollMove"&&hasEquipment(player,"轻便草鞋"))player.movePoints++;
    if(action.type==='rollMove'&&activeUntil(room,player.bounty))dealDamage(room,player,2,room.players.find(item=>item.playerId===player.bounty.ownerId),'悬赏令');
    log(room,`${player.nickname} 掷出 ${roll} 点，本回合可移动 ${player.movePoints} 格`);return {ok:true,roll:player.movePoints};
  }
  if(action.type==="stopMove"){if(player.movePoints===null||player.movePoints===undefined)return fail("当前没有剩余移动格数");player.movePoints=null;return {ok:true}}
  // 赌徒「好赌之人」：本回合可重投一次移动骰；「赌瘾犯了」提升为两次。已经走过格子就不能再重投。
  if(action.type==="rerollMove"){
    if(player.careerId!=="gambler")return fail("只有赌徒可以重投移动骰");
    if((player.rerollLeft||0)<1)return fail("本回合的重投次数已经用完");
    if(player.movePoints===null||player.movePoints===undefined)return fail("请先投掷移动骰");
    if(player.moveSpent)return fail("已经移动过，不能再重投");
    player.rerollLeft--;
    player.movePoints=rollDie(room,player,3,action)+(hasEquipment(player,"轻便草鞋")?1:0);
    player.moveSpent=false;
    log(room,`${player.nickname} 重投移动骰，得到 ${player.movePoints} 点`);return {ok:true,roll:player.movePoints};
  }
  if(action.type==="move"){
    if(player.moveBlockedUntilRound>room.round)return fail("猎狗缠住了你，本回合无法移动");
    const from=findTile(room,player.position),to=findTile(room,action.tileId);
    if(!from||!to||distance(from,to)!==1)return fail("只能移动到相邻地块");
    if(room.players.some(item=>item!==player&&activeUntil(room,{ownerId:item.playerId,untilTurn:item.blockadeUntilTurn})&&distance(findTile(room,item.position),to)<=2))return fail('开道：无法进入对方周围两格');
    if(player.movePoints===null||player.movePoints===undefined)return fail("请先投掷移动骰");
    const cost=player.ignoreTerrainCost?1:Math.max(1,(TERRAIN_COST[to.type]||1)-(player.careerId==="hunter"&&player.talent2==="a"?1:0)-(hasEquipment(player,"马车")?1:0));
    if(player.movePoints<cost)return fail(`移动格数不足，进入这里需要 ${cost} 格，当前还剩 ${player.movePoints} 格`);
    player.movePoints-=cost;player.position=to.id;player.moveSpent=true;resolveTerrain(room,player,to);
    if(player.movePoints===0)player.movePoints=null;return {ok:true};
  }
  if(action.type==="playCard")return playCard(room,player,action);
  if(action.type==="openPlayAction"){
    if(player.playActionOpen)return fail("已经处于出牌阶段");
    if(player.actionsLeft<1)return fail("行动次数不足");
    player.actionsLeft--;player.playActionOpen=true;
    log(room,`${player.nickname} 进入出牌阶段，本回合可连续打出多张牌`);
    return {ok:true};
  }
  if(action.type==="closePlayAction"){player.playActionOpen=false;return {ok:true}}
  if(player.actionsLeft<1)return fail("行动次数不足");
  if(action.type==='whistle'){
    if(!player.dog||!hasEquipment(player,'哨子'))return fail('需要猎狗与哨子');
    const name=action.cardName==='召唤猎狗'?'召唤猎狗':'舔舐伤口';
    const piles=[room.decks[player.playerId]||[],discardPile(player,false)];
    const pile=piles.find(items=>items.some(card=>card.name===name));
    if(!pile)return fail('牌库与弃牌堆中没有对应卡牌');
    const index=pile.findIndex(card=>card.name===name);player.hand.push(pile.splice(index,1)[0]);player.actionsLeft--;player.playActionOpen=false;return {ok:true};
  }
  if(action.type==="draw"){
    if(action.extra&&player.resources.meat<1)return fail("额外抽牌需要 1 肉");
    // 先确认能抽到牌再扣费，避免牌库耗尽时白白损失资源与行动机会。
    if(!draw(room,player,1))return fail("你的专属牌库已空");
    let count=1;
    if(action.extra&&draw(room,player,1)){player.resources.meat--;count++}
    player.actionsLeft--;player.playActionOpen=false;
    if(hasEquipment(player,'发牌器')&&player.resources.special>0)requestChoice(room,player,'exchangeDraw',{});
    log(room,`${player.nickname} 抽取 ${count} 张牌${count>1?"（消耗 1 肉）":""}`);return {ok:true};
  }
  if(action.type==="forge"){
    if(findTile(room,player.position)?.feature!=="forge")return fail("只能在铁匠铺抽取装备");
    if(!draw(room,player,1,true))return fail("装备牌库已空");
    player.actionsLeft--;player.playActionOpen=false;log(room,`${player.nickname} 在铁匠铺抽取装备`);return {ok:true};
  }
  if(action.type==="build"){
    if(player.buildsThisTurn)return fail("每回合最多建造一次");
    const tile=findTile(room,action.tileId||player.position);if(!tile||tile.building)return fail("该格不可建造");
    const here=findTile(room,player.position);if(distance(here,tile)>(player.careerId==="merchant"?1:0))return fail("只能在所在格建造");
    const type=action.buildingType||buildOptions(room,player).find(item=>item.tileId===tile.id&&item.enabled)?.buildingType;
    const spec=buildingSpec(type,player);
    if(!spec)return fail("未知建筑类型");if(spec.terrain!==tile.type)return fail(`该建筑只能建在${spec.terrain}地形`);
    if(!canPay(player,spec.cost))return fail("建造资源不足");pay(player,spec.cost);
    placeBuilding(room,player,tile,type,spec);
    player.actionsLeft--;player.buildsThisTurn++;player.playActionOpen=false;return {ok:true};
  }
  if(action.type==="harvest"||action.type==="raid"){
    const tile=findTile(room,action.tileId),building=tile?.building,here=findTile(room,player.position);
    if(!building)return fail("该地块没有建筑");
    if(action.type==="harvest"){
      if(building.ownerId!==player.playerId||distance(here,tile)>2)return fail("只能收获两格内自己的建筑");
    }else{
      if(player.raidsThisTurn)return fail("每回合最多抢夺一次");
      // 商人「强制征税」：消耗 2 铜币可对 3 格内的敌方建筑强制抢夺。
      const forced=player.careerId==="merchant"&&player.talent3==="b";
      const range=forced?3:0;
      if(building.ownerId===player.playerId||distance(here,tile)>range)return fail(forced?"只能强制抢夺 3 格内的敌方建筑":"只能抢夺同格敌方建筑");
      if(activeUntil(room,building.guard))return fail('雇佣护卫：此建筑受到保护，无法抢夺');
      if(forced){
        if(player.resources.special<2)return fail("强制征税需要 2 铜币");
        player.resources.special-=2;
      }
      building.robbedRound=room.round;player.raidsThisTurn++;
    }
    let amount=building.robbedRound===room.round&&action.type==="harvest"&&!hasEquipment(player,'地契')?0:effectiveOutput(room,building);
    if(action.type==='harvest'&&action.useBoots&&hasEquipment(player,'官靴')){if(player.resources.special<2)return fail('官靴需要 2 铜币');player.resources.special-=2;amount*=2}
    gain(player,building.resource,amount);player.actionsLeft--;player.playActionOpen=false;log(room,`${player.nickname} ${action.type==="harvest"?"收获":"抢夺"}了 ${building.name}，获得 ${amount} ${RESOURCE_NAMES[building.resource]}`);return {ok:true};
  }
  if(action.type==="attack"){
    if(activeUntil(room,room.peace))return fail('平等条约生效期间无法基础攻击');
    const target=room.players.find(item=>item.playerId===action.targetPlayerId&&!item.eliminated);
    const range=attackRange(player,room.round);
    if(!target||target===player||distance(findTile(room,player.position),findTile(room,target.position))>range)return fail(`目标必须在 ${range} 格范围内`);
    if(target.stealthUntilRound>room.round)return fail("目标处于隐秘行踪，无法被攻击");
    // 鹰眼：攻击距离 +1 的代价是一回合只能进行一次基础攻击。
    if(player.careerId==="hunter"&&player.talent2==="b"&&(player.attacksThisTurn||0)>=1)return fail("鹰眼：本回合已经进行过基础攻击");
    if(player.careerId==="merchant"&&player.talent2==="b"){
      if(player.resources.special<2)return fail("拿钱砸人需要 2 铜币");
      player.resources.special-=2;
    }
    const damage=(player.careerId==="merchant"&&player.talent2!=="b"?0:1)+(player.burn||0);
    // 人造人的掠夺标记在交战时消耗；「无恶不作」让这次交战额外造成 1 点伤害。
    const usesRaidMarker=player.careerId==="android"&&player.resources.special>0&&(player.raidUses||0)<3;
    const bonus=usesRaidMarker&&player.talent2==="b"?1:0;
    let weaponBonus=0;
    if(hasEquipment(player,'十字弩')&&action.loadCrossbow){if(player.resources.wood<1)return fail('十字弩装填需要 1 木');player.resources.wood--;player.crossbowLoaded=true}
    if(hasEquipment(player,'假面短刃')&&target.hand.length){const shown=target.hand[Math.floor(Math.random()*target.hand.length)];requestChoice(room,player,'confirmAttack',{targetId:target.playerId,shownCard:shown,damage:damage+bonus,resourceChoice:action.resourceChoice});return {ok:true}}
    player.actionsLeft--;player.playActionOpen=false;
    if(triggerSecret(room,target,'灵活步伐'))requestChoice(room,target,'evade',{sourceId:player.playerId,points:2,damage:damage+bonus,range,guard:!!action.useGuard});
    else dealDamage(room,target,damage+bonus+weaponBonus,player,'基础攻击',{attack:true,guard:!!action.useGuard});
    eliminate(room,target);return {ok:true};
  }
  if(action.type==="spring"){
    if(findTile(room,player.position)?.type!=="spring")return fail("只能在泉水地形回复");
    player.hp=Math.min(player.maxHp,player.hp+1);player.actionsLeft--;player.playActionOpen=false;return {ok:true};
  }
  if(action.type==="upgrade"){
    const career=careers.find(item=>item.id===player.careerId);const branch=action.branch;
    if(!["a","b"].includes(branch))return fail("请选择天赋分支");
    const level=Number(action.level);
    if(![2,3].includes(level))return fail("请选择天赋等级");
    // 未完整实现的天赋不允许升级，避免扣了资源却没有任何效果。
    if(!talentSupport(player.careerId)[level][branch])return fail("此天赋的效果尚未接入，暂不能升级（未扣除任何资源）");
    if(level===2&&player.talent2)return fail("二级天赋只能选择一个");
    if(level===3&&!player.talent2)return fail("请先学习二级天赋");
    const name=career?.[`lv${level}${branch}Name`];const effect=career?.[`lv${level}${branch}Effect`];
    if(!name||!effect)return fail("此天赋尚未完成，暂不能升级");
    if(level===3&&player.talent3)return fail("已达到最高等级");
    const cost=parseCost(level===2?career[`lv2${branch}Cost`]:career.lv3Cost);
    if(!canPay(player,cost))return fail("升级资源不足");pay(player,cost);player[`talent${level}`]=branch;player.actionsLeft--;player.playActionOpen=false;log(room,`${player.nickname} 学会 ${name}`);return {ok:true};
  }
  if(action.type==="trial"){
    if(player.position!=="0:0"||player.score<30)return fail("达到 30 分并位于中心才能开启生存试炼");
    if(player.trial)return fail("生存试炼已经开始");
    const sacrifice=action.resources||{};
    const keys=["wood","stone","meat","gold","special"];
    if(!keys.every(key=>Number.isInteger(sacrifice[key]||0)&&(sacrifice[key]||0)>=0&&(sacrifice[key]||0)<=player.resources[key]))return fail("置换资源无效");
    const points=(sacrifice.wood||0)+(sacrifice.stone||0)+(sacrifice.meat||0)+(sacrifice.special||0)+Math.floor((sacrifice.gold||0)/2);
    for(const key of keys)player.resources[key]-=sacrifice[key]||0;
    player.trial={pending:points,active:true};player.actionsLeft--;player.playActionOpen=false;log(room,`${player.nickname} 开启生存试炼，置换的 ${points} 分将在下回合生效`);return {ok:true};
  }
  return fail("未知行动");
}

module.exports={createTiles,createDecks,draw,act,distance,attackRange,alivePlayers,talentSupport,effectiveOutput,buildOptions,cardMetadata:cardEffects.metadata,activeUntil};
