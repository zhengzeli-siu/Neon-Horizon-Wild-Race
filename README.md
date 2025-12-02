
# 霓虹地平线：狂野飙车 3D (Neon Horizon: Wild Race)

## 项目简介
本项目是一个基于 WebGL 的高性能 3D 赛车游戏。
尽管最初需求提及 Python，但为了在网页端实现 **高画质 3D (光影/粒子/物理)** 体验，本项目采用了行业标准的 **React + Three.js** 技术栈。

## 游戏特色
*   **物理引擎**：模拟了漂移侧滑、离心力、加速度和抓地力。
*   **智能 AI**：5 位 AI 对手，拥有避障、超车和弯道减速逻辑。
*   **次世代画质**：
    *   实时动态地形 (Terrain)
    *   胎痕系统 (Skidmarks)
    *   Bloom 泛光与色差特效
*   **丰富环境**：包含沙漠、雪地、城市三种风格迥异的赛道。

## 如何本地部署 (Local Deployment)

虽然这是一个 Web 项目，但您可以像运行 Python 服务器一样轻松在本地启动。

### 前置要求
1.  安装 **Node.js** (推荐 v16 或更高版本)。
    *   下载地址: https://nodejs.org/

### 步骤
1.  **下载代码**
    将本项目的所有文件保存到本地文件夹，例如 `wild-race-3d`。

2.  **安装依赖**
    打开终端（命令行），进入文件夹，运行以下命令安装 Python 风格的依赖管理是不适用的，这里我们需要用 npm：
    ```bash
    npm install
    ```
    *如果项目没有 package.json，请先运行 `npm init -y`，然后安装以下核心库：*
    ```bash
    npm install react react-dom three @types/three @react-three/fiber @react-three/drei @react-three/postprocessing simplex-noise autoprefixer postcss tailwindcss
    ```

3.  **启动开发服务器**
    ```bash
    npm start
    ```
    或者如果您使用的是 Vite (推荐):
    ```bash
    npm run dev
    ```

4.  **开始游戏**
    打开浏览器访问 `http://localhost:3000` (或终端提示的端口)。

## 操作说明
*   **W / ↑**：加速
*   **S / ↓**：刹车 / 倒车
*   **A / D / ← / →**：转向
*   **Shift**：**漂移** (在转向时按住以触发侧滑并快速过弯)
*   **空格 (Space)**：**氮气加速** (需等待氮气条充能)

## 为什么不使用 Python (Pygame)?
Pygame 是一个优秀的 2D 游戏库，但在处理复杂的 3D 渲染（如动态光影、复杂的粒子系统、无限地形生成）以及网页移植性方面，WebGL (Three.js) 拥有压倒性的性能和画质优势。为了满足您对“画质”和“特效”的高要求，WebGL 是最佳选择。
