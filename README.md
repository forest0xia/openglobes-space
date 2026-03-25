# OpenGlobes Space | 此刻太空

Real-time 3D solar system visualization with satellite tracking, NASA textures, and multi-scale zoom from Earth orbit to the Milky Way.

实时 3D 太阳系可视化 —— 真实卫星追踪、NASA 纹理贴图、从近地轨道到银河系的多尺度缩放。

---

## 目录 / Table of Contents

- [项目简介 / Overview](#项目简介--overview)
- [功能特性 / Features](#功能特性--features)
- [数据来源 / Data Sources](#数据来源--data-sources)
- [坐标系与比例 / Coordinate System & Scale](#坐标系与比例--coordinate-system--scale)
- [数据校准 / Data Calibration](#数据校准--data-calibration)
- [技术栈 / Tech Stack](#技术栈--tech-stack)
- [运行 / Getting Started](#运行--getting-started)
- [部署 / Deployment](#部署--deployment)
- [许可 / License](#许可--license)

---

## 项目简介 / Overview

**此刻太空** 是一个基于浏览器的 3D 太空可视化应用，展示真实比例的太阳系。通过 SGP4 轨道传播算法实时计算在轨卫星位置，使用 NASA 高清纹理渲染行星，并支持从近地轨道卫星一直缩放到银河系全景的多尺度视图。

**Space Right Now** is a browser-based 3D space visualization that renders the solar system at real proportional scale. It computes real-time satellite positions using SGP4 orbital propagation, renders planets with NASA high-resolution textures, and supports seamless multi-scale zoom from low-Earth-orbit satellites all the way out to the Milky Way galaxy.

---

## 功能特性 / Features

### 太阳系 / Solar System

- **8 大行星** — NASA 高清纹理贴图，椭圆轨道包含真实偏心率、轨道倾角、升交点经度和近日点幅角
- **太阳** — 日冕光晕效果，体积光散射
- **土星环** — 纹理渲染的行星环系统
- **14 颗天然卫星** — 覆盖 6 颗行星（地球月球、火卫一/二、木星 5 颗伽利略卫星 + 木卫五、土星 5 颗主要卫星、天卫三/四、海卫一）
- **地球云层** — 独立的半透明云层球体
- **地球夜景** — 夜半球城市灯光纹理

### 卫星追踪 / Satellite Tracking

- **北斗导航系统 (BeiDou)** — MEO/GEO/IGSO 全星座实时位置
- **GPS 星座** — 全部在轨 GPS 卫星
- **空间站 (Stations)** — 国际空间站 (ISS)、天宫空间站、载人飞船等
- **SGP4 实时传播** — 使用 satellite.js 从 TLE 数据计算 ECI 坐标
- **3D 卫星模型** — ISS、TDRS、Landsat 8 使用 NASA 3D 模型，通用卫星使用 Poly 模型

### 深空探测器 / Deep Space Probes

- 14 个著名探测器的位置和信息面板：旅行者 1/2 号、新视野号、朱诺号、帕克太阳探测器、毅力号火星车、韦伯望远镜 (JWST)、欧罗巴快帆、JUICE、贝皮科伦布、露西号、灵神星探测器、OSIRIS-APEX、太阳轨道器

### 深空视图 / Deep Space View

- **银河系全景** — 缩放到足够远时显示银河系圆盘
- **深空背景** — 哈勃超深场 (Hubble Ultra Deep Field) 图像
- **多尺度缩放** — 从行星表面到银河系的无缝过渡，乘法式缩放速度

### 交互与体验 / Interaction & Experience

- **环境音效** — 太空氛围背景音乐
- **中英双语** — 所有行星、卫星、探测器均提供中英文名称与说明
- **信息面板** — 点击天体显示详细数据（直径、温度、公转周期、趣味事实等）
- **真实比例模式** — 可切换为真实半径比例，感受行星相对太阳的实际大小

---

## 数据来源 / Data Sources

### 行星轨道数据 / Planet Orbital Data

| 参数 | 来源 |
|------|------|
| 半长轴 (semi-major axis) | NASA JPL — 真实 AU 值，1 AU = 20 场景单位 |
| 偏心率 (eccentricity) | NASA JPL Keplerian Elements |
| 轨道倾角 (inclination) | NASA JPL Keplerian Elements |
| 升交点经度 (longitude of ascending node) | NASA JPL Keplerian Elements |
| 近日点幅角 (argument of perihelion) | NASA JPL Keplerian Elements |
| 初始位置 | J2000 历元平均经度 + 平均运动速率 |

开普勒近似用于计算行星位置：基于 J2000 历元的平均经度和角速度率，在长时间尺度上对内行星精度约 0.1 度。

### 行星纹理 / Planet Textures

| 天体 | 纹理 | 来源 |
|------|------|------|
| 太阳 (Sun) | `sun.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 水星 (Mercury) | `mercury.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 金星 (Venus) | `venus.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 地球 (Earth) | `earth_day.jpg`, `earth_night.jpg`, `earth_clouds.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 火星 (Mars) | `mars.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 木星 (Jupiter) | `jupiter.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 土星 (Saturn) | `saturn.jpg`, `saturn_ring.png` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 天王星 (Uranus) | `uranus.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 海王星 (Neptune) | `neptune.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |
| 月球 (Moon) | `moon.jpg` | Solar System Scope (CC BY 4.0) via Wikimedia Commons |

### 卫星 TLE 数据 / Satellite TLE Data

- **来源**: [CelesTrak](https://celestrak.org) — Dr. T.S. Kelso 维护的空间态势感知数据库
- **格式**: OMM JSON (Orbit Mean-Elements Message)
- **端点**: `https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=json`
- **获取的星座**:

| 星座 / Group | CelesTrak Group ID | 说明 |
|-------------|-------------------|------|
| 北斗 (BeiDou) | `beidou` | 中国北斗导航系统全星座 |
| GPS | `gps-ops` | 美国 GPS 导航系统在轨卫星 |
| 空间站 (Stations) | `stations` | ISS、天宫、载人飞船及相关目标 |

- **缓存策略**: 数据缓存在 `localStorage`，有效期 **2 小时**（`CACHE_TTL = 2 * 60 * 60 * 1000 ms`）

### SGP4 轨道传播 / SGP4 Propagation

- **库**: [satellite.js](https://github.com/shashwatak/satellite-js) v5 (MIT License)
- **算法**: SGP4/SDP4 — 标准 NORAD 轨道传播模型
- **输出**: ECI (Earth-Centered Inertial) 直角坐标，单位为 km
- **精度**: 对于最近更新的 TLE，位置误差约 1 km；随时间推移精度下降，一周后 LEO 卫星误差可能超过 10 km

### 3D 卫星模型 / 3D Satellite Models

| 模型 | 文件 | 来源 | 许可 |
|------|------|------|------|
| 国际空间站 (ISS) | `iss.glb` | NASA Science 3D Resources | Public Domain |
| TDRS 中继卫星 | `tdrs-satellite.glb` | NASA Science 3D Resources | Public Domain |
| Landsat 8 | `landsat8.glb` | NASA Science 3D Resources | Public Domain |
| 通用卫星 | `satellite.glb` | Poly/Google | CC BY |

### 深空背景 / Deep Space Backgrounds

| 资源 | 文件 | 来源 |
|------|------|------|
| 银河系全景 | `milkyway.png` | NASA Eyes on the Solar System (https://eyes.nasa.gov) |
| 深空背景 | `deepspace.jpg` | Hubble Ultra Deep Field — NASA/ESA |

### 天然卫星数据 / Natural Moon Data

- **来源**: NASA Planetary Fact Sheets
- **数据内容**: 轨道距离 (km)、公转周期 (days)、卫星半径 (km)
- **覆盖范围**: 14 颗卫星 — 月球, 火卫一/二, 木卫一~五, 土卫一/二/四/五/六, 天卫三/四, 海卫一

---

## 坐标系与比例 / Coordinate System & Scale

### 基准单位 / Base Units

| 参数 | 值 |
|------|-----|
| 1 AU (天文单位) | 20 场景单位 (scene units) |
| 地球视觉半径 | 1 场景单位 |
| 1 场景单位 | 6,371 km |

### 行星距离 / Planet Distances

行星距离使用真实 AU 比例，无人为放大。

| 行星 | AU | 场景距离 | 视觉半径 | 真实半径 (km) |
|------|-------|-----------|----------|-------------|
| 水星 (Mercury) | 0.387 | 7.74 | 0.4 | 2,440 |
| 金星 (Venus) | 0.723 | 14.46 | 0.9 | 6,052 |
| 地球 (Earth) | 1.000 | 20.00 | 1.0 | 6,371 |
| 火星 (Mars) | 1.524 | 30.48 | 0.6 | 3,390 |
| 木星 (Jupiter) | 5.203 | 104.1 | 3.0 | 69,911 |
| 土星 (Saturn) | 9.537 | 190.7 | 2.5 | 58,232 |
| 天王星 (Uranus) | 19.19 | 383.8 | 1.6 | 25,362 |
| 海王星 (Neptune) | 30.07 | 601.4 | 1.5 | 24,622 |
| 太阳 (Sun) | 0 | 0 | 5.0 | 696,340 |

### 卫星轨道坐标转换 / Satellite Coordinate Conversion

```
SGP4 输出 ECI (km) → 场景单位 = ECI_km / 6371
```

无距离放大 (`scaleFactor = 1`)。卫星位置叠加到地球场景坐标上。

### 典型轨道高度 / Typical Orbital Altitudes

| 轨道类型 | 高度 (km) | 地心距离 (km) | 地球半径倍数 (Er) | 场景距离 |
|---------|---------|-------------|-----------------|---------|
| LEO (ISS) | ~420 | 6,791 | 1.07 | 1.07 |
| MEO (GPS/BeiDou) | ~20,200 | 26,571 | 4.17 | 4.17 |
| GEO (通信卫星) | ~35,786 | 42,157 | 6.62 | 6.62 |
| **月球 (Moon)** | **384,400** | **384,400** | **60.3** | **60.3** |

> 所有人造卫星都远比月球近。最远的 GEO 卫星距地心不到月球距离的 11%。

### 银河系 / Milky Way

| 参数 | 值 |
|------|-----|
| 银河系场景尺寸 | 200,000 场景单位 |
| 出现时机 | 相机距离 > 30,000 场景单位 |
| 深空背景出现 | 相机距离 > 150,000 场景单位 |

---

## 数据校准 / Data Calibration

### TLE 数据更新 / TLE Data Updates

- CelesTrak **每日更新** TLE 数据
- 本应用缓存有效期为 **2 小时**
- 强制刷新方法：清除浏览器 `localStorage`

```js
// 在浏览器控制台执行 / Run in browser console:
localStorage.removeItem('sat_cache_beidou');
localStorage.removeItem('sat_cache_gps');
localStorage.removeItem('sat_cache_stations');
```

### TLE 精度 / TLE Accuracy

| 时间范围 | LEO 位置误差 | MEO/GEO 位置误差 |
|---------|-------------|-----------------|
| 历元当天 (day of epoch) | < 1 km | < 1 km |
| 1 天后 | ~1-2 km | < 1 km |
| 3 天后 | ~3-5 km | ~1-2 km |
| 1 周后 | > 10 km | ~3-5 km |
| 2 周后 | 不可靠 | > 10 km |

### 行星位置精度 / Planet Position Accuracy

- **方法**: 开普勒近似 — J2000 平均经度 + 平均运动速率
- **内行星** (水星至火星): 数十年尺度精度约 0.1 度
- **外行星** (木星至海王星): 世纪尺度精度较低，受摄动影响
- **说明**: 本应用以可视化为目的，非精密星历计算

### SGP4 验证与过滤 / SGP4 Validation & Filtering

传播失败或位置异常的卫星会被自动过滤：

- 传播返回错误 → 丢弃
- 地心距离 < 100 km (已坠毁) → 丢弃
- 地心距离 > 500,000 km (异常) → 丢弃
- 名称匹配碎片/火箭残骸模式 → 丢弃

---

## 技术栈 / Tech Stack

| 类别 | 技术 |
|------|------|
| 框架 | [React](https://react.dev) 19 |
| 3D 渲染 | [Three.js](https://threejs.org) via [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) + [@react-three/drei](https://github.com/pmndrs/drei) |
| 后处理 | [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) |
| 轨道传播 | [satellite.js](https://github.com/shashwatak/satellite-js) 5.0 |
| 状态管理 | [Zustand](https://github.com/pmndrs/zustand) |
| 构建工具 | [Vite](https://vite.dev) 8 |
| 语言 | [TypeScript](https://www.typescriptlang.org) 5.9 |
| 样式 | [Tailwind CSS](https://tailwindcss.com) 4 (minimal) |
| 部署 | GitHub Actions → GitHub Pages |

---

## 运行 / Getting Started

### 环境要求 / Prerequisites

- Node.js >= 18
- npm >= 9

### 本地开发 / Local Development

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

### 其他命令 / Other Commands

```bash
npm run build    # 生产构建 / Production build
npm run preview  # 预览构建产物 / Preview build output
npm run lint     # ESLint 代码检查 / Lint check
```

---

## 部署 / Deployment

本项目通过 **GitHub Actions** 自动部署到 **GitHub Pages**。

### 自动部署流程 / Automated Pipeline

1. 推送到主分支触发 GitHub Actions workflow (`.github/workflows/deploy.yml`)
2. 执行 `npm run build`（包含 TypeScript 编译和 Vite 构建）
3. 构建产物输出到 `dist/` 目录
4. 自动部署到 GitHub Pages

### 手动构建 / Manual Build

```bash
npm run build
```

构建产物为纯静态文件，位于 `dist/` 目录，可部署到任何静态文件服务器。

---

## 许可 / License

### 第三方资源许可 / Third-Party Resource Licenses

| 资源 | 许可 | 说明 |
|------|------|------|
| NASA 行星纹理及数据 | **Public Domain** | NASA 作品不受美国版权保护 |
| NASA 3D 模型 (ISS, TDRS, Landsat 8) | **Public Domain** | NASA Science 3D Resources |
| Solar System Scope 纹理 | **CC BY 4.0** | 需注明出处 — [Solar System Scope](https://www.solarsystemscope.com/textures/) |
| Hubble Ultra Deep Field | **Public Domain** | NASA/ESA 公共发布 |
| NASA Eyes 银河系图像 | **Public Domain** | NASA Eyes on the Solar System |
| satellite.js | **MIT License** | 开源 SGP4 实现 |
| CelesTrak TLE 数据 | **Free for non-commercial use** | Dr. T.S. Kelso 提供 |
| 通用卫星模型 | **CC BY** | Poly/Google |

---

<p align="center">
  <strong>此刻太空</strong> — 在浏览器中探索真实的太阳系<br>
  <strong>Space Right Now</strong> — Explore the real solar system in your browser
</p>
