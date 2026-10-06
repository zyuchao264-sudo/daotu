const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./rules-engine');

function roomWithPlayer(){
  const player={playerId:'p1',nickname:'测试者',careerId:'hunter',hp:8,maxHp:8,score:0,resources:{wood:3,stone:3,meat:3,gold:0,special:0},position:'0:0',actionsLeft:2,moved:false,movePoints:null,hand:[],secrets:[],equipment:[],eliminated:false,buildsThisTurn:0,raidsThisTurn:0,playActionOpen:false};
  const room={phase:'playing',hostId:'p1',currentPlayerId:'p1',round:1,players:[player],tiles:engine.createTiles(),decks:{p1:[]},equipmentDecks:{p1:[]},discard:[],holySpringUses:0,log:[]};
  return {room,player};
}

function roomWithPlayers(count){
  const players=Array.from({length:count},(_,index)=>({
    playerId:`p${index+1}`,nickname:`玩家${index+1}`,careerId:'hunter',hp:8,maxHp:8,score:0,
    resources:{wood:3,stone:3,meat:3,gold:0,special:0},position:'0:0',actionsLeft:2,moved:false,movePoints:null,
    hand:[],discard:[],equipmentDiscard:[],secrets:[],equipment:[],eliminated:false,
    buildsThisTurn:0,raidsThisTurn:0,raidUses:0,attacksThisTurn:0,playActionOpen:false
  }));
  const room={phase:'playing',hostId:'p1',currentPlayerId:'p1',round:1,players,tiles:engine.createTiles(),decks:{},equipmentDecks:{},discard:[],holySpringUses:0,log:[]};
  for(const player of players){room.decks[player.playerId]=[];room.equipmentDecks[player.playerId]=[];}
  return {room,players};
}

test('map contains 127 unique, connected hexes',()=>{
  const tiles=engine.createTiles();
  assert.equal(tiles.length,127);
  assert.equal(new Set(tiles.map(tile=>tile.id)).size,127);
  assert.equal(tiles.filter(tile=>tile.type==='trial').length,1);
  assert.ok(tiles.every(tile=>engine.distance(tile,{q:0,r:0})<=6));
});

test('players draw only from their own action deck',()=>{
  const players=[{playerId:'a',careerId:'hunter',hand:[]},{playerId:'b',careerId:'merchant',hand:[]}];
  const cards=[{uid:'h',career:'hunter',name:'狩猎',effect:'获得肉',type:'行动卡',count:2},{uid:'m',career:'merchant',name:'交易',effect:'交换',type:'行动卡',count:2},{uid:'e',career:'hunter',name:'短弓',effect:'装备',type:'武器',count:1}];
  const decks=engine.createDecks(cards,players);
  const room={...decks};
  assert.equal(engine.draw(room,players[0],2),2);
  assert.ok(players[0].hand.every(card=>card.career==='hunter'&&card.type==='行动卡'));
  assert.equal(room.equipmentDecks.a.length,1);
  assert.equal(room.decks.b.length,2);
});

test('build requires matching terrain, spends resources and awards one point',()=>{
  const {room,player}=roomWithPlayer();
  const forest=room.tiles.find(tile=>tile.type==='forest');
  player.position=forest.id;
  assert.equal(engine.act(room,player,{type:'build',tileId:forest.id,buildingType:'lumber'},[]).ok,true);
  assert.equal(forest.building.name,'伐木场');
  assert.equal(player.resources.wood,1);
  assert.equal(player.score,1);
  assert.equal(engine.act(room,player,{type:'build',tileId:forest.id,buildingType:'lumber'},[]).ok,false);
});

test('movement needs a roll and hand limit blocks turn end',()=>{
  const {room,player}=roomWithPlayer();
  const neighbor=room.tiles.find(tile=>engine.distance(tile,{q:0,r:0})===1);
  assert.equal(engine.act(room,player,{type:'move',tileId:neighbor.id},[]).ok,false);
  assert.equal(engine.act(room,player,{type:'rollMove'},[]).ok,true);
  assert.equal(player.moved,true);
  assert.equal(engine.act(room,player,{type:'rollMove'},[]).ok,false);
  player.hand=Array.from({length:6},(_,index)=>({uid:String(index)}));
  assert.equal(engine.act(room,player,{type:'endTurn'},[]).ok,false);
  assert.equal(engine.act(room,player,{type:'discard',cardUid:'0'},[]).ok,true);
  assert.equal(engine.act(room,player,{type:'endTurn'},[]).ok,true);
  assert.equal(room.round,2);
});

test('unsupported card is not consumed',()=>{
  const {room,player}=roomWithPlayer();
  player.hand=[{uid:'unknown',name:'未实现的卡',type:'行动卡',cost:'2肉'}];
  assert.equal(engine.act(room,player,{type:'playCard',cardUid:'unknown'},[]).ok,false);
  assert.equal(player.hand.length,1);
  assert.equal(player.resources.meat,3);
  assert.equal(player.actionsLeft,2);
});

test('equipment replaces its slot and remains separate from hand',()=>{
  const {room,player}=roomWithPlayer();
  player.hand=[{uid:'shoes-1',name:'轻便草鞋',type:'鞋',cost:'无'},{uid:'shoes-2',name:'马车',type:'防具',cost:'无'}];
  assert.equal(engine.act(room,player,{type:'playCard',cardUid:'shoes-1'},[]).ok,true);
  assert.equal(player.equipment[0].name,'轻便草鞋');
  assert.equal(player.hand.length,1);
  assert.equal(engine.act(room,player,{type:'rollMove'},[]).ok,true);
  assert.ok(player.movePoints>=2);
});

test('forge allows equipment draw only on its tile',()=>{
  const {room,player}=roomWithPlayer();
  room.equipmentDecks.p1=[{uid:'armor',name:'轻皮衣',type:'护具'}];
  assert.equal(engine.act(room,player,{type:'forge'},[]).ok,false);
  const forge=room.tiles.find(tile=>tile.feature==='forge');
  assert.ok(forge);
  player.position=forge.id;
  assert.equal(engine.act(room,player,{type:'forge'},[]).ok,true);
  assert.equal(player.hand[0].name,'轻皮衣');
});

test('resource conversion validates funds before consuming a card',()=>{
  const {room,player}=roomWithPlayer();
  player.resources.special=2;
  player.hand=[{uid:'swap',name:'钱是万能的',type:'行动卡',cost:'x铜币'}];
  assert.equal(engine.act(room,player,{type:'playCard',cardUid:'swap',resourceChoice:'gold',quantity:3},[]).ok,false);
  assert.equal(player.hand.length,1);
  assert.equal(engine.act(room,player,{type:'playCard',cardUid:'swap',resourceChoice:'gold',quantity:2},[]).ok,true);
  assert.equal(player.resources.gold,2);
  assert.equal(player.resources.special,0);
});

test('single player turn advances only when ended explicitly',()=>{
  const {room,player}=roomWithPlayer();
  room.decks.p1=[{uid:'drawn',name:'狩猎',type:'行动卡'}];
  assert.equal(engine.act(room,player,{type:'draw'},[]).ok,true);
  assert.equal(room.round,1);
  assert.equal(room.currentPlayerId,'p1');
  assert.equal(engine.act(room,player,{type:'endTurn'},[]).ok,true);
  assert.equal(room.round,2);
  assert.equal(room.currentPlayerId,'p1');
});

test('被淘汰的当前玩家不会卡住桌面',()=>{
  const {room,players}=roomWithPlayers(3);
  players[0].hp=0;players[0].eliminated=true;
  room.decks.p2=[{uid:'a',name:'狩猎',type:'行动卡'}];
  const result=engine.act(room,players[0],{type:'move',tileId:'1:0'},[]);
  assert.equal(result.ok,true);
  assert.equal(room.currentPlayerId,'p2','被淘汰玩家的回合应直接交给下一位');
  assert.equal(room.phase,'playing');
});

test('回合开始时被淘汰的玩家会被跳过',()=>{
  const {room,players}=roomWithPlayers(3);
  players[1].debtPending=true;players[1].resources.gold=0;players[1].hp=3;
  room.decks.p3=[{uid:'a',name:'狩猎',type:'行动卡'}];
  assert.equal(engine.act(room,players[0],{type:'endTurn'},[]).ok,true);
  assert.equal(players[1].eliminated,true);
  assert.equal(room.currentPlayerId,'p3','还款致死后应继续寻找下一位存活玩家');
  assert.equal(room.phase,'playing');
});

test('全员淘汰时判为无胜者而不是死循环',()=>{
  const {room,player}=roomWithPlayer();
  player.hp=0;player.eliminated=true;
  assert.equal(engine.act(room,player,{type:'endTurn'},[]).ok,true);
  assert.equal(room.phase,'finished');
  assert.equal(room.winner.type,'draw');
});

test('牌库不足时额外抽牌不扣肉且不消耗行动次数',()=>{
  const {room,player}=roomWithPlayer();
  room.decks.p1=[{uid:'only',name:'狩猎',type:'行动卡'}];
  assert.equal(engine.act(room,player,{type:'draw',extra:true},[]).ok,true);
  assert.equal(player.hand.length,1);
  assert.equal(player.resources.meat,3,'只抽到 1 张时不应扣肉');
  assert.equal(player.actionsLeft,1);
});

test('牌库为空时抽牌失败且不消耗资源与行动',()=>{
  const {room,player}=roomWithPlayer();
  assert.equal(engine.act(room,player,{type:'draw',extra:true},[]).ok,false);
  assert.equal(player.resources.meat,3);
  assert.equal(player.actionsLeft,2);
});

test('被替换的装备只洗回装备牌库，不混入行动牌库',()=>{
  const {room,player}=roomWithPlayer();
  player.hand=[{uid:'shoes-1',name:'轻便草鞋',type:'鞋',cost:'无'},{uid:'shoes-2',name:'轻便草鞋',type:'鞋',cost:'无'}];
  assert.equal(engine.act(room,player,{type:'playCard',cardUid:'shoes-1'},[]).ok,true);
  assert.equal(engine.act(room,player,{type:'playCard',cardUid:'shoes-2'},[]).ok,true);
  assert.equal((player.discard||[]).length,0,'装备不能进入行动牌弃牌堆');
  assert.equal(player.equipmentDiscard.length,1);
  assert.equal(engine.draw(room,player,1,true),1);
  assert.equal(player.equipmentDiscard.length,0,'装备弃牌堆应被洗回装备牌库');
  assert.equal(player.hand[player.hand.length-1].name,'轻便草鞋');
});

test('攻击距离按加法叠加',()=>{
  assert.equal(engine.attackRange({careerId:'gambler'},1),0);
  assert.equal(engine.attackRange({careerId:'hunter',talent2:'b',aimUntilRound:0},1),1);
  assert.equal(engine.attackRange({careerId:'hunter',talent2:'b',aimUntilRound:2},1),2);
  assert.equal(engine.attackRange({careerId:'merchant',talent2:'b',aimUntilRound:2},1),4);
});

test('鹰眼每回合只能进行一次基础攻击',()=>{
  const {room,players}=roomWithPlayers(2);
  players[0].careerId='hunter';players[0].talent2='b';
  players[1].position='1:0';
  assert.equal(engine.act(room,players[0],{type:'attack',targetPlayerId:'p2'},[]).ok,true);
  assert.equal(engine.act(room,players[0],{type:'attack',targetPlayerId:'p2'},[]).ok,false);
});

test('隐秘行踪只在行动真正结算后结束',()=>{
  const {room,player}=roomWithPlayer();
  player.hand=[{uid:'st',name:'隐秘行踪',type:'行动卡',cost:'2肉'}];
  assert.equal(engine.act(room,player,{type:'playCard',cardUid:'st'},[]).ok,true);
  assert.ok(player.stealthUntilRound>room.round,'打出行踪卡本身不应结束隐秘行踪');
  player.discard=[];
  assert.equal(engine.act(room,player,{type:'draw'},[]).ok,false);
  assert.ok(player.stealthUntilRound>room.round,'抽牌失败不应白白结束隐秘行踪');
  room.decks.p1=[{uid:'drawn',name:'狩猎',type:'行动卡'}];
  assert.equal(engine.act(room,player,{type:'draw'},[]).ok,true);
  assert.equal(player.stealthUntilRound,0,'成功抽牌是其他行动，应结束隐秘行踪');
});

test('大金矿：进入即占领，连续 3 个回合结束各得 2 金',()=>{
  const {room,player}=roomWithPlayer();
  const mine=room.tiles.find(tile=>tile.type==='goldMine');
  const neighbor=room.tiles.filter(tile=>engine.distance(tile,mine)===1)[0];
  player.position=neighbor.id;player.movePoints=2;
  assert.equal(engine.act(room,player,{type:'move',tileId:mine.id},[]).ok,true);
  assert.equal(player.goldMine.roundsLeft,3);
  assert.equal(mine.claim.playerId,'p1');
  assert.equal(mine.claim.roundsLeft,3);

  const start=player.resources.gold;
  for(const expected of [2,1,0]){
    assert.equal(engine.act(room,player,{type:'endTurn'},[]).ok,true);
    assert.equal(player.goldMine?.roundsLeft??0,expected);
  }
  assert.equal(player.resources.gold,start+6,'3 个回合共获得 6 金');
  assert.equal(player.goldMineCollected,6);
  assert.equal(player.goldMine,null,'占领结束后清除状态');
  assert.equal(mine.claim,null,'占领结束后清除地图标记');
});

test('大金矿：占领期间反复进入不会刷新时长，被他人进入会转移占领',()=>{
  const {room,players}=roomWithPlayers(2);
  const mine=room.tiles.find(tile=>tile.type==='goldMine');
  const neighbor=room.tiles.filter(tile=>engine.distance(tile,mine)===1)[0];
  players[0].position=neighbor.id;players[0].movePoints=2;
  assert.equal(engine.act(room,players[0],{type:'move',tileId:mine.id},[]).ok,true);
  assert.equal(engine.act(room,players[0],{type:'endTurn'},[]).ok,true);
  assert.equal(players[0].goldMine.roundsLeft,2);
  // 同一玩家再次进入：不刷新（回到自己的回合）
  room.currentPlayerId='p1';
  players[0].position=neighbor.id;players[0].movePoints=2;
  assert.equal(engine.act(room,players[0],{type:'move',tileId:mine.id},[]).ok,true);
  assert.equal(players[0].goldMine.roundsLeft,2,'生效期内反复进入不应刷新');
  // 另一名玩家进入：接管占领标记
  players[1].position=neighbor.id;players[1].movePoints=2;
  room.currentPlayerId='p2';
  assert.equal(engine.act(room,players[1],{type:'move',tileId:mine.id},[]).ok,true);
  assert.equal(mine.claim.playerId,'p2');
  assert.equal(players[0].goldMine,null,'原占领者的加成应被移除');
  assert.equal(players[1].goldMine.roundsLeft,3);
});

test('大金矿：占领者被淘汰时标记一并移除',()=>{
  const {room,players}=roomWithPlayers(2);
  const mine=room.tiles.find(tile=>tile.type==='goldMine');
  players[0].goldMine={tileId:mine.id,roundsLeft:2};
  mine.claim={playerId:'p1',nickname:'玩家1',roundsLeft:2};
  // 占领者在自己的回合开始因空头支票负债被淘汰
  players[0].debtPending=true;players[0].resources.gold=0;players[0].hp=3;
  room.currentPlayerId='p2';
  assert.equal(engine.act(room,players[1],{type:'endTurn'},[]).ok,true);
  assert.equal(players[0].eliminated,true);
  assert.equal(mine.claim,null,'占领者被淘汰后地图标记应清除');
});

test('未接入的天赋不能升级也不会扣资源',()=>{
  const {room,player}=roomWithPlayer();
  player.resources={wood:3,stone:3,meat:3,gold:4,special:0};
  const career={id:'hunter',lv2aName:'丛林之主',lv2aEffect:'效果',lv2aCost:'2木3肉',lv2bName:'鹰眼',lv2bEffect:'效果',lv2bCost:'2木3肉',lv3Cost:'4金',lv3aName:'公会会长',lv3aEffect:'效果',lv3bName:'锐利鹰眼',lv3bEffect:'效果'};
  const blocked=engine.act(room,player,{type:'upgrade',level:3,branch:'a'},[career]);
  assert.equal(blocked.ok,false);
  assert.match(blocked.error,/尚未接入/);
  assert.equal(player.resources.gold,4,'被拦截时不应扣除资源');
  player.talent2='a';
  const blockedAgain=engine.act(room,player,{type:'upgrade',level:3,branch:'a'},[career]);
  assert.equal(blockedAgain.ok,false);
  assert.equal(player.resources.gold,4);
  const allowed=engine.act(room,player,{type:'upgrade',level:2,branch:'b'},[career]);
  assert.equal(allowed.ok,false,'二级天赋只能选择一个');
  assert.equal(engine.talentSupport('merchant')[3].b,true,'商人三级 B 已实现');
  assert.equal(engine.talentSupport('gambler')[3].b,false,'赌徒三级 B 尚未实现');
});

test('商人「商会大亨」让专属建筑产出 +1',()=>{
  const {room,player}=roomWithPlayer();
  player.careerId='merchant';player.talent2='a';
  const plain=room.tiles.find(tile=>tile.type==='plain');
  player.position=plain.id;
  assert.equal(engine.act(room,player,{type:'build',tileId:plain.id,buildingType:'career'},[]).ok,true);
  assert.equal(plain.building.name,'商会');
  const before=player.resources.special;
  assert.equal(engine.act(room,player,{type:'harvest',tileId:plain.id},[]).ok,true);
  assert.equal(player.resources.special,before+3,'2 点基础产出 + 天赋 1 点');
});

test('商人「大富大贵」每笔非铜币收入额外给 1 铜币',()=>{
  const {room,player}=roomWithPlayer();
  player.careerId='merchant';player.talent3='a';
  const forest=room.tiles.find(tile=>tile.type==='forest');
  player.position=forest.id;
  assert.equal(engine.act(room,player,{type:'build',tileId:forest.id,buildingType:'lumber'},[]).ok,true);
  assert.equal(engine.act(room,player,{type:'harvest',tileId:forest.id},[]).ok,true);
  assert.equal(player.resources.wood,3,'3 木 - 2 建造 + 2 收获');
  assert.equal(player.resources.special,1,'获得木头的收入额外给 1 铜币');
});

test('商人「强制征税」可对 3 格内敌方建筑抢夺并收 2 铜币',()=>{
  const {room,players}=roomWithPlayers(2);
  players[0].careerId='merchant';players[0].talent3='b';players[0].resources.special=3;
  const forest=room.tiles.find(tile=>tile.type==='forest');
  forest.building={ownerId:'p2',name:'伐木场',type:'lumber',resource:'wood',output:2,level:1,robbedRound:null};
  const near=room.tiles.filter(tile=>engine.distance(tile,forest)===2)[0];
  players[0].position=near.id;
  assert.equal(engine.act(room,players[0],{type:'raid',tileId:forest.id},[]).ok,true);
  assert.equal(players[0].resources.special,1,'消耗 2 铜币');
  assert.equal(players[0].resources.wood,5,'3 + 抢夺产出 2');
});

test('人造人「无恶不作」在消耗掠夺标记时额外造成 1 点伤害',()=>{
  const {room,players}=roomWithPlayers(2);
  players[0].careerId='android';players[0].talent2='b';players[0].resources.special=1;
  players[1].position='0:0';
  assert.equal(engine.act(room,players[0],{type:'attack',targetPlayerId:'p2',resourceChoice:'wood'},[]).ok,true);
  assert.equal(players[1].hp,6,'基础 1 点 + 无恶不作 1 点');
  assert.equal(players[0].resources.special,0,'消耗 1 枚掠夺标记');
});

test('赌徒每回合可以重投一次移动骰',()=>{
  const {room,player}=roomWithPlayer();
  player.careerId='gambler';
  assert.equal(engine.act(room,player,{type:'endTurn'},[]).ok,true);
  assert.equal(player.rerollLeft,1,'好赌之人：回合开始获得 1 次重投');
  assert.equal(engine.act(room,player,{type:'rollMove'},[]).ok,true);
  assert.equal(engine.act(room,player,{type:'rerollMove'},[]).ok,true);
  assert.equal(player.rerollLeft,0);
  assert.equal(engine.act(room,player,{type:'rerollMove'},[]).ok,false,'重投次数已用完');
  assert.ok(player.movePoints>=1&&player.movePoints<=3);
  // 已经移动过就不能再重投
  const neighbor=room.tiles.filter(tile=>engine.distance(tile,{q:0,r:0})===1&&tile.type==='plain')[0];
  player.movePoints=3;
  assert.equal(engine.act(room,player,{type:'move',tileId:neighbor.id},[]).ok,true);
  assert.equal(engine.act(room,player,{type:'rerollMove'},[]).ok,false);
});

test('其他职业不能重投移动骰',()=>{
  const {room,player}=roomWithPlayer();
  assert.equal(engine.act(room,player,{type:'rollMove'},[]).ok,true);
  const result=engine.act(room,player,{type:'rerollMove'},[]);
  assert.equal(result.ok,false);
  assert.match(result.error,/赌徒/);
});

test('赌徒可以重投额外移动掷出的骰子',()=>{
  const {room,player}=roomWithPlayer();
  player.careerId='gambler';
  assert.equal(engine.act(room,player,{type:'endTurn'},[]).ok,true);
  assert.equal(engine.act(room,player,{type:'rollMove'},[]).ok,true);
  const plain=room.tiles.filter(tile=>engine.distance(tile,{q:0,r:0})===1&&tile.type==='plain')[0];
  assert.equal(engine.act(room,player,{type:'move',tileId:plain.id},[]).ok,true);
  player.movePoints=null;
  assert.equal(engine.act(room,player,{type:'extraMove'},[]).ok,true,'额外移动重新掷骰');
  assert.equal(player.moveSpent,false,'新一次掷骰应重新获得重投机会');
  assert.equal(engine.act(room,player,{type:'rerollMove'},[]).ok,true,'可以重投额外移动的骰子');
});
