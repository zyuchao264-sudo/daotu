const EQUIPMENT = new Set(['十字弩','匕首','轻布甲','轻便草鞋','捕兽夹','草药','哨子','轻皮衣','地契','护卫','防弹背心','马车','官靴','钱包','水泥','千层内衬','假面短刃','谎言怀表','无声软靴','破鞋','千变骰子','黑大衣','小皮鞋','老虎机','发牌器']);
const REACTIONS = new Set(['拿钱消灾','箭矢回收','灵活步伐','拉弓蓄力','仗势欺人','骰子也能防御','东山再起','我和你赌命','暗箱操作','假死脱身','骗术陷阱']);
const LEGACY = new Set(['止血绷带','舔舐伤口','陷阱投放','陷阱回收','狩猎','拾荒','整备','前进','召唤猎狗','冲吧！猎狗','誓死捍卫主人','隐秘行踪','战术瞄准','猎狗进化','猎人背包','金盆洗手','黑金','黑市交易','投资军火','瞄准射击','放暗箭','钱是万能的','换取筹码','哪有赌徒天天输','贷款','好运or厄运','逃跑是门技术','撒钱','止痛药','打吊水','假意示弱','空头支票']);
const DEFINITIONS = {
  '猎人标记':{target:'player',quantity:true}, '猎杀标记':{target:'player',range:3},
  '超级建造':{target:'tile',building:true}, '超级收获':{target:'tile'},
  '与虎为谋':{target:'player',range:2}, '建筑升级':{target:'tile',range:2},
  '拆迁':{target:'tile',range:3}, '开道':{}, '雇佣护卫':{target:'tile',range:2},
  '友好合约':{target:'player',range:2}, '悬赏令':{target:'player'},
  '金币雨':{target:'tile',range:3}, '钱来':{target:'players',range:3},
  '富甲天下':{}, '平等条约':{}, '虚张声势':{target:'player'},
  '群体伪装':{target:'players'}, '假情报':{}, '伪造身份':{target:'player',hand:true},
  '弥天大谎':{target:'player'}, '骗术大师':{target:'player'},
  '连环骗局':{}, '诈骗契约':{target:'player'},
  '借花献佛':{target:'player'}, '千面替身':{}, '伪造变卖':{},
  '偷天换日':{target:'player',hand:true}, '诱饵':{target:'player'},
  '狐假虎威':{target:'player',range:1}, '强抢豪夺':{target:'players'},
  '掠夺吧！':{}, '筛控':{target:'player',range:2}, '掀桌':{target:'tile',range:2},
  '兄弟，借点钱':{target:'player',range:2}, '让我看看':{target:'player',range:3,hand:true},
  '死亡轮盘':{}, '设备升级':{target:'tile',range:2}, '出老千':{},
  '押注':{target:'player',die:true}, '杀猪盘':{}, '改头换面':{}
};
function metadata(card){
  const name=card.name;
  const definition=DEFINITIONS[name];
  const legacyTarget={陷阱投放:'tile',陷阱回收:'tile',瞄准射击:'player',放暗箭:'player','冲吧！猎狗':'player',誓死捍卫主人:'player','好运or厄运':'player'}[name];
  const supported=!!definition||LEGACY.has(name)||EQUIPMENT.has(name)||REACTIONS.has(name);
  const resource=['拾荒','钱是万能的','换取筹码','哪有赌徒天天输','贷款','空头支票','伪造变卖','破鞋'].includes(name);
  const quantity=['钱是万能的','换取筹码','猎人标记','拿钱消灾'].includes(name);
  return {supported,reaction:REACTIONS.has(name),resource,quantity,target:definition?.target||legacyTarget||null,...definition};
}
function prepare(room,player,card,action,api){
  const definition=DEFINITIONS[card.name];
  if(!definition)return null;
  const {tileAt,distance,canPay,buildSpec,draw,gain,damage,log,output,discard,request}=api;
  const here=tileAt(player.position);
  const ids=action.targetPlayerIds||[action.targetPlayerId];
  if(!Array.isArray(ids))return {error:'目标玩家列表格式不正确'};
  const targets=[...new Set(ids)].map(id=>room.players.find(item=>item.playerId===id&&!item.eliminated));
  const target=targets[0];
  const tile=tileAt(action.tileId);
  const quantity=Number(action.quantity||1);
  const ownCard=player.hand.find(item=>item.uid===action.handCardUid&&item!==card&&!api.locked(item));
  if(definition.target==='player'||definition.target==='players'){
    if(!target||targets.some(item=>!item||item===player||item.stealthUntilRound>room.round||distance(here,tileAt(item.position))>(definition.range??Infinity)))return {error:`请选择${definition.range?definition.range+'格内的':''}其他未潜行玩家`};
    const max=card.name==='强抢豪夺'?3:2;
    if(definition.target==='players'&&targets.length>max)return {error:`最多选择 ${max} 名玩家`};
  }
  if(definition.target==='tile'&&(!tile||distance(here,tile)>(definition.range??Infinity)))return {error:'请选择范围内地块'};
  if(definition.hand&&!ownCard)return {error:'请选择另一张自己的手牌'};
  const building=tile?.building;
  const upgrade=card.name==='建筑升级'||card.name==='设备升级';
  if(upgrade&&(!building||(card.name==='设备升级'&&building.name!=='赌场')))return {error:'请选择可升级的建筑'};
  if(['拆迁','超级收获'].includes(card.name)&&building?.ownerId!==player.playerId)return {error:'请选择自己的建筑'};
  if(card.name==='雇佣护卫'&&!building)return {error:'请选择建筑'};
  if(card.name==='掀桌'&&!building)return {error:'请选择建筑'};
  const spec=buildSpec(action.buildingType,player);
  if(card.name==='超级建造'&&(!spec||tile.building||spec.terrain!==tile.type))return {error:'请选择空置的对应地形与建筑类型'};
  if(card.name==='猎人标记'&&(!Number.isInteger(quantity)||quantity<1||quantity>(player.resources.special||0)))return {error:'猎人标记数量不足或无效'};
  if(card.name==='押注'&&(!Number.isInteger(Number(action.dieChoice))||action.dieChoice<1||action.dieChoice>6))return {error:'请选择 1～6 的押注点数'};
  if(card.name==='出老千'&&(!Array.isArray(action.cardUids)||new Set(action.cardUids).size!==action.cardUids.length||action.cardUids.some(uid=>!player.hand.some(item=>item!==card&&item.uid===uid))))return {error:'请选择要换回牌库的手牌'};
  const sellable=player.hand.filter(item=>item!==card&&item.career&&item.career!==player.careerId&&!api.locked(item));
  if(card.name==='伪造变卖'&&action.resources&&!api.validAllocation(action.resources,sellable.length))return {error:'请按变卖张数分配基础资源'};
  const roll=()=>api.roll(6);
  const randomCard=owner=>owner.hand[Math.floor(Math.random()*owner.hand.length)];
  const remove=(owner,selected)=>{if(selected)owner.hand.splice(owner.hand.indexOf(selected),1)};
  const takeResources=(from,to,count)=>{
    for(const key of ['wood','stone','meat','gold']){const amount=Math.min(count,from.resources[key]||0);from.resources[key]-=amount;gain(to,key,amount);count-=amount}
    return count;
  };
  const success=()=>api.deceive();
  return {execute(){
    switch(card.name){
      case '猎人标记': player.resources.special-=quantity;(target.hunterMarks||={})[player.playerId]=((target.hunterMarks||{})[player.playerId]||0)+quantity;break;
      case '猎杀标记': target.markedCards={ownerId:player.playerId,uids:target.hand.map(item=>item.uid)};break;
      case '超级建造': api.build(tile,action.buildingType,spec);break;
      case '超级收获': gain(player,building.resource,output(building));break;
      case '建筑升级': case '设备升级': building.level++;building.output++;break;
      case '拆迁': gain(player,building.resource,output(building));tile.building=null;break;
      case '开道': player.blockadeUntilTurn=(player.turnsStarted||0)+1;break;
      case '雇佣护卫': building.guard={ownerId:player.playerId,untilTurn:(player.turnsStarted||0)+2};break;
      case '悬赏令': target.bounty={ownerId:player.playerId,untilTurn:(player.turnsStarted||0)+2};break;
      case '平等条约': room.peace={ownerId:player.playerId,untilTurn:(player.turnsStarted||0)+1};break;
      case '金币雨':
        tile.coinRain={ownerId:player.playerId,pendingIds:room.players.filter(item=>!item.eliminated).map(item=>item.playerId)};
        for(const victim of room.players.filter(item=>!item.eliminated&&item.position===tile.id))damage(victim,2,player,card.name);
        break;
      case '富甲天下': for(const item of room.tiles.filter(item=>item.building?.ownerId===player.playerId&&distance(here,item)<=2))gain(player,item.building.resource,output(item.building));break;
      case '友好合约': request(target,'contract',{sourceId:player.playerId,untilTurn:(player.turnsStarted||0)+2});break;
      case '与虎为谋': {const result=roll();log(`${player.nickname} 与虎为谋掷出 ${result}`);if(result!==6)request(target,'tribute',{sourceId:player.playerId,count:2});else request(player,'discardEnemy',{targetId:target.playerId});break}
      case '钱来': for(const victim of targets)request(victim,'tribute',{sourceId:player.playerId,count:1});break;
      case '虚张声势': {const shown=randomCard(target);if(shown){log(`${target.nickname} 展示 ${shown.name}`);if(shown.type==='行动卡'){gain(player,'special',1);success()}else damage(target,1,player,card.name)}break}
      case '群体伪装': for(const victim of targets){const first=randomCard(player),second=randomCard(victim);if(first&&second){remove(player,first);remove(victim,second);const lock={ownerId:player.playerId,untilTurn:(player.turnsStarted||0)+1};first.lock=lock;second.lock=lock;victim.hand.push(first);player.hand.push(second);api.exchange(victim)}}break;
      case '假情报': request(player,'scry',{cardUids:(room.decks[player.playerId]||[]).slice(-3).map(item=>item.uid)});break;
      case '伪造身份': remove(player,ownCard);request(target,'identity',{sourceId:player.playerId,card:ownCard,declaredType:action.declaredType||'行动卡'});break;
      case '弥天大谎': damage(target,3+(player.deceptions||0),player,card.name);request(player,'returnCard',{});break;
      case '骗术大师': request(player,'master',{targetId:target.playerId,step:'discard'});break;
      case '连环骗局': player.comboActive=true;break;
      case '诈骗契约': request(target,'extort',{sourceId:player.playerId,count:3,damage:3});break;
      case '强抢豪夺': for(const victim of targets)request(victim,'extort',{sourceId:player.playerId,count:2,damage:2,resources:['wood','stone','meat']});break;
      case '借花献佛': request(player,'borrow',{targetId:target.playerId});break;
      case '千面替身': {const previous=(player.playedThisTurn||[]).filter(item=>item.career===player.careerId&&item.name!=='千面替身');if(!previous.length){draw(player);gain(player,'special',1)}else request(player,'copy',{cards:previous});break}
      case '伪造变卖': {const resource=['wood','stone','meat','gold'].includes(action.resourceChoice)?action.resourceChoice:'wood';for(const item of sellable){remove(player,item);discard(player,item)}for(const [key,amount] of Object.entries(action.resources||{[resource]:sellable.length}))gain(player,key,amount);break}
      case '偷天换日': draw(player);draw(target);remove(player,ownCard);{const other=randomCard(target);remove(target,other);target.hand.push(ownCard);if(other)player.hand.push(other);api.exchange(target)}break;
      case '诱饵': request(target,'bait',{sourceId:player.playerId});gain(player,'special',1);break;
      case '狐假虎威': damage(target,0,player,card.name,{attack:true});damage(target,0,player,card.name,{attack:true});break;
      case '掠夺吧！': player.raidBoost=3;break;
      case '筛控': {const points=api.roll(3);request(player,'controlledMove',{targetId:target.playerId,points});log(`筛控：可替目标移动 ${points} 点`);break}
      case '掀桌': if(building.ownerId===player.playerId){const refund=buildSpec(building.type,player);if(refund)for(const [key,amount] of Object.entries(refund.cost))key==='hp'?player.hp=Math.min(player.maxHp,player.hp+amount):gain(player,key,amount);gain(player,building.resource,output(building));tile.building=null}else{const result=roll();log(`掀桌掷出 ${result}`);if(result>4)tile.building=null}break;
      case '兄弟，借点钱': request(target,'tribute',{sourceId:player.playerId,count:2});(player.borrowed||=[]).push({targetId:target.playerId,untilTurn:(player.turnsStarted||0)+1});break;
      case '让我看看': remove(player,ownCard);target.hand.push({...ownCard,spyOwnerId:player.playerId});break;
      case '死亡轮盘': {const result=roll(),victim=room.players[result-1];log(`死亡轮盘掷出 ${result}${victim?'，目标 '+victim.nickname:'，空位无伤害'}`);if(victim&&!victim.eliminated)damage(victim,2,player,card.name);break}
      case '出老千': {const limit=api.roll(3);const selected=action.cardUids.slice(0,limit);for(const uid of selected){const item=player.hand.find(item=>item.uid===uid);remove(player,item);room.decks[player.playerId].unshift(item)}draw(player,selected.length);log(`出老千掷出 ${limit}，换牌 ${selected.length} 张`);break}
      case '押注': {const result=roll();log(`押注 ${action.dieChoice}，掷出 ${result}`);if(result===Number(action.dieChoice))damage(target,3,player,card.name);else if(distance(here,tileAt(target.position))<=Number(action.dieChoice))damage(target,2,player,card.name);break}
      case '杀猪盘': for(const victim of room.players.filter(item=>!item.eliminated&&distance(here,tileAt(item.position))<=3)){const result=roll();log(`${victim.nickname} 杀猪盘掷出 ${result}`);if(result<=4)damage(victim,3,player,card.name)}break;
      case '改头换面': room.players.reverse();player.extraTurn=true;break;
    }
  }};
}
module.exports={EQUIPMENT,REACTIONS,metadata,prepare};
