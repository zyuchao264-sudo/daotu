// 地图缩放/拖动逻辑的集成验证。
// 在 vm 中用最小 DOM 桩加载真实的 game-client.js，直接检查它写入 SVG 的 viewBox，
// 避免只靠人工点击验证“右键拖动是否生效”。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('./rules-engine');

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 500;

function makeElement(tag){
  const listeners = {};
  const element = {
    tagName:String(tag||'div').toUpperCase(),
    attributes:{}, style:{}, dataset:{}, children:[],
    innerHTML:'', textContent:'', disabled:false, hidden:false, onclick:null, id:'',
    classList:{
      _set:new Set(),
      add(...names){names.forEach(name=>this._set.add(name))},
      remove(...names){names.forEach(name=>this._set.delete(name))},
      contains(name){return this._set.has(name)},
      toggle(name,force){const on=force===undefined?!this._set.has(name):!!force;on?this._set.add(name):this._set.delete(name);return on}
    },
    querySelector(){return null},
    // 让 [data-action] 查询真的返回按钮：这样 buildCommandPanel 的接线逻辑会被真正执行，
    // 同时可以用按钮注册表断言禁用/文案状态。
    querySelectorAll(selector){
      if(selector==='[data-action]')return actionsIn(this.innerHTML).map(registerActionButton);
      if(selector==='[data-todo]')return todosIn(this.innerHTML).map(registerTodoButton);
      return [];
    },
    append(){}, before(){}, after(){}, remove(){},
    addEventListener(type,handler){(listeners[type]||=[]).push(handler)},
    removeEventListener(){},
    dispatch(type,event){for(const handler of listeners[type]||[])handler(event)},
    setAttribute(name,value){this.attributes[name]=String(value)},
    getAttribute(name){return this.attributes[name]},
    setPointerCapture(){}, releasePointerCapture(){}, hasPointerCapture(){return false},
    getBoundingClientRect(){return {width:BOARD_WIDTH,height:BOARD_HEIGHT,left:0,top:0,right:BOARD_WIDTH,bottom:BOARD_HEIGHT}},
    contains(){return false}
  };
  return element;
}

const ACTION_PATTERN = /data-action="([^"]+)"/g;
function actionsIn(html){
  return [...String(html).matchAll(ACTION_PATTERN)].map(match => match[1]);
}
// 同一个 action 始终返回同一个按钮对象，便于断言
const actionButtons = new Map();
function registerActionButton(action){
  if(!actionButtons.has(action)){
    const button = makeElement('button');
    button.dataset.action = action;
    actionButtons.set(action, button);
  }
  return actionButtons.get(action);
}

const TODO_PATTERN = /data-todo="([^"]+)"/g;
function todosIn(html){
  return [...String(html).matchAll(TODO_PATTERN)].map(match => match[1]);
}
const todoButtons = new Map();
function registerTodoButton(action){
  if(!todoButtons.has(action)){
    const button = makeElement('button');
    button.dataset.todo = action;
    todoButtons.set(action, button);
  }
  return todoButtons.get(action);
}

// 与浏览器一致：viewBox 映射到元素时使用统一缩放 k = min(rectW/vbW, rectH/vbH)。
function makeSvg(){
  const svg = makeElement('svg');
  svg.getScreenCTM = () => {
    const parts = String(svg.attributes.viewBox || '0 0 900 900').split(/\s+/).map(Number);
    const scale = Math.min(BOARD_WIDTH / parts[2], BOARD_HEIGHT / parts[3]);
    return {a:scale, b:0, c:0, d:scale, e:0, f:0};
  };
  return svg;
}

function loadClient(){
  actionButtons.clear();
  todoButtons.clear();
  const svg = makeSvg();
  const board = makeElement('div');
  board.querySelector = selector => (selector === 'svg' ? svg : null);
  const elements = new Map([['board', board]]);
  const getElement = id => {
    if(!elements.has(id)) elements.set(id, makeElement('div'));
    return elements.get(id);
  };
  const windowListeners = {};
  const windowStub = {
    addEventListener(type,handler){(windowListeners[type]||=[]).push(handler)},
    removeEventListener(){},
    dispatch(type,event){for(const handler of windowListeners[type]||[])handler(event)}
  };
  const sent = [];
  const sandbox = {
    console, setTimeout, clearTimeout, Math, JSON, Date,
    document:{
      getElementById:getElement,
      createElement:tag=>makeElement(tag),
      querySelector:()=>makeElement('div'),
      querySelectorAll:()=>[],
      head:makeElement('head'),
      body:makeElement('body')
    },
    window:windowStub,
    localStorage:{getItem:()=>null, setItem(){}, removeItem(){}},
    socket:{on(){}, emit(){}, connected:false},
    esc:value=>String(value ?? ''),
    // 与 game.html 里的实现保持一致，这样提示文案也能被断言
    notice:(id,message)=>{getElement(id).textContent=message||''},
    send:action=>sent.push(action), confirm:()=>false,
    careers:[], readyCareerIds:new Set(), selectedCareer:'',
    state:null, meId:'p1', roomCode:'TEST01',
    $:getElement
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'game-client.js'),'utf8'), sandbox, {filename:'game-client.js'});
  // game-client.js 自己会包装 send 做“处理中”提示，这里在校验场景下换成记录器。
  sandbox.send = action => sent.push(action);
  return {sandbox, board, svg, getElement, windowStub, sent, buttonFor: action => actionButtons.get(action), todoFor: action => todoButtons.get(action)};
}

const HUNTER_CAREER = {
  id:'hunter', name:'猎人', hp:8, buildingName:'猎人公会',
  passive0:'忠诚的伙伴：开局自带猎狗',
  lv2aName:'丛林之主', lv2aCost:'2木3肉', lv2aEffect:'困难地形消耗减 1',
  lv2bName:'鹰眼', lv2bCost:'2木3肉', lv2bEffect:'攻击距离 +1',
  lv3Cost:'4金',
  lv3aName:'公会会长', lv3aEffect:'印记可直接放置',
  lv3bName:'锐利鹰眼', lv3bEffect:'额外基础攻击'
};

function gameState(overrides = {}){
  const me = Object.assign({
    playerId:'p1', nickname:'甲', careerId:'hunter', hp:8, maxHp:8, score:0,
    resources:{wood:3,stone:3,meat:3,gold:0,special:0}, position:'0:0', eliminated:false,
    actionsLeft:2, moved:false, movePoints:null, handCount:2, secretCount:0, equipment:[],
    talent2:null, talent3:null, attackRange:0, goldMine:null, goldMineCollected:0,
    rerollLeft:0, moveSpent:false, ignoreTerrainCost:false,
    talentSupport:{2:{a:true,b:true},3:{a:false,b:false}}
  }, overrides.me || {});
  return {
    public:Object.assign({
      roomCode:'TEST01', phase:'playing', hostId:'p1', maxPlayers:2, round:3,
      currentPlayerId:'p1', winner:null, players:[me], tiles:engine.createTiles(), log:[]
    }, overrides.public || {}),
    private:Object.assign({hand:[], deckCount:12, equipmentDeckCount:3, secretCount:0}, overrides.private || {})
  };
}

function commandStates(buttonFor){
  return {
    endTurn:buttonFor('endTurn'), rollMove:buttonFor('rollMove'), attack:buttonFor('attack'),
    draw:buttonFor('draw'), build:buttonFor('build'), raid:buttonFor('raid'),
    trial:buttonFor('trial'), endGame:buttonFor('endGame')
  };
}

test('指令面板状态随回合与资源变化', async t => {
  const {sandbox, getElement, buttonFor} = loadClient();
  sandbox.careers = [HUNTER_CAREER];

  await t.test('轮到自己时主操作可用，攻击缺少目标时禁用', () => {
    sandbox.renderGame(gameState());
    const buttons = commandStates(buttonFor);
    assert.equal(buttons.endTurn.disabled, false, '自己的回合应能结束回合');
    assert.equal(buttons.rollMove.disabled, false, '未掷骰时应能掷移动骰');
    assert.equal(buttons.attack.disabled, true, '未选目标时攻击应禁用');
    assert.match(buttons.attack.title || '', /目标玩家/, '禁用原因应说明要先选目标');
    assert.equal(buttons.endGame.hidden, false, '房主应能看到结束对局');
    assert.ok(getElement('turnStatus').textContent.includes('可掷移动骰'), '状态行应提示下一步');
    assert.equal(getElement('actionState').textContent, '剩余 2 次');
    assert.equal(getElement('cardState').textContent, '牌库 12 · 装备 3');
  });

  await t.test('不是自己的回合时全部禁用并说明原因', () => {
    const state = gameState({public:{currentPlayerId:'p2'}});
    state.public.players.push({playerId:'p2', nickname:'乙', careerId:'merchant', hp:8, maxHp:8, score:0, position:'1:0', eliminated:false, resources:{}, equipment:[], talentSupport:{2:{},3:{}}});
    sandbox.renderGame(state);
    const buttons = commandStates(buttonFor);
    for (const [name, button] of Object.entries(buttons)) {
      if (name === 'endGame') continue;
      assert.equal(button.disabled, true, `${name} 在别人回合应禁用`);
    }
    assert.equal(getElement('turnStatus').textContent, '等待 乙 行动…');
  });

  await t.test('行动次数用完时提示可以结束回合', () => {
    sandbox.renderGame(gameState({me:{actionsLeft:0}}));
    assert.ok(getElement('turnStatus').textContent.includes('行动次数已用完'), '应提示结束回合');
    assert.equal(buttonFor('draw').disabled, true);
    assert.equal(buttonFor('endTurn').disabled, false, '行动用完仍应能结束回合');
  });

  await t.test('天赋按钮带名称与费用，未接入的收进折叠区', () => {
    sandbox.renderGame(gameState());
    assert.equal(buttonFor('upgrade2a').hidden, false);
    assert.equal(buttonFor('upgrade2a').textContent, '二级 丛林之主 · 2木3肉');
    assert.equal(buttonFor('upgrade3a').hidden, true, '未接入的三级天赋不该占按钮位');
    assert.match(getElement('lockedTalentsSummary').textContent, /未接入的天赋（2）/);
    assert.match(getElement('lockedTalentRow').innerHTML, /公会会长/);
    assert.equal(getElement('talentState').textContent, '二级 未学习 · 三级 未学习');
  });

  await t.test('已学二级后另一分支不再占位', () => {
    sandbox.renderGame(gameState({me:{talent2:'a', talentSupport:{2:{a:true,b:true},3:{a:true,b:false}}}}));
    assert.equal(buttonFor('upgrade2a').hidden, true, '已学的不再显示');
    assert.equal(buttonFor('upgrade2b').hidden, true, '同层另一分支不再可选');
    assert.equal(buttonFor('upgrade3a').hidden, false, '接入的三级 A 应可升级');
    assert.equal(getElement('talentState').textContent, '二级 丛林之主（A） · 三级 未学习');
  });

  await t.test('商人拿钱砸人时攻击按钮改名并提示铜币', () => {
    const state = gameState({me:{careerId:'merchant', talent2:'b', resources:{wood:1,stone:1,meat:1,gold:0,special:0}, attackRange:3}});
    state.public.players.push({playerId:'p2', nickname:'乙', careerId:'gambler', position:'0:0', hp:8, maxHp:8, score:0, handCount:0, eliminated:false, resources:{}, equipment:[]});
    getElement('targetPlayer').value = 'p2';
    sandbox.renderGame(state);
    assert.equal(buttonFor('attack').textContent, '拿钱砸人 · 2铜币');
    assert.match(buttonFor('attack').title || '', /2 铜币/);
    assert.equal(buttonFor('attack').disabled, true, '铜币不足时应禁用');
    // 有铜币后即可攻击
    state.public.players[0].resources.special = 2;
    sandbox.renderGame(state);
    assert.equal(buttonFor('attack').disabled, false, '铜币充足时应可攻击');
    sandbox.renderGame(gameState({me:{careerId:'merchant', talent3:'b'}}));
    assert.equal(buttonFor('raid').textContent, '强制征税选中格');
  });

  await t.test('对局结束后隐藏操作组并给出结果', () => {
    sandbox.renderGame(gameState({public:{phase:'finished', winner:{type:'war', nickname:'甲'}}}));
    assert.equal(buttonFor('endTurn').disabled, true);
    assert.equal(getElement('turnStatus').textContent, '胜者：甲');
    assert.ok(getElement('gameNotice').textContent.includes('本局已结束'));
  });
});

test('本回合待办提醒', async t => {
  const {sandbox, getElement, todoFor} = loadClient();
  sandbox.careers = [HUNTER_CAREER];
  const todo = () => getElement('todoRow').innerHTML;

  await t.test('开局轮到自己时列出该做的事', () => {
    sandbox.renderGame(gameState({private:{hand:[{uid:'a',name:'狩猎',type:'行动卡'}], deckCount:12, equipmentDeckCount:3}}));
    const html = todo();
    assert.ok(html.includes('掷移动骰'), '应先提示掷移动骰');
    assert.ok(html.includes('基础行动还剩 2 次'), '应显示剩余行动次数');
    assert.ok(html.includes('可出牌 1 张'), '应提示可出牌数量');
    assert.ok(html.includes('结束回合'), '应提示结束回合');
    assert.match(getElement('todoState').textContent, /还有 \d+ 项可做/);
    // 可直接执行的项目做成按钮，并接到同一个 dispatchAction
    assert.ok(todoFor('rollMove'), '掷移动骰应可点击');
    assert.ok(todoFor('endTurn'), '结束回合应可点击');
  });

  await t.test('移动用完与建造/抢夺用掉后转为已完成', () => {
    sandbox.renderGame(gameState({me:{moved:true, movePoints:null, buildsThisTurn:true, raidsThisTurn:true, actionsLeft:0}}));
    const html = todo();
    assert.ok(html.includes('移动已完成'), '移动应标记完成');
    assert.ok(html.includes('已建造') && html.includes('已抢夺'), '建造与抢夺应标记完成');
    assert.ok(html.includes('基础行动已用完'));
    assert.ok(!html.includes('data-todo="rollMove"'), '已完成的项目不应再可点击');
  });

  await t.test('还有移动格数时提示可以继续走', () => {
    sandbox.renderGame(gameState({me:{moved:true, movePoints:2}}));
    assert.match(todo(), /还可移动 2 格/);
    assert.ok(todoFor('stopMove'), '可以结束移动放弃剩余格数');
  });

  await t.test('不是自己的回合只显示等待', () => {
    const state = gameState({public:{currentPlayerId:'p2'}});
    state.public.players.push({playerId:'p2', nickname:'乙', careerId:'gambler', position:'1:0', hp:8, maxHp:8, score:0, handCount:0, eliminated:false, resources:{}, equipment:[]});
    sandbox.renderGame(state);
    assert.match(todo(), /等待 乙 行动/);
    assert.equal(getElement('todoState').textContent, '', '等待时不该说还有几项可做');
  });

  await t.test('已淘汰与对局结束各有对应提示', () => {
    sandbox.renderGame(gameState({me:{eliminated:true}}));
    assert.match(todo(), /你已被淘汰/);
    sandbox.renderGame(gameState({public:{phase:'finished', winner:{type:'score', nickname:'乙'}}}));
    assert.match(todo(), /胜者：乙/);
  });

  await t.test('手牌都未接入时提示无法出牌', () => {
    sandbox.renderGame(gameState({private:{hand:[{uid:'x',name:'未实现的卡',type:'行动卡'}], deckCount:1, equipmentDeckCount:0}}));
    assert.match(todo(), /手牌效果均未接入/);
    assert.ok(todo().includes('data-todo="rollMove"'), '其他待办不受影响');
  });
});

function viewBoxOf(svg){
  const parts = String(svg.attributes.viewBox).split(/\s+/).map(Number);
  assert.equal(parts.length, 4, 'viewBox 应当是 4 个数字');
  assert.ok(parts.every(Number.isFinite), 'viewBox 不应包含 NaN');
  return {x:parts[0], y:parts[1], width:parts[2], height:parts[3]};
}

function pointerEvent(overrides){
  return Object.assign({pointerId:1, pointerType:'mouse', button:0, clientX:0, clientY:0, preventDefault(){}, stopPropagation(){}}, overrides);
}

function publicState(){
  return {roomCode:'TEST01', phase:'playing', currentPlayerId:'p1', round:1, maxPlayers:2,
    players:[{playerId:'p1', nickname:'甲', careerId:'hunter', position:'0:0', hp:8, maxHp:8, score:0, handCount:0}],
    tiles:engine.createTiles(), log:[]};
}

test('地图平移与缩放', async t => {
  const {sandbox, board, svg, getElement} = loadClient();
  const state = publicState();
  sandbox.renderMap(state, state.players[0]);
  assert.ok(svg.attributes.viewBox, 'renderMap 应当写入 viewBox');

  const bounds = sandbox.mapBoundsFor(state.tiles);

  await t.test('包围盒覆盖所有地块中心并留出六角格半径', () => {
    for(const tile of state.tiles){
      const center = sandbox.hexCenter(tile);
      assert.ok(center.x > bounds.minX && center.x < bounds.maxX, `${tile.id} 的 x 应在包围盒内`);
      assert.ok(center.y > bounds.minY && center.y < bounds.maxY, `${tile.id} 的 y 应在包围盒内`);
    }
    assert.ok(bounds.minX <= 450 - 369 - 45 && bounds.maxX >= 450 + 369 + 45, '包围盒应包含外圈并加上半格余量');
  });

  await t.test('渲染用的坐标与 hexCenter 一致', () => {
    const first = state.tiles[0];
    const center = sandbox.hexCenter(first);
    assert.ok(board.innerHTML.includes(`translate(${center.x} ${center.y})`), '地块应画在 hexCenter 的位置');
  });

  await t.test('100% 缩放时整张地图可见', () => {
    const view = viewBoxOf(svg);
    assert.equal(sandbox.mapViewSize().width, 960 * (BOARD_WIDTH / BOARD_HEIGHT));
    assert.ok(view.x <= bounds.minX && view.x + view.width >= bounds.maxX, '整张地图应横向落在视野内');
    assert.ok(view.y <= bounds.minY && view.y + view.height >= bounds.maxY, '整张地图应纵向落在视野内');
  });

  await t.test('地图小于视野时保持居中，拖动不会把地图推出屏幕', () => {
    const before = viewBoxOf(svg);
    sandbox.panMapByPixels(-500, -500);
    const after = viewBoxOf(svg);
    assert.equal(after.x, before.x, '横向无余量时不应移动');
    assert.equal(after.y, before.y, '纵向无余量时不应移动');
  });

  await t.test('放大后可平移，且被限制在地图边界内', () => {
    for(let index = 0; index < 4; index++) getElement('zoomIn').onclick();
    assert.equal(getElement('zoomLabel').textContent, '200%');
    const view = viewBoxOf(svg);
    assert.ok(view.height < bounds.maxY - bounds.minY, '放大后视野应小于地图高度');

    sandbox.panMapByPixels(0, -100000);
    const bottom = viewBoxOf(svg);
    assert.equal(bottom.y, bounds.maxY - bottom.height, '向上拖到底时应正好停在地图下边界');

    sandbox.panMapByPixels(0, 100000);
    const top = viewBoxOf(svg);
    assert.equal(top.y, bounds.minY, '向下拖到底时应正好停在地图上边界');
  });

  await t.test('全图按钮恢复整张地图可见', () => {
    getElement('zoomReset').onclick();
    assert.equal(getElement('zoomLabel').textContent, '100%');
    const view = viewBoxOf(svg);
    assert.ok(view.x <= bounds.minX && view.y <= bounds.minY, '全图后视野应包含整个地图');
  });
});

test('鼠标拖动手势', async t => {
  const {sandbox, board, svg, getElement, windowStub} = loadClient();
  const state = publicState();
  sandbox.renderMap(state, state.players[0]);
  for(let index = 0; index < 4; index++) getElement('zoomIn').onclick();
  const startView = viewBoxOf(svg);

  await t.test('未超过阈值时不平移，点击仍然选格', () => {
    board.dispatch('pointerdown', pointerEvent({clientX:600, clientY:250}));
    windowStub.dispatch('pointermove', pointerEvent({clientX:603, clientY:252}));
    assert.deepEqual(viewBoxOf(svg), startView, '微小位移不应触发平移');
    windowStub.dispatch('pointerup', pointerEvent({clientX:603, clientY:252}));
    let stopped = false;
    board.dispatch('click', {stopPropagation(){stopped=true}, preventDefault(){}});
    assert.equal(stopped, false, '普通点击不应被吞掉');
  });

  await t.test('右键拖动平移地图', () => {
    board.dispatch('pointerdown', pointerEvent({button:2, clientX:600, clientY:250}));
    windowStub.dispatch('pointermove', pointerEvent({button:2, clientX:600, clientY:210}));
    const view = viewBoxOf(svg);
    assert.ok(view.y !== startView.y, '右键拖动应改变 viewBox');
    const scale = svg.getScreenCTM().a;
    // 鼠标向上拖 40px，视野在内容坐标中向下移动 40/scale，位移必须与像素一致。
    assert.ok(Math.abs((view.y - startView.y) - 40 / scale) < 1e-6, '位移应与鼠标像素一致');
    windowStub.dispatch('pointerup', pointerEvent({button:2, clientX:600, clientY:210}));
  });

  await t.test('左键拖动平移并吞掉随后的选格点击', () => {
    const before = viewBoxOf(svg);
    board.dispatch('pointerdown', pointerEvent({clientX:600, clientY:250}));
    windowStub.dispatch('pointermove', pointerEvent({clientX:600, clientY:290}));
    windowStub.dispatch('pointerup', pointerEvent({clientX:600, clientY:290}));
    const after = viewBoxOf(svg);
    assert.ok(after.y !== before.y, '左键拖动应改变 viewBox');
    let stopped = false;
    board.dispatch('click', {stopPropagation(){stopped=true}, preventDefault(){}});
    assert.equal(stopped, true, '拖动结束后的一次点击应被吞掉');
    let second = false;
    board.dispatch('click', {stopPropagation(){second=true}, preventDefault(){}});
    assert.equal(second, false, '只应吞掉紧接拖动的那一次点击');
  });

  await t.test('中键拖动平移地图', () => {
    const before = viewBoxOf(svg);
    board.dispatch('pointerdown', pointerEvent({button:1, clientX:600, clientY:250}));
    windowStub.dispatch('pointermove', pointerEvent({button:1, clientX:600, clientY:290}));
    assert.notDeepEqual(viewBoxOf(svg), before, '中键拖动应改变 viewBox');
    windowStub.dispatch('pointerup', pointerEvent({button:1, clientX:600, clientY:290}));
  });

  await t.test('右键菜单被阻止，中键按下被阻止', () => {
    let contextPrevented = false;
    board.dispatch('contextmenu', {preventDefault(){contextPrevented=true}});
    assert.equal(contextPrevented, true, '必须阻止右键菜单，否则拖动会弹出系统菜单');
    let middlePrevented = false;
    board.dispatch('mousedown', {button:1, preventDefault(){middlePrevented=true}});
    assert.equal(middlePrevented, true, '必须阻止 Windows 中键自动滚动');
  });

  await t.test('棋盘尺寸变化后重新收紧视野', () => {
    board.getBoundingClientRect = () => ({width:600,height:800,left:0,top:0,right:600,bottom:800});
    windowStub.dispatch('resize', {});
    const view = viewBoxOf(svg);
    const bounds = sandbox.mapBoundsFor(state.tiles);
    assert.ok(view.x >= bounds.minX - 1e-6 && view.x + view.width <= bounds.maxX + 1e-6, '视野应仍在地图内');
  });
});

test('地图棋子与占领标记', async t => {
  const {sandbox, board, getElement} = loadClient();
  const state = publicState();

  await t.test('单人时棋子居中，地形图标移到左上角', () => {
    sandbox.renderMap(state, state.players[0]);
    const html = board.innerHTML;
    assert.ok(html.includes('<circle cx="0" cy="0" r="18"'), '棋子应画在格子中心');
    assert.ok(html.includes('href="/assets/avatars/hunter.png"'), '棋子应使用角色头像');
    assert.equal((html.match(/hex-icon-corner/g) || []).length, 1, '有人站上去时地形图标应移到角落');
    assert.equal((html.match(/data-map-player=/g) || []).length, 1);
    assert.equal((html.match(/claim-badge/g) || []).length, 0, '未占领时不应有标记');
  });

  await t.test('同格多人时棋子缩小并围绕中心排开', () => {
    state.players.push({playerId:'p2', nickname:'乙', careerId:'merchant', position:'0:0', hp:8, maxHp:8, score:0, handCount:0});
    sandbox.renderMap(state, state.players[0]);
    const html = board.innerHTML;
    assert.equal((html.match(/data-map-player=/g) || []).length, 2, '两名玩家都要显示');
    assert.equal((html.match(/r="12\.5"/g) || []).length, 2, '多人时棋子应缩小');
    assert.ok(html.includes('cx="-12.625"') && html.includes('cx="12.625"'), '两人应左右对称排布');
    assert.equal((html.match(/hex-icon-corner/g) || []).length, 1);
  });

  await t.test('大金矿被占领时显示占领者与剩余回合', () => {
    const mine = state.tiles.find(tile => tile.type === 'goldMine');
    mine.claim = {playerId:'p1', nickname:'甲', roundsLeft:2};
    sandbox.renderMap(state, state.players[0]);
    const html = board.innerHTML;
    assert.equal((html.match(/claim-badge/g) || []).length, 1, '只应有 1 个占领标记');
    assert.ok(html.includes('claim-ring'), '占领格应有高亮描边');
    assert.ok(html.includes('⛏2'), '应显示剩余 2 回合');
    assert.ok(html.includes('大金矿占领：甲'), '应带可读的提示文字');
  });

  await t.test('地图上的玩家编号与角色栏一致', () => {
    sandbox.renderMap(state, state.players[0]);
    assert.ok(getElement('mapPlayers').innerHTML.includes('1 · 甲'), '角色栏应带编号');
    assert.ok((board.innerHTML.match(/pawn-number/g) || []).length >= 2, '棋子应带编号角标');
  });
});

const MOVE_COST = {plain:1, forest:2, hill:2, river:2, riverGod:2, desert:1, spring:1, holySpring:1, void:1, fire:1, goldMine:1, trial:1};

test('指令面板：分组、控件标签与破坏性操作分隔', () => {
  const {getElement} = loadClient();
  const html = getElement('actionbar').innerHTML;

  // 按功能分成 5 组，而不是把 19 个控件平铺在一起
  for (const group of ['move','cards','act','params','talents']) {
    assert.ok(html.includes(`data-group="${group}"`), `应有 ${group} 分组`);
  }
  // 每个行动按钮只出现一次，且关键按钮齐全
  const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(actions).size, actions.length, '不应有重复的按钮');
  for (const needed of ['rollMove','confirmMove','stopMove','extraMove','draw','drawExtra','forge','build','harvest','raid','spring','upgrade2a','upgrade2b','upgrade3a','upgrade3b','trial','endTurn','endGame']) {
    assert.ok(actions.includes(needed), `应有 ${needed} 按钮`);
  }
  // 表单控件必须带可见文字标签，而不是只靠占位符
  for (const label of ['目标玩家','资源','数量','建筑']) {
    assert.ok(html.includes(`<span>${label}</span>`), `${label} 应有可见标签`);
  }
  // 结束回合与破坏性的结束对局之间要有分隔
  assert.ok(/cmd-divider[\s\S]*cmd-danger/.test(html), '破坏性操作应与常规操作分隔');
  // 状态行与提示位必须存在
  for (const id of ['turnStatus','movementHint','actionState','talentState','lockedTalents','cmdNoticeHost']) {
    assert.ok(html.includes(`id="${id}"`), `应有 ${id}`);
  }
  // 结束回合是主要操作
  assert.ok(/cmd-primary[^>]*data-action="endTurn"/.test(html) || /data-action="endTurn"[^>]*cmd-primary/.test(html), '结束回合应为主要按钮');
});

test('移动阶段：点数即格数，点击相邻格直接移动', async t => {
  const {sandbox, board, sent, getElement} = loadClient();
  const state = publicState();
  const me = state.players[0];
  const home = state.tiles.find(tile => tile.type === 'plain'
    && state.tiles.some(other => engine.distance(other, tile) === 1 && other.type === 'plain'));
  me.position = home.id;
  me.movePoints = 1;
  state.currentPlayerId = me.playerId;
  sandbox.state = {public:state};
  sandbox.selectMapPlayer(me.playerId);

  const reachableIds = () => [...board.innerHTML.matchAll(/class="hex-cell[^"]*reachable[^"]*" data-tile="([^"]+)"/g)].map(match => match[1]);

  await t.test('只高亮当前格数走得到的相邻格', () => {
    sandbox.renderMap(state, me);
    const expected = state.tiles
      .filter(tile => engine.distance(tile, home) === 1 && MOVE_COST[tile.type] <= 1)
      .map(tile => tile.id)
      .sort();
    assert.deepEqual(reachableIds().sort(), expected, '剩余 1 格时应只高亮消耗 1 格的相邻格');
    assert.ok(expected.length > 0, '测试位置应有平原邻居');
    const blocked = state.tiles.filter(tile => engine.distance(tile, home) === 1 && MOVE_COST[tile.type] > 1).map(tile => tile.id);
    assert.ok(blocked.every(id => !reachableIds().includes(id)), '消耗 2 格的困难地形不应被高亮');
  });

  await t.test('点击高亮的相邻格直接发出移动', () => {
    sent.length = 0;
    const target = reachableIds()[0];
    sandbox.onTileClick(target);
    // vm 里创建的对象原型与本进程不同，先转成普通 JSON 再比较
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{type:'move', tileId:target}], '点相邻格应直接移动，不必再点确认');
  });

  await t.test('点击走不到的格子只选择，不移动', () => {
    sent.length = 0;
    const far = state.tiles.find(tile => engine.distance(tile, home) === 3);
    sandbox.onTileClick(far.id);
    assert.equal(sent.length, 0, '非相邻格不应触发移动');
    assert.ok(board.innerHTML.includes(`data-tile="${far.id}"`), '仍应更新选中状态');
  });

  await t.test('格数不足时不发出移动', () => {
    sent.length = 0;
    const hard = state.tiles.find(tile => engine.distance(tile, home) === 1 && MOVE_COST[tile.type] > 1);
    if(hard){
      sandbox.onTileClick(hard.id);
      assert.equal(sent.length, 0, '剩余 1 格时不应尝试进入消耗 2 格的格子');
    }
  });

  await t.test('格子用完后不再高亮', () => {
    me.movePoints = null;
    sandbox.renderMap(state, me);
    assert.deepEqual(reachableIds(), [], '没有剩余格数时不应高亮任何格子');
  });

  await t.test('移动提示按格数显示', () => {
    me.movePoints = 2;
    sandbox.renderMap(state, me);
    const hint = getElement('movementHint').textContent;
    assert.ok(hint.includes('还剩 2 格'), `提示应说明剩余格数，实际：${hint}`);
    const next = state.tiles.find(tile => engine.distance(tile, home) === 1 && MOVE_COST[tile.type] === 1);
    sandbox.onTileClick(next.id);
    const hintWithTarget = getElement('movementHint').textContent;
    assert.ok(hintWithTarget.includes('消耗'), `选中相邻格后应说明消耗多少格，实际：${hintWithTarget}`);
  });
});
