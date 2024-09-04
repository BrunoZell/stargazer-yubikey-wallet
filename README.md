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

The current implementation expects `yubikey-apdu> node yubikey-apdu.js` to be running in the background.

### Install GPG

The Yubikey Bridge expects `gpg` to be an available command on your system. It uses `gpg` to extract the public key stored on the YubiKey and to sign messages with the private key stored on the YubiKey.

Installation instructions for GPG can be found [here](https://gnupg.org/download/).

### Install OpenSC and psclite

- [pcsclite](https://pcsclite.apdu.fr/files/)
- [OpenSC](https://github.com/OpenSC/OpenSC/releases)

The smard card service must be running.

## Prepare the Yubikey

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

## Signing Proccess under the hood

Stargazer prepares a transaction with hash: `82dc7a455095b3a67c484693249499f6790251833185b8c41cf44f9addb65e31`

```json
{
    "value": {
        "source": "DAG53VFwtir9K3WfeCLU7EVsmhJGYZtwf9YJJE1J",
        "destination": "DAG08TSeWZhT9GwemE5ioxRZZzLgYTVHVTp3r9g2",
        "amount": 100000000,
        "fee": 0,
        "parent": {
            "ordinal": 0,
            "hash": "0000000000000000000000000000000000000000000000000000000000000000"
        },
        "salt": "8824239026179262"
    },
    "proofs": []
}
```

The Stargazer Wallet extension will use the browsers native messaging capabilities to call the locally installed `yubikey-bridge` with this request:

```json
{
    "command": "signHash",
    "expectedUncompressedPublicKey": "0498a5ecbb2e3738c1021f980017a2f47314288e41ab1c435cfceef00a5e63276933ff480a6bd607f80729204c16c9d2d092a187767c2928008d146197f5fe43c3",
    "sha512DigestToSign": "f7564babead48166c9444b7ea38195074da660e64a57853954adfe56c3449de97dc356559337d1c2855e52cd647d913fb11fe9c81ec2fb5bee94bf9f13082966",
    "yubikeyPin": "123456"
}
```

The bridge then calls `gpg --card-status` to do some preliminary checks, e.g. chcking that the signature key exists and is of type `secp256k1`.

It then proceeds to execute raw APDU commands to sign the message:

First, the OpenPGP APDU `00A4040006D27600012401` makes the Yubikey select the OpenPGP applet. The typical response is `9000`: Success

Second, the GET PUBLIC KEY APDU is executed:

- `c=00`: Default command class
- `i=47`: Generate asymmetric key pair
- `p1=81`: Reading of actual public key
- `p2=00`
- `lc=000002`
- `le=B600`: Signature key
- `em=0000`

Extracting the public key in is optional but useful for verification. A possible response might look like: `7f494386410498a5ecbb2e3738c1021f980017a2f47314288e41ab1c435cfceef00a5e63276933ff480a6bd607f80729204c16c9d2d092a187767c2928008d146197f5fe43c39000`

Deconstructed this means:

- `7f49`: Response success
- `43`: Length in bytes of remaining result. `43` in hex is 67 in decimal.
- `86`: Constant for _ECDSA Signature_, as the Signature key on this Yubikey is of type `secp256k1`
- `41`: Length of following key. `41` in hex is 65 in decimal
- `04`: First part of the public key, with `04` indicating an uncompressed public key
- `98a5ecbb2e3738c1021f980017a2f47314288e41ab1c435cfceef00a5e63276933ff480a6bd607f80729204c16c9d2d092a187767c2928008d146197f5fe43c3`: The 64 byte public key containing `r` and `s` (both 32 bytes) according to my tests
- `9000` Success status word

(Reference _7.2.14 GENERATE ASYMMETRIC KEY PAIR_ on page 74 in the [OpenPGP Smart Card Spec](https://gnupg.org/ftp/specs/OpenPGP-smart-card-application-3.4.pdf))

Then the PIN APDU:

- `c=00`: Default command class
- `i=20`: Instruction byte for VERIFY
- `p1=00`
- `p2=81`: Must be 81 for SIGN as specified in 7.2.10
- `lc=06`: Pin length in bytes, hex encoded
- `data=313233343536`: hex-encoded default pin `123456`

Verifying the pin is a prerequisite for the following signing operation to work. Normally just `9000`: Success is returned.

(Reference _7.2.2 VERIFY_ on page 52 in the [OpenPGP Smart Card Spec](https://gnupg.org/ftp/specs/OpenPGP-smart-card-application-3.4.pdf))

Finally, the SIGN APDU:

- `c=00`: Default command class
- `i=2A`: Instruction byte for PERFORM SECURITY OPERATION
- `p1=9E`: 9E specifies that the operation is to compute a digital signature
- `p2=9A`: 9A specifies that the data is a hash that needs to be signed
- `lc=40`: hex for 64, so 512 bits for a SHA512
- `data=9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043`: hex-encoded [SHA512 of UTF8-encoded string `hello`](https://emn178.github.io/online-tools/sha512.html?input=68656c6c6f&input_type=hex&output_type=hex&hmac_enabled=0&hmac_input_type=utf-8) used as digest to sign
- `le=00`

With a response looking like: `af679c9010968004f5b3b6dc23795a743676dee39c4f214426f43b703a244448129ce9b72177bc6647ae2cb9caa0af7d26336a4daa8e67fad253b1b8c02a3f829000`

Deconstructed this means:

- `af679c9010968004f5b3b6dc23795a743676dee39c4f214426f43b703a244448129ce9b72177bc6647ae2cb9caa0af7d26336a4daa8e67fad253b1b8c02a3f82`: The 64 byte digital signature consisting of a 32 byte `r` and 32 byte `s`
- `9000` Success status word

(Reference _7.2.10 PSO: COMPUTE DIGITAL SIGNATURE_ on page 63 in the [OpenPGP Smart Card Spec](https://gnupg.org/ftp/specs/OpenPGP-smart-card-application-3.4.pdf))

After the `yubikey-bridge` has finished processing the request, it will respond with the signature data:

```json
{
    "publicKey": "0498a5ecbb2e3738c1021f980017a2f47314288e41ab1c435cfceef00a5e63276933ff480a6bd607f80729204c16c9d2d092a187767c2928008d146197f5fe43c3",
    "digestSigned": "f7564babead48166c9444b7ea38195074da660e64a57853954adfe56c3449de97dc356559337d1c2855e52cd647d913fb11fe9c81ec2fb5bee94bf9f13082966",
    "signatureRaw": "4a96924a09c21dd992c500112c18708f45d73971723e84b2753ec214b1f66cf277c18cf96bf12127f8b14a6c990d59acffa1d898293e8aaab720fe41da7e7867",
    "signatureAsnDer": "304402204a96924a09c21dd992c500112c18708f45d73971723e84b2753ec214b1f66cf2022077c18cf96bf12127f8b14a6c990d59acffa1d898293e8aaab720fe41da7e7867"
}
```

The Wallet then checks if the signature is signed with the expected public key, if that key derived the _From_ DAG address, and if the signature is valid:

- _From_ public key: `0498a5ecbb2e3738c1021f980017a2f47314288e41ab1c435cfceef00a5e63276933ff480a6bd607f80729204c16c9d2d092a187767c2928008d146197f5fe43c3`
- Signature public key: `0498a5ecbb2e3738c1021f980017a2f47314288e41ab1c435cfceef00a5e63276933ff480a6bd607f80729204c16c9d2d092a187767c2928008d146197f5fe43c3`
- Signature public key inferred address: `DAG53VFwtir9K3WfeCLU7EVsmhJGYZtwf9YJJE1J`
- Tx Hash: `82dc7a455095b3a67c484693249499f6790251833185b8c41cf44f9addb65e31`
- Signed digest: `f7564babead48166c9444b7ea38195074da660e64a57853954adfe56c3449de97dc356559337d1c2855e52cd647d913fb11fe9c81ec2fb5bee94bf9f13082966`
- Signature raw: `4a96924a09c21dd992c500112c18708f45d73971723e84b2753ec214b1f66cf277c18cf96bf12127f8b14a6c990d59acffa1d898293e8aaab720fe41da7e7867`
- Signature ASN.1 DER: `304402204a96924a09c21dd992c500112c18708f45d73971723e84b2753ec214b1f66cf2022077c18cf96bf12127f8b14a6c990d59acffa1d898293e8aaab720fe41da7e7867`
- dag4.keyStore.verify result: `true`

It will then add the signature as a proof to the transaction and send it to the network:

```json
{
    "value": {
        "source": "DAG53VFwtir9K3WfeCLU7EVsmhJGYZtwf9YJJE1J",
        "destination": "DAG08TSeWZhT9GwemE5ioxRZZzLgYTVHVTp3r9g2",
        "amount": 100000000,
        "fee": 0,
        "parent": {
            "ordinal": 0,
            "hash": "0000000000000000000000000000000000000000000000000000000000000000"
        },
        "salt": "8824239026179262"
    },
    "proofs": [
        {
            "id": "98a5ecbb2e3738c1021f980017a2f47314288e41ab1c435cfceef00a5e63276933ff480a6bd607f80729204c16c9d2d092a187767c2928008d146197f5fe43c3",
            "signature": "304402204a96924a09c21dd992c500112c18708f45d73971723e84b2753ec214b1f66cf2022077c18cf96bf12127f8b14a6c990d59acffa1d898293e8aaab720fe41da7e7867"
        }
    ]
}
```

And now the transaction will be sorted into the next DAG L1 block. Finish! 🎉
