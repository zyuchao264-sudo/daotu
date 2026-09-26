const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./rules-engine');

function roomWithPlayer(){
  const player={playerId:'p1',nickname:'测试者',careerId:'hunter',hp:8,maxHp:8,score:0,resources:{wood:3,stone:3,meat:3,gold:0,special:0},position:'0:0',actionsLeft:2,moved:false,movePoints:null,hand:[],secrets:[],equipment:[],eliminated:false,buildsThisTurn:0,raidsThisTurn:0,playActionOpen:false};
  const room={phase:'playing',hostId:'p1',currentPlayerId:'p1',round:1,players:[player],tiles:engine.createTiles(),decks:{p1:[]},equipmentDecks:{p1:[]},discard:[],holySpringUses:0,log:[]};
  return {room,player};
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
