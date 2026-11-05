const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('./rules-engine');
const data=require('./道途项目备份.json');
const views=require('./game-views');

function fixture(count=3){
  const players=Array.from({length:count},(_,index)=>({playerId:`p${index+1}`,nickname:`玩家${index+1}`,careerId:'hunter',position:`${index}:0`,hp:20,maxHp:20,resources:{wood:20,stone:20,meat:20,gold:20,special:20},score:0,actionsLeft:2,hand:[],equipment:[],secrets:[],discard:[],equipmentDiscard:[],dog:true,playActionOpen:true}));
  const room={phase:'playing',hostId:'p1',currentPlayerId:'p1',round:1,players,tiles:engine.createTiles(),decks:{},equipmentDecks:{},log:[],discard:[],holySpringUses:0};
  for(const player of players){room.decks[player.playerId]=Array.from({length:10},(_,index)=>({uid:`deck-${player.playerId}-${index}`,name:'舔舐伤口',type:'行动卡',cost:'无',career:'hunter'}));room.equipmentDecks[player.playerId]=[]}
  const act=(owner,action)=>engine.act(room,owner,action,[]);
  const play=(name,action={},owner=players[0])=>{
    const original=data.cards.find(card=>card.name===name)||({超级建造:{name,type:'行动卡',career:'hunter',cost:'2金'}}[name]);assert.ok(original,name);
    const card={...original,uid:`test-${name}`};owner.hand.push(card);owner.playActionOpen=true;
    return act(owner,{type:'playCard',cardUid:card.uid,...action});
  };
  const respond=(action={})=>{const choice=room.choices[0];return act(players.find(player=>player.playerId===choice.playerId),{type:'resolveChoice',choiceId:choice.id,...action})};
  return {room,players,play,act,respond};
}

test('现有卡牌全部注册；未知自定义卡保持关闭',()=>{
  for(const card of data.cards)assert.equal(engine.cardMetadata(card).supported,true,card.name);
  assert.equal(engine.cardMetadata({name:'未知自定义牌'}).supported,false);
});

for(const definition of data.cards){
  test(`卡牌可结算或进入明确响应流程：${definition.name}`,()=>{
    const {room,players,play}=fixture();const player=players[0];player.careerId=definition.career;
    if(definition.name==='冲吧！猎狗')player.dogFollowupAvailable=true;
    player.hand=[{uid:'other',name:'舔舐伤口',type:'行动卡',cost:'无',career:'hunter'}];
    players[1].hand=[{uid:'target-hand',name:'狩猎',type:'行动卡',cost:'1木',career:'hunter'}];
    const tile=room.tiles.find(tile=>tile.id==='1:0');tile.type='plain';
    if(['建筑升级','设备升级','拆迁','掀桌','雇佣护卫','超级收获'].includes(definition.name))tile.building={name:'赌场',ownerId:'p1',type:'career',level:1,output:2,resource:'special'};
    if(definition.name==='陷阱回收')tile.trap={ownerId:'p1',ownerName:player.nickname};
    const reply=play(definition.name,{targetPlayerId:'p2',tileId:tile.id,buildingType:'ranch',quantity:1,resourceChoice:'wood',handCardUid:'other',cardUids:['other'],dieChoice:3,declaredType:'行动卡'});
    assert.equal(reply.ok,true,reply.error);
    assert.ok(!player.hand.some(card=>card.uid===`test-${definition.name}`));
    assert.ok(room.players.every(player=>player.hp>=0&&Object.values(player.resources).every(value=>value>=0)));
  });
}

test('就地建造可选项携带费用与原因，合法选项直接建造',()=>{
  const {room,players,act}=fixture();const player=players[0];
  const forest=room.tiles.find(tile=>tile.type==='forest');player.position=forest.id;
  const options=engine.buildOptions(room,player);
  assert.deepEqual(options.map(option=>option.name),['伐木场','猎人公会']);
  assert.equal(options[0].enabled,true);
  const wood=player.resources.wood;
  assert.equal(act(player,{type:'build',tileId:forest.id,buildingType:options[0].buildingType}).ok,true);
  assert.equal(player.resources.wood,wood-2);assert.equal(player.score,1);assert.equal(player.actionsLeft,1);
  assert.equal(engine.buildOptions(room,player)[0].enabled,false);
});

test('默认近战可攻击相邻玩家，无法攻击两格外；可以进入其他玩家所在格',()=>{
  const {room,players,act}=fixture();
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p3'}).ok,false);
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p2'}).ok,true);assert.equal(players[1].hp,19);
  players[0].movePoints=3;room.tiles.find(tile=>tile.id==='1:0').type='plain';
  assert.equal(act(players[0],{type:'move',tileId:'1:0'}).ok,true);assert.equal(players[0].position,players[1].position);
});

test('无效建造或目标操作完整回滚，不扣卡、不扣资源、不破坏潜行',()=>{
  const {room,players,act}=fixture();const player=players[0];
  player.hand.push({...data.cards.find(card=>card.name==='建筑升级'),uid:'upgrade'});player.stealthUntilRound=3;
  const snapshot=structuredClone(room);
  assert.equal(act(player,{type:'playCard',cardUid:'upgrade',tileId:'6:0'}).ok,false);assert.deepEqual(room,snapshot);
  assert.equal(act(player,{type:'build',tileId:'1:0',buildingType:'ranch'}).ok,false);assert.deepEqual(room,snapshot);
});

test('猎人标记与装备加伤汇入统一伤害事件；护甲格挡也有事件',()=>{
  const {room,players,play,act}=fixture();
  assert.equal(play('猎人标记',{targetPlayerId:'p2',quantity:2}).ok,true);
  players[0].equipment=[{name:'匕首',slot:'weapon'}];
  players[1].equipment=[{name:'轻皮衣',slot:'armor'}];players[1].armorUses=1;
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p2'}).ok,true);
  assert.equal(players[1].hp,19);assert.equal(room.events.at(-1).amount,1);
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p2'}).ok,true);assert.equal(players[1].hp,16);
});

test('建筑升级、拆迁、保护和远程建造按费用与产出结算',()=>{
  const {room,players,play}=fixture();
  const tile=room.tiles.find(tile=>tile.id==='1:0');tile.type='plain';
  tile.building={name:'赌场',ownerId:'p1',type:'career',output:2,level:1,resource:'special'};
  assert.equal(play('建筑升级',{tileId:tile.id}).ok,true);assert.equal(tile.building.output,3);assert.equal(players[0].hp,18);
  assert.equal(play('雇佣护卫',{tileId:tile.id}).ok,true);assert.ok(tile.building.guard);
  assert.equal(play('拆迁',{tileId:tile.id}).ok,true);assert.equal(tile.building,null);
  assert.equal(play('超级建造',{tileId:tile.id,buildingType:'ranch'}).ok,true);assert.equal(tile.building.name,'牧场');
});

test('对手选择交资源或受伤；其他行动暂停；非法响应完整回滚',()=>{
  const {room,players,play,act,respond}=fixture();
  assert.equal(play('诈骗契约',{targetPlayerId:'p2'}).ok,true);
  assert.equal(act(players[0],{type:'endTurn'}).ok,false);
  const snapshot=structuredClone(room);
  assert.equal(respond({decision:'pay',resources:{gold:999}}).ok,false);assert.deepEqual(room,snapshot);
  assert.equal(respond({decision:'pay',resources:{wood:2,meat:1}}).ok,true);
  assert.equal(players[0].resources.wood,22);assert.equal(players[1].resources.wood,18);
  assert.equal(room.choices.length,0);
});

test('伪造身份由对手判断，翻牌后获得正确收益',()=>{
  const {room,players,play,respond}=fixture();const player=players[0];
  player.hand=[{uid:'hidden',name:'秘密行动',type:'行动卡',cost:'无'}];
  assert.equal(play('伪造身份',{targetPlayerId:'p2',handCardUid:'hidden',declaredType:'武器'}).ok,true);
  assert.equal(room.choices[0].playerId,'p2');
  const targetView=views.privateRoom(room,'p2');
  assert.equal(targetView.choice.card,undefined);assert.equal(targetView.choice.declaredType,'武器');
  assert.equal(views.privateRoom(room,'p3').choice,null);
  assert.equal(respond({decision:'believe'}).ok,true);assert.equal(player.resources.special,22);assert.equal(player.deceptions,1);
});

test('群体伪装交换牌被锁定直到施法者下一回合开始',()=>{
  const {room,players,play,act}=fixture();
  players[0].hand=[{uid:'first',name:'舔舐伤口',type:'行动卡',cost:'无'}];players[1].hand=[{uid:'second',name:'狩猎',type:'行动卡',cost:'无'}];
  assert.equal(play('群体伪装',{targetPlayerIds:['p2']}).ok,true);
  const received=players[0].hand[0];assert.equal(received.uid,'second');
  assert.equal(act(players[0],{type:'discard',cardUid:received.uid}).ok,false);
  assert.equal(act(players[0],{type:'playCard',cardUid:received.uid}).ok,false);
  players[0].turnsStarted=1;assert.equal(engine.activeUntil(room,received.lock),false);
});

test('响应牌预备后自动格挡、付费，并进入弃牌堆',()=>{
  const {room,players,play,act}=fixture();
  room.currentPlayerId='p2';
  assert.equal(play('拿钱消灾',{quantity:2},players[1]).ok,true);
  assert.equal(players[1].resources.special,20);
  room.currentPlayerId='p1';players[0].burn=1;
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p2'}).ok,true);
  assert.equal(players[1].hp,20);assert.equal(players[1].resources.special,18);assert.equal(players[1].secrets.length,0);
  assert.equal(room.events.at(-1).type,'block');
});

test('灵活步伐响应移动后，攻击超出范围则落空',()=>{
  const {room,players,play,act,respond}=fixture();room.currentPlayerId='p2';
  assert.equal(play('灵活步伐',{},players[1]).ok,true);room.currentPlayerId='p1';
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p2'}).ok,true);
  room.tiles.find(tile=>tile.id==='2:0').type='plain';
  assert.equal(respond({decision:'move',tileId:'2:0'}).ok,true);
  assert.equal(respond({decision:'stop'}).ok,true);assert.equal(players[1].hp,20);assert.equal(players[0].actionsLeft,1);
});

test('地形、群攻与治疗事件具有递增序号，覆盖多个玩家',()=>{
  const {room,players,play,act}=fixture();
  room.tiles.find(tile=>tile.id==='1:0').type='fire';players[0].movePoints=3;
  assert.equal(act(players[0],{type:'move',tileId:'1:0'}).ok,true);
  assert.equal(room.events[0].label,'地火');assert.equal(players[0].hp,16);
  assert.equal(play('撒钱').ok,true);assert.equal(room.events.filter(event=>event.label==='撒钱').length,2);
  assert.equal(play('舔舐伤口').ok,true);assert.equal(room.events.at(-1).type,'heal');
  const ids=room.events.map(event=>event.id);assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids,[...ids].sort((first,second)=>first-second));
});

test('假情报选择排序后抽顶牌；非法序列不会丢牌',()=>{
  const {room,players,play,respond}=fixture();
  assert.equal(play('假情报').ok,true);const uids=room.choices[0].cardUids;
  assert.equal(views.privateRoom(room,'p1').choice.cards.length,3);
  assert.equal(views.privateRoom(room,'p2').choice,null);
  assert.equal(respond({topCardUids:[uids[0],uids[0]],bottomCardUids:[]}).ok,false);
  assert.equal(respond({topCardUids:[uids[0]],bottomCardUids:uids.slice(1)}).ok,true);
  assert.equal(players[0].hand.at(-1).uid,uids[0]);
});

test('致命防御不会淘汰玩家，触发后移除防弹背心',()=>{
  const {room,players,act}=fixture();players[1].hp=1;players[1].equipment=[{name:'防弹背心',slot:'armor'}];
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p2'}).ok,true);
  assert.equal(players[1].hp,1);assert.equal(players[1].eliminated,undefined);assert.equal(players[1].equipment.length,0);
  assert.equal(players[1].removed[0].name,'防弹背心');assert.equal(room.events.at(-1).type,'block');
});

test('改头换面倒置顺序并在本回合后追加一次自己的回合',()=>{
  const {room,players,play,act}=fixture();const actor=players[0];
  assert.equal(play('改头换面').ok,true);assert.deepEqual(room.players.map(player=>player.playerId),['p3','p2','p1']);
  assert.equal(act(actor,{type:'endTurn'}).ok,true);assert.equal(room.currentPlayerId,'p1');
  assert.equal(act(actor,{type:'endTurn'}).ok,true);assert.equal(room.currentPlayerId,'p3');
});

test('地火淘汰当前玩家后自动移交回合，其他玩家继续游戏',()=>{
  const {room,players,act}=fixture();players[0].hp=1;players[0].movePoints=3;
  room.tiles.find(tile=>tile.id==='1:0').type='fire';
  assert.equal(act(players[0],{type:'move',tileId:'1:0'}).ok,true);
  assert.equal(players[0].eliminated,true);assert.equal(room.currentPlayerId,'p2');
});

test('千变骰子保留实际掷出点数，每回合至多沿用一次',()=>{
  const {players,act}=fixture();const player=players[0];
  player.equipment=[{name:'千变骰子'}];
  assert.equal(act(player,{type:'rollMove'}).ok,true);const kept=player.keptDie;
  assert.ok(kept>=1&&kept<=3);assert.equal(player.dieUsed,undefined);
  assert.equal(act(player,{type:'stopMove'}).ok,true);
  assert.equal(act(player,{type:'extraMove',useKeptDie:true}).ok,true);
  assert.equal(player.movePoints,kept);assert.equal(player.dieUsed,true);
});

test('私密查看权限不会把目标手牌发给第三方',()=>{
  const {room,players,play}=fixture();players[1].hand=[{uid:'secret',name:'狩猎',type:'行动卡',cost:'无'}];
  assert.equal(play('骗术大师',{targetPlayerId:'p2'}).ok,true);
  assert.equal(views.privateRoom(room,'p1').choice.cards[0].uid,'secret');
  assert.equal(views.privateRoom(room,'p2').choice,null);assert.equal(views.privateRoom(room,'p3').choice,null);
  assert.equal(views.privateRoom(room,'p3').insights.length,0);
});

test('空头支票与伪造变卖允许混合分配基础资源且拒绝超额',()=>{
  const {players,play}=fixture();const player=players[0];player.careerId='career_1787382232648';
  assert.equal(play('空头支票',{resources:{wood:1,stone:1,meat:1}}).ok,true);
  assert.equal(player.resources.wood,21);assert.equal(player.resources.stone,21);assert.equal(player.resources.meat,21);assert.equal(player.resources.gold,19);
  player.hand=[{uid:'sale-a',name:'狩猎',type:'行动卡',career:'hunter'},{uid:'sale-b',name:'止痛药',type:'行动卡',career:'merchant'}];
  assert.equal(play('伪造变卖',{resources:{gold:1,meat:1}}).ok,true);
  assert.equal(player.hand.length,0);assert.equal(player.resources.gold,20);assert.equal(player.resources.meat,22);
});

test('成功欺诈后可以重新选择连环骗局目标和无声软靴分支',()=>{
  const {room,players,play,respond}=fixture();players[0].comboActive=true;
  players[0].equipment=[{name:'无声软靴'}];
  players[1].hand=[{uid:'shown',name:'狩猎',type:'行动卡'}];
  assert.equal(play('虚张声势',{targetPlayerId:'p2'}).ok,true);
  assert.equal(room.choices[0].kind,'comboHit');
  assert.equal(respond({targetPlayerId:'p3'}).ok,true);assert.equal(players[2].hp,19);
  assert.equal(room.choices[0].kind,'softBoots');
  assert.equal(respond({decision:'coin'}).ok,true);assert.equal(players[0].resources.special,22);assert.equal(room.choices.length,0);
});

test('蓄力延后当前伤害，下个自己的回合才结算双倍伤害',()=>{
  const {room,players,play,act}=fixture();players[0].careerId='hunter';
  assert.equal(play('拉弓蓄力').ok,true);
  assert.equal(act(players[0],{type:'attack',targetPlayerId:'p2'}).ok,true);assert.equal(players[1].hp,20);
  for(const player of players)assert.equal(act(player,{type:'endTurn'}).ok,true);
  assert.equal(room.currentPlayerId,'p1');assert.equal(players[1].hp,18);
});

test('千面替身复制效果不制造额外实体卡，不重复支付印刷费用',()=>{
  const {room,players,play,respond}=fixture();const player=players[0];player.careerId='career_1787382232648';
  assert.equal(play('黑市交易').ok,true);const gold=player.resources.gold;
  assert.equal(play('千面替身').ok,true);assert.equal(respond({copyCardUid:'test-黑市交易'}).ok,true);
  assert.equal(player.resources.gold,gold+1);
  assert.equal(player.discard.filter(card=>card.name==='黑市交易').length,1);
  assert.equal(player.hand.some(card=>card.uid.startsWith('copy-')),false);
});
