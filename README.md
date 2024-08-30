# Stargazer Wallet: Yubikey Hardware Wallet Integration

Yubikey Wallet is a cross-chain compatible extension to the Stargazer Wallet that integrates Yubikey as a hardware wallet for Constellation Network. The GPG signature key (`secp256k1`) stored on the YubiKey is used to extract a DAG-Address and to sign messages and transactions.

## Project Structure

The project is organized into several workspaces:

- `yubikey-bridge`: Native messaging host to grant Stargazer Wallet access to a Yubikey. It runs on the host machine and is called by the browser from within the Stargazer Wallet extension. It calls `gpg` to extract the public key stored on the YubiKey and to sign messages with the private key stored on the YubiKey.
- `yubikey-bridge-installer`: Installer for the Yubikey Wallet Native Messaging Host. It builds the Yubikey Bridge executable and installs it on the host machine. It also registers it as a native messaging host with the Google Chrome browser.
- `stargazer-wallet-ext`: A fork of the Stargazer Wallet browser extension that integrates the Yubikey Wallet as a hardware wallet.

## Getting Started

### Build Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org) 10 or later
- [Yarn](https://yarnpkg.com) v1 or v2

### Install Dependencies

To install dependencies, run `yarn install` from both the root of the repository and the `stargazer-wallet-ext` directory.

### Install the Extension in Chrome

1. Build the extension: `cd stargazer-wallet-ext && yarn build:chrome`
2. Go to `chrome://extensions` in the browser.
3. Enable `Developer Mode`.
4. Click on `Load Unpacked Extension…`.
5. Select the extension's extracted directory: `stargazer-wallet-ext\source\web\extension\chrome`

### Install the Yubikey Constellation Bridge

1. Copy the Chrome Extension ID from the `chrome://extensions` page.
2. Adjust `chromeExtensionId` in `yubikey-bridge-installer/install.js` to the copied ID.
3. Run `yarn yubikey-bridge:build` to build the native messaging host executable called by the Browser Extension.
4. Run `yarn yubikey-bridge:install`. It will:
    - Install the `yubikey-bridge` executable in your user directory `~/YubikeyWallet`
    - Register the `yubikey-bridge` executable as a native messaging host with the Google Chrome browser

### Install GPG

The Yubikey Bridge expects `gpg` to be an available command on your system. It uses `gpg` to extract the public key stored on the YubiKey and to sign messages with the private key stored on the YubiKey.

Installation instructions for GPG can be found [here](https://gnupg.org/download/).

### Prepare the Yubikey

When you buy a new Yubikey, plug it into your computer and run `gpg --card-status`, it looks like this:

```bash
> gpg --card-status
Reader ...........: Yubico YubiKey OTP FIDO CCID 0
Application ID ...: D2760001240100000006312547600000
Application type .: OpenPGP
Version ..........: 3.4
Manufacturer .....: Yubico
Serial number ....: 31254760
Name of cardholder: [not set]
Language prefs ...: [not set]
Salutation .......:
URL of public key : [not set]
Login data .......: [not set]
Signature PIN ....: not forced
Key attributes ...: rsa2048 rsa2048 rsa2048
Max. PIN lengths .: 127 127 127
PIN retry counter : 3 0 3
Signature counter : 0
KDF setting ......: off
UIF setting ......: Sign=off Decrypt=off Auth=off
Signature key ....: [none]
Encryption key....: [none]
Authentication key: [none]
General key info..: [none]
```

To initialize the Yubikey as a Constellation Network wallet, you need to generate a new key pair.

⚠️ While its possible to generate keypairs directly on the Yubikey without it ever leaving the device, this is not supported for `secp256k1` type keys which Constellation uses for message and transaction signing. And even if, there would be no option to back up the key, so it would be lost if the pin is entered incorrectly three consecutive times or when the Yubikey is lost.

So lets generate the keypair on the host machine and then copy it onto the Yubikey. It's generally a good idea to do this on an air-gapped machine, although a passphrase will protect the key on the host machine. Remeber the `--expert` flag to see keys of type `secp256k1`:

```bash
> gpg --expert --full-generate-key
gpg (GnuPG) 2.4.5; Copyright (C) 2024 g10 Code GmbH
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.

Please select what kind of key you want:
   (1) RSA and RSA
   (2) DSA and Elgamal
   (3) DSA (sign only)
   (4) RSA (sign only)
   (7) DSA (set your own capabilities)
   (8) RSA (set your own capabilities)
   (9) ECC (sign and encrypt) *default*
  (10) ECC (sign only)
  (11) ECC (set your own capabilities)
  (13) Existing key
  (14) Existing key from card
Your selection? 9
Please select which elliptic curve you want:
   (1) Curve 25519 *default*
   (2) Curve 448
   (3) NIST P-256
   (4) NIST P-384
   (5) NIST P-521
   (6) Brainpool P-256
   (7) Brainpool P-384
   (8) Brainpool P-512
   (9) secp256k1
Your selection? 9
Please specify how long the key should be valid.
         0 = key does not expire
      <n>  = key expires in n days
      <n>w = key expires in n weeks
      <n>m = key expires in n months
      <n>y = key expires in n years
Key is valid for? (0) 0
Key does not expire at all
Is this correct? (y/N) y

GnuPG needs to construct a user ID to identify your key.

Real name: Bruno
Email address: ask@bruno.wtf
Comment: Constellation Wallet
You selected this USER-ID:
    "Bruno (Constellation Wallet) <ask@bruno.wtf>"

Change (N)ame, (C)omment, (E)mail or (O)kay/(Q)uit?
```

Type `o` to confirm and enter a passphrase that will protect the key material at rest on the host machine. They key will be generated and store it in your GPG key ring. It'll also print the fingerprint, which you'll need in the next steps:

```text
pub   secp256k1 2024-08-26 [SC]
      F977C90DA4077068CAAD8B299502515330CB5D0F
uid                      Bruno (Constellation Wallet) <ask@bruno.wtf>
sub   secp256k1 2024-08-26 [E]
```

ℹ️ The fingerprint `F977C90DA4077068CAAD8B299502515330CB5D0F` uniquely identifies your GPG key. It is derived from the public key but is not the public key itself (it's the SHA-1 hash of the public key). To extract the raw public key from the GPG card, you can use `gpg --export [--armor] [fingerprint]`. You don't need to do that manually as the Yubikey Wallet Bridge will take care of that.

Now there is an opportunity to back up the private key so it can be recovered in case the Yubikey is lost or reset. For that, run `gpg --armor --export-secret-keys F977C90DA4077068CAAD8B299502515330CB5D0F > private-key.asc`. If you don't do that, the private key will be fully removed from the host machine in the next step.

To copy the key to the Yubikey, run `gpg --edit-key F977C90DA4077068CAAD8B299502515330CB5D0F` with your keys fingerprint. Within `gpg`, type `keytocard`, copy it as Authentication key (`1`), and then `save`:

```text
> gpg --edit-key F977C90DA4077068CAAD8B299502515330CB5D0F
gpg (GnuPG) 2.4.5; Copyright (C) 2024 g10 Code GmbH
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.

Secret key is available.

sec  secp256k1/9502515330CB5D0F
     created: 2024-08-26  expires: never       usage: SC
     trust: ultimate      validity: ultimate
ssb  secp256k1/4B140C97C6AD3322
     created: 2024-08-26  expires: never       usage: E
[ultimate] (1). Bruno (Constellation Wallet) <ask@bruno.wtf>

gpg> keytocard
Really move the primary key? (y/N) y
Please select where to store the key:
   (1) Signature key
   (3) Authentication key
Your selection? 1

sec  secp256k1/9502515330CB5D0F
     created: 2024-08-26  expires: never       usage: SC
     trust: ultimate      validity: ultimate
ssb  secp256k1/4B140C97C6AD3322
     created: 2024-08-26  expires: never       usage: E
[ultimate] (1). Bruno (Constellation Wallet) <ask@bruno.wtf>

Note: the local copy of the secret key will only be deleted with "save".
gpg> save
```

Now the card status looks like this:

```txt
C:\Repos> gpg --card-status
Reader ...........: Yubico YubiKey OTP FIDO CCID 0
Application ID ...: D2760001240100000006312547600000
Application type .: OpenPGP
Version ..........: 3.4
Manufacturer .....: Yubico
Serial number ....: 31254760
Name of cardholder: [not set]
Language prefs ...: [not set]
Salutation .......:
URL of public key : [not set]
Login data .......: [not set]
Signature PIN ....: not forced
Key attributes ...: secp256k1 rsa2048 rsa2048
Max. PIN lengths .: 127 127 127
PIN retry counter : 3 0 3
Signature counter : 0
KDF setting ......: off
UIF setting ......: Sign=off Decrypt=off Auth=off
Signature key ....: F977 C90D A407 7068 CAAD  8B29 9502 5153 30CB 5D0F
      created ....: 2024-08-26 17:45:16
Encryption key....: [none]
Authentication key: [none]
General key info..: pub  secp256k1/9502515330CB5D0F 2024-08-26 Bruno (Constellation Wallet) <ask@bruno.wtf>
sec>  secp256k1/9502515330CB5D0F  created: 2024-08-26  expires: never
                                  card-no: 0006 31254760
ssb   secp256k1/4B140C97C6AD3322  created: 2024-08-26  expires: never
```

By default, a Yubikey signature only requires entering the PIN code on every signature request. The default user pin is 123456, which should be personalized using ``.

To further improve security, configure your Yubikeys touch policy to require a touch for signatures. This is turned **off** by default (see `UIF setting: Sign=off`) but can be changed using `ykman` (see [install instructions](https://developers.yubico.com/yubikey-manager/)):

```bash
> ykman openpgp info
OpenPGP version:            3.4
Application version:        5.7.1
PIN tries remaining:        3
Reset code tries remaining: 0
Admin PIN tries remaining:  3
Require PIN for signature:  Once
KDF enabled:                False
Touch policies:
  Signature key:      Off
  Encryption key:     Off
  Authentication key: Off
  Attestation key:    Off
```

To change the signature touch policy, run:

```bash
> ykman openpgp keys set-touch SIG On
Enter Admin PIN: ********
Set touch policy of SIG key to on? [y/N]: y
Touch policy for slot SIG set.
```

Now after entering the pin somebody needs to physically touch the Yubikey for the signature to be generated. This protects the key from a leaked PIN code. For more details, see `ykman openpgp keys set-touch -h`.

ℹ️ The Yubikey touch policy can also be changed using the Yubikey Manager GUI.
