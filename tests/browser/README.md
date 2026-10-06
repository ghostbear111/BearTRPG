# 骰子落定回归检查

运行 `npm run dev` 后打开以下页面，点击「连续检查三轮」：

- `http://127.0.0.1:5173/tests/browser/dice-roll.html?count=2&sides=8`：常用 2d8。
- `http://127.0.0.1:5173/tests/browser/dice-roll.html?count=8`：所有六种骰型、符号骰和两种创作缩放。
- `http://127.0.0.1:5173/tests/browser/dice-roll.html?count=20`：最大混合骰组。

页面使用生产环境的 `TableDiceRolls`、骰子材质和 Rapier 模拟，记录每次实际渲染的姿态。它不读取或写入玩家的游戏存档，不进入生产构建。

每轮应满足：

- `maxLateDelta === 0`：落定后所有渲染帧的位置、四元数和缩放完全一致。
- `resumedAfterRest === 0`：连续静止 100 毫秒后没有再次运动。
- `faceMatches === true`：渲染的最终骰面与实际结算一致。
- `resultCount`、`uniqueResults` 均等于骰子数量；`errors` 为空。

`#history` 包含每轮报告，`#evidence` 包含最后一轮的逐帧数据。

# 编辑模式物件稳定性

打开 `http://127.0.0.1:5173/tests/browser/editor-stability.html`。页面使用实际 `TableCanvas`，放置 16 个物件，包括重叠棋子、悬空棋子、倾斜物件和两种骰子，每 500 毫秒以新数组重新渲染，模拟编辑与自动保存更新。它不读写玩家存档。

- 静置至少 5 秒：`maxPoseDelta < 1e-7`（四元数分解的浮点误差除外），`physicsWrites === 0`。
- 点击棋子：显示选中，姿态写入次数仍为 0，不抬起、不吸附。
- 拖动后：仅出现一次 `reason: "drag"` 的姿态写入，高度和朝向保持不变。
- 点击「重新检查静止」后继续观察：所有物件保持静止，`maxPoseDelta < 1e-7`。

`#objects` 提供对应物件投影坐标；`#evidence` 包含实际逐帧姿态与操作写入记录。
