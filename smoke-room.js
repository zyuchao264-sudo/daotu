// 联机流程冒烟测试：真实启动 server.js，用最小 engine.io/socket.io 客户端跑一遍
// 建房 → 6 人入座（含重复职业）→ 开局 → 掷骰 → 移动 → 结束回合 → 离开房间。
// 依赖 Node 18+ 自带的 WebSocket，无需额外依赖。
// 运行：node smoke-room.js
const assert = require('node:assert/strict');

const PORT = Number(process.env.SMOKE_PORT || 3199);
process.env.PORT = String(PORT);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;

require('./server.js');

// 与 rules-engine.js 的 TERRAIN_COST 对应，用于挑一个移动点数够得着的邻格。
const TERRAIN_COST = {plain:1, forest:2, hill:2, river:2, riverGod:2, desert:1, spring:1, holySpring:1, void:1, fire:1, goldMine:1, trial:1};
const MOVE_CAREERS = ['hunter', 'merchant', 'gambler', 'android', 'career_1787382232648'];

class MiniSocket {
  constructor(url){
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.states = [];
    this.opened = new Promise((resolve,reject)=>{
      this._resolveOpen = resolve;
      this._rejectOpen = reject;
    });
  }
  on(event,handler){ this.handlers.set(event,handler); }
  connect(){
    return new Promise((resolve,reject)=>{
      this.ws = new WebSocket(this.url);
      this.ws.addEventListener('error',()=>{ const error = new Error('WebSocket 连接失败'); this._rejectOpen(error); reject(error); });
      this.ws.addEventListener('open',()=>this._send('40'));
      this.ws.addEventListener('message',event=>{
        for(const frame of String(event.data).split('\x1e')) this._onFrame(frame);
      });
      this.opened.then(resolve).catch(reject);
    });
  }
  _send(frame){ this.ws.send(frame); }
  _onFrame(frame){
    if(!frame) return;
    if(frame[0] === '0') return;                                // engine.io 握手
    if(frame === '2'){ this._send('3'); return; }               // ping → pong
    if(frame.startsWith('40')){ this._resolveOpen(); return; }  // socket.io 命名空间已连接
    if(frame.startsWith('42')){
      const match = frame.slice(2).match(/^(\d*)(\[.*\])$/s);
      if(!match) return;
      const [event,payload] = JSON.parse(match[2]);
      if(event === 'gameState') this.states.push(payload);
      const handler = this.handlers.get(event);
      if(handler) handler(payload);
      return;
    }
    if(frame.startsWith('43')){
      const match = frame.slice(2).match(/^(\d+)(\[.*\])$/s);
      if(!match) return;
      const resolve = this.pending.get(match[1]);
      this.pending.delete(match[1]);
      if(resolve) resolve(JSON.parse(match[2])[0]);
    }
  }
  emit(event,payload){
    const id = String(this.nextId++);
    return new Promise((resolve,reject)=>{
      const timer = setTimeout(()=>reject(new Error(`${event} 超时未响应`)), 8000);
      this.pending.set(id,result=>{ clearTimeout(timer); resolve(result); });
      this._send(`42${id}${JSON.stringify([event,payload])}`);
    });
  }
  latest(){ return this.states[this.states.length-1]; }
  close(){ try{ this.ws.close(); }catch{} }
}

const hexDistance = (first,second)=>
  Math.max(Math.abs(first.q-second.q),Math.abs(first.r-second.r),Math.abs(first.q+first.r-second.q-second.r));

// 服务端先回执再广播，其他人收到的 gameState 与回执没有先后保证，必须等状态而不是直接读最新值。
function waitForState(client,predicate,timeoutMs=5000){
  const matched = client.states.filter(predicate);
  if(matched.length) return Promise.resolve(matched[matched.length-1]);
  return new Promise((resolve,reject)=>{
    const timer = setTimeout(()=>{ cleanup(); reject(new Error('等待 gameState 超时')); },timeoutMs);
    const handler = payload=>{ if(predicate(payload)){ cleanup(); resolve(payload); } };
    const cleanup = ()=>{ clearTimeout(timer); client.handlers.delete('gameState'); };
    client.handlers.set('gameState',handler);
  });
}

async function connectAll(url,count){
  const clients = [];
  for(let index = 0; index < count; index++){
    const client = new MiniSocket(url);
    await client.connect();
    clients.push(client);
  }
  return clients;
}

async function main(){
  const url = `ws://127.0.0.1:${PORT}/socket.io/?EIO=4&transport=websocket`;
  const clients = [];
  try{
    // 静态资源必须真的被服务出来，否则页面加载后地图交互代码根本不会生效。
    for(const [file,needle] of [['/game.html','game-client.js'],['/game-client.js','PAN_DRAG_THRESHOLD'],['/game-layout.css','claim-badge'],['/index.html','updateAll']]){
      const response = await fetch(`http://127.0.0.1:${PORT}${file}`);
      assert.equal(response.status,200,`${file} 应可访问`);
      const text = await response.text();
      assert.ok(text.includes(needle),`${file} 应包含 ${needle}`);
    }
    // 地图棋子用角色头像做贴图，这些图片必须真的存在。
    for(const careerId of MOVE_CAREERS){
      const response = await fetch(`http://127.0.0.1:${PORT}/assets/avatars/${careerId==='career_1787382232648'?'trickster':careerId}.png`);
      assert.equal(response.status,200,'棋子头像应可访问');
    }
    console.log('✓ 静态页面、脚本与棋子头像可正常访问');

    const connected = await connectAll(url,6);
    connected.forEach(client=>clients.push(client));
    console.log(`✓ ${clients.length} 个客户端已连接`);

    const created = await clients[0].emit('createRoom',{nickname:'玩家1',careerId:MOVE_CAREERS[0],maxPlayers:6});
    assert.equal(created.ok,true,created.error);
    const roomCode = created.roomCode;
    console.log(`✓ 建房成功 ${roomCode}（目标 6 人）`);

    // 第 2 位玩家刻意选择与房主相同的职业：已裁定允许重复职业，且每名玩家仍有独立牌库。
    const joinReplies = [];
    for(let index = 1; index < 6; index++){
      const careerId = MOVE_CAREERS[index-1];
      const reply = await clients[index].emit('joinRoom',{roomCode,nickname:`玩家${index+1}`,careerId});
      assert.equal(reply.ok,true,`玩家${index+1} 入座失败：${reply.error}`);
      joinReplies.push(reply);
    }
    console.log(`✓ 6 人入座成功（含重复职业：两人都是 ${MOVE_CAREERS[0]}）`);

    const started = await clients[0].emit('startRoom',{roomCode,playerId:created.playerId});
    assert.equal(started.ok,true,started.error);
    const playing = await Promise.all(clients.map(client=>waitForState(client,state=>state.public.phase==='playing')));
    console.log('✓ 开局成功，6 名玩家都收到对局状态');

    const state = playing[0];
    assert.equal(state.public.players.length,6);

    const spawns = state.public.players.map(player=>player.position);
    assert.ok(spawns.every(Boolean),'每名玩家都应有出生点');
    assert.equal(new Set(spawns).size,6,'出生点不能重叠');
    assert.ok(!spawns.includes('0:0'),'出生点不能落在中心生存试炼板块');
    assert.ok(state.public.players.every(player=>player.hp>0&&player.hp===player.maxHp),'开局应满血');
    console.log(`✓ 出生点互不重叠且避开中心：${spawns.join(' ')}`);

    assert.equal(state.private.hand.length,4,'首位玩家应有 3 张起始手牌 + 1 张回合抽牌');
    assert.equal(playing[1].private.hand.length,3,'其他玩家应有 3 张起始手牌');
    assert.equal(state.public.currentPlayerId,created.playerId,'房主先行');
    console.log('✓ 手牌按玩家隔离，首位玩家先行');

    // 大金矿与天赋的下发字段必须到位，否则界面上的占领标记和天赋按钮无从渲染。
    for(const player of state.public.players){
      assert.equal(player.goldMine,null,'开局时没人占领大金矿');
      assert.equal(player.goldMineCollected,0);
      assert.ok(player.talentSupport&&player.talentSupport[2]&&player.talentSupport[3],'应下发天赋实现状态');
      assert.equal(typeof player.talentSupport[2].a,'boolean','天赋状态应为布尔值');
      assert.equal(typeof player.attackRange,'number');
      // 本回合待办需要的回合内状态
      assert.equal(player.buildsThisTurn,false,'开局应未建造');
      assert.equal(player.raidsThisTurn,false,'开局应未抢夺');
      assert.equal(player.moved,false,'开局应未移动');
      assert.equal(player.movePoints,null,'开局应未掷移动骰');
    }
    assert.equal(state.public.tiles.filter(tile=>tile.type==='goldMine').length,1,'地图上应恰好有一个大金矿');
    console.log('✓ 大金矿、天赋与本回合待办所需状态已下发');

    const rolled = await clients[0].emit('gameAction',{roomCode,playerId:created.playerId,action:{type:'rollMove'}});
    assert.equal(rolled.ok,true,rolled.error);
    assert.ok(rolled.roll>=1&&rolled.roll<=3,`移动骰应为 1~3，实际 ${rolled.roll}`);
    const afterRoll = await waitForState(clients[0],current=>
      current.public.players.find(player=>player.playerId===created.playerId)?.movePoints!=null);
    console.log(`✓ 掷移动骰 = ${rolled.roll}`);

    const me = afterRoll.public.players.find(player=>player.playerId===created.playerId);
    const here = afterRoll.public.tiles.find(tile=>tile.id===me.position);
    const affordable = afterRoll.public.tiles.filter(tile=>hexDistance(tile,here)===1&&(TERRAIN_COST[tile.type]||1)<=rolled.roll);
    if(affordable.length){
      // 掷出的点数就是可移动格数：连续走到格数用完，验证不是“一步就要重新掷骰”。
      let steps = 0, spent = 0, stoppedForNoTarget = false;
      while(steps < 10){
        const current = clients[0].latest();
        const walker = current.public.players.find(player=>player.playerId===created.playerId);
        if(!walker.movePoints) break;
        const from = current.public.tiles.find(tile=>tile.id===walker.position);
        const next = current.public.tiles
          .filter(tile=>hexDistance(tile,from)===1&&(TERRAIN_COST[tile.type]||1)<=walker.movePoints)
          .sort((first,second)=>(TERRAIN_COST[first.type]||1)-(TERRAIN_COST[second.type]||1))[0];
        if(!next){ stoppedForNoTarget = true; break; }
        const reply = await clients[0].emit('gameAction',{roomCode,playerId:created.playerId,action:{type:'move',tileId:next.id}});
        assert.equal(reply.ok,true,reply.error);
        spent += TERRAIN_COST[next.type]||1;
        steps++;
      }
      assert.ok(steps>=1,'掷骰后至少能移动一格');
      assert.ok(spent<=rolled.roll,`消耗的格数 ${spent} 不应超过掷出的 ${rolled.roll}`);
      if(!stoppedForNoTarget){
        assert.equal(spent,rolled.roll,`掷出 ${rolled.roll} 点应刚好用完 ${rolled.roll} 格`);
        if(rolled.roll>=2) assert.ok(steps>=2,`掷出 ${rolled.roll} 点应能连续移动多格，实际只走了 ${steps} 格`);
      }
      console.log(`✓ 掷出 ${rolled.roll} 点后连续移动 ${steps} 格（消耗 ${spent} 格，无需重新掷骰）`);
    }else{
      console.log('· 本次骰点不足以往任意相邻地块移动，跳过移动检查');
    }

    const wrongTurn = await clients[1].emit('gameAction',{roomCode,playerId:joinReplies[0].playerId,action:{type:'draw'}});
    assert.equal(wrongTurn.ok,false,'非当前玩家不应能行动');
    console.log(`✓ 非当前玩家被拒绝：${wrongTurn.error}`);

    const ended = await clients[0].emit('gameAction',{roomCode,playerId:created.playerId,action:{type:'endTurn'}});
    assert.equal(ended.ok,true,ended.error);
    const afterEnd = await waitForState(clients[0],current=>current.public.currentPlayerId===joinReplies[0].playerId);
    console.log(`✓ 回合已交给下一位玩家，进入第 ${afterEnd.public.round} 轮`);

    // 对局中离开只标记掉线，保留席位以便重连，不破坏进行中的对局。
    await clients[0].emit('leaveRoom',{roomCode,playerId:created.playerId});
    await waitForState(clients[1],current=>
      current.public.players.find(player=>player.playerId===created.playerId)?.connected===false);
    const afterLeave = clients[1].latest();
    assert.equal(afterLeave.public.players.length,6,'对局中离开不应删除席位');
    console.log('✓ 对局中离开只标记掉线，席位保留');

    // 等待阶段离开应释放席位，并由下一位玩家接任房主。
    const lobby = await clients[1].emit('createRoom',{nickname:'房主',careerId:'merchant',maxPlayers:2});
    assert.equal(lobby.ok,true,lobby.error);
    const guest = await clients[2].emit('joinRoom',{roomCode:lobby.roomCode,nickname:'客人',careerId:'gambler'});
    assert.equal(guest.ok,true,guest.error);
    await waitForState(clients[2],current=>current.public.players.length===2);
    await clients[1].emit('leaveRoom',{roomCode:lobby.roomCode,playerId:lobby.playerId});
    const lobbyState = await waitForState(clients[2],current=>current.public.players.length===1);
    assert.equal(lobbyState.public.hostId,guest.playerId,'房主应顺延给剩下的玩家');
    console.log('✓ 等待阶段离开释放席位并顺延房主');

    console.log('\n全部联机冒烟检查通过');
    return 0;
  }catch(error){
    console.error(`\n冒烟测试失败：${error.stack||error.message}`);
    return 1;
  }finally{
    for(const client of clients) client.close();
  }
}

main().then(code=>process.exit(code));
