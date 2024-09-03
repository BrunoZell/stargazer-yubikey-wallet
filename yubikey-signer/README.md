# Yubikey Signer

This is a tool I used to debig the Yubikey signing process. This implements the signing logic through `gpg`. However, `gpg --sign` adds additional metadata to the signed message which results in a different SHA512 digest, resulting in the network rejecting the signatures.

Using `gpg` to sign is deprecated in favor of using [raw APDU commands to the YubiKey](../yubikey-apdu/README.md).
