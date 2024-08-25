# Stargazer Wallet: Yubikey Hardware Wallet Integration

Yubikey Wallet is a cross-chain compatible extension to the Stargazer Wallet that integrates Yubikey as a hardware wallet for Constellation Network. The GPG signature key (Ed25519) stored on the YubiKey is used to extract a DAG-Address and to sign messages and transactions.

## Project Structure

The project is organized into several workspaces:

- `wallet-host`: Native messaging host to grant Stargazer Wallet access to a Yubikey. It runs on the host machine and is called by the browser from within the Stargazer Wallet extension. It calls `gpg` to extract the public key stored on the YubiKey and to sign messages with the private key stored on the YubiKey.
- `wallet-host-installer`: Installer for the Yubikey Wallet Native Messaging Host. It builds the `wallet-host` executable and installs it on the host machine. It also registers it as a native messaging host with the Google Chrome browser.
- `stargazer-wallet-ext`: A fork of the Stargazer Wallet browser extension that integrates the Yubikey Wallet as a hardware wallet.

## Getting Started

### Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org) 10 or later
- [Yarn](https://yarnpkg.com) v1 or v2

### Installation

To install dependencies, run:

```bash
yarn
```

To build the forked Stargazer Wallet extension, run:

```bash
yarn build-extension
```

To build and install the Yubikey Wallet bridging host, run:

```bash
yarn install-wallet
```

### Loading the Extension in Browser

1. Go to `chrome://extensions` in the browser.
2. Enable `Developer Mode`.
3. Click on `Load Unpacked Extension…`.
4. Select the extension’s extracted directory.
