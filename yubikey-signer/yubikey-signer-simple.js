const { dag4 } = require('@stardust-collective/dag4');
const { keyStore } = require('@stardust-collective/dag4-keystore');
const { TransactionReference } = require('@stardust-collective/dag4-network');
const { readFileSync } = require('fs');
const openpgp = require('openpgp');
const { execSync } = require('child_process');
const secp = require("@noble/secp256k1");

function log(message) {
    console.log(message);
}

const txHash = "4482a285c51066ee59c69b59b773e9e7a2de5a7de9ea9890a302930c49f382dc";

console.log(`Prepared Transaction ${txHash}:`);

async function main() {
    var privateKey = await loadPrivateKeyFromFile('private_key.asc');
    var publicKey = await loadPublicKeyFromAsc('private_key.asc');
    var sha512HashOfTxHashString = keyStore.sha512(txHash);
    var txHashBuffer = Buffer.from(txHash, "hex");
    var sha512HashOfTxHashBuffer = keyStore.sha512(txHashBuffer);


    console.log(`sha512HashOfTxHashString: ${sha512HashOfTxHashString}`);
    console.log(`sha512HashOfTxHashBuffer: ${sha512HashOfTxHashBuffer}`);

    const signatureStringRaw = await secp.sign(sha512HashOfTxHashString, privateKey);
    const signatureBufferRaw = await secp.sign(sha512HashOfTxHashBuffer, privateKey);

    const signatureString = Buffer.from(signatureStringRaw).toString('hex');
    const signatureBuffer = Buffer.from(signatureBufferRaw).toString('hex');

    console.log(`signature string: ${signatureString}`);
    console.log(`signature buffer: ${signatureBuffer}`);

    const signatureStringValid = secp.verify(signatureString, sha512HashOfTxHashString, publicKey);
    const signatureBufferValid = secp.verify(signatureBuffer, sha512HashOfTxHashBuffer, publicKey);

    console.log(`signature string valid: ${signatureStringValid}`);
    console.log(`signature buffer valid: ${signatureBufferValid}`);
}

main().catch(console.error);

// -------------------------------------------------------------------------------------------------

// Load private key from private_key.asc file
async function loadPrivateKeyFromFile(filePath) {
    const armoredKey = readFileSync(filePath, 'utf8');
    const result = await openpgp.readPrivateKey({ armoredKey });
    const keyID = result.getKeyID();
    const key = result.getKeys(keyID)[0];
    const keyBytes = key.keyPacket.privateParams.d;
    const privateKeyHex = Buffer.from(keyBytes).toString('hex');
    return privateKeyHex;
}

// Load public key from private_key.asc file
async function loadPublicKeyFromAsc(filePath) {
    const privateKeyHex = await loadPrivateKeyFromFile(filePath);
    const publicKeyHex = keyStore.getPublicKeyFromPrivate(privateKeyHex);
    return publicKeyHex;
}

// Load public key from Yubikey via gpg card status
async function loadPublicKeyFromYubikey() {
    const cardStatus = execSync('gpg --card-status').toString();
    const { fingerprint, serialNumber, hasNoSignatureKey, keyAttributes } = parseFingerprint_fromGpgCardStatusOutput(cardStatus);

    if (hasNoSignatureKey || !fingerprint) throw new Error(`No signature key on Yubikey with serial number ${serialNumber}.`);
    if (keyAttributes.sign.toLowerCase() !== "secp256k1") throw new Error(`Signature key is not of type secp256k1 on Yubikey with serial number ${serialNumber}.`);

    const publicKeyArmor = execSync(`gpg --export --armor ${fingerprint}`).toString('utf8');
    const publicKeyPackets = execSync('gpg --list-packets --verbose', { input: publicKeyArmor, encoding: 'utf8' });
    const publicKeyHex = parsePublicKey_fromGpgListPublicKetPacketsVerboseOutput(publicKeyPackets);

    return publicKeyHex;
}

// Sign transaction with software key
async function signTransactionWithSoftwareKey(filePath, txHash) {
    const privateKeyHex = await loadPrivateKeyFromFile(filePath);
    const signature = await keyStore.sign(privateKeyHex, txHash);
    return signature;
}

// Sign transaction on Yubikey
async function signTransactionOnYubikey(fingerprint, txHash) {
    const txHashBuffer = Buffer.from(txHash, "hex");
    const sha512Hash = keyStore.sha512(txHash);
    const rawGpgSignDigest = txHashBuffer;
    // const rawGpgSignDigest = txHash;
    const signedArmor = execSync(`gpg --digest-algo SHA512 --sign --armor --default-key ${fingerprint} --binary`, { input: txHashBuffer }).toString('utf8');
    const signaturePackets = execSync('gpg --list-packets --verbose', { input: signedArmor, encoding: 'utf8' });
    const rawSignature = parseSignature_fromGpgListSignaturePacketsVerboseOutput(signaturePackets);

    return rawSignature;
}

async function signAndVerify(loadPublicKey, signTransaction) {
    const publicKeyHex = await loadPublicKey();
    console.log(`Loaded Public Key: ${publicKeyHex}`);

    const address = keyStore.getDagAddressFromPublicKey(publicKeyHex);
    console.log(`Inferred Address: ${address}`);
    console.log(`Matches Provided Address? ${address === fromAddress}`);

    const signature = await signTransaction(txHash);
    console.log(`Signature: ${signature}`);

    const uncompressedPublicKey = publicKeyHex.length === 128 ? '04' + publicKeyHex : publicKeyHex;
    const success = keyStore.verify(uncompressedPublicKey, txHash, signature);

    if (!success) {
        throw new Error('Sign-Verify failed');
    } else {
        console.log('Sign-Verify succeeded');
    }
}

// -------------------------------------------------------------------------------------------------

function parseFingerprint_fromGpgCardStatusOutput(gpgOutput) {
    const signatureKeyFingerprintRegex = /Signature key\s*\.*:\s+([0-9A-F\s]+)(?=\r?\n)/;
    const signatureKeyNoneRegex = /Signature key\s*\.*:\s+\[none\]/;
    const serialNumberRegex = /Serial number\s*\.*:\s+(\d+)/;
    const keyAttributesRegex = /Key attributes\s*\.*:\s+([a-z0-9\s]+)(?=\r?\n)/i;

    const signatureKeyFingerprintMatch = gpgOutput.match(signatureKeyFingerprintRegex);
    const serialNumberMatch = gpgOutput.match(serialNumberRegex);
    const keyAttributesMatch = gpgOutput.match(keyAttributesRegex);

    const signatureKeyFingerprint = signatureKeyFingerprintMatch ? signatureKeyFingerprintMatch[1].replace(/\s+/g, '') : null;
    const serialNumber = serialNumberMatch ? serialNumberMatch[1] : null;
    const hasNoSignatureKey = signatureKeyNoneRegex.test(gpgOutput);

    if (serialNumber) {
        log(`Serial number ${serialNumber} extracted from: "${serialNumberMatch[0]}"`);
    } else {
        log(`No serial number found`);
    }

    if (signatureKeyFingerprint) {
        log(`Key fingerprint ${signatureKeyFingerprint} extracted from: "${signatureKeyFingerprintMatch[0]}"`);
    } else {
        log(`No signature key fingerprint found`);
    }

    log(`Has [none] signature key: ${hasNoSignatureKey}`);

    let keyAttributes = { sign: null, encrypt: null, authenticate: null };
    if (keyAttributesMatch) {
        const attributes = keyAttributesMatch[1].trim().split(/\s+/);
        if (attributes.length === 3) {
            keyAttributes = {
                sign: attributes[0],
                encrypt: attributes[1],
                authenticate: attributes[2]
            };
            log(`Key attributes extracted: sign=${keyAttributes.sign}, encrypt=${keyAttributes.encrypt}, authenticate=${keyAttributes.authenticate}`);
        } else {
            log(`Could not extract key attributes from: ${keyAttributesMatch[0]}`);
        }
    } else {
        log(`No key attributes found`);
    }

    return { fingerprint: signatureKeyFingerprint, serialNumber, hasNoSignatureKey, keyAttributes };
}

function parsePublicKey_fromGpgListPublicKetPacketsVerboseOutput(gpgOutput) {
    // Regular expression to match the public key packet and extract pkey[1]
    const publicKeyPacketRegex = /:public key packet:\r?\n\s+version \d+, algo \d+, created \d+, expires \d+\r?\n\s+pkey\[0\]: [0-9A-F]+ .+\r?\n\s+pkey\[1\]: ([0-9A-F]+)\r?\n\s+keyid: [0-9A-F]+/;
    const match = gpgOutput.match(publicKeyPacketRegex);

    if (match) {
        const publicKeyHex = match[1];
        log(`Public key ${publicKeyHex} extrated from packet match:\n${match[0]}`);
        return publicKeyHex;
    } else {
        throw new Error("Public key packet not found.");
    }
}

function parseSignature_fromGpgListSignaturePacketsVerboseOutput(gpgOutput) {
    const signaturePacketRegex = /:signature packet:.*?data: ([0-9A-F]+).*?data: ([0-9A-F]+)/s;
    const match = gpgOutput.match(signaturePacketRegex);

    if (match) {
        const rawSignature = match[1] + match[2];
        log(`Raw signature extracted: ${rawSignature}`);
        return rawSignature;
    } else {
        throw new Error("Signature packet not found.");
    }
}
