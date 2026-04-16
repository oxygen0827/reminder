# 提醒事项 Remind App

简洁的待办事项应用，深色主题，开箱即用。

支持两种运行方式：**网页开发模式** 和 **Windows 桌面应用（.exe）**。

---

## 一、桌面应用（.exe）

### 安装使用

直接双击安装包即可：

```
electron-dist/提醒事项 Setup 1.0.0.exe
```

安装完成后桌面会出现"提醒事项"快捷方式，打开后是独立的桌面窗口，不需要浏览器。

数据库文件保存在系统用户目录（`%APPDATA%/提醒事项/todos.db`），卸载重装不会丢失数据。

### 重新打包

每次修改代码后，运行以下命令生成新的 `.exe`：

```bash
npm run package
```

输出文件在 `electron-dist/提醒事项 Setup 1.0.0.exe`。

### 打包原理

| 文件 | 作用 |
|------|------|
| `electron/main.js` | Electron 主进程：启动 Express 服务，创建桌面窗口加载 `http://localhost:3001` |
| `electron/package.json` | 声明 CommonJS 模式（覆盖根目录的 `"type":"module"`） |
| `server/index.js` | 打包后由 Express 直接托管 React 构建产物（`dist/`） |
| `package.json` | `"main"` 指向 Electron 入口，`electron-builder` 配置打包规则 |

- **原生模块**：`better-sqlite3` 安装在根目录 `node_modules`，由 `electron-builder` 在打包时自动为当前 Electron 版本重新编译。`electron/main.js` 通过 `Module._load` 补丁将 `require('better-sqlite3')` 重定向到根目录版本。
- **asar 解包**：`.node` 原生文件通过 `asarUnpack` 保留在文件系统上（原生模块无法从 asar 压缩包内加载）。

---

## 二、网页开发模式

### 启动步骤

```bash
# 进入项目目录
cd remind-app

# 启动前后端（并发）
npm run dev
```

等待看到以下输出：

```
Remind server running on http://localhost:3001
VITE v8.0.8  ready in xxx ms
➜  Local:   http://localhost:5173/
```

然后访问 **http://localhost:5173**

### 常见问题

**端口被占用**：先清理 node 进程，再重新启动。

```bash
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
```

**关闭终端**：服务会自动停止，需要重新运行 `npm run dev`。

---

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Express + SQLite（better-sqlite3）
- 桌面：Electron + electron-builder
- 样式：自定义 CSS（深色主题）

## 项目结构

```
remind-app/
├── electron/              # Electron 桌面应用入口
│   ├── main.js            # 主进程：启动服务 + 创建窗口
│   └── package.json       # 声明 CommonJS 模式
├── src/                   # 前端源码
│   ├── App.tsx            # 主组件
│   ├── api.ts             # API 调用层
│   └── types.ts           # TypeScript 类型定义
├── server/                # 后端源码
│   ├── index.js           # Express 路由（含静态文件服务）
│   └── database.js        # SQLite 数据库初始化
├── dist/                  # 前端构建产物（npm run build 生成）
├── electron-dist/         # 桌面应用打包输出（npm run package 生成）
└── ARCHITECTURE.md        # 架构文档
```
