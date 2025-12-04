
# 霓虹地平线：狂野飙车 3D (Neon Horizon: Wild Race)

[![在线试玩](https://img.shields.io/badge/🎮%20在线试玩-点击立即开始-00ffff?style=for-the-badge&logo=google-chrome&logoColor=white)](https://ai.studio/apps/drive/1Pa4A9do9TY5RUkvy6tu-fqMYTK5skrlF)

> **注意**：如果您是仓库拥有者，请先将本项目部署到 Vercel 或 GitHub Pages，然后将生成的网址填入上方链接中。

## 项目简介
本项目是一个基于 WebGL 的高性能 3D 赛车游戏,本项目采用了行业标准的 **React + Three.js** 技术栈。

## 游戏特色
*   **物理引擎**：模拟了漂移侧滑、离心力、加速度和抓地力。
*   **智能 AI**：5 位 AI 对手，拥有避障、超车和弯道减速逻辑。
*   **次世代画质**：
    *   实时动态地形 (Terrain)
    *   胎痕系统 (Skidmarks)
    *   Bloom 泛光与色差特效
*   **丰富环境**：包含沙漠、雪地、城市三种风格迥异的赛道。

## 🚀 如何让别人通过链接直接玩？ (部署指南)

### 方案：GitHub Pages

如果您希望直接在 GitHub 上托管：

1.  **修改配置**：打开 `package.json`，将 `"homepage"` 字段修改为 `https://<您的用户名>.github.io/<仓库名>/`。
2.  **安装依赖并部署**：
    ```bash
    npm install
    npm run deploy
    ```
3.  脚本会自动运行构建并将代码推送到 `gh-pages` 分支。之后您可以在仓库的 Settings -> Pages 中看到在线地址。

---

## 如何本地运行

### 前置要求
1.  安装 **Node.js** (推荐 v16 或更高版本)。

### 步骤
1.  **克隆项目**
    ```bash
    git clone https://github.com/zhengzeli-siu/wild_race_3D.git
    cd wild_race_3D
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **启动开发服务器**
    ```bash
    npm run dev
    ```

4.  **开始游戏**
    打开浏览器访问 `http://localhost:5173`。

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

## 📞联系方式
如有任何问题或建议，请联系：
- 项目作者: Zhengze Li
- 邮箱: zhengzeli44@gmail.com
- GitHub: [github.com/zhengzeli-siu](https://github.com/zhengzeli-siu)
