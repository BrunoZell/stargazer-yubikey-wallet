const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const manifestJson = {
    "name": "com.constellation.yubikey",
    "description": "Native Messaging Host for Yubikey Wallet",
    "path": "",  // This will be set dynamically based on the platform
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://dacabonkdgpbkfdmpnnngmgdcadpglla/"
    ]
};

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
    const registryPath = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.constellation.yubikey';
    const executablePath = path.join(__dirname, '../dist', 'yubikey-wallet-win.exe');
    const userHomeDir = os.homedir();
    const appDir = path.join(userHomeDir, 'YubikeyWallet');
    const manifestJsonPath = path.join(appDir, 'native-messaging-host.json');
    manifestJson.path = path.join(appDir, 'yubikey-wallet.exe');

    // Ensure the directory exists
    fs.mkdirSync(appDir, { recursive: true });
    
    // Write manifest json so Chrome recognizes the Wallet as a Native Messaging Host
    const jsonString = JSON.stringify(manifestJson, null, 2);
    fs.writeFileSync(manifestJsonPath, jsonString);
    
    // Copy the executable to the path
    fs.copyFileSync(executablePath, manifestJson.path);

    // Add the registry key
    exec(`reg add "${registryPath}" /ve /t REG_SZ /d "${manifestJsonPath}" /f`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error adding registry key: ${error.message}`);
            return;
        }
        console.log('Registry key added successfully');
    });
}

function installOnMacLinux() {
    const platform = os.platform();
    const manifestJsonPath = path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts', 'com.constellation.yubikey.json');
    const executablePath = path.join(__dirname, '../dist', `yubikey-wallet${platform === 'darwin' ? '-macos' : '-linux'}`);

    manifestJson.path = '/usr/local/bin/yubikey-wallet';
    const jsonString = JSON.stringify(manifestJson, null, 2);

    // Ensure the directory exists
    fs.mkdirSync(path.dirname(manifestJsonPath), { recursive: true });

    // Write manifest json so Chrome recognizes the Wallet as a Native Messaging Host
    fs.writeFileSync(manifestJsonPath, jsonString);

    // Copy the executable to the path
    fs.copyFileSync(executablePath, manifestJson.path);

    console.log('Manifest JSON and executable placed successfully');
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