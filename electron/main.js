const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const net = require('net');
const Module = require('module');

const SERVER_PORT = 3001;

// 将 better-sqlite3 的 require 重定向到根目录 node_modules 里重编译过的版本
// （electron-builder 打包时会自动为 Electron 重编译根目录下的原生模块）
const rootBetterSqlite3 = path.join(__dirname, '../node_modules/better-sqlite3');
const originalLoad = Module._load.bind(Module);
Module._load = function (request, parent, isMain) {
  if (request === 'better-sqlite3') {
    return originalLoad(rootBetterSqlite3, parent, isMain);
  }
  return originalLoad(request, parent, isMain);
};

// 等待 TCP 端口可用，然后执行回调
function waitForPort(port, callback, retries = 40) {
  const client = net.createConnection({ port }, () => {
    client.destroy();
    callback();
  });
  client.on('error', () => {
    if (retries <= 0) {
      console.error('Server failed to start in time');
      app.quit();
      return;
    }
    setTimeout(() => waitForPort(port, callback, retries - 1), 300);
  });
}

app.whenReady().then(() => {
  // 数据库存到用户目录（可写位置，打包后也能正常读写）
  process.env.DATA_DIR = app.getPath('userData');
  // 前端静态文件目录
  // 打包后 dist 被 asarUnpack 到 app.asar.unpacked/dist，express.static 需要真实文件系统路径
  const distDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist')
    : path.join(__dirname, '../dist');
  process.env.DIST_DIR = distDir;

  // 在主进程里启动 Express 服务
  require('../server/index');

  // 创建桌面窗口
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 580,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: '提醒事项',
    show: false, // 等服务就绪后再显示，避免白屏闪烁
  });

  Menu.setApplicationMenu(null);

  waitForPort(SERVER_PORT, () => {
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
