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
    innerHTML:'', textContent:'', disabled:false, onclick:null, id:'',
    classList:{
      _set:new Set(),
      add(...names){names.forEach(name=>this._set.add(name))},
      remove(...names){names.forEach(name=>this._set.delete(name))},
      contains(name){return this._set.has(name)},
      toggle(){}
    },
    querySelector(){return null},
    querySelectorAll(){return []},
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
    notice(){}, send(){}, confirm:()=>false,
    careers:[], readyCareerIds:new Set(), selectedCareer:'',
    state:null, meId:'p1', roomCode:'TEST01',
    $:getElement
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'game-client.js'),'utf8'), sandbox, {filename:'game-client.js'});
  return {sandbox, board, svg, getElement, windowStub};
}

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
