# 🐾 桌面陪伴 Desktop Pet

让你在意的 TA，以最可爱的方式常驻桌面。

上传一张照片，AI 自动生成专属动画形象，TA 会在你的桌面上陪你工作、聊天、玩游戏。

## ✨ 功能亮点

- **🖥 桌面悬浮陪伴** — 透明窗口悬浮在桌面，随时陪在你身边
- **🗣 AI 语音聊天** — 专属声音和性格，像朋友一样聊天（基于火山引擎声音克隆）
- **🎮 趣味小游戏** — 记忆挑战、快速点击、猜拳对战，和宠物一起玩
- **📈 每日成长系统** — 打卡升级、每日任务、排行榜竞争
- **👋 社交互动** — 串门拜访、赠送礼物、点赞互动
- **⏰ 智能提醒** — 午餐、晚餐、下班提醒，语音播报

## 📥 下载安装

| 平台 | 下载 |
|------|------|
| macOS | [DesktopPet.dmg](http://118.196.36.27:8765/api/download/mac) |
| Windows | [DesktopPet-Setup.exe](http://118.196.36.27:8765/api/download/win) |

> macOS 首次打开：右键点击 App → 打开 → 确认打开

也可以直接在浏览器中访问：http://118.196.36.27:8765

## 🛠 技术栈

- **前端**：React + TypeScript + Vite
- **桌面端**：Electron 33（透明悬浮窗、系统托盘）
- **后端**：Node.js + Express + WebSocket
- **AI**：火山引擎豆包大模型（对话）+ 声音克隆 TTS（语音）
- **动画生成**：AI 抠图 + 动作生成

## 📁 项目结构

```
├── src/                    # React 前端
│   ├── pages/              # 页面组件
│   │   ├── LandingPage.tsx     # 展示落地页
│   │   ├── LoginPage.tsx       # 登录/注册
│   │   ├── HomePage.tsx        # 首页（宠物列表）
│   │   ├── PetOverlayPage.tsx  # 宠物互动页
│   │   └── ...
│   └── components/         # 通用组件
│       ├── PetRenderer.tsx     # 宠物动画渲染
│       ├── ChatDialog.tsx      # 聊天对话框
│       ├── GamePanel.tsx       # 游戏面板
│       └── ...
├── electron/               # Electron 主进程
│   └── main.ts
├── backend-ts/             # 后端服务
│   ├── server.ts               # Express + WebSocket 服务
│   └── config.ts               # 配置
└── package.json
```

## 🚀 本地开发

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev

# 启动 Electron 开发模式
npm run electron:dev

# 构建前端
npm run build

# 打包 macOS DMG
npx electron-builder --mac

# 打包 Windows EXE
npx electron-builder --win
```

## 🎨 设计风格

采用 Airbnb 温暖可爱风：
- 纯白底 + 珊瑚红 (`#FF385C`) 点缀
- 大圆角卡片、温暖阴影
- 宠物视觉为主角，UI 退后

## 📄 License

MIT
