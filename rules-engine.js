const TERRAIN_COST = {plain:1, forest:2, hill:2, river:2, riverGod:2, desert:1, spring:1, holySpring:1, void:1, fire:1, goldMine:1, trial:1};
const RESOURCE_NAMES = {wood:"木", stone:"石", meat:"肉", gold:"金", special:"专属资源"};
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
  for(const tile of main){
    if(tile.type==="plain"&&Math.abs(tile.q+tile.r)%5===0) tile.resource={type:["wood","stone","meat"][Math.abs(tile.q*3+tile.r)%3],amount:1};
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
  player.actionsLeft=2;player.moved=false;player.movePoints=null;
  player.buildsThisTurn=0;player.raidsThisTurn=0;player.raidUses=0;player.attacksThisTurn=0;player.playActionOpen=false;player.coatUsed=false;
  player.moveSpent=false;
  player.rerollLeft=player.careerId==="gambler"?(player.talent2==="a"?2:1):0;
  if(player.debtPending){
    if(player.resources.gold>=2)player.resources.gold-=2;
    else{player.hp-=3;eliminate(room,player);log(room,`${player.nickname} 无力偿还空头支票，受到 3 点伤害`)}
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

function resolveTerrain(room,player,tile){
  if(tile.resource&&player.careerId!=="android"){gain(player,tile.resource.type,tile.resource.amount);log(room,`${player.nickname} 拾取了 ${tile.resource.amount} ${RESOURCE_NAMES[tile.resource.type]}`);tile.resource=null}
  if(tile.type==="goldMine")claimGoldMine(room,player,tile);
  if(tile.type==="holySpring"&&room.holySpringUses<2){room.holySpringUses++;player.hp=player.maxHp;log(room,`${player.nickname} 在圣泉恢复了生命`);if(room.holySpringUses===2)tile.type="spring"}
  if(tile.type==="void"){
    const roll=1+Math.floor(Math.random()*6);
    if(roll%2)player.hp-=2;else player.score++;
    log(room,`${player.nickname} 在虚空掷出 ${roll}：${roll%2?"失去 2 生命":"获得 1 分"}`);eliminate(room,player)
  }
  if(tile.type==="fire"){
    player.resources.wood=0;player.resources.meat=0;player.hp-=4;
    player.fireTiles=player.fireTiles||[];
    if(!player.fireTiles.includes(tile.id)){player.fireTiles.push(tile.id);player.burn=(player.burn||0)+1}
    log(room,`${player.nickname} 穿过地火，失去 4 生命并获得燃烧`);eliminate(room,player)
  }
  if(tile.type==="riverGod"){
    if(canPay(player,{gold:5,meat:4})){pay(player,{gold:5,meat:4});player.blessing=true;log(room,`${player.nickname} 获得河神庇护`)}
    else{player.score=Math.max(0,player.score-3);player.stunnedUntilRound=room.round+1;log(room,`${player.nickname} 无法上供河神，失去 3 分并停滞`)}
  }
}

function parseCost(text){
  const cost={};for(const match of String(text||"").matchAll(/(\d+)\s*(木|石|肉|金|生命|血|铜币|筹码|猎人标记|欺诈币)/g)){
    const key={木:"wood",石:"stone",肉:"meat",金:"gold",生命:"hp",血:"hp",铜币:"special",筹码:"special",猎人标记:"special",欺诈币:"special"}[match[2]];
    cost[key]=(cost[key]||0)+Number(match[1]);
  }return cost;
}

// 基础攻击范围：默认 0（同格）。多个「攻击距离 +1」来源按加法叠加。
function attackRange(player,round){
  let range=player.careerId==="merchant"&&player.talent2==="b"?3:0;
  if(player.aimUntilRound>round)range++;
  if(player.careerId==="hunter"&&player.talent2==="b")range++;
  return range;
}

const MOVE_ACTIONS=new Set(["rollMove","rerollMove","extraMove","move","stopMove"]);
const STEALTH_SAFE_ACTIONS=new Set(["discard","closePlayAction","endTurn","playCard"]);
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
  if(card.type==="奥秘卡")return fail("奥秘卡只能在触发条件满足时使用；当前触发流程尚未开放");
  const slot={武器:"weapon",护具:"armor",防具:"armor",鞋:"shoes",道具:"item",宠物:"pet"}[card.type];
  const supportedEquipment=new Set(["轻便草鞋","草药","轻皮衣","黑大衣","马车"]);
  if(slot){
    if(!supportedEquipment.has(card.name))return fail("这件装备的效果尚未接入，暂不能装备");
    if(!player.playActionOpen){if(player.actionsLeft<1)return fail("行动次数不足");player.actionsLeft--;player.playActionOpen=true}
    endStealth(room,player);
    const old=player.equipment.find(item=>item.slot===slot);
    // 被替换的装备进入装备弃牌堆，不能混进职业行动牌库。
    if(old)discardPile(player,true).push(old);
    player.equipment=player.equipment.filter(item=>item.slot!==slot);
    player.equipment.push({...card,slot});player.hand.splice(index,1);
    log(room,`${player.nickname} 装备了 ${card.name}`);return {ok:true};
  }
  if(card.type!=="行动卡")return fail("未知卡牌类型");
  const cost=parseCost(card.cost);
  if(card.name==="止血绷带"&&hasEquipment(player,"草药"))cost.wood=0;
  if(!canPay(player,cost))return fail("支付卡牌费用的资源不足");
  const healing=card.name==="止血绷带"?2:card.name==="舔舐伤口"?1:0;
  const hunting=card.name==="狩猎";
  const drawing=card.name==="整备";
  const advancing=card.name==="前进";
  const summonDog=card.name==="召唤猎狗";
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
  const resourceChoice=action.resourceChoice;
  const quantity=Number(action.quantity)||1;
  const target=room.players.find(item=>item.playerId===action.targetPlayerId&&!item.eliminated);
  const playerTile=findTile(room,player.position);
  const targetedAttack=card.name==="瞄准射击"||card.name==="放暗箭";
  if(targetedAttack&&(!target||target===player||distance(playerTile,findTile(room,target.position))>2||target.stealthUntilRound>room.round))return fail("请选择两格内且未潜行的目标玩家");
  if(lucky&&(!target||distance(playerTile,findTile(room,target.position))>3))return fail("请选择三格内玩家");
  if((wealthSwap||chipSwap||gamblerGain||loan||blankCheque)&&!["wood","stone","meat","gold"].includes(resourceChoice))return fail("请选择资源种类");
  if((wealthSwap||chipSwap)&&(!Number.isInteger(quantity)||quantity<1||quantity>10))return fail("置换数量需为 1～10");
  if(wealthSwap&&player.resources.special<quantity)return fail("铜币不足");
  if(chipSwap&&player.resources[resourceChoice]<quantity)return fail("基础资源不足");
  if(gamblerGain&&player.resources[resourceChoice]<1)return fail("需要支付 1 份基础资源");
  if(blackGold&&player.resources.special<4)return fail("黑金需要 4 枚欺诈币");
  if(!healing&&!hunting&&!drawing&&!advancing&&!summonDog&&!stealth&&!aiming&&!dogEvolution&&!healingMerchant&&!blackGold&&!blackMarket&&!equipDraw&&!targetedAttack&&!wealthSwap&&!chipSwap&&!gamblerGain&&!loan&&!lucky&&!escape&&!paymentRain&&!painkiller&&!drip&&!weak&&!blankCheque)return fail("此卡效果尚未接入，暂不能打出，手牌与资源不会扣除");
  if(!player.playActionOpen){if(player.actionsLeft<1)return fail("行动次数不足");player.actionsLeft--;player.playActionOpen=true}
  if(card.name!=="隐秘行踪")endStealth(room,player);
  pay(player,cost);player.hand.splice(index,1);discardPile(player,false).push(card);
  if(healing)player.hp=Math.min(player.maxHp,player.hp+healing);
  if(hunting)gain(player,"meat",player.dog?2:1);
  if(drawing)draw(room,player,1,true);
  if(advancing)player.movePoints=(player.movePoints||0)+2+(player.talent2==="a"?1:0);
  if(summonDog)player.dog=true;
  if(stealth)player.stealthUntilRound=room.round+2;
  if(aiming)player.aimUntilRound=room.round+2;
  if(dogEvolution)player.dogDamage=(player.dogDamage||0)+1;
  if(healingMerchant){player.resources.special=0;player.hp=Math.min(player.maxHp,player.hp+3)}
  if(blackGold){player.resources.special-=4;gain(player,"gold",2);draw(room,player,2)}
  if(blackMarket){player.hp--;gain(player,"special",2);gain(player,"gold",1);eliminate(room,player)}
  if(equipDraw)draw(room,player,1,true);
  if(targetedAttack){target.hp-=reduceDamage(target,card.name==="放暗箭"?1:1+(player.burn||0),room.round);eliminate(room,target)}
  if(wealthSwap){player.resources.special-=quantity;gain(player,resourceChoice,quantity)}
  if(chipSwap){player.resources[resourceChoice]-=quantity;gain(player,"special",quantity)}
  if(gamblerGain){player.resources[resourceChoice]--;gain(player,"special",1+Math.floor(Math.random()*3))}
  if(loan){draw(room,player);gain(player,resourceChoice,1);player.loanMovePenaltyRound=room.round+1}
  if(lucky){const roll=1+Math.floor(Math.random()*6);if(roll>3)target.hp=Math.min(target.maxHp,target.hp+roll-3);else if(roll<3){target.hp-=reduceDamage(target,3-roll,room.round);eliminate(room,target)}log(room,`${target.nickname} 掷出 ${roll}`)}
  if(escape){const roll=1+Math.floor(Math.random()*6);player.movePoints=(player.movePoints||0)+Math.min(3,roll)+(roll===4||roll===6?1:0);player.ignoreTerrainCost=roll===5||roll===6;log(room,`${player.nickname} 逃跑掷出 ${roll}`)}
  if(paymentRain)for(const victim of room.players.filter(item=>item!==player&&!item.eliminated)){victim.hp-=reduceDamage(victim,2,room.round);eliminate(room,victim)}
  if(painkiller)player.painkillerUntilRound=room.round+2;
  if(drip)player.dripHealRound=room.round+1;
  if(weak){player.weakShield=2;player.weakShieldHit=false}
  if(blankCheque){gain(player,resourceChoice,3);player.debtPending=true}
  log(room,`${player.nickname} 打出了 ${card.name}`);return {ok:true};
}

function act(room,player,action,careers){
  if(action.type==="endGame"){
    if(room.hostId!==player.playerId)return fail("只有房主可以结束游戏");
    room.phase="finished";room.winner={type:"manual",playerId:player.playerId,nickname:player.nickname};log(room,`${player.nickname} 手动结束了游戏`);return {ok:true};
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
    const removed=player.hand.splice(index,1)[0];
    discardPile(player,removed.type!=="行动卡"&&removed.type!=="奥秘卡").push(removed);
    log(room,`${player.nickname} 弃置 1 张牌`);return {ok:true};
  }
  if(action.type==="rollMove"||action.type==="extraMove"){
    if(player.movePoints!==null&&player.movePoints!==undefined)return fail("请先用完当前可移动的格数");
    if(action.type==="rollMove"){if(player.moved)return fail("本回合已进行基础移动");if(player.dripHealRound===room.round||player.loanMovePenaltyRound===room.round)return fail("本回合无法进行基础移动");player.moved=true}
    else{if(player.actionsLeft<1)return fail("行动次数不足");player.actionsLeft--;player.playActionOpen=false}
    player.movePoints=1+Math.floor(Math.random()*3);
    // 每次重新掷骰都重新获得重投机会（重投次数本身由 rerollLeft 限制）。
    player.moveSpent=false;
    const roll=player.movePoints;
    if(action.type==="rollMove"&&hasEquipment(player,"轻便草鞋"))player.movePoints++;
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
    player.movePoints=1+Math.floor(Math.random()*3)+(hasEquipment(player,"轻便草鞋")?1:0);
    player.moveSpent=false;
    log(room,`${player.nickname} 重投移动骰，得到 ${player.movePoints} 点`);return {ok:true,roll:player.movePoints};
  }
  if(action.type==="move"){
    const from=findTile(room,player.position),to=findTile(room,action.tileId);
    if(!from||!to||distance(from,to)!==1)return fail("只能移动到相邻地块");
    if(player.movePoints===null||player.movePoints===undefined)return fail("请先投掷移动骰");
    const cost=player.ignoreTerrainCost?1:Math.max(1,(TERRAIN_COST[to.type]||1)-(player.careerId==="hunter"&&player.talent2==="a"?1:0)-(hasEquipment(player,"马车")?1:0));
    if(player.movePoints<cost)return fail(`移动格数不足，进入这里需要 ${cost} 格，当前还剩 ${player.movePoints} 格`);
    player.movePoints-=cost;player.position=to.id;player.moveSpent=true;resolveTerrain(room,player,to);
    if(player.movePoints===0)player.movePoints=null;return {ok:true};
  }
  if(action.type==="playCard")return playCard(room,player,action);
  if(action.type==="closePlayAction"){player.playActionOpen=false;return {ok:true}}
  if(player.actionsLeft<1)return fail("行动次数不足");
  if(action.type==="draw"){
    if(action.extra&&player.resources.meat<1)return fail("额外抽牌需要 1 肉");
    // 先确认能抽到牌再扣费，避免牌库耗尽时白白损失资源与行动机会。
    if(!draw(room,player,1))return fail("你的专属牌库已空");
    let count=1;
    if(action.extra&&draw(room,player,1)){player.resources.meat--;count++}
    player.actionsLeft--;player.playActionOpen=false;
    log(room,`${player.nickname} 抽取 ${count} 张牌${count>1?"（消耗 1 肉）":""}`);return {ok:true};
  }
  if(action.type==="forge"){
    if(findTile(room,player.position)?.feature!=="forge")return fail("只能在铁匠铺抽取装备");
    if(!draw(room,player,1,true))return fail("装备牌库已空");
    player.actionsLeft--;player.playActionOpen=false;log(room,`${player.nickname} 在铁匠铺抽取装备`);return {ok:true};
  }
  if(action.type==="build"){
    if(player.buildsThisTurn)return fail("每回合最多建造一次");
    const tile=findTile(room,action.tileId);if(!tile||tile.building)return fail("该格不可建造");
    const here=findTile(room,player.position);if(distance(here,tile)>(player.careerId==="merchant"?1:0))return fail("只能在所在格建造");
    const spec=action.buildingType==="career"?CAREER_BUILDINGS[player.careerId]:BASE_BUILDINGS[action.buildingType];
    if(!spec)return fail("未知建筑类型");if(spec.terrain!==tile.type)return fail(`该建筑只能建在${spec.terrain}地形`);
    if(!canPay(player,spec.cost))return fail("建造资源不足");pay(player,spec.cost);
    tile.building={ownerId:player.playerId,name:spec.name,type:action.buildingType,resource:spec.resource||"special",output:2,level:1,robbedRound:null};
    player.score++;player.actionsLeft--;player.buildsThisTurn++;player.playActionOpen=false;log(room,`${player.nickname} 建造了 ${spec.name}，获得 1 分`);return {ok:true};
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
      if(forced){
        if(player.resources.special<2)return fail("强制征税需要 2 铜币");
        player.resources.special-=2;
      }
      building.robbedRound=room.round;player.raidsThisTurn++;
    }
    const amount=building.robbedRound===room.round&&action.type==="harvest"?0:effectiveOutput(room,building);
    gain(player,building.resource,amount);player.actionsLeft--;player.playActionOpen=false;log(room,`${player.nickname} ${action.type==="harvest"?"收获":"抢夺"}了 ${building.name}，获得 ${amount} ${RESOURCE_NAMES[building.resource]}`);return {ok:true};
  }
  if(action.type==="attack"){
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
    const damage=player.careerId==="merchant"&&player.talent2!=="b"?0:1+(player.burn||0);
    // 人造人的掠夺标记在交战时消耗；「无恶不作」让这次交战额外造成 1 点伤害。
    const usesRaidMarker=player.careerId==="android"&&player.resources.special>0&&(player.raidUses||0)<3;
    const bonus=usesRaidMarker&&player.talent2==="b"?1:0;
    const dealt=reduceDamage(target,damage+bonus,room.round);target.hp-=dealt;player.actionsLeft--;player.playActionOpen=false;player.attacksThisTurn=(player.attacksThisTurn||0)+1;log(room,`${player.nickname} 对 ${target.nickname} 造成 ${dealt} 伤害`);
    if(usesRaidMarker&&dealt>0){
      const resource=["wood","stone","meat"].includes(action.resourceChoice)?action.resourceChoice:"wood";
      const stolen=Math.min(3,target.resources[resource]||0);
      player.resources.special--;target.resources[resource]-=stolen;gain(player,resource,stolen);player.raidUses++;
      log(room,`${player.nickname} 消耗掠夺标记，夺取 ${stolen} ${RESOURCE_NAMES[resource]}`);
    }
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

module.exports={createTiles,createDecks,draw,act,distance,attackRange,alivePlayers,talentSupport,effectiveOutput};
