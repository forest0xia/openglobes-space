# 此刻太空 — "What's in Space Right Now"

## 一句话

一个视觉炸裂的实时 3D 太空可视化，展示此刻环绕地球的卫星和飞向深空的探测器。纯静态托管，GitHub Action 每日自动更新数据。一个人 + AI，几天做完。

---

## 核心体验

用户打开页面 → 一个深黑色的太阳系从远处拉近 → 镜头聚焦到地球 → 北斗、GPS 等卫星星座在周围旋转 → 天宫空间站在低轨道划过 → 拉远，看到整个太阳系 → 旅行者号在极远处闪烁 → 底部一行字："旅行者1号此刻距你 164 AU，信号到达需要 22.8 小时"

**一个交互动作定义体验：** 点击任何天体/卫星/探测器 → 镜头平滑飞过去 → 弹出一张精美信息卡。就这么简单。

---

## 传播叙事

帖子标题方向：

- "一个人 + AI，3 天做了一个接入真实卫星数据的太空可视化"
- "你知道此刻有多少中国卫星在太空中吗？我把它们全画出来了"
- "旅行者1号现在在哪？我做了个网站让你实时看到"

配图/录屏重点：
1. 北斗星座环绕地球的全景（视觉冲击）
2. 从地球一路拉远到旅行者号的连续镜头（尺度感）
3. 和 Claude 对话的过程截图（AI 叙事）

---

## 技术架构（不变）

```
GitHub Repository
├── src/                          # React + Three.js
├── public/data/
│   ├── probes.json               # ← GitHub Action 每日从 JPL Horizons 更新
│   └── satellites-cache.json     # ← GitHub Action 每日从 CelesTrak 缓存（备用离线数据）
├── .github/workflows/
│   ├── deploy.yml                # 构建 → GitHub Pages
│   └── fetch-data.yml            # 每日数据更新
└── dist/

浏览器端：
  CelesTrak API（实时 TLE）→ satellite.js（SGP4）→ 3D 位置
  probes.json（静态）→ 插值 → 3D 位置
```

---

## 功能清单（只做这些）

### ✅ 必须做

**3D 太阳系场景**
- 太阳（发光体 + 光晕）、8 大行星（程序化纹理）、轨道线
- 土星环
- 背景星空（4000+ 颗）
- 平滑的相机控制（拖拽旋转、滚轮缩放、触屏手势）

**实时地球轨道卫星**
- 启动时从 CelesTrak 拉取：北斗（~56）、GPS（~31）、天宫空间站、嫦娥（月球轨道器）
- satellite.js 在 Web Worker 中计算位置
- InstancedMesh 渲染，每个星座不同颜色
- 地球周围的卫星轨道环（视觉标志性画面）

**深空探测器**
- 从 probes.json 读取 15 个探测器的位置
- 八面体几何体 + 发光点 + 运动轨迹尾巴
- 旅行者号在极远处用连线标注

**点击交互**
- 点击任何物体 → 镜头飞过去 → 信息卡滑出
- 信息卡内容：名称（中/英）、关键数据（2-4 项）、一句话描述
- 行星：直径、公转周期、温度、一个趣味事实
- 卫星：名称、所属星座、轨道高度、国家
- 探测器：任务名、发射年份、当前距离、一句话任务描述

**左侧导航**
- 行星快捷按钮（彩色圆点，hover 显示名字）

**底部时间控制**
- 播放/暂停、加速/减速、速度滑块
- 当前模拟时间显示

**顶部图层切换**
- 卫星层 开/关
- 探测器层 开/关

**一句话数据展示**（页面底部或角落，始终可见）
- "此刻追踪 XX 颗卫星 · 旅行者1号距地球 XXX AU"

### ❌ 不做（留给未来）

- What-If 实验模式
- 卫星搜索/筛选面板
- 天然卫星（月球、木卫等）
- 小行星带
- 比例模式切换
- i18n 切换（直接中文为主，关键术语中英双语）
- Starlink（6000+ 太重，以后加）
- 对比模式、距离测量工具
- 键盘快捷键

---

## 实现步骤（3 段式）

### 第一步：3D 场景 + 行星（Day 1）

搭建项目脚手架，渲染核心太阳系。

```bash
npm create vite@latest space-now -- --template react-ts
npm install three @react-three/fiber @react-three/drei zustand satellite.js
npm install -D @types/three tailwindcss
```

交付物：
- 太阳 + 8 行星 + 轨道线 + 星空背景
- 相机控制（拖拽/缩放/触屏）
- 时间控制（播放/暂停/加速）
- 点击行星 → 飞过去 → 信息卡
- 左侧行星导航
- 深色主题，Orbitron + Noto Sans SC 字体

技术细节：
- 用 @react-three/fiber 的 Canvas + OrbitControls（或自定义相机）
- 程序化 Canvas 纹理（不依赖外部图片文件，减少加载时间）
- Zustand store 管理：simulationTime, timeSpeed, isPaused, focusedObject
- 行星数据硬编码在 `src/data/planets.ts`

### 第二步：接入真实数据（Day 2）

让卫星和探测器出现在场景中。

**CelesTrak 卫星：**
- `services/celestrak.ts`：fetch CelesTrak JSON，缓存到 localStorage（2h TTL）
- `services/sgp4Worker.ts`：Web Worker 接收 OMM 数据 + simulationTime，返回 Float32Array 位置
- `three/SatelliteCloud.tsx`：InstancedMesh，从 Worker 更新 instance matrices
- 颜色方案：北斗 #DE2910（中国红）、GPS #3B82F6（蓝）、天宫 #F59E0B（金）、嫦娥 #A855F7（紫）

**深空探测器：**
- `scripts/fetch-probes.js`：Node 脚本，调 Horizons API，输出 probes.json
- 先本地跑一次生成初始数据
- `services/probeData.ts`：加载 JSON，提供 getPosition(id, time) 插值函数
- `three/Probe.tsx`：八面体 + 发光 + 轨迹线

**坐标转换：**
- 地球轨道卫星：ECI (km) → 平移到地球在场景中的位置 → 缩放
- 深空探测器：太阳心 AU → 直接映射到场景坐标
- 关键：地球附近的卫星在太阳系视图下极小，用放大的点 + 光晕表示存在感，不要试图按真实比例渲染

### 第三步：打磨 + 部署（Day 3）

让它从"能用"变成"想截图"。

**视觉打磨：**
- 太阳 bloom/光晕效果（UnrealBloomPass 或自定义 shader）
- 卫星星座的环状排列视觉（GEO 卫星会自然形成一个环）
- 探测器的脉动发光动画
- 信息卡的 glassmorphism 效果 + 入场动画
- 页面加载动画（太阳系从远处飞入）

**数据展示：**
- 左下角常驻："🛰 正在追踪 142 颗卫星 · 15 个深空探测器"
- 旅行者号距离实时更新显示

**部署：**
- `.github/workflows/deploy.yml`：push to main → build → GitHub Pages
- `.github/workflows/fetch-data.yml`：每日 06:00 UTC → 更新 probes.json + satellites 缓存
- 绑定自定义域名（可选）
- 加 Open Graph meta tags（分享链接时有预览图）

**移动端：**
- 信息卡从底部滑出（不是右侧）
- 隐藏左侧导航，用底部 tab 代替
- 触屏手势支持

---

## 文件结构

```
src/
├── App.tsx                     # 主布局
├── main.tsx                    # 入口
├── stores/
│   └── store.ts                # 单一 Zustand store（时间/相机/选中/图层）
├── data/
│   ├── planets.ts              # 行星数据 + 描述
│   └── probesMeta.ts           # 探测器元数据（名称/描述/颜色）
├── services/
│   ├── celestrak.ts            # CelesTrak API + localStorage 缓存
│   ├── probeData.ts            # 加载 probes.json + 位置插值
│   ├── sgp4Worker.ts           # Web Worker
│   └── sgp4Worker.worker.ts    # Worker 实体
├── scene/
│   ├── SolarSystem.tsx         # R3F Canvas + 后处理
│   ├── Planet.tsx              # 行星组件
│   ├── Sun.tsx                 # 太阳 + 光晕
│   ├── SatelliteCloud.tsx      # 卫星 InstancedMesh
│   ├── Probes.tsx              # 深空探测器
│   ├── OrbitLine.tsx           # 轨道线
│   └── Stars.tsx               # 背景星空
├── ui/
│   ├── InfoPanel.tsx           # 右侧/底部信息卡
│   ├── PlanetNav.tsx           # 左侧导航
│   ├── TimeControl.tsx         # 底部时间控制
│   ├── LayerToggles.tsx        # 图层开关
│   └── StatusBar.tsx           # 左下角追踪状态
└── utils/
    ├── coordinates.ts          # 坐标转换
    └── constants.ts            # 物理常量

public/
└── data/
    └── probes.json             # GitHub Action 生成

scripts/
└── fetch-data.js               # GitHub Action 调用的数据拉取脚本

.github/workflows/
├── deploy.yml
└── fetch-data.yml
```

---

## CelesTrak 查询清单（第一版只拉这些）

```javascript
const SATELLITE_GROUPS = [
  { id: 'beidou',   url: '?GROUP=beidou&FORMAT=json',   color: '#DE2910', label: '北斗 BeiDou' },
  { id: 'gps',      url: '?GROUP=gps-ops&FORMAT=json',  color: '#3B82F6', label: 'GPS' },
  { id: 'stations', url: '?GROUP=stations&FORMAT=json',  color: '#F59E0B', label: '空间站' },
  // Chang'e by name search:
  { id: 'change',   url: '?NAME=CHANG%27E&FORMAT=json', color: '#A855F7', label: '嫦娥 Chang\'e' },
];
// Total: ~90 satellites — very manageable, no performance concerns
```

## 深空探测器清单（probes.json）

```javascript
const PROBES = [
  { id: 'voyager1',      cmd: '-31',  name: '旅行者1号',       emoji: '🛸' },
  { id: 'voyager2',      cmd: '-32',  name: '旅行者2号',       emoji: '🛸' },
  { id: 'newhorizons',   cmd: '-98',  name: '新视野号',        emoji: '🔭' },
  { id: 'juno',          cmd: '-61',  name: '朱诺号',          emoji: '⚡' },
  { id: 'parker',        cmd: '-96',  name: '帕克太阳探测器',    emoji: '☀️' },
  { id: 'perseverance',  cmd: '-168', name: '毅力号',          emoji: '🔴' },
  { id: 'jwst',          cmd: '-170', name: '韦伯望远镜',       emoji: '🔭' },
  { id: 'clipper',       cmd: '-159', name: '欧罗巴快帆',       emoji: '🧊' },
  { id: 'juice',         cmd: '-28',  name: 'JUICE',          emoji: '🧃' },
  { id: 'bepi',          cmd: '-121', name: '贝皮科伦布',       emoji: '☿️' },
  { id: 'lucy',          cmd: '-49',  name: '露西号',          emoji: '💎' },
  { id: 'psyche',        cmd: '-255', name: '灵神星探测器',      emoji: '🪨' },
  { id: 'osirisapex',    cmd: '-64',  name: 'OSIRIS-APEX',    emoji: '☄️' },
  { id: 'hayabusa2',     cmd: '-37',  name: '隼鸟2号',         emoji: '🦅' },
  { id: 'solarorbiter',  cmd: '-144', name: '太阳轨道器',       emoji: '🌞' },
];
```

---

## GitHub Action: `.github/workflows/fetch-data.yml`

```yaml
name: Update Space Data
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Fetch probe positions from JPL Horizons
        run: node scripts/fetch-data.js

      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/data/
          git diff --staged --quiet || git commit -m "🛰 data update $(date -u +%Y-%m-%d)"
          git push
```

## GitHub Action: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## 视觉设计关键词

- **色调：** 深空黑 (#030014) + 冷蓝辉光 (#4FC3F7) + 暖金点缀 (#FFB74D)
- **字体：** Orbitron（数据/标题）+ Noto Sans SC（中文正文）
- **UI 风格：** Glassmorphism — 半透明毛玻璃面板，细微边框光
- **动效：** 相机飞行用 cubic-bezier 缓动，信息卡 slide + fade
- **核心视觉记忆点：** 地球被卫星环包围的画面（GEO 卫星自然形成环，MEO 形成网格）

---

## 未来扩展路径（做完最小版本后按需加）

每次加一个功能 = 一条新帖子的素材

1. **+ 小行星带** → "火星和木星之间有多少石头？"
2. **+ Starlink 6000 颗** → "马斯克的卫星网有多密？"（用 sgp4.gl GPU 加速）
3. **+ 天然卫星** → "木星的 95 颗卫星长什么样？"
4. **+ What-If 实验** → "如果木星消失了会怎样？"
5. **+ 更多国家卫星** → Galileo, GLONASS, 印度 NavIC
6. **+ 历史轨迹回放** → "阿波罗 11 号的飞行路线"
7. **+ AR 模式** → WebXR，手机对着天空看卫星

每个扩展都是独立的 PR + 一篇传播内容。架构从第一天就支持这种增量扩展。

---

## 给 Claude Code 的指令

> 请按照这份 plan 实现一个 3D 太空可视化应用。
>
> 核心原则：
> 1. 视觉优先——每个像素都要好看，宁可功能少也不要丑
> 2. 真实数据——卫星位置来自 CelesTrak API + satellite.js SGP4，探测器位置来自 probes.json
> 3. 纯静态——不需要任何后端服务，部署到 GitHub Pages
> 4. 移动端友好——触屏手势、响应式布局
>
> 先完成第一步（3D 场景 + 行星），确认能跑后再进入第二步（数据接入）。
> 
> 参考之前的原型 V2 的视觉风格和交互设计，但用 React + R3F 重写。
