# Stargazer Wallet: Yubikey Hardware Wallet Integration

Yubikey Wallet is a cross-chain compatible extension to the Stargazer Wallet that integrates Yubikey as a hardware wallet for Constellation Network. The GPG signature key (Ed25519) stored on the YubiKey is used to extract a DAG-Address and to sign messages and transactions.

## Project Structure

The project is organized into several workspaces:

- `yubikey-bridge`: Native messaging host to grant Stargazer Wallet access to a Yubikey. It runs on the host machine and is called by the browser from within the Stargazer Wallet extension. It calls `gpg` to extract the public key stored on the YubiKey and to sign messages with the private key stored on the YubiKey.
- `yubikey-bridge-installer`: Installer for the Yubikey Wallet Native Messaging Host. It builds the `yubikey-bridge` executable and installs it on the host machine. It also registers it as a native messaging host with the Google Chrome browser.
- `stargazer-wallet-ext`: A fork of the Stargazer Wallet browser extension that integrates the Yubikey Wallet as a hardware wallet.

## Getting Started

### Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org) 10 or later
- [Yarn](https://yarnpkg.com) v1 or v2

### Install Dependencies

To install dependencies, run `yarn`

### Install the Extension in Chrome

1. Build the extension: `yarn build-extension`
2. Go to `chrome://extensions` in the browser.
3. Enable `Developer Mode`.
4. Click on `Load Unpacked Extension…`.
5. Select the extension's extracted directory: `stargazer-wallet-ext\source\web\extension\chrome`

### Install Yubikey Wallet Bridge

1. Copy the Chrome Extension ID from the `chrome://extensions` page.
2. Adjust `chromeExtensionId` in `yubikey-bridge-installer/install.js` to the copied ID.
3. Run `yarn yubikey-bridge:build` to build the native messaging host executable called by the Browser Extension.
4. Run `yarn yubikey-bridge:install`. It will:
    - Install the `yubikey-bridge` executable in your user directory `~/YubikeyWallet`
    - Register the `yubikey-bridge` executable as a native messaging host with the Google Chrome browser
