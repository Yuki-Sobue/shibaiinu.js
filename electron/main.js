const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 750,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    autoHideMenuBar: true,
    resizable: true,
    title: 'Shibaiinu Novel'
  });

  win.loadFile('index.html');

  // 開発時はDevToolsを開く
  // win.webContents.openDevTools();
}

// 新規ウィンドウ生成や外部遷移を防ぐ（ノベルゲームの単一ウィンドウ前提）。
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // 外部 URL はデフォルトブラウザで開き、アプリ内では開かない
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, navUrl) => {
    // file:// での自前ページ遷移以外は遮断
    if (!navUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
