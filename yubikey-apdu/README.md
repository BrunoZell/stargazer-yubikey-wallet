# YubiKey APDU Commands

This document provides an overview of the APDU (Application Protocol Data Unit) commands used in the `yubikey-apdu.js` script for interacting with a YubiKey.

## APDU Commands

### 1. PGP APDU Command

**Command:** `00A4040006D27600012401`

**Description:** This command selects the OpenPGP application on the YubiKey.

### 2. Get Public Key APDU Command

**Command:** `00 47 81 00 000002 B600 0000`

**Description:** This command retrieves the public key from the YubiKey.

- **CLA:** `00`
- **INS:** `47` (GENERATE ASYMMETRIC KEY PAIR)
- **P1:** `81` (Reading of actual public key)
- **P2:** `00`
- **Lc:** `000002`
- **Le:** `B600` (Signature key)
- **Em:** `0000`

### 3. PIN APDU Command

**Command:** `00 20 00 81 <pinLengthHex> <pinHex>`

**Description:** This command verifies the PIN on the YubiKey.

- **CLA:** `00`
- **INS:** `20` (VERIFY)
- **P1:** `00`
- **P2:** `81` (Reference control parameter for SIGN)
- **Lc:** `<pinLengthHex>` (Length of the PIN in hex)
- **Data:** `<pinHex>` (PIN in hex)

### 4. Sign Data APDU Command

**Command:** `00 2A 9E 9A 40 <Data> 00`

**Description:** This command signs the provided SHA-512 hash using the YubiKey.

- **CLA:** `00`
- **INS:** `2A` (PERFORM SECURITY OPERATION)
- **P1:** `9E` (Compute a digital signature)
- **P2:** `9A` (Data is a hash to be signed)
- **Lc:** `40` (64 bytes for SHA-512)
- **Data:** `<Data>` (SHA-512 hash in hex)
- **Le:** `00`

## Usage as CLI

_(this is commented out in `yubikey-apdu.js`)._

To use the script, run the following command:

```sh
node yubikey-apdu.js <utf8-string> <pin>
```

- `<utf8-string>`: The UTF-8 encoded string to be signed.
- `<pin>`: The PIN for the YubiKey.

## Example

```sh
node yubikey-apdu.js "hello" 123456
```

This command will SHA512 the provided UTF8 text and sign the hash digest using a connected YubiKey and the provided PIN.

## Logging

The script logs all operations including raw APDU commands and responses to a file named `yubikey-apdu-logfile.txt`.
