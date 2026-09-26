# 道途联机桌游第一阶段

## Render

继续使用当前 Node 服务，启动命令仍然是：

```bash
npm start
```

需要配置环境变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `PORT`（Render 通常会自动提供）

## Supabase

在 Supabase SQL Editor 执行 `SUPABASE_GAME_SCHEMA.sql`。原有 `daotu` 表继续保存卡牌和职业配置；新增的 `daotu_games` 表保存房间和对局快照。

## 入口

- `/`：原有卡牌与职业协作工作台
- `/game.html`：联机桌游入口

联机页支持自定义 1～5 人房间、房间码加入、职业选择、禁止中途加入、断线重连、服务端回合校验和房主手动结束游戏。选择 1 人即为单人测试模式，回合只在点击“结束回合”后推进。

当前规则覆盖情况见 `RULES_IMPLEMENTATION.md`。尚未实现的卡牌在界面中禁用，点击不会消耗手牌或资源；不能将当前版本视为完整正式对局。

卡牌的逐张效果仍需要按规则裁定表继续接入；服务端不会执行待补充职业的卡牌。
