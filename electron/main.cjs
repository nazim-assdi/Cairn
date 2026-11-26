const { app, BrowserWindow, dialog, Menu, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      supportServiceWorkers: true,
      stream: true,
      codeCache: true,
      corsEnabled: true,
    },
  },
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.onnx': 'application/octet-stream',
};

let mainWindow = null;

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers });
}

async function handleAppRequest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return response('Method not allowed', 405, { Allow: 'GET, HEAD' });
  }

  try {
    const url = new URL(request.url);
    if (url.hostname !== 'cairn') {
      return response('Not found', 404);
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const relativePath = decodedPath.replace(/^\\/+/, '') || 'index.html';
    const distRoot = path.resolve(app.getAppPath(), 'dist');
    let filePath = path.resolve(distRoot, relativePath);

    if (filePath !== distRoot && !filePath.startsWith(distRoot + path.sep)) {
      return response('Forbidden', 403);
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return response('Not found', 404);
    }

    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      try {
        stat = await fs.stat(filePath);
      } catch {
        return response('Not found', 404);
      }
    }

    if (!stat.isFile()) {
      return response('Not found', 404);
    }

    const headers = {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': path.basename(filePath) === 'index.html'
        ? 'no-store'
        : 'public, max-age=31536000, immutable',
      'Content-Length': String(stat.size),
    };

    if (request.method === 'HEAD') {
      return response(null, 200, headers);
    }

    const contents = await fs.readFile(filePath);
    return response(contents, 200, headers);
  } catch (error) {
    console.error('Cairn protocol error:', error);
    return response('Unable to load this Cairn resource', 500);
  }
}

function installApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'close', label: 'Close window' },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Cairn' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Cairn',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Cairn',
            message: 'Cairn',
            detail: 'Offline Edge Document & Media Studio\\nDeveloper: N Tech\\nVersion 1.0.0',
          }),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  if (app.isPackaged) {
    protocol.handle('app', handleAppRequest);
  }

  mainWindow = new BrowserWindow({
    title: 'Cairn — Offline Edge Document & Media Studio',
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const isInternal = app.isPackaged
      ? targetUrl.startsWith('app://cairn/')
      : targetUrl.startsWith('http://127.0.0.1:3210/');

    if (!isInternal) {
      event.preventDefault();
      if (targetUrl.startsWith('https://') || targetUrl.startsWith('http://')) {
        shell.openExternal(targetUrl);
      }
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Cairn renderer exited:', details);
    dialog.showErrorBox(
      'Cairn encountered a problem',
      'The application window stopped unexpectedly. Close and reopen Cairn. Your saved local vault is preserved.'
    );
  });

  try {
    if (app.isPackaged) {
      await mainWindow.loadURL('app://cairn/index.html');
    } else {
      await mainWindow.loadURL(process.env.CAIRN_DEV_URL || 'http://127.0.0.1:3210');
    }
  } catch (error) {
    console.error('Unable to start Cairn:', error);
    dialog.showErrorBox(
      'Unable to start Cairn',
      app.isPackaged
        ? 'The application resources could not be loaded. Reinstall Cairn and try again.'
        : 'The Vite development server is not running. Start the app with npm run desktop:dev.'
    );
    if (app.isPackaged) app.quit();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.ntech.cairn');
    installApplicationMenu();
    await createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
