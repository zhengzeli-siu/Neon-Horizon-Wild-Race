
# 霓虹地平线：狂野飙车 3D (Neon Horizon: Wild Race)

[![在线试玩](https://siu-phi.vercel.app)]([请在此处替换您的部署链接])

> **注意**：如果您是仓库拥有者，请先将本项目部署到 Vercel 或 GitHub Pages，然后将生成的网址填入上方链接中。

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

## 🚀 如何让别人通过链接直接玩？ (部署指南)

要让游戏在其他笔记本或手机上通过链接直接运行，推荐使用 **Vercel** 进行免费部署：

1.  将本项目代码上传到您的 **GitHub** 仓库。
2.  访问 [Vercel.com](https://vercel.com) 并使用 GitHub 账号登录。
3.  点击 **"Add New Project"**，导入本仓库。
4.  直接点击 **"Deploy"** (Vercel 会自动识别 React 环境)。
5.  等待约 1 分钟，您将获得一个类似 `https://xxx.vercel.app` 的网址。
6.  **回到本 README 文件，修改顶部的链接，将您的网址填入。**

---

## 如何本地运行 (Local Development)
**克隆项目**
```bash
git clone https://github.com/zhengzeli-siu/wild_race_3D.git
```
如果您想在本地开发或调试：

### 前置要求
1.  安装 **Node.js** (推荐 v16 或更高版本)。

### 步骤
1.  **安装依赖**
    ```bash
    npm install
    # 如果报错，请先运行 npm init -y，然后运行:
    # npm install react react-dom three @types/three @react-three/fiber @react-three/drei @react-three/postprocessing simplex-noise autoprefixer postcss tailwindcss
    ```

2.  **启动开发服务器**
    ```bash
    npm start
    # 或者如果使用 Vite:
    # npm run dev
    ```

3.  **开始游戏**
    打开浏览器访问 `http://localhost:3000`。

## 操作说明
| 按键 | 功能 |
| --- | --- |
| **W / ↑** | 加速 |
| **S / ↓** | 刹车 / 倒车 |
| **A / ←** | **向左转** |
| **D / →** | **向右转** |
| **Shift** | **漂移** (转向时按住) |
| **Space** | **氮气加速** (需充能) |
| **Esc** | 暂停/退出 |

## 技术栈说明
*   **核心库**: React 18, Three.js
*   **渲染引擎**: @react-three/fiber
*   **后期处理**: @react-three/postprocessing (Bloom, Vignette, Chromatic Aberration)
*   **数学/物理**: Simplex Noise (地形生成), Vector math

---

## 🤝 贡献与致谢
本项目参考了 `javascript-racer` 和 `OutRun` 的经典算法。欢迎提交 Issue 或 Pull Request 帮助改进游戏！

---
*Powered by Python & Pygame*

## 📞联系方式
如有任何问题或建议，请联系：
- 项目作者: Zhengze Li
- 邮箱: zhengzeli44@gmail.com
- GitHub: [github.com/zhengzeli-siu](https://github.com/zhengzeli-siu)


