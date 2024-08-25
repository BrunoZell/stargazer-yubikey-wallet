const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const jsonContent = {
    "name": "com.constellation.yubikey",
    "description": "Native Messaging Host for Yubikey Wallet",
    "path": "/path/to/native-messaging-host",
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://dacabonkdgpbkfdmpnnngmgdcadpglla/"
    ]
};

const jsonString = JSON.stringify(jsonContent, null, 2);

function runNpmCommands(callback) {
    exec('npm install && npm run build', { cwd: path.resolve(__dirname, '../wallet-host') }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error running npm commands: ${error.message}`);
            return;
        }
        console.log('npm install and build completed successfully');
        callback();
    });
}

function installOnWindows() {
    const registryPath = 'HKLM\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.constellation.yubikey';
    const jsonFilePath = path.join('C:\\path\\to\\native-messaging-host.json');
    const executablePath = path.join(__dirname, '../dist', 'yubikey-wallet.exe');

    fs.writeFileSync(jsonFilePath, jsonString);
    fs.copyFileSync(executablePath, 'C:\\path\\to\\native-messaging-host.exe');
    exec(`reg add "${registryPath}" /ve /t REG_SZ /d "${jsonFilePath}" /f`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error adding registry key: ${error.message}`);
            return;
        }
        console.log('Registry key added successfully');
    });
}

function installOnMacLinux() {
    const jsonFilePath = path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts', 'com.constellation.yubikey.json');
    const executablePath = path.join(__dirname, '../dist', 'yubikey-wallet');

    fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
    fs.writeFileSync(jsonFilePath, jsonString);
    fs.copyFileSync(executablePath, path.join(os.homedir(), 'path', 'to', 'native-messaging-host'));
    console.log('JSON file and executable placed successfully');
}

function install() {
    const platform = os.platform();
    runNpmCommands(() => {
        if (platform === 'win32') {
            installOnWindows();
        } else if (platform === 'darwin' || platform === 'linux') {
            installOnMacLinux();
        } else {
            console.error('Unsupported platform');
        }
    });
}

install();